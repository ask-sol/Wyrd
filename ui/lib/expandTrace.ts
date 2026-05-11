import type { WyrdSpan } from './types';
import { getBlobs } from './store';

export type VirtualKind =
  | 'v.request'
  | 'v.response'
  | 'v.system_prompt'
  | 'v.message'
  | 'v.tool_decl'
  | 'v.params'
  | 'v.content_block.text'
  | 'v.content_block.tool_use'
  | 'v.content_block.server_tool_use'
  | 'v.content_block.web_search_result'
  | 'v.content_block.code_exec_result'
  | 'v.content_block.thinking'
  | 'v.search_hit'
  | 'v.usage'
  | 'v.tool_args'
  | 'v.tool_result';

export interface VirtualNode {
  id: string;
  parent_id: string;
  kind: VirtualKind;
  name: string;
  preview: string;
  /** Arbitrary structured payload for the inspector to render. */
  payload?: unknown;
  /** Length of the preview's underlying content in bytes. */
  size?: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function shorten(s: string, n = 140): string {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= n) return trimmed;
  return trimmed.slice(0, n - 1) + '…';
}

async function loadBlob(hash: string): Promise<unknown> {
  const blobs = getBlobs();
  try {
    const buf = await blobs.get({ algo: 'sha256', hash, size: 0, content_type: '' } as Parameters<typeof blobs.get>[0]);
    const text = new TextDecoder().decode(buf);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function expandLlmRequest(parentId: string, req: unknown, out: VirtualNode[]): void {
  if (!isObj(req)) return;

  const requestId = `${parentId}::request`;
  out.push({
    id: requestId,
    parent_id: parentId,
    kind: 'v.request',
    name: 'Request',
    preview: `model=${String(req.model ?? '?')} · ${Array.isArray(req.messages) ? req.messages.length : 0} messages`,
    payload: req,
  });

  const params = isObj(req.params) ? req.params : {};
  if (params.system && typeof params.system === 'string') {
    out.push({
      id: `${requestId}::system`,
      parent_id: requestId,
      kind: 'v.system_prompt',
      name: 'System prompt',
      preview: shorten(params.system),
      size: params.system.length,
      payload: params.system,
    });
  }

  if (Array.isArray(req.messages)) {
    req.messages.forEach((m: unknown, i: number) => {
      if (!isObj(m)) return;
      const role = String(m.role ?? '?');
      const content = m.content;
      let preview = '';
      if (typeof content === 'string') preview = shorten(content);
      else if (Array.isArray(content)) {
        preview = content
          .map((b) => (isObj(b) ? (typeof b.text === 'string' ? b.text : b.type ?? '') : ''))
          .filter(Boolean)
          .join(' · ');
        preview = shorten(preview);
      }
      out.push({
        id: `${requestId}::msg.${i}`,
        parent_id: requestId,
        kind: 'v.message',
        name: `message[${i}] · ${role}`,
        preview: preview || '(empty)',
        payload: m,
      });
    });
  }

  if (Array.isArray(req.tools) && req.tools.length > 0) {
    const toolsId = `${requestId}::tools`;
    out.push({
      id: toolsId,
      parent_id: requestId,
      kind: 'v.tool_decl',
      name: `tools (${req.tools.length})`,
      preview: req.tools.map((t: unknown) => (isObj(t) ? t.name ?? t.function ?? '?' : '?')).join(' · '),
      payload: req.tools,
    });
    req.tools.forEach((t: unknown, i: number) => {
      if (!isObj(t)) return;
      const name = (t.name as string) ?? (isObj(t.function) ? (t.function.name as string) : `tool[${i}]`);
      const desc = (t.description as string) ?? (isObj(t.function) ? (t.function.description as string) : '');
      out.push({
        id: `${toolsId}::${i}`,
        parent_id: toolsId,
        kind: 'v.tool_decl',
        name,
        preview: shorten(desc ?? ''),
        payload: t,
      });
    });
  }

  out.push({
    id: `${requestId}::params`,
    parent_id: requestId,
    kind: 'v.params',
    name: 'Parameters',
    preview: `temp=${params.temperature ?? '—'} · max=${params.max_tokens ?? '—'} · top_p=${params.top_p ?? '—'}`,
    payload: params,
  });
}

function expandLlmResponse(parentId: string, resp: unknown, out: VirtualNode[]): void {
  if (!isObj(resp)) return;

  const respId = `${parentId}::response`;
  const text = typeof resp.text === 'string' ? resp.text : '';
  const usage = isObj(resp.usage) ? resp.usage : null;

  out.push({
    id: respId,
    parent_id: parentId,
    kind: 'v.response',
    name: 'Response',
    preview: `${text.length} chars · finish=${String(resp.finish_reason ?? '?')}`,
    payload: resp,
  });

  if (text) {
    out.push({
      id: `${respId}::text`,
      parent_id: respId,
      kind: 'v.content_block.text',
      name: 'Text',
      preview: shorten(text, 200),
      size: text.length,
      payload: text,
    });
  }

  if (Array.isArray(resp.tool_calls)) {
    resp.tool_calls.forEach((tc: unknown, i: number) => {
      if (!isObj(tc)) return;
      const name = String(tc.name ?? `tool[${i}]`);
      const args = String(tc.arguments ?? '');
      const isServer = name.startsWith('anthropic.');
      out.push({
        id: `${respId}::tool.${i}`,
        parent_id: respId,
        kind: isServer ? 'v.content_block.server_tool_use' : 'v.content_block.tool_use',
        name: name,
        preview: shorten(args, 140),
        payload: tc,
      });
    });
  }

  if (Array.isArray(resp.tool_executed)) {
    resp.tool_executed.forEach((te: unknown, i: number) => {
      if (!isObj(te)) return;
      const name = String(te.name ?? `executed[${i}]`);
      const result = te.result ?? '';
      const kind: VirtualKind = name === 'anthropic.web_search'
        ? 'v.content_block.web_search_result'
        : name === 'anthropic.code_execution'
          ? 'v.content_block.code_exec_result'
          : 'v.content_block.tool_use';
      const parsed = typeof result === 'string' ? safeParseJson(result) : result;
      const nodeId = `${respId}::executed.${i}`;
      out.push({
        id: nodeId,
        parent_id: respId,
        kind,
        name,
        preview: typeof parsed === 'string' ? shorten(parsed) : shorten(JSON.stringify(parsed)),
        payload: parsed,
      });
      if (kind === 'v.content_block.web_search_result' && Array.isArray(parsed)) {
        parsed.forEach((hit: unknown, hi: number) => {
          if (!isObj(hit)) return;
          out.push({
            id: `${nodeId}::hit.${hi}`,
            parent_id: nodeId,
            kind: 'v.search_hit',
            name: shorten(String(hit.title ?? hit.url ?? `result[${hi}]`), 80),
            preview: shorten(String(hit.url ?? hit.snippet ?? '')),
            payload: hit,
          });
        });
      }
    });
  }

  if (usage) {
    out.push({
      id: `${respId}::usage`,
      parent_id: respId,
      kind: 'v.usage',
      name: 'Usage',
      preview: `${usage.inputTokens ?? 0}↓ ${usage.outputTokens ?? 0}↑${
        usage.cacheReadTokens ? ` · cache ${usage.cacheReadTokens}` : ''
      }`,
      payload: usage,
    });
  }
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function expandToolCall(parentId: string, args: unknown, result: unknown, out: VirtualNode[]): void {
  if (args !== undefined && args !== null) {
    out.push({
      id: `${parentId}::args`,
      parent_id: parentId,
      kind: 'v.tool_args',
      name: 'Arguments',
      preview: typeof args === 'string' ? shorten(args) : shorten(JSON.stringify(args)),
      payload: args,
    });
  }
  if (result !== undefined && result !== null) {
    const resId = `${parentId}::result`;
    out.push({
      id: resId,
      parent_id: parentId,
      kind: 'v.tool_result',
      name: 'Result',
      preview: typeof result === 'string' ? shorten(result) : shorten(JSON.stringify(result)),
      payload: result,
    });
    // If the result looks like a list of search hits, expand them.
    if (Array.isArray(result)) {
      result.slice(0, 50).forEach((item: unknown, i: number) => {
        if (!isObj(item)) return;
        const title = item.title ?? item.url ?? item.name;
        if (title) {
          out.push({
            id: `${resId}::item.${i}`,
            parent_id: resId,
            kind: 'v.search_hit',
            name: shorten(String(title), 80),
            preview: shorten(String(item.url ?? item.snippet ?? '')),
            payload: item,
          });
        }
      });
    }
  }
}

export async function expandTrace(spans: WyrdSpan[]): Promise<VirtualNode[]> {
  const out: VirtualNode[] = [];
  for (const s of spans) {
    const refs = s.refs ?? {};
    if (s.kind === 'llm.call') {
      const req = refs.request ? await loadBlob(refs.request.hash) : null;
      const resp = refs.response ? await loadBlob(refs.response.hash) : null;
      if (req) expandLlmRequest(s.span_id, req, out);
      if (resp) expandLlmResponse(s.span_id, resp, out);
    } else if (s.kind === 'tool.call' || s.kind === 'tool.result') {
      const args = refs.tool_args ? await loadBlob(refs.tool_args.hash) : null;
      const result = refs.tool_result ? await loadBlob(refs.tool_result.hash) : null;
      expandToolCall(s.span_id, args, result, out);
    }
  }
  return out;
}
