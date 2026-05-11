import { GitCompare } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { DiffViewer } from '@/components/DiffViewer';
import { TraceListPicker } from '@/components/TraceListPicker';
import { getRootDir } from '@/lib/store';
import { listTracesAggregated } from '@/lib/traceList';

export const dynamic = 'force-dynamic';

export default async function DiffPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const dir = getRootDir();
  const traces = await listTracesAggregated({ limit: 200 });

  return (
    <Shell crumbs={[{ label: 'Diff' }]} storeDir={dir} activePath="/diff">
      <div className="max-w-[1500px] mx-auto px-6 py-6">
        <PageHeader
          title="Diff"
          subtitle="Compare two traces side-by-side. Find regressions, validate prompt changes, verify replays."
        />

        {!a || !b ? (
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-ink">
              <GitCompare size={16} strokeWidth={1.75} className="text-brand" />
              Pick a base trace (A) and a comparison trace (B).
            </div>
            <TraceListPicker traces={traces} a={a ?? null} b={b ?? null} />
          </div>
        ) : (
          <>
            <div className="mb-4">
              <TraceListPicker traces={traces} a={a} b={b} compact />
            </div>
            <DiffViewer a={a} b={b} />
          </>
        )}
      </div>
    </Shell>
  );
}
