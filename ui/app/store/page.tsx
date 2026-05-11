import { Database, FileBox, FolderTree, HardDrive } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { getRootDir } from '@/lib/store';
import { getStoreStats, formatBytes } from '@/lib/storeStats';
import { MaintenanceActions } from './MaintenanceActions';

export const dynamic = 'force-dynamic';

export default async function StorePage() {
  const stats = await getStoreStats();
  const dir = getRootDir();
  const totalBytes = stats.sqlite_bytes + stats.sqlite_wal_bytes + stats.blobs_bytes;

  return (
    <Shell crumbs={[{ label: 'Store' }]} storeDir={dir} activePath="/store">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        <PageHeader
          title="Store"
          subtitle="Local content-addressed cache. Every prompt, every tool I/O, deduplicated by SHA-256."
          actions={<MaintenanceActions />}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <StatTile icon={HardDrive} label="Total on disk" value={formatBytes(totalBytes)} />
          <StatTile icon={Database} label="Traces" value={stats.trace_count.toLocaleString()} />
          <StatTile icon={FolderTree} label="Spans" value={stats.span_count.toLocaleString()} />
          <StatTile icon={FileBox} label="Blobs" value={stats.blob_count.toLocaleString()} />
        </div>

        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-divider">
            <div className="text-base font-medium text-ink">Disk usage</div>
            <div className="text-sm text-ink3 mt-0.5 font-mono break-all">{stats.dir}</div>
          </div>
          <div className="divide-y divide-divider">
            <UsageRow
              label="traces.sqlite3"
              hint="Trace + span index"
              bytes={stats.sqlite_bytes}
              total={totalBytes}
            />
            <UsageRow
              label="traces.sqlite3-wal"
              hint="Write-ahead log (transient)"
              bytes={stats.sqlite_wal_bytes}
              total={totalBytes}
            />
            <UsageRow
              label="blobs/"
              hint="Content-addressed prompts, tool I/O, model responses"
              bytes={stats.blobs_bytes}
              total={totalBytes}
            />
          </div>
        </div>

        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
            <div>
              <div className="text-base font-medium text-ink">Trace status</div>
              <div className="text-sm text-ink3 mt-0.5">Outcome distribution across all runs.</div>
            </div>
          </div>
          <div className="px-5 py-4 grid grid-cols-3 gap-4">
            <StatusCell label="OK" value={stats.trace_count_by_status.ok} tone="success" />
            <StatusCell label="Error" value={stats.trace_count_by_status.error} tone="danger" />
            <StatusCell label="Running" value={stats.trace_count_by_status.running} tone="brand" />
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-divider">
            <div className="text-base font-medium text-ink">Most recent blobs</div>
            <div className="text-sm text-ink3 mt-0.5">Newest 20 by mtime.</div>
          </div>
          {stats.recent_blobs.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-ink3">No blobs captured yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink3 bg-elevated border-b border-divider">
                  <th className="text-left font-medium px-5 h-9">SHA-256</th>
                  <th className="text-right font-medium px-5 h-9 w-32">Size</th>
                  <th className="text-right font-medium px-5 h-9 w-48">Captured</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_blobs.map((b) => (
                  <tr key={b.sha} className="border-b border-divider last:border-b-0">
                    <td className="px-5 py-2 font-mono text-xs text-ink2 truncate max-w-[600px]">
                      {b.sha}
                    </td>
                    <td className="px-5 py-2 text-right font-mono text-xs text-ink2 tabular">
                      {formatBytes(b.size)}
                    </td>
                    <td className="px-5 py-2 text-right font-mono text-xs text-ink3 tabular">
                      {new Date(b.modified_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Shell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-2 text-ink3 text-xs">
        <Icon size={14} strokeWidth={1.75} />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-normal text-ink tabular font-mono">{value}</div>
    </div>
  );
}

function UsageRow({
  label,
  hint,
  bytes,
  total,
}: {
  label: string;
  hint: string;
  bytes: number;
  total: number;
}) {
  const pct = total > 0 ? (bytes / total) * 100 : 0;
  return (
    <div className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div>
          <span className="text-sm font-mono text-ink">{label}</span>
          <span className="ml-2 text-xs text-ink3">{hint}</span>
        </div>
        <div className="text-sm font-mono text-ink2 tabular shrink-0">{formatBytes(bytes)}</div>
      </div>
      <div className="h-1.5 bg-subtle rounded-full overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'brand';
}) {
  const ring =
    tone === 'success'
      ? 'border-successBorder bg-successSoft text-success'
      : tone === 'danger'
        ? 'border-dangerBorder bg-dangerSoft text-danger'
        : 'border-brandBorder bg-brandSoft text-brand';
  return (
    <div className={`rounded-md border ${ring} px-4 py-3`}>
      <div className="text-xs uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-mono tabular mt-1">{value.toLocaleString()}</div>
    </div>
  );
}
