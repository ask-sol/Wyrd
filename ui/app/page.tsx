import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Disc3,
  GitCompare,
  History,
  LineChart,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { EmptyState } from '@/components/EmptyState';
import { TraceListClient } from '@/components/TraceListClient';
import { ImportBundleButton } from '@/components/BundleActions';
import { getRootDir } from '@/lib/store';
import { listTracesAggregated } from '@/lib/traceList';
import type { TraceListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

function HeroShapes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1280 320" preserveAspectRatio="xMidYMid slice">
        <g stroke="rgb(var(--ink-3) / 0.55)" fill="none" strokeWidth="1">
          <g transform="translate(880 30)">
            <path d="M0 0 L130 90 L46 220 L-66 100 Z" strokeDasharray="2 4" />
            <path d="M46 220 L62 295" strokeDasharray="2 4" />
            <circle cx="62" cy="298" r="2.4" fill="rgb(var(--ink-3) / 0.6)" />
          </g>
          <g transform="translate(180 50)" strokeDasharray="2 4">
            <path d="M0 0 L120 30 L90 150 L-20 110 Z" />
            <path d="M90 150 L100 230" />
            <circle cx="100" cy="232" r="2.2" fill="rgb(var(--ink-3) / 0.55)" stroke="none" />
          </g>
          <g transform="translate(540 200)" strokeDasharray="2 4">
            <path d="M0 0 L80 -10 L120 60 L40 90 Z" />
            <path d="M40 90 L48 140" />
          </g>
          <g strokeDasharray="2 4">
            <path d="M40 260 L320 240" />
            <path d="M740 100 L1040 70" />
            <path d="M1100 220 L1240 250" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function ActivationRing({ recent, total }: { recent: number; total: number }) {
  // Show "recent / total" with the ring at recent/max(total,recent,1).
  const denom = Math.max(total, recent, 1);
  const pct = recent / denom;
  const C = 2 * Math.PI * 36;
  const dash = pct * C;
  return (
    <div className="relative inline-flex items-center justify-center w-[88px] h-[88px] rounded-full">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r="36" stroke="rgb(var(--divider))" strokeWidth="6" fill="none" />
        <circle
          cx="44"
          cy="44"
          r="36"
          stroke="rgb(var(--success))"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 44 44)"
        />
      </svg>
      <Disc3 size={26} strokeWidth={1.75} className="absolute text-success" />
    </div>
  );
}

interface ChipProps {
  href: string;
  label: string;
  icon?: React.ReactNode;
  delay?: number;
}
function QuickChip({ href, label, icon, delay }: ChipProps) {
  return (
    <Link
      href={href}
      className="animate-in-up inline-flex items-center gap-2 h-9 px-4 rounded-pill border border-border bg-surface text-sm text-ink hover:bg-hover hover:border-borderHi hover:-translate-y-0.5 transition-all"
      style={delay !== undefined ? { animationDelay: `${delay}ms` } : undefined}
    >
      {icon ?? <Plus size={14} strokeWidth={2} className="text-brand" />}
      <span>{label}</span>
    </Link>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent } = await searchParams;
  let traces: TraceListItem[] = [];
  let error: string | null = null;
  try {
    traces = await listTracesAggregated({ ...(agent ? { agent } : {}), limit: 500 });
  } catch (err) {
    console.error('[wyrd-ui] loadTraces failed:', err);
    error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  }
  const dir = getRootDir();

  const totalCost = traces.reduce((s, t) => s + t.cost_usd, 0);
  const totalInTokens = traces.reduce((s, t) => s + t.input_tokens, 0);
  const totalOutTokens = traces.reduce((s, t) => s + t.output_tokens, 0);
  const totalTokens = totalInTokens + totalOutTokens;
  // Recent = last 24h
  const dayAgo = Date.now() - 86_400_000;
  const recent = traces.filter((t) => t.started_at >= dayAgo).length;
  const dirShort = dir.split('/').filter(Boolean).slice(-1)[0] ?? dir;

  const refreshAction = (
    <div className="flex items-center gap-2">
      <ImportBundleButton />
      <form action="/" method="get">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border border-border bg-surface text-sm text-brand hover:bg-brandSoft transition-colors"
        >
          <RefreshCw size={14} strokeWidth={1.75} />
          Refresh
        </button>
      </form>
    </div>
  );

  return (
    <Shell crumbs={[{ label: 'Home' }]} storeDir={dir} pageActions={refreshAction} activePath="/">
      <section className="relative bg-bg border-b border-border">
        <HeroShapes />
        <div className="relative max-w-[1280px] mx-auto px-8 pt-10 pb-7">
          <div className="animate-in-up" style={{ animationDelay: '60ms' }}>
            <div className="text-[11px] uppercase tracking-wider text-faint font-medium mb-3">
              Wyrd Console
            </div>
            <h1 className="text-[36px] leading-tight font-normal text-ink tracking-tight">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-ink3 max-w-xl">
              Replay, inspect, and audit every LLM call and tool invocation across your agents — all
              on your own disk.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <div
              className="card bg-elevated p-6 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in-up"
              style={{ animationDelay: '120ms' }}
            >
              <div>
                <div className="text-base text-ink mb-1">
                  Your local store is{' '}
                  <span className="font-medium">capturing traces</span>
                </div>
                <div className="text-sm text-ink3 mb-5">
                  Every span lands here as it's produced. Replay, diff, and re-execute on demand.
                </div>
                <div className="flex items-center gap-4">
                  <ActivationRing recent={recent} total={traces.length} />
                  <div>
                    <div className="text-2xl font-normal text-ink tabular">
                      {traces.length.toLocaleString()}{' '}
                      <span className="text-sm text-ink3">
                        {traces.length === 1 ? 'trace' : 'traces'}
                      </span>
                    </div>
                    <div className="text-xs text-ink3 mt-0.5 tabular">
                      <span className="font-mono text-success">+{recent.toLocaleString()}</span>{' '}
                      in last 24h
                    </div>
                    <div className="text-xs text-ink3 mt-1 tabular">
                      <span className="font-mono">{totalTokens.toLocaleString()}</span> tokens ·{' '}
                      <span className="font-mono">${totalCost.toFixed(4)}</span> total
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-ink3 mb-1">
                  You're working on store{' '}
                  <span className="text-ink font-medium">{dirShort}</span>
                </div>
                <div className="text-xs text-ink3 font-mono mb-4 truncate" title={dir}>
                  {dir}
                </div>
                <ul className="space-y-2 text-sm">
                  <li>
                    <Link href="/agents" className="text-brand hover:underline">
                      Browse agents
                    </Link>
                  </li>
                  <li>
                    <Link href="/live" className="text-brand hover:underline">
                      Watch live activity
                    </Link>
                  </li>
                  <li>
                    <Link href="/insights" className="text-brand hover:underline">
                      Review usage & cost
                    </Link>
                  </li>
                  <li>
                    <Link href="/settings" className="text-brand hover:underline">
                      Configure capture
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div
              className="card bg-elevated p-6 flex flex-col animate-in-up"
              style={{ animationDelay: '180ms' }}
            >
              <div className="text-base text-ink mb-1 flex items-center gap-2">
                <Sparkles size={16} strokeWidth={1.75} className="text-brand" />
                Try Wyrd Time-Travel Replay
              </div>
              <div className="text-xs text-ink3 leading-relaxed">
                Step through any captured trace span-by-span. Re-execute prompts with one click and
                diff the two timelines side-by-side.
              </div>
              <div className="mt-auto pt-6">
                <Link
                  href="/replays"
                  className="inline-flex items-center gap-2 text-brand hover:underline text-sm font-medium"
                >
                  Open replays
                  <ArrowRight size={14} strokeWidth={2} />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 flex-wrap">
            <QuickChip href="/agents" label="Connect an agent" delay={240} />
            <QuickChip
              href="/live"
              label="Open live activity"
              delay={280}
              icon={<Activity size={14} strokeWidth={1.75} className="text-brand" />}
            />
            <QuickChip
              href="/insights"
              label="View insights"
              delay={320}
              icon={<LineChart size={14} strokeWidth={1.75} className="text-brand" />}
            />
            <QuickChip
              href="/diff"
              label="Diff two traces"
              delay={360}
              icon={<GitCompare size={14} strokeWidth={1.75} className="text-brand" />}
            />
            <QuickChip
              href="/replays"
              label="Browse replays"
              delay={400}
              icon={<History size={14} strokeWidth={1.75} className="text-brand" />}
            />
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-8 py-8 animate-in-up" style={{ animationDelay: '300ms' }}>
        <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-normal text-ink">
              Recent traces
              {agent && (
                <span className="ml-2 text-sm text-brand">
                  · filtered to <code className="font-mono">{agent}</code>{' '}
                  <Link href="/" className="text-xs text-ink3 hover:text-ink underline ml-1">
                    clear
                  </Link>
                </span>
              )}
            </h2>
            <div className="text-xs text-ink3 mt-1">
              {traces.length > 0 ? (
                <>
                  Showing <span className="font-mono tabular">{traces.length.toLocaleString()}</span>{' '}
                  {traces.length === 1 ? 'run' : 'runs'} from this store
                </>
              ) : (
                'Captured agent executions appear here.'
              )}
            </div>
          </div>
        </div>

        {error ? (
          <div className="card border-dangerBorder bg-dangerSoft text-danger p-4 text-sm font-mono whitespace-pre-wrap">
            {error}
          </div>
        ) : traces.length === 0 ? (
          <EmptyState dir={dir} />
        ) : (
          <TraceListClient initial={traces} />
        )}
      </section>
    </Shell>
  );
}
