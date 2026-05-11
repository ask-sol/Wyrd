import type { Span } from '../schema/span.js';

export interface SpanNode {
  readonly span: Span;
  readonly children: SpanNode[];
}

/**
 * Build a tree of spans from a flat list. Spans without a parent in the
 * given list become roots. Children are ordered by `started_at` ascending.
 */
export function buildSpanTree(spans: readonly Span[]): SpanNode[] {
  const byId = new Map<string, { span: Span; children: SpanNode[] }>();
  for (const span of spans) {
    byId.set(span.span_id, { span, children: [] });
  }

  const roots: SpanNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.span.parent_span_id;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByStart = (a: SpanNode, b: SpanNode) => a.span.started_at - b.span.started_at;
  function sortRecursively(nodes: SpanNode[]): void {
    nodes.sort(sortByStart);
    for (const n of nodes) sortRecursively(n.children);
  }
  sortRecursively(roots);

  return roots;
}

export interface CostRollup {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  llmCalls: number;
  toolCalls: number;
}

function attrNumber(attrs: Span['attributes'], key: string): number {
  const v = attrs[key];
  if (typeof v === 'number') return v;
  return 0;
}

/**
 * Aggregate token + cost totals across a list of spans.
 * Llm/tool counts are simple span tallies by kind.
 */
export function rollupCost(spans: readonly Span[]): CostRollup {
  const out: CostRollup = {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    llmCalls: 0,
    toolCalls: 0,
  };
  for (const s of spans) {
    if (s.kind === 'llm.call') {
      out.llmCalls += 1;
      out.totalCostUsd += attrNumber(s.attributes, 'gen_ai.usage.cost_usd');
      out.totalInputTokens += attrNumber(s.attributes, 'gen_ai.usage.input_tokens');
      out.totalOutputTokens += attrNumber(s.attributes, 'gen_ai.usage.output_tokens');
      out.totalCacheReadTokens += attrNumber(s.attributes, 'gen_ai.usage.cache_read_tokens');
      out.totalCacheWriteTokens += attrNumber(s.attributes, 'gen_ai.usage.cache_write_tokens');
    } else if (s.kind === 'tool.call') {
      out.toolCalls += 1;
    }
  }
  return out;
}
