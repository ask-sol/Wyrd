'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';

export function ExportBundleButton({ traceId }: { traceId: string }) {
  const [busy, setBusy] = useState(false);
  const [sanitize, setSanitize] = useState(true);
  const [open, setOpen] = useState(false);

  function go() {
    setBusy(true);
    const url = `/api/traces/${encodeURIComponent(traceId)}/export${sanitize ? '?sanitize=1' : ''}`;
    // Browser handles the file download natively.
    window.location.href = url;
    window.setTimeout(() => setBusy(false), 1200);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors"
      >
        {busy ? <Loader2 size={14} className="animate-spin" strokeWidth={1.75} /> : <Download size={14} strokeWidth={1.75} />}
        Export bundle
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 card shadow-e2 z-40 w-80 p-4 space-y-3">
            <div className="text-sm font-medium text-ink">Export this trace</div>
            <p className="text-xs text-ink3">
              Produces a single <code className="font-mono">.wyrdpack</code> file containing the trace,
              its spans, events, links, annotations, and every referenced blob. Compressed with gzip.
            </p>
            <label className="inline-flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={sanitize}
                onChange={(e) => setSanitize(e.target.checked)}
                className="accent-brand mt-0.5"
              />
              <span className="text-ink2">
                Sanitize before export · run <code className="font-mono">wyrd-guard</code> over every
                blob and redact matched secrets / PII (replaced with <code className="font-mono">«REDACTED:…»</code>).
              </span>
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setOpen(false)}
                className="h-7 px-2.5 rounded-pill border border-border bg-surface text-xs text-ink2 hover:text-ink hover:bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={go}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-brand text-bg text-xs font-medium hover:bg-brandStrong transition-colors"
              >
                <Download size={12} strokeWidth={2} /> Download
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ImportBundleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const r = await fetch('/api/bundles/import', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: buf,
      });
      const j = (await r.json()) as {
        ok: boolean;
        trace_id?: string;
        spans?: number;
        blobs?: number;
        annotations?: number;
        warning?: string;
        error?: string;
      };
      if (j.ok && j.trace_id) {
        setMsg(`imported · ${j.spans} spans · ${j.blobs} blobs · ${j.annotations} notes`);
        router.refresh();
        window.setTimeout(() => router.push(`/trace/${j.trace_id}`), 600);
      } else {
        setMsg(`failed · ${j.error ?? 'unknown'}`);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      e.target.value = ''; // allow re-pick same file
    }
  }

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="file"
        accept=".wyrdpack,application/octet-stream,application/gzip"
        onChange={onPick}
        className="hidden"
      />
      <span
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors ${
          busy ? 'opacity-60' : ''
        }`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" strokeWidth={1.75} /> : <Upload size={14} strokeWidth={1.75} />}
        Import bundle
      </span>
      {msg && <span className="text-xs font-mono text-ink3">{msg}</span>}
    </label>
  );
}
