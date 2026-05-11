import type { BlobStore } from '../blobs/store.js';
import { canonicalJsonStringify } from '../canonical.js';
import type { AttributeValue, Attributes } from '../schema/attributes.js';
import { Attr } from '../schema/attributes.js';
import type { BlobRef } from '../schema/blob.js';
import { newSpanId, newTraceId, type SpanId, type TraceId } from '../schema/ids.js';
import type { Span, SpanStatus } from '../schema/span.js';
import { SCHEMA_VERSION, type Trace } from '../schema/trace.js';
import type { SpanRecorder } from '../recorder/recorder.js';
import {
  requireTraceContext,
  traceContextStorage,
  type TraceContext,
} from './context.js';

export interface TracerOptions {
  recorder: SpanRecorder;
  blobs: BlobStore;
  agent_id: string;
  agent_version?: string | null;
  sdk_version?: string;
}

export interface LlmCallStartSpec {
  provider: string;
  model: string;
  request: unknown;
  attributes?: Attributes;
}

export interface LlmCallEndSpec {
  response: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  costUsd?: number | null;
  finishReason?: string | null;
  status: 'ok' | 'error';
  errorMessage?: string;
  attributes?: Attributes;
}

export interface LlmCallHandle {
  readonly trace_id: TraceId;
  readonly span_id: SpanId;
  readonly parent_span_id: SpanId | null;
  readonly started_at: number;
  readonly model: string;
  readonly provider: string;
  readonly request_ref: BlobRef;
  readonly base_attributes: Attributes;
}

export interface ToolCallStartSpec {
  tool_name: string;
  args: unknown;
  tool_call_id?: string;
  safe_to_replay?: boolean;
  attributes?: Attributes;
}

export interface ToolCallEndSpec {
  result: unknown;
  status: 'ok' | 'error';
  duration_ms?: number;
  errorMessage?: string;
  attributes?: Attributes;
}

export interface ToolCallHandle {
  readonly trace_id: TraceId;
  readonly span_id: SpanId;
  readonly parent_span_id: SpanId | null;
  readonly started_at: number;
  readonly tool_name: string;
  readonly args_ref: BlobRef;
  readonly base_attributes: Attributes;
}

const ENCODER = new TextEncoder();

async function putCanonical(blobs: BlobStore, value: unknown): Promise<BlobRef> {
  const bytes = ENCODER.encode(canonicalJsonStringify(value));
  return blobs.put(bytes, 'application/json');
}

export class Tracer {
  constructor(private readonly opts: TracerOptions) {}

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const trace_id = newTraceId();
    const span_id = newSpanId();
    const started_at = Date.now();
    const ctx: TraceContext = {
      trace_id,
      current_span_id: span_id,
      agent_id: this.opts.agent_id,
      agent_version: this.opts.agent_version ?? null,
    };

    // Record the trace at start so /live shows in-flight runs. The final
    // recordTrace in the finally block upserts (status, ended_at).
    await this.opts.recorder.recordTrace({
      trace_id,
      agent_id: this.opts.agent_id,
      agent_version: this.opts.agent_version ?? null,
      root_span_id: span_id,
      status: 'running',
      started_at,
      ended_at: null,
      attributes: {},
    });

    let status: SpanStatus = 'running';
    let errorMessage: string | null = null;
    try {
      const result = await traceContextStorage.run(ctx, fn);
      status = 'ok';
      return result;
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const ended_at = Date.now();
      const attrs: Record<string, AttributeValue> = {
        [Attr.AGENT_ID]: this.opts.agent_id,
        [Attr.AGENT_VERSION]: this.opts.agent_version ?? null,
        [Attr.WYRD_SCHEMA_VERSION]: SCHEMA_VERSION,
      };
      if (this.opts.sdk_version) attrs[Attr.WYRD_SDK_VERSION] = this.opts.sdk_version;
      if (errorMessage) attrs['error.message'] = errorMessage;

      await this.opts.recorder.recordSpan({
        trace_id,
        span_id,
        parent_span_id: null,
        kind: 'agent.step',
        name,
        status,
        started_at,
        ended_at,
        attributes: attrs,
        refs: {},
      });
      const trace: Trace = {
        trace_id,
        agent_id: this.opts.agent_id,
        agent_version: this.opts.agent_version ?? null,
        root_span_id: span_id,
        status,
        started_at,
        ended_at,
        attributes: {},
      };
      await this.opts.recorder.recordTrace(trace);
    }
  }

  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const parent = requireTraceContext();
    const span_id = newSpanId();
    const started_at = Date.now();
    const child: TraceContext = { ...parent, current_span_id: span_id };

    let status: SpanStatus = 'running';
    let errorMessage: string | null = null;
    try {
      const result = await traceContextStorage.run(child, fn);
      status = 'ok';
      return result;
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const ended_at = Date.now();
      const attrs: Record<string, AttributeValue> = {};
      if (errorMessage) attrs['error.message'] = errorMessage;
      await this.opts.recorder.recordSpan({
        trace_id: parent.trace_id,
        span_id,
        parent_span_id: parent.current_span_id,
        kind: 'agent.step',
        name,
        status,
        started_at,
        ended_at,
        attributes: attrs,
        refs: {},
      });
    }
  }

  async startLlmCall(spec: LlmCallStartSpec): Promise<LlmCallHandle> {
    const ctx = requireTraceContext();
    const span_id = newSpanId();
    const request_ref = await putCanonical(this.opts.blobs, spec.request);
    const base_attributes: Attributes = {
      [Attr.GEN_AI_SYSTEM]: spec.provider,
      [Attr.GEN_AI_REQUEST_MODEL]: spec.model,
      ...(spec.attributes ?? {}),
    };
    const handle: LlmCallHandle = {
      trace_id: ctx.trace_id,
      span_id,
      parent_span_id: ctx.current_span_id,
      started_at: Date.now(),
      model: spec.model,
      provider: spec.provider,
      request_ref,
      base_attributes,
    };
    // Record an in-progress span immediately so observers (e.g. the /live UI)
    // can see the call appear, follow tokens climb, etc.
    await this.opts.recorder.recordSpan({
      trace_id: handle.trace_id,
      span_id: handle.span_id,
      parent_span_id: handle.parent_span_id,
      kind: 'llm.call',
      name: handle.model,
      status: 'running',
      started_at: handle.started_at,
      ended_at: null,
      attributes: { ...base_attributes },
      refs: { request: request_ref },
    });
    return handle;
  }

  /**
   * Re-record an in-progress llm.call span with the latest streaming usage
   * estimates. Safe to call from a hot path — the SQLite recorder upserts.
   */
  async updateLlmCallProgress(
    handle: LlmCallHandle,
    progress: {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      costUsd?: number;
    },
  ): Promise<void> {
    const attrs: Record<string, AttributeValue> = { ...handle.base_attributes };
    if (typeof progress.inputTokens === 'number')
      attrs[Attr.GEN_AI_USAGE_INPUT_TOKENS] = progress.inputTokens;
    if (typeof progress.outputTokens === 'number')
      attrs[Attr.GEN_AI_USAGE_OUTPUT_TOKENS] = progress.outputTokens;
    if (typeof progress.cacheReadTokens === 'number')
      attrs[Attr.GEN_AI_USAGE_CACHE_READ_TOKENS] = progress.cacheReadTokens;
    if (typeof progress.cacheWriteTokens === 'number')
      attrs[Attr.GEN_AI_USAGE_CACHE_WRITE_TOKENS] = progress.cacheWriteTokens;
    if (typeof progress.costUsd === 'number')
      attrs[Attr.GEN_AI_USAGE_COST_USD] = progress.costUsd;
    await this.opts.recorder.recordSpan({
      trace_id: handle.trace_id,
      span_id: handle.span_id,
      parent_span_id: handle.parent_span_id,
      kind: 'llm.call',
      name: handle.model,
      status: 'running',
      started_at: handle.started_at,
      ended_at: null,
      attributes: attrs,
      refs: { request: handle.request_ref },
    });
  }

  async endLlmCall(handle: LlmCallHandle, end: LlmCallEndSpec): Promise<void> {
    const response_ref = await this.opts.blobs.putJson(end.response);
    const attrs: Record<string, AttributeValue> = { ...handle.base_attributes };
    if (typeof end.inputTokens === 'number') attrs[Attr.GEN_AI_USAGE_INPUT_TOKENS] = end.inputTokens;
    if (typeof end.outputTokens === 'number') attrs[Attr.GEN_AI_USAGE_OUTPUT_TOKENS] = end.outputTokens;
    if (typeof end.cacheReadTokens === 'number') attrs[Attr.GEN_AI_USAGE_CACHE_READ_TOKENS] = end.cacheReadTokens;
    if (typeof end.cacheWriteTokens === 'number') attrs[Attr.GEN_AI_USAGE_CACHE_WRITE_TOKENS] = end.cacheWriteTokens;
    if (typeof end.costUsd === 'number') attrs[Attr.GEN_AI_USAGE_COST_USD] = end.costUsd;
    if (end.finishReason) attrs[Attr.GEN_AI_RESPONSE_FINISH_REASON] = end.finishReason;
    if (end.errorMessage) attrs['error.message'] = end.errorMessage;
    if (end.attributes) Object.assign(attrs, end.attributes);

    const span: Span = {
      trace_id: handle.trace_id,
      span_id: handle.span_id,
      parent_span_id: handle.parent_span_id,
      kind: 'llm.call',
      name: handle.model,
      status: end.status,
      started_at: handle.started_at,
      ended_at: Date.now(),
      attributes: attrs,
      refs: { request: handle.request_ref, response: response_ref },
    };
    await this.opts.recorder.recordSpan(span);
  }

  async failLlmCall(
    handle: LlmCallHandle,
    err: unknown,
    partial?: { response?: unknown },
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const responseValue = partial?.response ?? { error: message };
    await this.endLlmCall(handle, {
      response: responseValue,
      status: 'error',
      errorMessage: message,
    });
  }

  async startToolCall(spec: ToolCallStartSpec): Promise<ToolCallHandle> {
    const ctx = requireTraceContext();
    const span_id = newSpanId();
    const args_ref = await putCanonical(this.opts.blobs, spec.args);
    const base_attributes: Attributes = {
      [Attr.TOOL_NAME]: spec.tool_name,
      ...(spec.tool_call_id ? { [Attr.TOOL_CALL_ID]: spec.tool_call_id } : {}),
      ...(typeof spec.safe_to_replay === 'boolean' ? { [Attr.TOOL_SAFE_TO_REPLAY]: spec.safe_to_replay } : {}),
      ...(spec.attributes ?? {}),
    };
    return {
      trace_id: ctx.trace_id,
      span_id,
      parent_span_id: ctx.current_span_id,
      started_at: Date.now(),
      tool_name: spec.tool_name,
      args_ref,
      base_attributes,
    };
  }

  async endToolCall(handle: ToolCallHandle, end: ToolCallEndSpec): Promise<void> {
    const result_ref = await this.opts.blobs.putJson(end.result);
    const attrs: Record<string, AttributeValue> = { ...handle.base_attributes };
    if (typeof end.duration_ms === 'number') attrs[Attr.TOOL_DURATION_MS] = end.duration_ms;
    if (end.errorMessage) attrs[Attr.TOOL_ERROR] = end.errorMessage;
    if (end.attributes) Object.assign(attrs, end.attributes);

    const span: Span = {
      trace_id: handle.trace_id,
      span_id: handle.span_id,
      parent_span_id: handle.parent_span_id,
      kind: 'tool.call',
      name: handle.tool_name,
      status: end.status,
      started_at: handle.started_at,
      ended_at: Date.now(),
      attributes: attrs,
      refs: { tool_args: handle.args_ref, tool_result: result_ref },
    };
    await this.opts.recorder.recordSpan(span);
  }

  async failToolCall(
    handle: ToolCallHandle,
    err: unknown,
    partial?: { duration_ms?: number },
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.endToolCall(handle, {
      result: { error: message },
      status: 'error',
      errorMessage: message,
      ...(partial?.duration_ms !== undefined ? { duration_ms: partial.duration_ms } : {}),
    });
  }

  /**
   * Emit a child `tool.call` span attached to an existing LLM call span.
   * Used to record provider-executed tool uses (Anthropic `web_search`,
   * `code_execution`, etc.) that happen inside the model's pipeline and
   * therefore never go through the agent's tool-dispatch wrapper.
   */
  async recordChildToolCall(spec: {
    trace_id: TraceId;
    parent_span_id: SpanId;
    tool_name: string;
    args: unknown;
    result: unknown;
    status: SpanStatus;
    started_at: number;
    ended_at?: number;
    side?: 'client' | 'server';
    safe_to_replay?: boolean;
    extra?: Attributes;
  }): Promise<void> {
    const args_ref = await this.opts.blobs.putJson(spec.args ?? null);
    const result_ref = await this.opts.blobs.putJson(spec.result ?? null);
    const attrs: Record<string, AttributeValue> = {
      [Attr.TOOL_NAME]: spec.tool_name,
      'tool.side': spec.side ?? 'server',
      ...(typeof spec.safe_to_replay === 'boolean'
        ? { [Attr.TOOL_SAFE_TO_REPLAY]: spec.safe_to_replay }
        : {}),
      ...(spec.extra ?? {}),
    };
    const span: Span = {
      trace_id: spec.trace_id,
      span_id: newSpanId(),
      parent_span_id: spec.parent_span_id,
      kind: 'tool.call',
      name: spec.tool_name,
      status: spec.status,
      started_at: spec.started_at,
      ended_at: spec.ended_at ?? Date.now(),
      attributes: attrs,
      refs: { tool_args: args_ref, tool_result: result_ref },
    };
    await this.opts.recorder.recordSpan(span);
  }
}
