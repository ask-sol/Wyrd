'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Edit3, Loader2, PlayCircle, X } from 'lucide-react';

export function ReexecuteButton({
  traceId,
  disabled,
}: {
  traceId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [promptOverride, setPromptOverride] = useState('');
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    new_trace_id?: string;
    error?: string;
    stderr_tail?: string;
    stdout_tail?: string;
    prompt_preview?: string;
  } | null>(null);

  async function go() {
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch(`/api/reproduce/${encodeURIComponent(traceId)}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(editMode && promptOverride.trim() ? { prompt_override: promptOverride } : {}),
          ...(enableWebSearch ? { enable_anthropic_web_search: true } : {}),
        }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        new_trace_id?: string;
        error?: string;
        stderr_tail?: string;
        stdout_tail?: string;
        prompt_preview?: string;
      };
      setResult(j);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-pill bg-success/90 hover:bg-success text-bg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Spawn a fresh OpenAgent run with this trace's prompt"
      >
        <PlayCircle size={14} strokeWidth={2.5} />
        Re-execute
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-bg/70 flex items-start justify-center p-6 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !running) setOpen(false);
          }}
        >
          <div className="card shadow-e2 w-full max-w-2xl my-8">
            <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
              <div>
                <div className="text-base font-medium text-ink">Re-execute</div>
                <div className="text-xs text-ink3 mt-0.5">
                  Spawns a fresh OpenAgent run with <code className="font-mono text-ink2">WYRD_ENABLED=1</code>.
                  The new trace will appear in your store; you'll be navigated to it when done.
                </div>
              </div>
              <button
                onClick={() => !running && setOpen(false)}
                className="text-ink3 hover:text-ink"
                aria-label="Close"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            {!result ? (
              <div className="p-5 space-y-4">
                <div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editMode}
                      onChange={(e) => setEditMode(e.target.checked)}
                      className="accent-brand"
                    />
                    <span className="text-sm text-ink2 inline-flex items-center gap-1">
                      <Edit3 size={12} strokeWidth={1.75} />
                      Edit the prompt before running
                    </span>
                  </label>
                  {editMode && (
                    <textarea
                      value={promptOverride}
                      onChange={(e) => setPromptOverride(e.target.value)}
                      rows={5}
                      placeholder="Leave blank to use the original trace's user prompt."
                      className="mt-2 w-full bg-surface border border-border rounded-sm text-sm p-2.5 font-mono focus:border-brand focus:border-2 outline-none resize-y placeholder:text-ink3"
                    />
                  )}
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableWebSearch}
                    onChange={(e) => setEnableWebSearch(e.target.checked)}
                    className="accent-brand"
                  />
                  <span className="text-sm text-ink2">
                    Enable Anthropic server-side <code className="font-mono">web_search</code>
                  </span>
                </label>

                <div className="text-xs text-ink3">
                  This is a <strong className="text-ink2">live execution</strong> — it bills your LLM provider for real
                  tokens. To just rewatch the captured trace without re-billing, use the
                  <code className="font-mono text-ink2"> Replay </code> tab instead.
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-3 text-sm">
                {result.ok ? (
                  <div className="space-y-3">
                    <div className="text-success font-medium">New trace captured.</div>
                    <div className="text-xs font-mono text-ink2 break-all">
                      {result.new_trace_id}
                    </div>
                    {result.prompt_preview && (
                      <div>
                        <div className="text-2xs text-ink3 uppercase tracking-wider mb-1">Prompt used</div>
                        <div className="text-xs font-mono text-ink2 bg-subtle border border-divider rounded-sm p-2 max-h-[120px] overflow-auto whitespace-pre-wrap">
                          {result.prompt_preview}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-danger font-medium">Re-execute failed.</div>
                    <div className="text-xs font-mono text-ink2">{result.error}</div>
                    {result.stderr_tail && (
                      <>
                        <div className="text-2xs text-ink3 uppercase tracking-wider">stderr tail</div>
                        <pre className="bg-subtle border border-divider rounded-sm p-2 text-2xs font-mono max-h-[160px] overflow-auto whitespace-pre-wrap break-words">
                          {result.stderr_tail}
                        </pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="px-5 py-3 border-t border-divider flex items-center justify-end gap-2">
              {!result ? (
                <>
                  <button
                    onClick={() => setOpen(false)}
                    disabled={running}
                    className="h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={go}
                    disabled={running}
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-pill bg-success/90 hover:bg-success text-bg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {running ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} strokeWidth={2} />}
                    {running ? 'Running…' : 'Run'}
                  </button>
                </>
              ) : result.ok && result.new_trace_id ? (
                <>
                  <button
                    onClick={() => {
                      setResult(null);
                      setOpen(false);
                    }}
                    className="h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const newId = result.new_trace_id!;
                      setOpen(false);
                      setResult(null);
                      router.push(`/trace/${encodeURIComponent(newId)}`);
                      router.refresh();
                    }}
                    className="h-8 px-4 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors"
                  >
                    Open new trace →
                  </button>
                  <button
                    onClick={() => {
                      const newId = result.new_trace_id!;
                      setOpen(false);
                      setResult(null);
                      router.push(`/diff?a=${encodeURIComponent(traceId)}&b=${encodeURIComponent(newId)}`);
                    }}
                    className="h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
                  >
                    Diff vs original
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setResult(null)}
                  className="h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
