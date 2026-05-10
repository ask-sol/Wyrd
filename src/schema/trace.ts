import type { Attributes } from './attributes.js';
import type { SpanId, TraceId } from './ids.js';
import type { SpanStatus } from './span.js';

export interface Trace {
  readonly trace_id: TraceId;
  readonly agent_id: string;
  readonly agent_version: string | null;
  readonly root_span_id: SpanId;
  readonly status: SpanStatus;
  readonly started_at: number;
  readonly ended_at: number | null;
  readonly attributes: Attributes;
}

export const SCHEMA_VERSION = '0.0.1' as const;
