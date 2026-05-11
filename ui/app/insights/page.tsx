import Link from 'next/link';
import { Activity, AlertTriangle, CircleDollarSign, Layers, Wrench, Zap } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { TrendsChart } from '@/components/TrendsChart';
import { getRootDir } from '@/lib/store';
import { getTrends, type Range } from '@/lib/trends';
import { formatCost, formatDuration, formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';

const RANGES: Array<{ id: Range; label: string }> = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = (RANGES.find((r) => r.id === params.range)?.id ?? '7d') as Range;
  const trends = await getTrends(range);
  const dir = getRootDir();

  const errorRate =
    trends.totals.trace_count > 0
      ? (trends.totals.error_count / trends.totals.trace_count) * 100
      : 0;

  return (
    <Shell crumbs={[{ label: 'Insights' }]} storeDir={dir} activePath="/insights">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <PageHeader
          title="Insights"
          subtitle="Cost, throughput, latency, and error trends across your captured traces."
          actions={
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <Link
                  key={r.id}
                  href={`/insights?range=${r.id}`}
                  className={`h-8 px-3 rounded-pill border text-xs font-medium transition-colors inline-flex items-center ${
                    range === r.id
                      ? 'bg-brandSoft border-brandBorder text-brand'
                      : 'bg-surface border-border text-ink3 hover:text-ink hover:bg-hover'
                  }`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
          <Tile icon={Layers} label="Traces" value={formatNumber(trends.totals.trace_count)} />
          <Tile
            icon={AlertTriangle}
            label="Error rate"
            value={`${errorRate.toFixed(1)}%`}
            accent={errorRate > 5 ? 'danger' : undefined}
          />
          <Tile icon={Zap} label="LLM calls" value={formatNumber(trends.totals.llm_calls)} />
          <Tile icon={Wrench} label="Tool calls" value={formatNumber(trends.totals.tool_calls)} />
          <Tile
            icon={Activity}
            label="Tokens"
            value={`${formatNumber(trends.totals.input_tokens)}↓ ${formatNumber(trends.totals.output_tokens)}↑`}
          />
          <Tile
            icon={CircleDollarSign}
            label="Spend"
            value={formatCost(trends.totals.cost_usd)}
            accent="brand"
          />
        </div>

        <div className="mb-6">
          <TrendsChart buckets={trends.buckets} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-divider">
              <div className="text-base font-medium text-ink">Spend by model</div>
              <div className="text-sm text-ink3 mt-0.5">
                Where the money is going.
              </div>
            </div>
            {trends.by_model.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-ink3">No LLM calls in this window.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink3 bg-elevated border-b border-divider">
                    <th className="text-left font-medium px-5 h-9">Model</th>
                    <th className="text-right font-medium px-5 h-9 w-20">Calls</th>
                    <th className="text-right font-medium px-5 h-9 w-32">Tokens</th>
                    <th className="text-right font-medium px-5 h-9 w-24">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.by_model.map((m) => (
                    <tr key={m.model} className="border-b border-divider last:border-b-0">
                      <td className="px-5 py-2 font-mono text-sm text-ink truncate max-w-[280px]" title={m.model}>
                        {m.model}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular">
                        {formatNumber(m.calls)}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular whitespace-nowrap">
                        {formatNumber(m.input_tokens)}↓ {formatNumber(m.output_tokens)}↑
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-sm text-ink tabular">
                        {formatCost(m.cost_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-divider">
              <div className="text-base font-medium text-ink">Tool usage</div>
              <div className="text-sm text-ink3 mt-0.5">
                Call volume, error rate, and average duration per tool.
              </div>
            </div>
            {trends.by_tool.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-ink3">No tool calls in this window.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink3 bg-elevated border-b border-divider">
                    <th className="text-left font-medium px-5 h-9">Tool</th>
                    <th className="text-right font-medium px-5 h-9 w-20">Calls</th>
                    <th className="text-right font-medium px-5 h-9 w-20">Errors</th>
                    <th className="text-right font-medium px-5 h-9 w-24">Avg ms</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.by_tool.map((t) => (
                    <tr key={`${t.tool_name}|${t.side}`} className="border-b border-divider last:border-b-0">
                      <td className="px-5 py-2 text-sm text-ink">
                        <span className="font-mono">{t.tool_name}</span>
                        {t.side === 'server' && (
                          <span className="ml-2 text-2xs font-mono text-ink3 bg-subtle border border-divider rounded-sm px-1.5 py-0.5">
                            server
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular">
                        {formatNumber(t.calls)}
                      </td>
                      <td
                        className={`px-5 py-2 text-right font-mono text-xs tabular ${
                          t.errors > 0 ? 'text-danger' : 'text-ink3'
                        }`}
                      >
                        {t.errors}
                      </td>
                      <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular">
                        {t.avg_duration_ms !== null ? formatDuration(Math.round(t.avg_duration_ms)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  accent?: 'brand' | 'danger';
}) {
  const valueClass =
    accent === 'brand' ? 'text-brand' : accent === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-2 text-ink3 text-xs">
        <Icon size={14} strokeWidth={1.75} />
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-normal tabular font-mono ${valueClass}`}>{value}</div>
    </div>
  );
}
