'use client';
import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Play, Square } from 'lucide-react';

interface Status {
  installed: boolean;
  python_path: string | null;
  binary_path: string | null;
  pid: number | null;
  running: boolean;
  pid_alive: boolean;
  base_url: string;
  has_api_key: boolean;
  version: string | null;
  install_log_path: string;
  spawn_log_path: string;
}

export function InferwallManager() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<null | 'install' | 'start' | 'stop'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  async function fetchLog() {
    setLog(null);
    try {
      const r = await fetch('/api/inferwall/log?which=server', { cache: 'no-store' });
      const j = (await r.json()) as { ok: boolean; text: string; truncated?: boolean; error?: string };
      setLog(j.ok ? j.text || '(empty)' : `error: ${j.error ?? 'unknown'}`);
    } catch (e) {
      setLog(e instanceof Error ? e.message : String(e));
    }
  }

  async function refresh() {
    try {
      const r = await fetch('/api/inferwall/status', { cache: 'no-store' });
      setStatus(await r.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, []);

  async function doInstall() {
    setBusy('install');
    setMsg(null);
    try {
      const r = await fetch('/api/inferwall/install', { method: 'POST' });
      const j = (await r.json()) as { ok: boolean; step?: string; error?: string };
      setMsg(j.ok ? 'Installed and started.' : `${j.step ?? 'install'} failed: ${j.error ?? '—'}`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }
  async function doStart() {
    setBusy('start');
    setMsg(null);
    try {
      const r = await fetch('/api/inferwall/start', { method: 'POST' });
      const j = (await r.json()) as {
        ok: boolean;
        pid?: number;
        error?: string;
        log_tail?: string;
      };
      if (j.ok) {
        setMsg(`Started (pid ${j.pid}).`);
      } else {
        setMsg(j.error ?? 'start failed');
        if (j.log_tail) {
          setLog(j.log_tail);
          setLogOpen(true);
        }
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }
  async function doStop() {
    setBusy('stop');
    setMsg(null);
    try {
      const r = await fetch('/api/inferwall/stop', { method: 'POST' });
      const j = (await r.json()) as { ok: boolean; error?: string };
      setMsg(j.ok ? 'Stopped.' : j.error ?? 'stop failed');
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return <div className="text-xs text-ink3 font-mono">loading…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono">
        <StateBadge label="Python" value={status.python_path ?? 'not found'} ok={!!status.python_path} />
        <StateBadge
          label="inferwall"
          value={status.installed ? status.version ?? 'installed' : 'not installed'}
          ok={status.installed}
        />
        <StateBadge
          label="Server"
          value={
            status.running
              ? status.pid
                ? `running · pid ${status.pid}`
                : 'running (external)'
              : status.pid_alive
                ? `pid ${status.pid} alive · port unreachable`
                : 'stopped'
          }
          ok={status.running}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {!status.installed && (
          <button
            onClick={doInstall}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-60"
          >
            {busy === 'install' ? <Loader2 size={14} className="animate-spin" strokeWidth={2} /> : <Download size={14} strokeWidth={2} />}
            Install + start
          </button>
        )}
        {status.installed && !status.running && (
          <button
            onClick={doStart}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-60"
          >
            {busy === 'start' ? <Loader2 size={14} className="animate-spin" strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
            Start server
          </button>
        )}
        {status.running && (
          <button
            onClick={doStop}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors disabled:opacity-60"
          >
            {busy === 'stop' ? <Loader2 size={14} className="animate-spin" strokeWidth={2} /> : <Square size={14} strokeWidth={2} />}
            Stop server
          </button>
        )}
      </div>

      {msg && <div className="text-xs font-mono text-ink2">{msg}</div>}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => {
            setLogOpen((v) => !v);
            if (!logOpen) fetchLog();
          }}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill border border-border bg-surface text-xs text-ink2 hover:text-ink hover:bg-hover transition-colors"
        >
          <FileText size={11} strokeWidth={1.75} />
          {logOpen ? 'Hide server log' : 'Show server log'}
        </button>
        {logOpen && (
          <button
            onClick={fetchLog}
            className="text-2xs font-mono text-ink3 hover:text-ink transition-colors"
          >
            refresh
          </button>
        )}
      </div>

      {logOpen && (
        <pre className="bg-subtle border border-divider rounded-md p-3 text-2xs font-mono text-ink2 leading-relaxed whitespace-pre-wrap break-words max-h-[280px] overflow-auto">
          {log ?? 'loading…'}
        </pre>
      )}

      <div className="text-2xs text-ink3 font-mono leading-relaxed">
        Wyrd installs Inferwall to <code className="text-ink2">~/.local/lib</code> via pip
        (user-site), generates a scan API key into <code className="text-ink2">$WYRD_DIR/inferwall/.env.local</code>,
        and runs the server on the configured base URL. Logs:{' '}
        <code className="text-ink2">{status.spawn_log_path}</code>.
      </div>
    </div>
  );
}

function StateBadge({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-divider bg-surface px-3 py-2 flex items-center gap-2 min-w-0">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-success' : 'bg-warning'}`}
        aria-hidden
      />
      <span className="text-ink3 shrink-0">{label}</span>
      <span className="text-ink truncate" title={value}>
        {value}
      </span>
    </div>
  );
}
