'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Play,
  RefreshCw,
  Rocket,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Spinner } from './Spinner';

interface Props {
  /** Called when the wizard finishes or is dismissed. */
  onDone: () => void;
  /** Called every time a store is registered so the parent panel can refresh. */
  onRegistered?: () => void;
}

type Stage = 'configure' | 'await' | 'created';

interface StatusOut {
  exists: boolean;
  hasDb: boolean;
  dbBytes: number;
  dbMtimeMs: number | null;
  traceCount: number;
  spanCount: number;
  lastTraceAt: number | null;
  blobCount: number;
  hasActivity: boolean;
  error?: string;
}

function safeName(n: string): string {
  return n.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
}

function fullPath(baseDir: string, name: string): string {
  const cleanBase = baseDir.trim().replace(/\/$/, '');
  return `${cleanBase}/${name}`;
}

function buildCommand({
  fullDir,
  launchOpenAgent,
}: {
  fullDir: string;
  launchOpenAgent: boolean;
}): string {
  const dir = fullDir.startsWith('~') ? `"$HOME${fullDir.slice(1)}"` : `"${fullDir}"`;
  if (launchOpenAgent) {
    // Prefer the Homebrew keg's binary if brew installed openagent — this
    // sidesteps `~/.local/bin/openagent` and other shadowing shims on PATH
    // that often pin to an older version. Falls back to `command -v` for
    // `npm i -g` / `npm link` installs, then to a copy-pasteable hint.
    return [
      `mkdir -p ${dir} && \\`,
      `  WYRD_DIR=${dir} WYRD_ENABLED=1 \\`,
      `  $({ p="$(brew --prefix openagent 2>/dev/null)/bin/openagent"; [ -x "$p" ] && echo "$p"; } || command -v openagent || echo 'echo "openagent not found — run: brew install ask-sol/openagent/openagent (or npm i -g openagent)" && false')`,
    ].join('\n');
  }
  return [
    `mkdir -p ${dir} && \\`,
    `  export WYRD_DIR=${dir} WYRD_ENABLED=1 && \\`,
    `  echo "Wyrd store ready at ${fullDir}"`,
  ].join('\n');
}

function CommandBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }
  return (
    <div className="relative group">
      <div className="absolute top-0 left-0 right-0 h-7 flex items-center px-2.5 border-b border-divider bg-bg/40 rounded-t-md pointer-events-none">
        <Terminal size={12} strokeWidth={1.75} className="text-faint" />
        <span className="ml-1.5 text-[10px] uppercase tracking-wider text-faint font-mono">
          bash
        </span>
      </div>
      <pre className="bg-subtle border border-divider rounded-md pt-9 pb-3.5 px-3 text-[13px] font-mono text-ink overflow-x-auto whitespace-pre leading-relaxed">
        {code}
      </pre>
      <button
        type="button"
        onClick={copy}
        title="Copy"
        className="absolute top-1 right-1.5 inline-flex items-center gap-1.5 h-6 px-2 rounded-sm text-[11px] font-medium text-ink2 hover:text-ink hover:bg-hover transition-colors"
      >
        {copied ? (
          <>
            <Check size={12} strokeWidth={2} className="text-success" /> Copied
          </>
        ) : (
          <>
            <Copy size={12} strokeWidth={1.75} /> Copy
          </>
        )}
      </button>
    </div>
  );
}

function StepIndicator({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string }[] = [
    { id: 'configure', label: 'Configure' },
    { id: 'await', label: 'Connect' },
    { id: 'created', label: 'Ready' },
  ];
  const idx = steps.findIndex((s) => s.id === stage);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1.5">
          <span
            className={`h-1.5 rounded-pill transition-all ${
              i < idx ? 'w-6 bg-brand' : i === idx ? 'w-12 bg-brand' : 'w-6 bg-divider'
            }`}
          />
        </div>
      ))}
    </div>
  );
}

export function StoreOnboarding({ onDone, onRegistered }: Props) {
  const [stage, setStage] = useState<Stage>('configure');
  const [name, setName] = useState('my-agent');
  const [baseDir, setBaseDir] = useState('~/.wyrd-stores');
  const [launchOpenAgent, setLaunchOpenAgent] = useState(true);
  const [createdDir, setCreatedDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusOut | null>(null);
  const [friendlyName, setFriendlyName] = useState('');
  const [registering, setRegistering] = useState(false);
  const pollRef = useRef<number | null>(null);

  const validName = useMemo(() => safeName(name), [name]);
  const previewDir = fullPath(baseDir, validName || 'my-agent');
  const command = buildCommand({ fullDir: previewDir, launchOpenAgent });

  async function createAndAdvance(toAwait: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/stores/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: validName, baseDir }),
      });
      const j = (await r.json()) as { ok: boolean; dir?: string; error?: string };
      if (!j.ok || !j.dir) throw new Error(j.error ?? 'failed to create store');
      setCreatedDir(j.dir);
      setFriendlyName(validName);
      // Register immediately so the panel sees it even if the user closes early.
      await fetch('/api/stores/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dir: j.dir, name: validName }),
      });
      onRegistered?.();
      // Copy the command so it's ready to paste.
      try {
        await navigator.clipboard.writeText(command);
      } catch {
        /* clipboard may be denied in this context */
      }
      setStage(toAwait ? 'await' : 'created');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Poll status while awaiting first activity.
  useEffect(() => {
    if (stage !== 'await' || !createdDir) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    async function tick() {
      try {
        const r = await fetch(`/api/stores/status?path=${encodeURIComponent(createdDir!)}`, {
          cache: 'no-store',
        });
        const j = (await r.json()) as StatusOut;
        setStatus(j);
        // Flip the moment ANY activity is seen — a fresh DB file, a span, a
        // blob, or a trace. Waiting for "traceCount > 0" missed mid-conversation
        // writes (spans land first; the trace row is updated as the run grows).
        if (j.hasActivity) setStage('created');
      } catch {
        /* keep polling */
      }
    }
    void tick();
    pollRef.current = window.setInterval(tick, 1500);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [stage, createdDir]);

  async function saveFriendlyName() {
    if (!createdDir) return;
    setRegistering(true);
    try {
      await fetch('/api/stores/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dir: createdDir,
          name: friendlyName.trim() || validName,
          setActive: true,
        }),
      });
      onRegistered?.();
      onDone();
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-4 border-b border-divider">
        <div className="text-[11px] uppercase tracking-wider text-faint font-medium mb-2">
          New store
        </div>
        <StepIndicator stage={stage} />
        <h2 className="mt-4 text-xl font-normal text-ink">
          {stage === 'configure' && 'Create a Wyrd store'}
          {stage === 'await' && 'Run this command in your terminal'}
          {stage === 'created' && 'Your store is live'}
        </h2>
        <p className="mt-1.5 text-sm text-ink3">
          {stage === 'configure' &&
            'Wyrd generates a one-liner that creates the store, exports the env vars, and (optionally) launches your agent.'}
          {stage === 'await' &&
            'We are watching the folder. The moment your agent records its first span, we will flip to ready.'}
          {stage === 'created' &&
            'Captured your first activity. Give it a friendly name and Wyrd will remember it.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {stage === 'configure' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-3">
              <div>
                <label className="block text-xs font-medium text-ink2 mb-1.5">Store name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-agent"
                  className="w-full h-9 px-3 bg-surface border border-border rounded-sm text-sm text-ink font-mono placeholder:text-faint focus:border-brand outline-none"
                />
                {name !== validName && (
                  <p className="mt-1 text-[11px] text-warning font-mono">→ {validName}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink2 mb-1.5">
                  Parent directory
                </label>
                <input
                  type="text"
                  value={baseDir}
                  onChange={(e) => setBaseDir(e.target.value)}
                  placeholder="~/.wyrd-stores"
                  className="w-full h-9 px-3 bg-surface border border-border rounded-sm text-sm text-ink font-mono placeholder:text-faint focus:border-brand outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={launchOpenAgent}
                onChange={(e) => setLaunchOpenAgent(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              <span className="text-sm text-ink">
                Launch OpenAgent automatically
                <span className="ml-1.5 text-xs text-ink3">
                  (skip to just create the folder)
                </span>
              </span>
            </label>

            <div>
              <div className="text-xs font-medium text-ink2 mb-1.5">Generated command</div>
              <CommandBlock code={command} />
              <p className="mt-2 text-[11px] text-ink3">
                We will create the folder now, copy the command to your clipboard, then watch for
                your first trace.
              </p>
            </div>

            {err && (
              <div className="rounded-sm bg-dangerSoft border border-dangerBorder px-3 py-2 text-xs text-danger font-mono whitespace-pre-wrap">
                {err}
              </div>
            )}
          </div>
        )}

        {stage === 'await' && createdDir && (
          <div className="space-y-5">
            <div className="flex items-center justify-center py-2">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-brand/20 blur-2xl animate-pulse" />
                <div className="relative inline-flex items-center justify-center h-16 w-16 rounded-full bg-brandSoft border border-brandBorder">
                  <Spinner size={28} className="text-brand" />
                </div>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-ink">
                Listening at <span className="font-mono">{createdDir}</span>
              </div>
              <div className="text-xs text-ink3 mt-1">
                {!status
                  ? 'Checking…'
                  : status.hasActivity
                    ? 'Activity detected — switching to ready.'
                    : 'No activity yet — paste & run the command above.'}
              </div>
            </div>

            {/* Live diagnostics — three signal lights so the user can see why
                we have or have not flipped to ready. */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'DB file', ok: !!status?.hasDb, value: status?.hasDb ? 'yes' : 'none' },
                {
                  label: 'Spans',
                  ok: !!status && status.spanCount > 0,
                  value: status ? status.spanCount.toLocaleString() : '—',
                },
                {
                  label: 'Blobs',
                  ok: !!status && status.blobCount > 0,
                  value: status ? status.blobCount.toLocaleString() : '—',
                },
              ].map((d) => (
                <div
                  key={d.label}
                  className={`rounded-md border px-2 py-2 ${
                    d.ok
                      ? 'border-successBorder bg-successSoft'
                      : 'border-divider bg-subtle'
                  }`}
                >
                  <div className={`text-base font-mono tabular ${d.ok ? 'text-success' : 'text-ink2'}`}>
                    {d.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-ink3 mt-0.5">
                    {d.label}
                  </div>
                </div>
              ))}
            </div>

            {status?.error && (
              <div className="rounded-sm bg-dangerSoft border border-dangerBorder px-3 py-2 text-xs text-danger font-mono whitespace-pre-wrap">
                {status.error}
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-ink2 mb-1.5">Command (already copied)</div>
              <CommandBlock code={command} />
              <p className="mt-2 text-[11px] text-ink3">
                If you see <code className="font-mono">openagent not found</code>, install with{' '}
                <code className="font-mono text-ink">npm i -g openagent</code> (or link a local
                checkout with <code className="font-mono text-ink">npm link</code>), then re-run.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-ink3">
              <RefreshCw size={11} strokeWidth={1.75} className="animate-spin" />
              <span>Polling every 1.5s</span>
            </div>
          </div>
        )}

        {stage === 'created' && createdDir && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center pt-2">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-successSoft border border-successBorder mb-3">
                <Check size={26} strokeWidth={2} className="text-success" />
              </div>
              <div className="text-lg font-normal text-ink">
                {status && status.traceCount > 0
                  ? `${status.traceCount.toLocaleString()} ${status.traceCount === 1 ? 'trace' : 'traces'} captured`
                  : 'Store ready'}
              </div>
              <div className="text-xs text-ink3 font-mono mt-1">{createdDir}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink2 mb-1.5">Friendly name</label>
              <input
                type="text"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder={validName || 'My agent'}
                className="w-full h-9 px-3 bg-surface border border-border rounded-sm text-sm text-ink focus:border-brand outline-none"
              />
              <p className="mt-1 text-xs text-ink3">
                Shown in the project picker and store list. You can rename it any time.
              </p>
            </div>

            {status && status.traceCount === 0 && (
              <div className="rounded-sm bg-brandSoft border border-brandBorder px-3 py-2 text-xs text-ink2">
                Tip: when you're ready to inspect this store in the console, restart Wyrd with{' '}
                <code className="font-mono text-ink">WYRD_DIR={createdDir}</code>.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-3 border-t border-divider flex items-center justify-between gap-2">
        {stage === 'configure' && (
          <>
            <button
              type="button"
              onClick={onDone}
              className="h-9 px-3 rounded-pill text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => createAndAdvance(false)}
                disabled={busy || !validName}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-pill border border-border text-sm text-ink2 hover:bg-hover transition-colors disabled:opacity-50"
              >
                {busy ? <Spinner size={14} /> : <Sparkles size={14} strokeWidth={1.75} />}
                Just create
              </button>
              <button
                type="button"
                onClick={() => createAndAdvance(true)}
                disabled={busy || !validName}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-brand text-white text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-50"
              >
                {busy ? <Spinner size={14} color="white" /> : <Play size={14} strokeWidth={2} />}
                {launchOpenAgent ? 'Generate & copy' : 'Create store'}
              </button>
            </div>
          </>
        )}
        {stage === 'await' && (
          <>
            <button
              type="button"
              onClick={() => setStage('configure')}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-pill text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
            >
              <ArrowLeft size={13} strokeWidth={1.75} />
              Back
            </button>
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/ask-sol/Wyrd#sdks"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 h-9 px-3 rounded-pill border border-border text-sm text-ink2 hover:bg-hover transition-colors"
              >
                <ExternalLink size={13} strokeWidth={1.75} />
                SDK docs
              </a>
              <button
                type="button"
                onClick={() => setStage('created')}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-brand text-white text-sm font-medium hover:bg-brandStrong transition-colors"
              >
                <ChevronRight size={14} strokeWidth={2} />
                Skip wait
              </button>
            </div>
          </>
        )}
        {stage === 'created' && (
          <>
            <button
              type="button"
              onClick={onDone}
              className="h-9 px-3 rounded-pill text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={saveFriendlyName}
              disabled={registering}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-brand text-white text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-50"
            >
              {registering ? <Spinner size={14} color="white" /> : <Rocket size={14} strokeWidth={1.75} />}
              Save & set active
            </button>
          </>
        )}
      </div>
    </div>
  );
}
