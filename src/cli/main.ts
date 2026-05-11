import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { FilesystemBlobStore } from '../blobs/store.js';
import { SqliteQueryStore } from '../storage/sqlite.js';
import { rollupCost } from '../storage/treeBuilder.js';
import { playbackTrace } from '../replay/playback.js';

interface CliConfig {
  dir: string;
}

function resolveConfig(values: Record<string, string | boolean | undefined>): CliConfig {
  const dir =
    (typeof values.dir === 'string' ? values.dir : undefined) ??
    process.env.WYRD_DIR ??
    join(process.cwd(), '.wyrd');
  return { dir };
}

function dbPath(cfg: CliConfig): string {
  return join(cfg.dir, 'traces.sqlite3');
}

function blobsDir(cfg: CliConfig): string {
  return join(cfg.dir, 'blobs');
}

function shortTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function cmdLs(cfg: CliConfig, _args: string[]): Promise<void> {
  const store = new SqliteQueryStore(dbPath(cfg));
  try {
    const traces = await store.listTraces({ limit: 50 });
    if (traces.length === 0) {
      process.stdout.write(`No traces found in ${cfg.dir}.\n`);
      return;
    }
    process.stdout.write(
      `${pad('TRACE_ID', 28)} ${pad('AGENT', 14)} ${pad('STATUS', 7)} ${pad('STARTED', 21)} DURATION\n`,
    );
    for (const t of traces) {
      const dur = t.ended_at !== null ? `${(t.ended_at - t.started_at).toString()}ms` : '-';
      process.stdout.write(
        `${pad(t.trace_id, 28)} ${pad(t.agent_id, 14)} ${pad(t.status, 7)} ${pad(shortTime(t.started_at), 21)} ${dur}\n`,
      );
    }
  } finally {
    await store.close();
  }
}

async function cmdShow(cfg: CliConfig, args: string[]): Promise<void> {
  const traceId = args[0];
  if (!traceId) {
    process.stderr.write('usage: wyrd show <trace_id>\n');
    process.exit(2);
  }
  const store = new SqliteQueryStore(dbPath(cfg));
  const blobs = new FilesystemBlobStore(blobsDir(cfg));
  try {
    const t = await store.getTrace(traceId);
    if (!t) {
      process.stderr.write(`No trace ${traceId} in ${cfg.dir}.\n`);
      process.exit(1);
    }
    await playbackTrace(t, blobs, { showPrompts: true, showResponses: true, maxBodyChars: 240 });
  } finally {
    await store.close();
  }
}

async function cmdReplay(cfg: CliConfig, args: string[]): Promise<void> {
  // v0.1 replay = step-by-step textual playback (UI is deferred). Programmatic
  // CachedProvider / cacheTool are exposed via the SDK for actual re-execution.
  await cmdShow(cfg, args);
}

async function cmdStats(cfg: CliConfig, args: string[]): Promise<void> {
  const traceId = args[0];
  if (!traceId) {
    process.stderr.write('usage: wyrd stats <trace_id>\n');
    process.exit(2);
  }
  const store = new SqliteQueryStore(dbPath(cfg));
  try {
    const t = await store.getTrace(traceId);
    if (!t) {
      process.stderr.write(`No trace ${traceId} in ${cfg.dir}.\n`);
      process.exit(1);
    }
    const r = rollupCost(t.spans);
    process.stdout.write(`trace ${t.trace.trace_id}\n`);
    process.stdout.write(`  llm.calls           ${r.llmCalls}\n`);
    process.stdout.write(`  tool.calls          ${r.toolCalls}\n`);
    process.stdout.write(`  input tokens        ${r.totalInputTokens}\n`);
    process.stdout.write(`  output tokens       ${r.totalOutputTokens}\n`);
    process.stdout.write(`  cache read tokens   ${r.totalCacheReadTokens}\n`);
    process.stdout.write(`  cache write tokens  ${r.totalCacheWriteTokens}\n`);
    process.stdout.write(`  cost USD            $${r.totalCostUsd.toFixed(5)}\n`);
  } finally {
    await store.close();
  }
}

function printHelp(): void {
  process.stdout.write(
    `wyrd — execution tracing and replay debugger for AI agents\n\n` +
      `Usage: wyrd <command> [args]\n\n` +
      `Commands:\n` +
      `  ls                   List recorded traces\n` +
      `  show <trace_id>      Print full trace tree with prompts and tool I/O\n` +
      `  replay <trace_id>    Step-by-step playback of a trace (alias for show)\n` +
      `  stats <trace_id>     Token + cost rollup for a trace\n\n` +
      `Options:\n` +
      `  --dir <path>         Trace storage directory (default: ./.wyrd, env WYRD_DIR)\n` +
      `  --help               Show this help\n`,
  );
}

export async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: {
      dir: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    return 0;
  }

  const cmd = positionals[0];
  const rest = positionals.slice(1);
  const cfg = resolveConfig(values);

  switch (cmd) {
    case 'ls':
      await cmdLs(cfg, rest);
      return 0;
    case 'show':
      await cmdShow(cfg, rest);
      return 0;
    case 'replay':
      await cmdReplay(cfg, rest);
      return 0;
    case 'stats':
      await cmdStats(cfg, rest);
      return 0;
    case 'help':
      printHelp();
      return 0;
    default:
      process.stderr.write(`unknown command: ${cmd}\n`);
      printHelp();
      return 2;
  }
}
