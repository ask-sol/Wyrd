import type { Attributes } from './attributes.js';
import type { BlobRefMap } from './blob.js';
import type { SpanId, TraceId } from './ids.js';

export type SpanKind =
  | 'agent.step'
  | 'llm.call'
  | 'tool.call'
  | 'tool.result';

export type SpanStatus = 'running' | 'ok' | 'error';

export interface Span {
  readonly trace_id: TraceId;
  readonly span_id: SpanId;
  readonly parent_span_id: SpanId | null;
  readonly kind: SpanKind;
  readonly name: string;
  readonly status: SpanStatus;
  readonly started_at: number;
  readonly ended_at: number | null;
  readonly attributes: Attributes;
  readonly refs: BlobRefMap;
}

export type SpanLinkRelation =
  | 'spawned'
  | 'consumed'
  | 'influenced_by'
  | 'memory_read';

export interface SpanLink {
  readonly trace_id: TraceId;
  readonly from_span_id: SpanId;
  readonly to_span_id: SpanId;
  readonly relation: SpanLinkRelation;
  readonly attributes: Attributes;
}

export const SPAN_KINDS: readonly SpanKind[] = [
  'agent.step',
  'llm.call',
  'tool.call',
  'tool.result',
] as const;

export function isSpanKind(value: string): value is SpanKind {
  return (SPAN_KINDS as readonly string[]).includes(value);
}
