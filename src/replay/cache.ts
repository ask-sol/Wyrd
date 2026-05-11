import type { BlobStore } from '../blobs/store.js';
import type { Span } from '../schema/span.js';
import type { TraceWithSpans } from '../storage/types.js';
import type { OAToolResult } from '../integrations/openagent/types.js';

/**
 * Reconstructed in-memory cache for replaying a trace from local storage.
 * Keys are content hashes:
 *   - `responses` keyed by canonical-request hash (BlobRef.hash of request blob)
 *   - `tools`     keyed by `${tool_name}:${canonical-args hash}`
 */
export interface ReplayCache {
  readonly responses: Map<string, unknown>;
  readonly tools: Map<string, OAToolResult>;
}

export class ReplayDivergenceError extends Error {
  constructor(message: string, readonly detail?: Record<string, unknown>) {
    super(message);
    this.name = 'ReplayDivergenceError';
  }
}

export function toolCacheKey(tool_name: string, argsHash: string): string {
  return `${tool_name}:${argsHash}`;
}

/**
 * Build a `ReplayCache` from a stored trace. Reads each `llm.call` and
 * `tool.call` span's blobs from the blob store and indexes them by their
 * content-addressable hashes for O(1) lookup at replay time.
 */
export async function buildReplayCache(
  trace: TraceWithSpans,
  blobs: BlobStore,
): Promise<ReplayCache> {
  const responses = new Map<string, unknown>();
  const tools = new Map<string, OAToolResult>();

  for (const span of trace.spans) {
    if (span.kind === 'llm.call') {
      const reqRef = span.refs.request;
      const respRef = span.refs.response;
      if (reqRef && respRef) {
        const response = await blobs.getJson(respRef);
        responses.set(reqRef.hash, response);
      }
    } else if (span.kind === 'tool.call') {
      const argsRef = span.refs.tool_args;
      const resultRef = span.refs.tool_result;
      const toolName = readString(span, 'tool.name');
      if (argsRef && resultRef && toolName) {
        const result = (await blobs.getJson(resultRef)) as OAToolResult;
        tools.set(toolCacheKey(toolName, argsRef.hash), result);
      }
    }
  }

  return { responses, tools };
}

function readString(span: Span, key: string): string | null {
  const v = span.attributes[key];
  return typeof v === 'string' ? v : null;
}
