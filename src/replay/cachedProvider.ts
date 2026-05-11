import { hashCanonicalJson } from '../blobs/hash.js';
import type {
  OAProvider,
  OAProviderConfig,
  OAProviderMessage,
  OAProviderRequestOptions,
  OAProviderResponse,
  OAProviderTool,
  OAProviderToolCall,
  OAStreamChunk,
} from '../integrations/openagent/types.js';
import { ReplayDivergenceError, type ReplayCache } from './cache.js';

interface CachedResponse {
  text?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
  tool_executed?: Array<{ name?: string; result?: string; error?: string }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd?: number;
  };
  finish_reason?: string;
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

/**
 * Reconstruct the AsyncGenerator stream from a cached canonical response,
 * yielding chunks in the same shape an agent would have observed live.
 */
async function* replayChunks(cached: CachedResponse): AsyncGenerator<OAStreamChunk> {
  if (cached.text) {
    yield { type: 'text', text: cached.text };
  }
  for (const tc of cached.tool_calls ?? []) {
    yield {
      type: 'tool_call_start',
      toolCall: { id: tc.id, name: tc.name, arguments: '' },
    };
    yield { type: 'tool_call_end', toolCall: tc };
  }
  for (const tx of cached.tool_executed ?? []) {
    const chunk: OAStreamChunk = { type: 'tool_executed' };
    if (tx.name) chunk.toolCall = { id: '', name: tx.name, arguments: '' };
    if (tx.result !== undefined) chunk.toolResult = tx.result;
    if (tx.error !== undefined) chunk.toolError = tx.error;
    yield chunk;
  }
  const doneChunk: OAStreamChunk = { type: 'done' };
  if (cached.usage) doneChunk.usage = cached.usage;
  yield doneChunk;
}

function cachedToProviderResponse(cached: CachedResponse): OAProviderResponse {
  const toolCalls: OAProviderToolCall[] = (cached.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    type: 'function',
    function: { name: tc.name, arguments: tc.arguments },
  }));
  return {
    content: cached.text ?? '',
    toolCalls,
    usage: {
      inputTokens: cached.usage?.inputTokens ?? 0,
      outputTokens: cached.usage?.outputTokens ?? 0,
      ...(cached.usage?.cacheReadTokens !== undefined ? { cacheReadTokens: cached.usage.cacheReadTokens } : {}),
      ...(cached.usage?.cacheWriteTokens !== undefined ? { cacheWriteTokens: cached.usage.cacheWriteTokens } : {}),
      ...(cached.usage?.costUsd !== undefined ? { costUsd: cached.usage.costUsd } : {}),
    },
    stopReason: (cached.finish_reason as OAProviderResponse['stopReason']) ?? 'end_turn',
  };
}

export interface CachedProviderOptions {
  /** Throw `ReplayDivergenceError` on any cache miss. Default: true. */
  strict?: boolean;
}

/**
 * A provider that serves responses from a `ReplayCache` instead of calling
 * the upstream model. Falls back to the underlying provider on cache miss
 * unless `strict: true`, in which case any miss raises.
 */
export class CachedProvider implements OAProvider {
  readonly config: OAProviderConfig;

  constructor(
    private readonly underlying: OAProvider,
    private readonly cache: ReplayCache,
    private readonly opts: CachedProviderOptions = {},
  ) {
    this.config = underlying.config;
  }

  stream(
    messages: OAProviderMessage[],
    tools: OAProviderTool[],
    options: OAProviderRequestOptions,
  ): AsyncGenerator<OAStreamChunk> {
    return this.streamImpl(messages, tools, options);
  }

  private async *streamImpl(
    messages: OAProviderMessage[],
    tools: OAProviderTool[],
    options: OAProviderRequestOptions,
  ): AsyncGenerator<OAStreamChunk> {
    const key = hashCanonicalJson(buildRequest(this.config.id, messages, tools, options));
    const hit = this.cache.responses.get(key);
    if (hit) {
      yield* replayChunks(hit as CachedResponse);
      return;
    }
    if (this.opts.strict !== false) {
      throw new ReplayDivergenceError(
        `Replay cache miss for llm.call (request hash ${key.slice(0, 12)}…)`,
        { hash: key, model: options.model, provider: this.config.id },
      );
    }
    yield* this.underlying.stream(messages, tools, options);
  }

  async complete(
    messages: OAProviderMessage[],
    tools: OAProviderTool[],
    options: OAProviderRequestOptions,
  ): Promise<OAProviderResponse> {
    const key = hashCanonicalJson(buildRequest(this.config.id, messages, tools, options));
    const hit = this.cache.responses.get(key);
    if (hit) return cachedToProviderResponse(hit as CachedResponse);
    if (this.opts.strict !== false) {
      throw new ReplayDivergenceError(
        `Replay cache miss for llm.call (request hash ${key.slice(0, 12)}…)`,
        { hash: key, model: options.model, provider: this.config.id },
      );
    }
    return this.underlying.complete(messages, tools, options);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    if (this.underlying.validateApiKey) return this.underlying.validateApiKey(apiKey);
    return true;
  }
}
