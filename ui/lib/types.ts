import type { Span, Trace, Event, SpanLink, BlobRef } from 'wyrd';

export type WyrdTrace = Trace;
export type WyrdSpan = Span;
export type WyrdEvent = Event;
export type WyrdSpanLink = SpanLink;
export type WyrdBlobRef = BlobRef;

export interface TraceListItem {
  trace_id: string;
  agent_id: string;
  agent_version: string | null;
  status: 'running' | 'ok' | 'error';
  started_at: number;
  ended_at: number | null;
  duration_ms: number | null;
  span_count: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  last_activity?: string | null;
  last_activity_kind?: 'agent.step' | 'llm.call' | 'tool.call' | 'tool.result' | null;
  note_count?: number;
}

export interface TraceDetailPayload {
  trace: WyrdTrace;
  spans: WyrdSpan[];
  events: WyrdEvent[];
  links: WyrdSpanLink[];
  rollup: {
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    llm_calls: number;
    tool_calls: number;
  };
}
