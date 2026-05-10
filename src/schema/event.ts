import type { Attributes } from './attributes.js';
import type { BlobRef } from './blob.js';
import type { EventId, SpanId, TraceId } from './ids.js';

export interface Event {
  readonly trace_id: TraceId;
  readonly span_id: SpanId;
  readonly event_id: EventId;
  readonly ts: number;
  readonly name: string;
  readonly attributes: Attributes;
  readonly ref: BlobRef | null;
}
