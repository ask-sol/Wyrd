import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { LiveActivity } from '@/components/LiveActivity';
import { getRootDir, getStore } from '@/lib/store';
import { loadSettings } from '@/lib/settings';
import type { TraceListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadRunning(): Promise<TraceListItem[]> {
  const store = getStore();
  const traces = await store.listTraces({ limit: 100, status: 'running' });
  return traces.map((t) => ({
    trace_id: t.trace_id,
    agent_id: t.agent_id,
    agent_version: t.agent_version,
    status: t.status,
    started_at: t.started_at,
    ended_at: t.ended_at,
    duration_ms: t.ended_at !== null ? t.ended_at - t.started_at : null,
    span_count: 0,
    cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
  }));
}

export default async function LivePage() {
  let initial: TraceListItem[] = [];
  try {
    initial = await loadRunning();
  } catch {
    /* tolerate first-run errors */
  }
  const settings = await loadSettings();
  return (
    <Shell crumbs={[{ label: 'Live activity' }]} storeDir={getRootDir()} activePath="/live">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        <PageHeader
          title="Live activity"
          subtitle="In-flight agent runs, updated continuously. Click any row to drop into the trace as it's still being captured."
        />
        <LiveActivity initial={initial} pollMs={settings.live_poll_ms} />
      </div>
    </Shell>
  );
}
