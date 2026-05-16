import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';

const COMMON_PATHS = [
  join(homedir(), 'Documents', 'GitHub', 'openagent'),
  join(homedir(), 'Documents', 'github', 'openagent'),
  join(homedir(), 'code', 'openagent'),
  join(homedir(), 'src', 'openagent'),
  join(homedir(), 'openagent'),
];

/** Resolve a usable OpenAgent checkout. Returns null if none looks valid. */
export async function findOpenAgent(explicit: string): Promise<string | null> {
  const candidates = [explicit, ...COMMON_PATHS].filter((p) => p && p.length > 0);
  for (const p of candidates) {
    try {
      const cli = join(p, 'src', 'entrypoints', 'cli.tsx');
      await fs.access(cli);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

export interface ReexecuteResult {
  ok: boolean;
  new_trace_id?: string;
  stderr_tail?: string;
  stdout_tail?: string;
  exit_code?: number;
  error?: string;
}

/**
 * Spawn `openagent --prompt "<text>"` with WYRD_ENABLED + WYRD_DIR set so the
 * resulting run is captured into the same store. Detects the new trace by
 * polling SQLite for the most-recently-started trace whose `started_at` is
 * after the spawn time.
 */
export async function reexecutePrompt(opts: {
  prompt: string;
  openagentPath: string;
  runtime: 'bun' | 'node';
  wyrdDir: string;
  enableAnthropicWebSearch?: boolean;
}): Promise<ReexecuteResult> {
  const oaCli = join(opts.openagentPath, 'src', 'entrypoints', 'cli.tsx');
  try {
    await fs.access(oaCli);
  } catch {
    return { ok: false, error: `OpenAgent CLI not found at ${oaCli}` };
  }

  const spawnTime = Date.now();
  const args =
    opts.runtime === 'bun'
      ? ['run', oaCli, '--prompt', opts.prompt, '--unrestricted']
      : ['tsx', oaCli, '--prompt', opts.prompt, '--unrestricted'];
  const exe = opts.runtime === 'bun' ? 'bun' : 'npx';

  const child = spawn(exe, args, {
    cwd: opts.openagentPath,
    env: {
      ...process.env,
      WYRD_ENABLED: '1',
      WYRD_DIR: opts.wyrdDir,
      ...(opts.enableAnthropicWebSearch ? { OPENAGENT_ANTHROPIC_WEB_SEARCH: '1' } : {}),
      CI: '1', // signal non-interactive to inner libs
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on('data', (b) => stdoutChunks.push(b));
  child.stderr.on('data', (b) => stderrChunks.push(b));

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? -1));
    child.on('error', () => resolve(-1));
  });

  const stdoutTail = Buffer.concat(stdoutChunks).toString('utf8').slice(-2000);
  const stderrTail = Buffer.concat(stderrChunks).toString('utf8').slice(-2000);

  if (exitCode !== 0) {
    return {
      ok: false,
      exit_code: exitCode,
      stdout_tail: stdoutTail,
      stderr_tail: stderrTail,
      error: `OpenAgent exited with code ${exitCode}`,
    };
  }

  // Find the trace that started after our spawn time.
  let newTraceId: string | null = null;
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(join(opts.wyrdDir, 'traces.sqlite3'), {
      readonly: true,
      fileMustExist: true,
    });
    db.pragma('busy_timeout = 2000');
    try {
      const row = db
        .prepare(
          `SELECT trace_id FROM traces WHERE started_at >= ? ORDER BY started_at DESC LIMIT 1`,
        )
        .get(spawnTime - 500) as { trace_id: string } | undefined;
      newTraceId = row?.trace_id ?? null;
    } finally {
      db.close();
    }
  } catch (err) {
    return {
      ok: false,
      exit_code: exitCode,
      stdout_tail: stdoutTail,
      stderr_tail: stderrTail,
      error: `ran but could not locate new trace: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!newTraceId) {
    return {
      ok: false,
      exit_code: exitCode,
      stdout_tail: stdoutTail,
      stderr_tail: stderrTail,
      error:
        'ran but no new trace appeared in the store (WYRD_ENABLED may not be wired in this OpenAgent checkout, or wyrd is not linked)',
    };
  }

  return {
    ok: true,
    new_trace_id: newTraceId,
    exit_code: exitCode,
    stdout_tail: stdoutTail,
    stderr_tail: stderrTail,
  };
}

/** Pull the user-supplied prompt(s) from a captured llm.call request blob. */
export function extractPromptFromRequest(reqJson: unknown): string {
  if (!reqJson || typeof reqJson !== 'object') return '';
  const req = reqJson as { messages?: unknown };
  if (!Array.isArray(req.messages)) return '';
  const parts: string[] = [];
  for (const m of req.messages) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: string }).role;
    if (role !== 'user') continue;
    const content = (m as { content?: unknown }).content;
    if (typeof content === 'string') {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object') {
          const t = (block as { text?: unknown }).text;
          if (typeof t === 'string') parts.push(t);
        }
      }
    }
  }
  return parts.join('\n\n');
}
