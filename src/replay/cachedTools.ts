import { hashCanonicalJson } from '../blobs/hash.js';
import type { OATool, OAToolContext, OAToolResult } from '../integrations/openagent/types.js';
import { ReplayDivergenceError, toolCacheKey, type ReplayCache } from './cache.js';

export interface CachedToolOptions {
  /** Throw `ReplayDivergenceError` on cache miss. Default: true. */
  strict?: boolean;
}

/**
 * Wrap a tool so it serves results from a `ReplayCache` keyed by
 * `(tool_name, canonical-args hash)`. Cache miss raises in strict mode.
 */
export function cacheTool<T extends OATool>(
  tool: T,
  cache: ReplayCache,
  opts: CachedToolOptions = {},
): T {
  const wrapped: OATool = {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    async execute(input: Record<string, unknown>, context: OAToolContext): Promise<OAToolResult> {
      const argsHash = hashCanonicalJson(input);
      const key = toolCacheKey(tool.name, argsHash);
      const hit = cache.tools.get(key);
      if (hit) return hit;
      if (opts.strict !== false) {
        throw new ReplayDivergenceError(
          `Replay cache miss for tool.call ${tool.name} (args hash ${argsHash.slice(0, 12)}…)`,
          { tool: tool.name, hash: argsHash },
        );
      }
      return tool.execute(input, context);
    },
  };
  return wrapped as T;
}

/**
 * Wrap a `getTool(name)` lookup so every retrieved tool is served from
 * `cache` first, falling through (or raising in strict mode) on miss.
 */
export function cacheToolLookup(
  lookup: (name: string) => OATool | undefined,
  cache: ReplayCache,
  opts: CachedToolOptions = {},
): (name: string) => OATool | undefined {
  return (name: string) => {
    const t = lookup(name);
    if (!t) return undefined;
    return cacheTool(t, cache, opts);
  };
}
