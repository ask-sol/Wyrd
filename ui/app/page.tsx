import { RefreshCw } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { TraceListClient } from '@/components/TraceListClient';
import { ImportBundleButton } from '@/components/BundleActions';
import { getRootDir } from '@/lib/store';
import { listTracesAggregated } from '@/lib/traceList';
import type { TraceListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

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
    <Shell crumbs={[{ label: 'Traces' }]} storeDir={dir} pageActions={refreshAction}>
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <PageHeader
          title="Traces"
          subtitle={
            <>
              {agent && (
                <span className="inline-flex items-center gap-2 mr-3 text-brand">
                  filtered to agent <code className="font-mono">{agent}</code>
                  <a href="/" className="text-xs text-ink3 hover:text-ink underline">
                    clear
                  </a>
                </span>
              )}
              {traces.length > 0 ? (
                <span>
                  <span className="font-mono tabular">{traces.length.toLocaleString()}</span>{' '}
                  {traces.length === 1 ? 'run' : 'runs'}
                  <span className="mx-2 text-faint">·</span>
                  <span className="font-mono tabular">
                    {(totalInTokens + totalOutTokens).toLocaleString()}
                  </span>{' '}
                  tokens
                  <span className="mx-2 text-faint">·</span>
                  <span className="font-mono tabular">${totalCost.toFixed(4)}</span> total
                </span>
              ) : (
                'Captured agent executions from your local store.'
              )}
            </>
          }
        />

        {error ? (
          <div className="card border-dangerBorder bg-dangerSoft text-danger p-4 text-sm font-mono mb-6 whitespace-pre-wrap">
            {error}
          </div>
        ) : traces.length === 0 ? (
          <EmptyState dir={dir} />
        ) : (
          <TraceListClient initial={traces} />
        )}
      </div>
    </Shell>
  );
}
