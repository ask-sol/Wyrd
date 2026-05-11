/**
 * Structural types matching OpenAgent's Provider interface.
 *
 * Wyrd does not import OpenAgent — these types duplicate the shape so that
 * `wrapProvider` can be applied to any compatible provider implementation,
 * keeping Wyrd framework-neutral at the schema layer.
 *
 * See OpenAgent's `src/providers/types.ts` for the canonical definitions.
 */

export interface OAProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OAProviderContentBlock[];
  tool_call_id?: string;
  tool_calls?: OAProviderToolCall[];
}

export interface OAProviderContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image_url';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  image_url?: { url: string };
}

export interface OAProviderToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OAProviderTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OATokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}

export type OAStreamChunkType =
  | 'text'
  | 'tool_call_start'
  | 'tool_call_delta'
  | 'tool_call_end'
  | 'tool_executed'
  | 'done'
  | 'error';

export interface OAStreamChunk {
  type: OAStreamChunkType;
  text?: string;
  toolCall?: { id: string; name: string; arguments: string };
  toolResult?: string;
  toolError?: string;
  error?: string;
  usage?: OATokenUsage;
}

export type OAStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

export interface OAProviderResponse {
  content: string;
  toolCalls: OAProviderToolCall[];
  usage: OATokenUsage;
  stopReason: OAStopReason;
}

export interface OAProviderRequestOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
}

export interface OAProviderModel {
  id: string;
  name?: string;
  contextWindow?: number;
  maxOutput?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export interface OAProviderConfig {
  id: string;
  name?: string;
  models: OAProviderModel[];
  [k: string]: unknown;
}

export interface OAProvider {
  config: OAProviderConfig;
  validateApiKey?(apiKey: string): Promise<boolean>;
  stream(
    messages: OAProviderMessage[],
    tools: OAProviderTool[],
    options: OAProviderRequestOptions,
  ): AsyncGenerator<OAStreamChunk>;
  complete(
    messages: OAProviderMessage[],
    tools: OAProviderTool[],
    options: OAProviderRequestOptions,
  ): Promise<OAProviderResponse>;
}

export interface OAToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
  [k: string]: unknown;
}

export interface OAToolResult {
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface OATool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    input: Record<string, unknown>,
    context: OAToolContext,
  ): Promise<OAToolResult>;
}
