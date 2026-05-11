import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Event } from '../schema/event.js';
import type { TraceId } from '../schema/ids.js';
import type { Span, SpanLink } from '../schema/span.js';
import type { Trace } from '../schema/trace.js';
import type { SpanRecorder } from './recorder.js';

interface JsonlRecord {
  $type: 'trace' | 'span' | 'event' | 'link';
  [k: string]: unknown;
}

/**
 * Append-only JSONL `SpanRecorder`. One file per trace at
 * `<dir>/<trace_id>.jsonl`, each line a self-contained record with a `$type`
 * discriminator. Intended as the simplest possible persistence for v0.1; a
 * DuckDB-backed recorder replaces this for query-tier workloads.
 */
export class JsonlSpanRecorder implements SpanRecorder {
  private dirEnsured = false;

  constructor(private readonly dir: string) {}

  async recordTrace(trace: Trace): Promise<void> {
    await this.append(trace.trace_id, { $type: 'trace', ...trace });
  }

  async recordSpan(span: Span): Promise<void> {
    await this.append(span.trace_id, { $type: 'span', ...span });
  }

  async recordEvent(event: Event): Promise<void> {
    await this.append(event.trace_id, { $type: 'event', ...event });
  }

  async recordLink(link: SpanLink): Promise<void> {
    await this.append(link.trace_id, { $type: 'link', ...link });
  }

  async flush(): Promise<void> {}

  private async append(trace_id: TraceId, record: JsonlRecord): Promise<void> {
    if (!this.dirEnsured) {
      await fs.mkdir(this.dir, { recursive: true });
      this.dirEnsured = true;
    }
    const path = join(this.dir, `${trace_id}.jsonl`);
    await fs.appendFile(path, JSON.stringify(record) + '\n');
  }
}
