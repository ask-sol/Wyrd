'use client';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, Loader2, Search } from 'lucide-react';
import type { WyrdBlobRef } from '@/lib/types';

interface Hit {
  type?: string;
  title?: string;
  url?: string;
  encrypted_content?: string;
  page_age?: string;
}

async function fetchJson(hash: string): Promise<unknown> {
  const r = await fetch(`/api/blobs/${hash}`, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`blob ${hash}: ${r.status}`);
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function hostnameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function WebSearchView({
  argsRef,
  resultRef,
}: {
  argsRef?: WyrdBlobRef | null;
  resultRef?: WyrdBlobRef | null;
}) {
  const [args, setArgs] = useState<unknown>(null);
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      argsRef ? fetchJson(argsRef.hash) : Promise.resolve(null),
      resultRef ? fetchJson(resultRef.hash) : Promise.resolve(null),
    ])
      .then(([a, r]) => {
        if (cancelled) return;
        setArgs(a);
        setResult(r);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [argsRef?.hash, resultRef?.hash]);

  const query = useMemo(() => {
    if (isObj(args) && typeof args.query === 'string') return args.query;
    return null;
  }, [args]);

  const hits = useMemo<Hit[]>(() => {
    if (Array.isArray(result)) return result.filter((h): h is Hit => isObj(h));
    return [];
  }, [result]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink3 p-2">
        <Loader2 size={14} className="animate-spin" strokeWidth={1.75} />
        Loading search data…
      </div>
    );
  }
  if (err) {
    return <div className="text-xs text-danger font-mono">{err}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-divider bg-elevated p-3">
        <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ink3 font-medium mb-1.5">
          <Search size={11} strokeWidth={2} />
          Query
        </div>
        {query ? (
          <div className="font-mono text-sm text-ink break-words">{query}</div>
        ) : (
          <div className="text-xs text-ink3 italic">no query field in args</div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ink3 font-medium mb-2 px-1">
          <Globe size={11} strokeWidth={2} />
          {hits.length === 0 ? 'No results' : `${hits.length} result${hits.length === 1 ? '' : 's'}`}
        </div>
        {hits.length === 0 ? (
          <pre className="bg-subtle border border-divider rounded-md p-3 text-xs font-mono text-ink2 whitespace-pre-wrap break-words max-h-[260px] overflow-auto">
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <ol className="space-y-1.5">
            {hits.map((h, i) => {
              const host = hostnameOf(h.url);
              return (
                <li key={i}>
                  <a
                    href={h.url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md border border-divider bg-surface hover:border-brand hover:bg-elevated transition-colors px-3 py-2 group"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-2xs font-mono text-faint tabular shrink-0 mt-0.5">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm text-brand font-medium truncate group-hover:underline underline-offset-2">
                            {h.title || h.url || '(untitled)'}
                          </span>
                          <ExternalLink
                            size={11}
                            strokeWidth={1.75}
                            className="text-ink3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </div>
                        {host && (
                          <div className="text-2xs font-mono text-ink3 truncate mt-0.5">
                            {host}
                            {h.page_age && (
                              <>
                                <span className="mx-1.5 text-faint">·</span>
                                <span>{h.page_age}</span>
                              </>
                            )}
                          </div>
                        )}
                        {h.url && h.url !== h.title && (
                          <div className="text-2xs font-mono text-faint truncate mt-0.5" title={h.url}>
                            {h.url}
                          </div>
                        )}
                      </div>
                    </div>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
