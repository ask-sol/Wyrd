import type { Tracer } from '../../tracer/tracer.js';
import type {
  OAProvider,
  OAProviderConfig,
  OAProviderMessage,
  OAProviderRequestOptions,
  OAProviderResponse,
  OAProviderTool,
  OAStreamChunk,
  OATokenUsage,
} from './types.js';

export interface WrapProviderDeps {
  tracer: Tracer;
}

interface CanonicalRequest {
  provider: string;
  model: string;
  messages: OAProviderMessage[];
  tools: OAProviderTool[];
  params: {
    temperature: number | null;
    max_tokens: number | null;
    top_p: number | null;
    system: string | null;
  };
}

interface AggregatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface AggregatedExecutedTool {
  name?: string;
  result?: string;
  error?: string;
}

interface AggregatedStream {
  text: string;
  tool_calls: AggregatedToolCall[];
  tool_executed: AggregatedExecutedTool[];
  usage: OATokenUsage | null;
  stream_error: string | null;
}

interface ModelPricing {
  in?: number;
  out?: number;
}

function buildRequest(
  providerId: string,
  messages: OAProviderMessage[],
  tools: OAProviderTool[],
  options: OAProviderRequestOptions,
): CanonicalRequest {
  return {
    provider: providerId,
    model: options.model,
    messages,
    tools,
    params: {
      temperature: options.temperature ?? null,
      max_tokens: options.maxTokens ?? null,
      top_p: options.topP ?? null,
      system: options.systemPrompt ?? null,
    },
  };
}

function pricingFor(config: OAProviderConfig, model: string): ModelPricing {
  const m = config.models.find((entry) => entry.id === model);
  if (!m) return {};
  const out: ModelPricing = {};
  if (typeof m.costPer1kInput === 'number') out.in = m.costPer1kInput;
  if (typeof m.costPer1kOutput === 'number') out.out = m.costPer1kOutput;
  return out;
}

function computeCostUsd(usage: OATokenUsage | null, pricing: ModelPricing): number | null {
  if (!usage) return null;
  if (typeof usage.costUsd === 'number') return usage.costUsd;
  if (pricing.in === undefined && pricing.out === undefined) return null;
  const inCost = (usage.inputTokens / 1000) * (pricing.in ?? 0);
  const outCost = (usage.outputTokens / 1000) * (pricing.out ?? 0);
  return inCost + outCost;
}

function deriveFinishReason(agg: AggregatedStream): string | null {
  if (agg.stream_error) return 'error';
  if (agg.tool_calls.length > 0) return 'tool_use';
  if (agg.tool_executed.length > 0) return 'tool_use';
  return 'end_turn';
}

/**
 * Wrap an OpenAgent-compatible `Provider` so that every `stream()` and
 * `complete()` invocation emits an `llm.call` span as a child of the
 * current trace context.
 *
 * Usage:
 *   const tracer = new Tracer({...});
 *   const provider = wrapProvider(originalProvider, { tracer });
 *   await tracer.run('user-prompt', async () => {
 *     for await (const chunk of provider.stream(...)) {...}
 *   });
 */
export function wrapProvider<P extends OAProvider>(
  provider: P,
  deps: WrapProviderDeps,
): P {
  const { tracer } = deps;

  const wrapped: OAProvider = {
    config: provider.config,
    stream(messages, tools, options) {
      return wrappedStream(provider, messages, tools, options, tracer);
    },
    async complete(messages, tools, options) {
      return wrappedComplete(provider, messages, tools, options, tracer);
    },
  };

  if (provider.validateApiKey) {
    wrapped.validateApiKey = provider.validateApiKey.bind(provider);
  }

  return wrapped as P;
}

async function* wrappedStream(
  provider: OAProvider,
  messages: OAProviderMessage[],
  tools: OAProviderTool[],
  options: OAProviderRequestOptions,
  tracer: Tracer,
): AsyncGenerator<OAStreamChunk> {
  const handle = await tracer.startLlmCall({
    provider: provider.config.id,
    model: options.model,
    request: buildRequest(provider.config.id, messages, tools, options),
  });

  const agg: AggregatedStream = {
    text: '',
    tool_calls: [],
    tool_executed: [],
    usage: null,
    stream_error: null,
  };

  let crashed = false;

  // Throttled progress writer so /live and the trace detail can show
  // tokens climbing in real time as the model streams.
  const pricing = pricingFor(provider.config, options.model);
  let lastProgressAt = 0;
  const PROGRESS_THROTTLE_MS = 200;
  const fireProgress = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
    lastProgressAt = now;
    const estimatedOut =
      typeof agg.usage?.outputTokens === 'number' && agg.usage.outputTokens > 0
        ? agg.usage.outputTokens
        : Math.ceil(agg.text.length / 4);
    const estimatedIn = agg.usage?.inputTokens ?? undefined;
    const estimatedCost =
      typeof estimatedIn === 'number'
        ? computeCostUsd(
            {
              inputTokens: estimatedIn,
              outputTokens: estimatedOut,
              cacheReadTokens: agg.usage?.cacheReadTokens ?? 0,
              cacheWriteTokens: agg.usage?.cacheWriteTokens ?? 0,
              costUsd: agg.usage?.costUsd,
            } as OATokenUsage,
            pricing,
          )
        : null;
    // Fire-and-forget — don't block the stream on SQLite latency.
    void tracer
      .updateLlmCallProgress(handle, {
        outputTokens: estimatedOut,
        ...(typeof estimatedIn === 'number' ? { inputTokens: estimatedIn } : {}),
        ...(typeof agg.usage?.cacheReadTokens === 'number'
          ? { cacheReadTokens: agg.usage.cacheReadTokens }
          : {}),
        ...(typeof agg.usage?.cacheWriteTokens === 'number'
          ? { cacheWriteTokens: agg.usage.cacheWriteTokens }
          : {}),
        ...(estimatedCost !== null ? { costUsd: estimatedCost } : {}),
      })
      .catch(() => {
        /* tolerate transient WAL contention */
      });
  };

  try {
    for await (const chunk of provider.stream(messages, tools, options)) {
      switch (chunk.type) {
        case 'text': {
          if (chunk.text) agg.text += chunk.text;
          fireProgress();
          break;
        }
        case 'tool_call_start': {
          const tc = chunk.toolCall;
          if (tc) agg.tool_calls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });
          break;
        }
        case 'tool_call_delta': {
          const tc = chunk.toolCall;
          if (tc) {
            const existing = agg.tool_calls.find((c) => c.id === tc.id);
            if (existing) {
              existing.arguments += tc.arguments;
            } else {
              agg.tool_calls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });
            }
          }
          break;
        }
        case 'tool_call_end': {
          const tc = chunk.toolCall;
          if (tc) {
            const existing = agg.tool_calls.find((c) => c.id === tc.id);
            if (existing) {
              existing.arguments = tc.arguments;
              existing.name = tc.name;
            } else {
              agg.tool_calls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });
            }
          }
          break;
        }
        case 'tool_executed': {
          const entry: AggregatedExecutedTool = {};
          if (chunk.toolCall?.name) entry.name = chunk.toolCall.name;
          if (chunk.toolResult !== undefined) entry.result = chunk.toolResult;
          if (chunk.toolError !== undefined) entry.error = chunk.toolError;
          agg.tool_executed.push(entry);
          break;
        }
        case 'done': {
          if (chunk.usage) {
            agg.usage = chunk.usage;
            fireProgress(true);
          }
          break;
        }
        case 'error': {
          agg.stream_error = chunk.error ?? 'unknown error';
          break;
        }
      }
      yield chunk;
    }
  } catch (err) {
    crashed = true;
    await tracer.failLlmCall(handle, err, {
      response: {
        text: agg.text,
        tool_calls: agg.tool_calls,
        tool_executed: agg.tool_executed,
        usage: agg.usage,
        finish_reason: 'error',
        partial: true,
      },
    });
    throw err;
  } finally {
    if (!crashed) {
      const status: 'ok' | 'error' = agg.stream_error ? 'error' : 'ok';
      const finish_reason = deriveFinishReason(agg);
      const pricing = pricingFor(provider.config, options.model);
      const costUsd = computeCostUsd(agg.usage, pricing);
      const endSpec = {
        response: {
          text: agg.text,
          tool_calls: agg.tool_calls,
          tool_executed: agg.tool_executed,
          usage: agg.usage,
          finish_reason,
        },
        inputTokens: agg.usage?.inputTokens ?? null,
        outputTokens: agg.usage?.outputTokens ?? null,
        cacheReadTokens: agg.usage?.cacheReadTokens ?? null,
        cacheWriteTokens: agg.usage?.cacheWriteTokens ?? null,
        costUsd,
        finishReason: finish_reason,
        status,
        ...(agg.stream_error ? { errorMessage: agg.stream_error } : {}),
      };
      await tracer.endLlmCall(handle, endSpec);
      await emitServerToolSpans(tracer, handle, agg);
    }
  }
}

/**
 * For provider-executed tools (Anthropic `web_search`, `code_execution`,
 * Bedrock equivalents, etc.) — emit a child `tool.call` span per execution
 * so they appear in the trace graph, rollup, and tool-count statistics.
 */
async function emitServerToolSpans(
  tracer: Tracer,
  handle: { trace_id: string; span_id: string; started_at: number },
  agg: AggregatedStream,
): Promise<void> {
  for (const te of agg.tool_executed) {
    const name = te.name ?? '';
    if (!name.startsWith('anthropic.') && !name.startsWith('server.')) continue;
    const match = agg.tool_calls.find((c) => c.name === name);
    let args: unknown = {};
    if (match?.arguments) {
      try {
        args = JSON.parse(match.arguments);
      } catch {
        args = match.arguments;
      }
    }
    let result: unknown = te.result ?? te.error ?? null;
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result);
      } catch {
        /* leave as string */
      }
    }
    await tracer.recordChildToolCall({
      trace_id: handle.trace_id as never,
      parent_span_id: handle.span_id as never,
      tool_name: name,
      args,
      result,
      status: te.error ? 'error' : 'ok',
      started_at: handle.started_at,
      side: 'server',
      safe_to_replay: true,
    });
    if (process.env.WYRD_DEBUG === '1') {
      process.stderr.write(`[wyrd] recorded server tool span: ${name}\n`);
    }
  }
}

async function wrappedComplete(
  provider: OAProvider,
  messages: OAProviderMessage[],
  tools: OAProviderTool[],
  options: OAProviderRequestOptions,
  tracer: Tracer,
): Promise<OAProviderResponse> {
  const handle = await tracer.startLlmCall({
    provider: provider.config.id,
    model: options.model,
    request: buildRequest(provider.config.id, messages, tools, options),
  });
  try {
    const result = await provider.complete(messages, tools, options);
    const pricing = pricingFor(provider.config, options.model);
    const costUsd = computeCostUsd(result.usage, pricing);
    await tracer.endLlmCall(handle, {
      response: result,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens ?? null,
      cacheWriteTokens: result.usage.cacheWriteTokens ?? null,
      costUsd,
      finishReason: result.stopReason,
      status: 'ok',
    });
    return result;
  } catch (err) {
    await tracer.failLlmCall(handle, err);
    throw err;
  }
}
