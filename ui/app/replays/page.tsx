import { History } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { TraceListClient } from '@/components/TraceListClient';
import { getRootDir } from '@/lib/store';
import { listTracesAggregated } from '@/lib/traceList';
import type { TraceListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadReplayable(): Promise<TraceListItem[]> {
  return listTracesAggregated({ status: 'ok', limit: 500 });
}

export default async function ReplaysPage() {
  let traces: TraceListItem[] = [];
  let error: string | null = null;
  try {
    traces = await loadReplayable();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const dir = getRootDir();

  return (
    <Shell
      crumbs={[{ label: 'Replays' }]}
      storeDir={dir}
      activePath="/replays"
    >
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <PageHeader
          title="Replays"
          subtitle="Completed runs that can be reproduced deterministically from the local cache. Open any trace and press Reproduce to step through it."
        />

        {error && (
          <div className="card border-dangerBorder bg-dangerSoft text-danger p-4 text-sm font-mono mb-6">
            {error}
          </div>
        )}

        {traces.length === 0 ? (
          <div className="card max-w-2xl mx-auto p-10 text-center mt-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-brandSoft border border-brandBorder text-brand mb-4">
              <History size={22} strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-medium text-ink mb-2">No replayable traces yet</h2>
            <p className="text-sm text-ink3 max-w-md mx-auto">
              Every successful agent run becomes a replay candidate. Capture a trace from
              OpenAgent first, then return here.
            </p>
          </div>
        ) : (
          <TraceListClient initial={traces} />
        )}
      </div>
    </Shell>
  );
}
