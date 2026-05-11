import type { Event } from '../schema/event.js';
import type { Span, SpanLink } from '../schema/span.js';
import type { Trace } from '../schema/trace.js';

export interface TraceWithSpans {
  trace: Trace;
  spans: Span[];
  events: Event[];
  links: SpanLink[];
}
