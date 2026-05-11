'use client';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { shortId } from '@/lib/format';

interface Verdict {
  decision: 'allow' | 'flag' | 'block';
  score: number;
  matches: Array<{
    signature_id: string;
    matched_text?: string;
    confidence?: number;
    severity?: number;
    score?: number;
  }>;
  request_id: string;
}

interface ScanItem {
  span_id: string;
  span_name: string;
  side: 'input' | 'output';
  verdict?: Verdict;
  scanner?: 'inferwall' | 'wyrd-guard';
  error?: string;
  cached?: boolean;
}

interface ScanResponse {
  ok: boolean;
  overall?: 'allow' | 'flag' | 'block' | 'unknown';
  items?: ScanItem[];
  scanner_used?: 'inferwall' | 'wyrd-guard';
  error?: string;
}

const DECISION_STYLE: Record<'allow' | 'flag' | 'block' | 'unknown', { bg: string; text: string; border: string; Icon: typeof ShieldCheck; label: string }> = {
  allow: { bg: 'bg-successSoft', text: 'text-success', border: 'border-successBorder', Icon: ShieldCheck, label: 'Allowed' },
  flag: { bg: 'bg-warningSoft', text: 'text-warning', border: 'border-warningBorder', Icon: ShieldAlert, label: 'Flagged' },
  block: { bg: 'bg-dangerSoft', text: 'text-danger', border: 'border-dangerBorder', Icon: ShieldX, label: 'Blocked' },
  unknown: { bg: 'bg-subtle', text: 'text-ink3', border: 'border-divider', Icon: ShieldCheck, label: 'No scan' },
};

export function SecurityPanel({ traceId }: { traceId: string }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);

  async function scan() {
    setScanning(true);
    setResult(null);
    try {
      const r = await fetch(`/api/inferwall/scan/${traceId}`, { method: 'POST' });
      const j = (await r.json()) as ScanResponse;
      setResult(j);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setScanning(false);
    }
  }

  const overall = result?.overall ?? 'unknown';
  const style = DECISION_STYLE[overall];
  const OverallIcon = style.Icon;

  return (
    <div className="space-y-4">
      <div className={`card border ${style.border} ${style.bg} p-4 flex items-start gap-4`}>
        <div className={`w-10 h-10 rounded-md flex items-center justify-center ${style.text}`}>
          <OverallIcon size={22} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${style.text}`}>
            {result ? `Trace verdict: ${style.label}` : 'Not yet scanned'}
          </div>
          <p className="text-xs text-ink3 mt-1">
            Scans every LLM input + output for prompt injection, jailbreak attempts, secrets, and PII.
            Falls back to the built-in <code className="font-mono text-ink2">wyrd-guard</code> scanner
            when Inferwall isn't running — works offline, works with any provider.
            {result?.scanner_used && (
              <>
                {' · scanner: '}
                <code className="font-mono text-ink2">{result.scanner_used}</code>
              </>
            )}
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-60"
        >
          {scanning ? (
            <Loader2 size={14} className="animate-spin" strokeWidth={2} />
          ) : (
            <ShieldCheck size={14} strokeWidth={2} />
          )}
          {result ? 'Re-scan' : 'Scan trace'}
        </button>
      </div>

      {result && !result.ok && (
        <div className="card border-dangerBorder bg-dangerSoft text-danger p-3 text-sm font-mono">
          {result.error ?? 'scan failed'}
        </div>
      )}

      {result?.items && result.items.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink3 bg-elevated border-b border-divider">
                <th className="text-left font-medium px-4 h-10 w-24">Verdict</th>
                <th className="text-left font-medium px-4 h-10">Span</th>
                <th className="text-left font-medium px-4 h-10 w-20">Side</th>
                <th className="text-right font-medium px-4 h-10 w-20">Score</th>
                <th className="text-left font-medium px-4 h-10">Signatures</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((it, i) => {
                const v = it.verdict;
                const dec = v?.decision ?? 'unknown';
                const sty = DECISION_STYLE[dec];
                return (
                  <tr key={`${it.span_id}-${it.side}-${i}`} className="border-b border-divider last:border-b-0">
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${sty.text}`}>
                        <sty.Icon size={12} strokeWidth={2} />
                        {sty.label}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-sm text-ink truncate">{it.span_name}</div>
                      <div className="text-2xs font-mono text-ink3">{shortId(it.span_id, 16)}</div>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-ink2">{it.side}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-ink2 tabular">
                      {v ? v.score.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {it.error ? (
                        <span className="text-xs text-danger font-mono inline-flex items-center gap-1">
                          <AlertTriangle size={12} strokeWidth={2} />
                          {it.error}
                        </span>
                      ) : v && v.matches.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {v.matches.slice(0, 4).map((m, j) => (
                            <span
                              key={j}
                              className="text-2xs font-mono bg-subtle border border-divider rounded-sm px-1.5 py-0.5 text-ink2"
                              title={`confidence ${m.confidence?.toFixed(2) ?? '?'} · severity ${m.severity ?? '?'}`}
                            >
                              {m.signature_id}
                            </span>
                          ))}
                          {v.matches.length > 4 && (
                            <span className="text-2xs text-ink3 font-mono">+{v.matches.length - 4}</span>
                          )}
                        </div>
                      ) : v ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 size={12} strokeWidth={2} />
                          clean
                        </span>
                      ) : (
                        <span className="text-xs text-ink3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result?.items && result.items.length === 0 && (
        <div className="card p-6 text-center text-sm text-ink3">
          No LLM calls in this trace to scan.
        </div>
      )}
    </div>
  );
}
