import { AsyncLocalStorage } from 'node:async_hooks';
import type { SpanId, TraceId } from '../schema/ids.js';

export interface TraceContext {
  readonly trace_id: TraceId;
  readonly current_span_id: SpanId;
  readonly agent_id: string;
  readonly agent_version: string | null;
}

export const traceContextStorage = new AsyncLocalStorage<TraceContext>();

export function currentTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}

export function requireTraceContext(): TraceContext {
  const ctx = traceContextStorage.getStore();
  if (!ctx) {
    throw new Error(
      'No active Wyrd trace context. Wrap your agent run in tracer.run(name, fn).',
    );
  }
  return ctx;
}
