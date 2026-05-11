import type { Event } from '../schema/event.js';
import type { Span, SpanLink } from '../schema/span.js';
import type { Trace } from '../schema/trace.js';

export interface SpanRecorder {
  recordTrace(trace: Trace): Promise<void>;
  recordSpan(span: Span): Promise<void>;
  recordEvent(event: Event): Promise<void>;
  recordLink(link: SpanLink): Promise<void>;
  flush(): Promise<void>;
}
