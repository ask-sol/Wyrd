import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getRootDir } from './store';
import { loadSettings, saveSettings } from './settings';

export interface InferwallStatus {
  installed: boolean;
  python_path: string | null;
  binary_path: string | null;
  pid: number | null;
  /** True if the HTTP server is reachable AT ALL — authoritative. */
  running: boolean;
  /** True if the recorded pidfile process is still alive (informational). */
  pid_alive: boolean;
  base_url: string;
  has_api_key: boolean;
  version: string | null;
  install_log_path: string;
  spawn_log_path: string;
}

export interface InferwallVerdict {
  decision: 'allow' | 'flag' | 'block';
  score: number;
  matches: Array<{
    signature_id: string;
    matched_text?: string;
    score?: number;
    confidence?: number;
    severity?: number;
  }>;
  request_id: string;
}

function infraDir(): string {
  return join(getRootDir(), 'inferwall');
}

const PID_PATH = () => join(infraDir(), 'server.pid');
const INSTALL_LOG = () => join(infraDir(), 'install.log');
const SPAWN_LOG = () => join(infraDir(), 'server.log');
const SCAN_CACHE = () => join(infraDir(), 'scan-cache.json');

async function ensureDir(): Promise<void> {
  await fs.mkdir(infraDir(), { recursive: true });
}

function findPython(): string | null {
  const candidates = ['python3', 'python'];
  for (const c of candidates) {
    const r = spawnSync(c, ['-c', 'import sys; print(sys.version_info >= (3, 9))'], {
      encoding: 'utf8',
    });
    if (r.status === 0 && r.stdout.trim() === 'True') return c;
  }
  return null;
}

function findInferwallBinary(): string | null {
  // Try PATH first.
  const w = spawnSync('which', ['inferwall'], { encoding: 'utf8' });
  if (w.status === 0 && w.stdout.trim()) return w.stdout.trim();
  // Fall back to typical pip --user locations on macOS/Linux.
  const py = findPython();
  if (!py) return null;
  const sitePaths = spawnSync(py, ['-c', 'import sysconfig, os; print(sysconfig.get_paths()["scripts"]); p=os.path.expanduser("~/.local/bin"); print(p); p=os.path.expanduser("~/Library/Python"); print(p)'], { encoding: 'utf8' });
  if (sitePaths.status !== 0) return null;
  for (const line of sitePaths.stdout.split('\n')) {
    const dir = line.trim();
    if (!dir) continue;
    // Direct match
    const candidate = join(dir, 'inferwall');
    try {
      const s = require('node:fs').statSync(candidate);
      if (s.isFile()) return candidate;
    } catch {/* ignore */}
    // Search one level deep (e.g. ~/Library/Python/3.13/bin/inferwall)
    try {
      const entries = require('node:fs').readdirSync(dir) as string[];
      for (const ent of entries) {
        const nested = join(dir, ent, 'bin', 'inferwall');
        try {
          const s = require('node:fs').statSync(nested);
          if (s.isFile()) return nested;
        } catch {/* ignore */}
      }
    } catch {/* ignore */}
  }
  return null;
}

function getVersion(binary: string | null): string | null {
  if (!binary) return null;
  const r = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.trim() || r.stderr.trim() || null;
  // Fall back to reading pip metadata.
  const py = findPython();
  if (py) {
    const pr = spawnSync(py, ['-m', 'pip', 'show', 'inferwall'], { encoding: 'utf8' });
    const m = pr.stdout.match(/Version:\s*(\S+)/);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function readPid(): Promise<number | null> {
  try {
    const s = await fs.readFile(PID_PATH(), 'utf8');
    const n = parseInt(s.trim(), 10);
    if (!Number.isFinite(n)) return null;
    try {
      process.kill(n, 0);
      return n;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Build URL variants to try for connection probes. Node's fetch can fail when
 * `localhost` resolves to IPv6 (`::1`) but the server only binds IPv4 — so
 * always try `127.0.0.1` as a fallback.
 */
function urlVariants(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, '');
  if (!base) return [];
  const out = [base];
  if (base.includes('://localhost')) {
    out.push(base.replace('://localhost', '://127.0.0.1'));
  } else if (base.includes('://127.0.0.1')) {
    out.push(base.replace('://127.0.0.1', '://localhost'));
  }
  return out;
}

/**
 * True if the Inferwall server is responding on the configured base URL.
 * Tries GET health paths first, then POSTs to /v1/scan/input as a last resort
 * (since some self-hosted builds don't expose a health endpoint at all).
 */
export async function probeServer(baseUrl: string, apiKey = ''): Promise<{ ok: boolean; via?: string; error?: string }> {
  const bases = urlVariants(baseUrl);
  if (bases.length === 0) return { ok: false, error: 'no base_url configured' };
  const authHeaders: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  for (const base of bases) {
    for (const path of ['/health', '/v1/health', '/']) {
      try {
        const r = await fetch(`${base}${path}`, {
          signal: AbortSignal.timeout(2500),
          headers: authHeaders,
        });
        if (r.status >= 200 && r.status < 500) return { ok: true, via: `GET ${base}${path}` };
      } catch {
        /* try next */
      }
    }
    // Final fallback: probe the actual scan endpoint with a tiny payload.
    try {
      const r = await fetch(`${base}/v1/scan/input`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({ text: 'ping' }),
        signal: AbortSignal.timeout(2500),
      });
      if (r.status >= 200 && r.status < 500) return { ok: true, via: `POST ${base}/v1/scan/input` };
    } catch {
      /* try next base */
    }
  }
  return { ok: false, error: 'no path responded; check IW server is bound + port matches base_url' };
}

export async function getStatus(): Promise<InferwallStatus> {
  await ensureDir();
  const settings = await loadSettings();
  const binary = findInferwallBinary();
  const installed = binary !== null;
  const pid = await readPid();
  const version = installed ? getVersion(binary) : null;
  // Authoritative "running" check: can we actually talk to the server?
  const probe = await probeServer(settings.inferwall.base_url, settings.inferwall.api_key);
  const running = probe.ok;

  return {
    installed,
    python_path: findPython(),
    binary_path: binary,
    pid,
    running,
    pid_alive: pid !== null,
    base_url: settings.inferwall.base_url,
    has_api_key: settings.inferwall.api_key.length > 0,
    version,
    install_log_path: INSTALL_LOG(),
    spawn_log_path: SPAWN_LOG(),
  };
}

export async function install(): Promise<{ ok: boolean; log: string }> {
  await ensureDir();
  const py = findPython();
  if (!py) {
    return { ok: false, log: 'Python 3.9+ not found on PATH. Install Python first.' };
  }
  const log: string[] = [];
  const run = (cmd: string, args: string[]) =>
    new Promise<number>((resolve) => {
      const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.on('data', (d) => log.push(d.toString()));
      p.stderr.on('data', (d) => log.push(d.toString()));
      p.on('close', (code) => resolve(code ?? -1));
    });

  log.push(`> ${py} -m pip install --user inferwall\n`);
  const code = await run(py, ['-m', 'pip', 'install', '--user', 'inferwall']);
  if (code !== 0) {
    const final = log.join('');
    await fs.writeFile(INSTALL_LOG(), final, 'utf8');
    return { ok: false, log: final };
  }

  // Verify the binary actually runs. The PyPI package historically shipped
  // without its compiled Rust core (`inferwall_core`), so a "successful" pip
  // install can still leave the binary broken.
  log.push(`\n> verify: ${py} -c "import inferwall_core"\n`);
  const verify = await run(py, ['-c', 'import inferwall_core']);
  const final = log.join('');
  await fs.writeFile(INSTALL_LOG(), final, 'utf8');
  if (verify !== 0) {
    return {
      ok: false,
      log:
        final +
        `\n\nInferwall's pip package is missing its compiled Rust core (inferwall_core).\n` +
        `The PyPI release is currently broken — even \`pip install inferwall\` succeeds but\n` +
        `the binary won't run. Either:\n` +
        `  1. Wait for upstream to publish a fixed wheel, OR\n` +
        `  2. Build from source:\n` +
        `       git clone https://github.com/inferwall/inferwall ~/.wyrd/inferwall/src\n` +
        `       cd ~/.wyrd/inferwall/src && docker build -t wyrd-inferwall:latest .\n` +
        `       docker run -d -p 8000:8000 wyrd-inferwall:latest\n`,
    };
  }
  return { ok: true, log: final };
}

export async function generateKey(): Promise<{ ok: boolean; key?: string; error?: string }> {
  await ensureDir();
  // Inferwall admin setup writes keys to .env.local in cwd. We run it in our
  // own infra dir so it stays segregated.
  const binary = findInferwallBinary();
  if (!binary) {
    return { ok: false, error: 'inferwall binary not found (run install first)' };
  }
  const r = spawnSync(binary, ['admin', 'setup', '--yes'], {
    cwd: infraDir(),
    encoding: 'utf8',
    env: { ...process.env, IW_HOME: infraDir() },
  });
  if (r.status !== 0) {
    return { ok: false, error: `${r.stderr || r.stdout || 'setup failed'}` };
  }
  // Try to read .env.local for the scan key.
  try {
    const env = await fs.readFile(join(infraDir(), '.env.local'), 'utf8');
    const m = env.match(/IW_API_KEY_SCAN=([^\s]+)/) ?? env.match(/scan[_-]?key\s*=\s*"?([^"\n]+)/i);
    if (m && m[1]) {
      const settings = await loadSettings();
      settings.inferwall.api_key = m[1];
      await saveSettings(settings);
      return { ok: true, key: m[1] };
    }
    return { ok: false, error: 'key generated but could not be parsed from .env.local' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function start(): Promise<{ ok: boolean; pid?: number; error?: string; log_tail?: string }> {
  await ensureDir();
  const existing = await readPid();
  if (existing) return { ok: true, pid: existing };

  // Truncate the spawn log so the user sees only the current attempt's output.
  await fs.writeFile(SPAWN_LOG(), '', 'utf8');

  const out = await fs.open(SPAWN_LOG(), 'a');
  const fd = out.fd;
  try {
    const binary = findInferwallBinary();
    if (!binary) {
      return { ok: false, error: 'inferwall binary not found' };
    }
    const child = spawn(binary, ['serve'], {
      cwd: infraDir(),
      env: { ...process.env, IW_HOME: infraDir() },
      stdio: ['ignore', fd, fd],
      detached: true,
    });
    child.unref();
    if (!child.pid) {
      return { ok: false, error: 'spawn returned no pid' };
    }
    await fs.writeFile(PID_PATH(), String(child.pid), 'utf8');
    // Give the process time to either bind the port or crash.
    await new Promise((r) => setTimeout(r, 1500));
    // Did it survive?
    let alive = false;
    try {
      process.kill(child.pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (!alive) {
      // Process died — pull the log tail to tell the user why.
      let logTail = '';
      try {
        const raw = await fs.readFile(SPAWN_LOG(), 'utf8');
        const tail = raw.slice(-2000);
        logTail = tail.trim();
      } catch {
        /* no log */
      }
      await fs.unlink(PID_PATH()).catch(() => undefined);
      return {
        ok: false,
        error: 'inferwall exited immediately after start — see log tail',
        log_tail: logTail,
      };
    }
    return { ok: true, pid: child.pid };
  } finally {
    await out.close();
  }
}

export async function stop(): Promise<{ ok: boolean; error?: string }> {
  const pid = await readPid();
  if (!pid) return { ok: true };
  try {
    process.kill(pid, 'SIGTERM');
    await fs.unlink(PID_PATH()).catch(() => undefined);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function getCache(): Promise<Record<string, InferwallVerdict>> {
  try {
    const raw = await fs.readFile(SCAN_CACHE(), 'utf8');
    return JSON.parse(raw) as Record<string, InferwallVerdict>;
  } catch {
    return {};
  }
}

async function putCache(cache: Record<string, InferwallVerdict>): Promise<void> {
  await ensureDir();
  await fs.writeFile(SCAN_CACHE(), JSON.stringify(cache, null, 2), 'utf8');
}

export async function scan(
  text: string,
  cacheKey: string,
  kind: 'input' | 'output',
): Promise<{ ok: true; verdict: InferwallVerdict; cached: boolean } | { ok: false; error: string }> {
  const cache = await getCache();
  if (cache[cacheKey]) {
    return { ok: true, verdict: cache[cacheKey], cached: true };
  }
  const settings = await loadSettings();
  const base = settings.inferwall.base_url.replace(/\/+$/, '');
  if (!base) return { ok: false, error: 'inferwall base_url not configured' };
  try {
    const r = await fetch(`${base}/v1/scan/${kind}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(settings.inferwall.api_key ? { authorization: `Bearer ${settings.inferwall.api_key}` } : {}),
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, error: `HTTP ${r.status} ${t.slice(0, 200)}` };
    }
    const verdict = (await r.json()) as InferwallVerdict;
    cache[cacheKey] = verdict;
    await putCache(cache);
    return { ok: true, verdict, cached: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function aggregateDecision(
  verdicts: InferwallVerdict[],
): 'allow' | 'flag' | 'block' | 'unknown' {
  if (verdicts.length === 0) return 'unknown';
  if (verdicts.some((v) => v.decision === 'block')) return 'block';
  if (verdicts.some((v) => v.decision === 'flag')) return 'flag';
  return 'allow';
}
