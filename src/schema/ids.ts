import { ulid } from 'ulid';

export type TraceId = string & { readonly __brand: 'TraceId' };
export type SpanId = string & { readonly __brand: 'SpanId' };
export type EventId = string & { readonly __brand: 'EventId' };

export function newTraceId(): TraceId {
  return ulid() as TraceId;
}

export function newSpanId(): SpanId {
  return ulid() as SpanId;
}

export function newEventId(): EventId {
  return ulid() as EventId;
}

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: string): boolean {
  return ULID_REGEX.test(value);
}

export function asTraceId(value: string): TraceId {
  if (!isUlid(value)) {
    throw new Error(`Invalid trace_id (expected 26-char Crockford ULID): ${value}`);
  }
  return value as TraceId;
}

export function asSpanId(value: string): SpanId {
  if (!isUlid(value)) {
    throw new Error(`Invalid span_id (expected 26-char Crockford ULID): ${value}`);
  }
  return value as SpanId;
}

export function asEventId(value: string): EventId {
  if (!isUlid(value)) {
    throw new Error(`Invalid event_id (expected 26-char Crockford ULID): ${value}`);
  }
  return value as EventId;
}
