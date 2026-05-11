import type { Tracer } from '../../tracer/tracer.js';
import type { OATool, OAToolContext, OAToolResult } from './types.js';

export interface WrapToolDeps {
  tracer: Tracer;
  /**
   * Whether the tool's effects can be safely re-executed during cached
   * replay. `read_file` is true; `send_email` / `bash` is false. Default
   * unspecified — replay engines decide policy.
   */
  safe_to_replay?: boolean;
}

/**
 * Wrap an OpenAgent-compatible tool so that every `execute()` invocation
 * emits a `tool.call` span as a child of the current trace context. The
 * tool's args and result are persisted to the blob store and referenced
 * by hash.
 */
export function wrapTool<T extends OATool>(tool: T, deps: WrapToolDeps): T {
  const { tracer, safe_to_replay } = deps;
  const wrapped: OATool = {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    async execute(input: Record<string, unknown>, context: OAToolContext): Promise<OAToolResult> {
      const handle = await tracer.startToolCall({
        tool_name: tool.name,
        args: input,
        ...(safe_to_replay !== undefined ? { safe_to_replay } : {}),
      });
      const started = Date.now();
      try {
        const result = await tool.execute(input, context);
        await tracer.endToolCall(handle, {
          result,
          status: result.error ? 'error' : 'ok',
          duration_ms: Date.now() - started,
          ...(result.error ? { errorMessage: result.error } : {}),
        });
        return result;
      } catch (err) {
        await tracer.failToolCall(handle, err, { duration_ms: Date.now() - started });
        throw err;
      }
    },
  };
  return wrapped as T;
}

/**
 * Wrap a `getTool(name)`-style lookup so every retrieved tool is traced.
 * Returns a lookup function with the same shape.
 */
export function wrapToolLookup(
  lookup: (name: string) => OATool | undefined,
  deps: WrapToolDeps,
): (name: string) => OATool | undefined {
  return (name: string) => {
    const t = lookup(name);
    if (!t) return undefined;
    return wrapTool(t, deps);
  };
}
