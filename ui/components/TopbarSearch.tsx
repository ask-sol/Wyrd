'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bot, GitBranch, Layers, Search } from 'lucide-react';

interface Hit {
  kind: 'trace' | 'agent' | 'span';
  label: string;
  detail: string;
  href: string;
}

const ICONS = {
  trace: Layers,
  agent: Bot,
  span: GitBranch,
} as const;

export function TopbarSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        const json = (await r.json()) as { hits: Hit[] };
        if (cancelled) return;
        setHits(json.hits);
        setActive(0);
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  const grouped = useMemo(() => {
    const g: Record<Hit['kind'], Hit[]> = { trace: [], agent: [], span: [] };
    for (const h of hits) g[h.kind].push(h);
    return g;
  }, [hits]);

  function navigateTo(href: string) {
    setOpen(false);
    setQ('');
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = hits[active];
      if (h) navigateTo(h.href);
    }
  }

  return (
    <div className="relative w-full">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none"
        strokeWidth={1.75}
      />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Search (/) traces, agents, spans"
        className="w-full h-9 pl-9 pr-12 bg-subtle border border-transparent rounded-md text-sm placeholder:text-ink3 hover:bg-hover focus:bg-surface focus:border-brand outline-none transition-colors"
      />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs font-mono text-ink3 bg-surface border border-divider rounded-sm px-1.5 py-0.5 pointer-events-none">
        /
      </kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 card shadow-e2 max-h-[480px] overflow-y-auto z-50">
          {hits.length === 0 ? (
            <div className="px-4 py-5 text-sm text-ink3 text-center">
              No matches for <span className="font-mono text-ink2">{q}</span>
            </div>
          ) : (
            <div className="py-1">
              {(['trace', 'agent', 'span'] as const).map((k) =>
                grouped[k].length > 0 ? (
                  <div key={k}>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wider text-faint uppercase">
                      {k === 'trace' ? 'Traces' : k === 'agent' ? 'Agents' : 'Spans'}
                    </div>
                    {grouped[k].map((h) => {
                      const Icon = ICONS[h.kind];
                      const isActive = hits[active]?.href === h.href;
                      return (
                        <Link
                          key={h.href}
                          href={h.href}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            navigateTo(h.href);
                          }}
                          className={`flex items-center gap-3 px-3 py-2 text-sm ${
                            isActive ? 'bg-brandSoft' : 'hover:bg-hover'
                          }`}
                        >
                          <Icon size={14} strokeWidth={1.75} className="text-ink3 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div
                              className={`font-mono truncate ${
                                isActive ? 'text-brand' : 'text-ink'
                              }`}
                            >
                              {h.label}
                            </div>
                            <div className="text-xs text-ink3 truncate font-mono">{h.detail}</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
