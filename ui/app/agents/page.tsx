import Link from 'next/link';
import { Bot, ChevronRight } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { getRootDir } from '@/lib/store';
import { getAgentSummaries } from '@/lib/agents';
import { formatCost, formatNumber, formatTimeShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const agents = await getAgentSummaries();
  const dir = getRootDir();

  return (
    <Shell crumbs={[{ label: 'Agents' }]} storeDir={dir} activePath="/agents">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <PageHeader
          title="Agents"
          subtitle={
            agents.length > 0
              ? `${agents.length} distinct agent${agents.length === 1 ? '' : 's'} have written traces to this store.`
              : 'No agents have written traces yet.'
          }
        />

        {agents.length === 0 ? (
          <div className="card max-w-2xl mx-auto p-10 text-center mt-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-brandSoft border border-brandBorder text-brand mb-4">
              <Bot size={22} strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-medium text-ink mb-2">No agents seen</h2>
            <p className="text-sm text-ink3 max-w-md mx-auto">
              Each unique <code className="font-mono text-ink2">agent_id</code> from a wyrd session
              shows up here.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink3 bg-elevated border-b border-divider">
                  <th className="text-left font-medium px-5 h-10">Agent</th>
                  <th className="text-left font-medium px-5 h-10">Versions</th>
                  <th className="text-right font-medium px-5 h-10 w-24">Runs</th>
                  <th className="text-right font-medium px-5 h-10 w-28">OK / Err</th>
                  <th className="text-right font-medium px-5 h-10 w-32">Tokens</th>
                  <th className="text-right font-medium px-5 h-10 w-28">Spend</th>
                  <th className="text-right font-medium px-5 h-10 w-44">Last seen</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr
                    key={a.agent_id}
                    className="group border-b border-divider last:border-b-0 hover:bg-hover transition-colors"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/?agent=${encodeURIComponent(a.agent_id)}`}
                        className="inline-flex items-center gap-2 text-ink hover:text-brand transition-colors"
                      >
                        <Bot size={16} strokeWidth={1.75} className="text-ink3 group-hover:text-brand" />
                        <span className="font-medium">{a.agent_id}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.versions.length === 0 ? (
                          <span className="text-xs text-faint">—</span>
                        ) : (
                          a.versions.slice(0, 4).map((v) => (
                            <span
                              key={v}
                              className="font-mono text-2xs text-ink2 bg-subtle border border-divider rounded-sm px-1.5 py-0.5"
                            >
                              v{v}
                            </span>
                          ))
                        )}
                        {a.versions.length > 4 && (
                          <span className="text-2xs text-ink3 font-mono">
                            +{a.versions.length - 4}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink2 tabular">
                      {a.total_runs.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular whitespace-nowrap">
                      <span className="text-success">{a.ok_runs}</span>
                      <span className="text-faint mx-1">/</span>
                      <span className={a.error_runs > 0 ? 'text-danger' : 'text-faint'}>
                        {a.error_runs}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink2 tabular whitespace-nowrap">
                      {formatNumber(a.total_input_tokens)}
                      <span className="text-faint mx-0.5">↓</span>
                      {formatNumber(a.total_output_tokens)}
                      <span className="text-faint ml-0.5">↑</span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-ink2 tabular">
                      {formatCost(a.total_cost_usd)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-ink3 tabular">
                      {formatTimeShort(a.last_seen)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Link
                        href={`/?agent=${encodeURIComponent(a.agent_id)}`}
                        className="text-ink3 hover:text-ink transition-colors inline-block"
                        aria-label="Filter traces"
                      >
                        <ChevronRight size={18} strokeWidth={1.75} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
