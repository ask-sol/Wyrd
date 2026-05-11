import type { Event } from '../schema/event.js';
import type { Span, SpanLink } from '../schema/span.js';
import type { Trace } from '../schema/trace.js';
import type { SpanRecorder } from './recorder.js';

/**
 * In-memory `SpanRecorder` — useful for tests, fixtures, and short-lived
 * single-process introspection. Records are exposed as readonly arrays.
 */
export class MemorySpanRecorder implements SpanRecorder {
  readonly traces: Trace[] = [];
  readonly spans: Span[] = [];
  readonly events: Event[] = [];
  readonly links: SpanLink[] = [];

  async recordTrace(trace: Trace): Promise<void> {
    this.traces.push(trace);
  }

  async recordSpan(span: Span): Promise<void> {
    this.spans.push(span);
  }

  async recordEvent(event: Event): Promise<void> {
    this.events.push(event);
  }

  async recordLink(link: SpanLink): Promise<void> {
    this.links.push(link);
  }

  async flush(): Promise<void> {}
}
