'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WyrdSpan } from '@/lib/types';
import type { VirtualKind, VirtualNode } from '@/lib/expandTrace';
import { formatDuration, formatNumber } from '@/lib/format';

type GraphItem =
  | { kind: 'span'; id: string; parentId: string | null; span: WyrdSpan }
  | { kind: 'virtual'; id: string; parentId: string; node: VirtualNode };

interface GraphNodeData extends Record<string, unknown> {
  item: GraphItem;
  selected: boolean;
  hasChildren: boolean;
  expanded: boolean;
  childCount: number;
  onToggle: (id: string) => void;
}

const SPAN_ACCENT: Record<WyrdSpan['kind'], string> = {
  'agent.step': '#9AA0A6',
  'llm.call': '#8AB4F8',
  'tool.call': '#C58AF9',
  'tool.result': '#C58AF9',
};

const VIRTUAL_ACCENT: Record<VirtualKind, string> = {
  'v.request': '#5F9EE6',
  'v.response': '#7DD3FC',
  'v.system_prompt': '#94A3B8',
  'v.message': '#A1B6D6',
  'v.tool_decl': '#B794F4',
  'v.params': '#94A3B8',
  'v.content_block.text': '#7DD3FC',
  'v.content_block.tool_use': '#C58AF9',
  'v.content_block.server_tool_use': '#F0ABFC',
  'v.content_block.web_search_result': '#F472B6',
  'v.content_block.code_exec_result': '#FB7185',
  'v.content_block.thinking': '#FBBF24',
  'v.search_hit': '#F472B6',
  'v.usage': '#94A3B8',
  'v.tool_args': '#B794F4',
  'v.tool_result': '#B794F4',
};

const STATUS_DOT: Record<WyrdSpan['status'], string> = {
  ok: '#34D399',
  error: '#F87171',
  running: '#FBBF24',
};

function GraphNode({ data }: { data: GraphNodeData }) {
  const { item, selected, hasChildren, expanded, childCount, onToggle } = data;
  const isVirtual = item.kind === 'virtual';
  const accent = item.kind === 'span'
    ? SPAN_ACCENT[item.span.kind]
    : VIRTUAL_ACCENT[item.node.kind];

  let label: string;
  let kindTag: string;
  let preview = '';
  let durationStr = '';
  let statusDot: string | null = null;
  let badge = '';

  if (item.kind === 'span') {
    label = item.span.name;
    kindTag = item.span.kind;
    const d = item.span.ended_at !== null ? item.span.ended_at - item.span.started_at : null;
    durationStr = formatDuration(d);
    statusDot = STATUS_DOT[item.span.status];
    if (item.span.kind === 'llm.call') {
      const i = item.span.attributes['gen_ai.usage.input_tokens'];
      const o = item.span.attributes['gen_ai.usage.output_tokens'];
      if (typeof i === 'number' || typeof o === 'number') {
        badge = `${formatNumber(Number(i ?? 0))}↓ ${formatNumber(Number(o ?? 0))}↑`;
      }
    }
    if (item.span.kind === 'tool.call' && item.span.attributes['tool.side'] === 'server') {
      badge = badge ? `${badge} · server` : 'server';
    }
  } else {
    label = item.node.name;
    kindTag = item.node.kind.replace('v.content_block.', 'block.').replace('v.', '');
    preview = item.node.preview;
  }

  return (
    <div
      className={`relative bg-surface border rounded-md transition-colors ${
        selected ? 'border-brand shadow-md' : 'border-border'
      }`}
      style={{ width: isVirtual ? 240 : 280 }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-md"
        style={{ background: accent }}
      />
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div className={isVirtual ? 'px-3 py-2' : 'px-3 py-2.5'}>
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span
            className="text-2xs font-mono uppercase tracking-wide truncate"
            style={{ color: accent }}
          >
            {kindTag}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {statusDot && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: statusDot }}
                aria-hidden
              />
            )}
          </div>
        </div>
        <div
          className={`${isVirtual ? 'text-xs' : 'text-sm'} text-ink truncate leading-tight font-medium`}
          title={label}
        >
          {label}
        </div>
        {preview && (
          <div className="text-2xs font-mono text-ink3 truncate mt-0.5" title={preview}>
            {preview}
          </div>
        )}
        {(durationStr && durationStr !== '—') || badge ? (
          <div className="flex items-center gap-2 text-2xs font-mono text-ink3 tabular mt-1">
            {durationStr && durationStr !== '—' && <span>{durationStr}</span>}
            {badge && (
              <span className="px-1 rounded-sm bg-subtle border border-divider text-ink2">
                {badge}
              </span>
            )}
          </div>
        ) : null}
      </div>
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item.id);
          }}
          className={`absolute -bottom-[10px] left-1/2 -translate-x-1/2 z-10 inline-flex items-center justify-center text-2xs font-mono font-medium rounded-pill border transition-colors px-2 h-5 ${
            expanded
              ? 'bg-surface border-border text-ink3 hover:text-ink hover:bg-hover'
              : 'bg-brand border-brand text-bg hover:bg-brandStrong'
          }`}
          title={expanded ? 'Collapse children' : `Expand ${childCount} children`}
        >
          {expanded ? '−' : `+${childCount}`}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
}

// ──── tidy-ish vertical tree layout ──────────────────────────────────
//
// • Each real span / virtual node sits on its own row. Y is strictly
//   monotonically increasing with depth — children below parents.
// • Children are placed in their own X subtree; siblings get equal slots.
// • Root sits centered above its visible descendants.

function layout(items: GraphItem[]): Map<string, { x: number; y: number }> {
  const childrenByParent = new Map<string | null, GraphItem[]>();
  for (const it of items) {
    const arr = childrenByParent.get(it.parentId) ?? [];
    arr.push(it);
    childrenByParent.set(it.parentId, arr);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => {
      if (a.kind === 'span' && b.kind === 'span') return a.span.started_at - b.span.started_at;
      if (a.kind === 'span') return -1;
      if (b.kind === 'span') return 1;
      return 0;
    });
  }

  const H_GAP = 36;
  const V_GAP = 150; // vertical spacing per depth row — keep clearly > node height
  const positions = new Map<string, { x: number; y: number }>();
  let cursor = 0;

  function widthOf(it: GraphItem): number {
    return it.kind === 'virtual' ? 240 : 280;
  }

  function place(it: GraphItem, depth: number): { left: number; right: number } {
    const children = childrenByParent.get(it.id) ?? [];
    const w = widthOf(it);
    if (children.length === 0) {
      const x = cursor;
      positions.set(it.id, { x, y: depth * V_GAP });
      cursor += w + H_GAP;
      return { left: x, right: x + w };
    }

    // Grid layout for many same-kind leaf children (tool decls, search hits,
    // result items). Keeps the canvas from sprawling sideways with 40+ siblings.
    const sameKind = children.every((c) => c.kind === children[0]!.kind);
    const allLeaves = children.every((c) => (childrenByParent.get(c.id) ?? []).length === 0);
    if (sameKind && allLeaves && children.length >= 6) {
      const COLS = 2;
      const childW = widthOf(children[0]!);
      const COL_GAP = 16;
      const ROW_STEP = 56; // tight rows so 42 items don't push the canvas miles down
      const startX = cursor;
      for (let i = 0; i < children.length; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = startX + col * (childW + COL_GAP);
        const y = (depth + 1) * V_GAP + row * ROW_STEP;
        positions.set(children[i]!.id, { x, y });
      }
      const gridW = COLS * childW + (COLS - 1) * COL_GAP;
      cursor = startX + gridW + H_GAP;
      const parentX = startX + gridW / 2 - w / 2;
      positions.set(it.id, { x: parentX, y: depth * V_GAP });
      return {
        left: Math.min(startX, parentX),
        right: Math.max(startX + gridW, parentX + w),
      };
    }

    const ranges = children.map((c) => place(c, depth + 1));
    const leftMost = ranges[0]!.left;
    const rightMost = ranges[ranges.length - 1]!.right;
    const childrenCenter = (leftMost + rightMost) / 2;
    const x = childrenCenter - w / 2;
    positions.set(it.id, { x, y: depth * V_GAP });
    return { left: Math.min(leftMost, x), right: Math.max(rightMost, x + w) };
  }

  const roots = childrenByParent.get(null) ?? [];
  for (const r of roots) place(r, 0);
  return positions;
}

const nodeTypes = { item: GraphNode };

export function Dag({
  spans,
  selectedId,
  onSelect,
  traceId,
}: {
  spans: WyrdSpan[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  traceId?: string;
}) {
  const [virtuals, setVirtuals] = useState<VirtualNode[]>([]);
  const [loadingVirtuals, setLoadingVirtuals] = useState(false);
  // Real spans are always expanded; virtual nodes default collapsed.
  // `expanded` holds the set of node IDs whose children are visible.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(spans.map((s) => s.span_id)));

  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;
    setLoadingVirtuals(true);
    fetch(`/api/traces/${traceId}/expanded`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as { virtual_nodes?: VirtualNode[] };
        if (cancelled) return;
        if (j.virtual_nodes) setVirtuals(j.virtual_nodes);
      })
      .catch(() => {/* tolerate */})
      .finally(() => !cancelled && setLoadingVirtuals(false));
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  // Re-init expanded set when spans arrive.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const s of spans) next.add(s.span_id);
      return next;
    });
  }, [spans]);

  const { nodes, edges, virtualChildCount } = useMemo(() => {
    // Build the full item map.
    const allItems: GraphItem[] = [];
    for (const s of spans) {
      allItems.push({ kind: 'span', id: s.span_id, parentId: s.parent_span_id, span: s });
    }
    for (const v of virtuals) {
      allItems.push({ kind: 'virtual', id: v.id, parentId: v.parent_id, node: v });
    }
    const byId = new Map(allItems.map((i) => [i.id, i] as const));
    const childMap = new Map<string, GraphItem[]>();
    for (const it of allItems) {
      if (it.parentId === null) continue;
      const arr = childMap.get(it.parentId) ?? [];
      arr.push(it);
      childMap.set(it.parentId, arr);
    }
    // Count children including all descendants for the "+N" badge.
    const totalDescendants = new Map<string, number>();
    function countDescendants(id: string): number {
      if (totalDescendants.has(id)) return totalDescendants.get(id)!;
      const c = childMap.get(id) ?? [];
      let total = c.length;
      for (const child of c) total += countDescendants(child.id);
      totalDescendants.set(id, total);
      return total;
    }
    for (const it of allItems) countDescendants(it.id);

    // Compute visible subset based on `expanded`.
    const visible: GraphItem[] = [];
    function walk(it: GraphItem) {
      visible.push(it);
      if (!expanded.has(it.id)) return;
      const cs = childMap.get(it.id) ?? [];
      for (const c of cs) walk(c);
    }
    for (const it of allItems) {
      if (it.parentId === null) walk(it);
    }
    // Filter so virtuals whose parent isn't visible drop out (happens for collapsed branches).
    const visibleIds = new Set(visible.map((i) => i.id));
    const trimmed = visible.filter(
      (it) => it.parentId === null || visibleIds.has(it.parentId!),
    );

    const positions = layout(trimmed);

    const ns: Node<GraphNodeData>[] = trimmed.map((it) => ({
      id: it.id,
      type: 'item',
      position: positions.get(it.id) ?? { x: 0, y: 0 },
      data: {
        item: it,
        selected: it.id === selectedId,
        hasChildren: (childMap.get(it.id)?.length ?? 0) > 0,
        expanded: expanded.has(it.id),
        childCount: childMap.get(it.id)?.length ?? 0,
        onToggle: (id: string) =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          }),
      },
      draggable: false,
    }));

    const es: Edge[] = trimmed
      .filter((it) => it.parentId !== null && visibleIds.has(it.parentId!))
      .map((it) => {
        const parent = byId.get(it.parentId!)!;
        const isVirtualEdge = it.kind === 'virtual' || parent.kind === 'virtual';
        return {
          id: `${it.parentId}->${it.id}`,
          source: it.parentId as string,
          target: it.id,
          style: {
            stroke: isVirtualEdge ? '#3C4043' : '#5F6368',
            strokeWidth: isVirtualEdge ? 1 : 1.5,
            strokeDasharray: isVirtualEdge ? '3 3' : undefined,
          },
          type: 'smoothstep',
        };
      });

    return { nodes: ns, edges: es, virtualChildCount: virtuals.length };
  }, [spans, virtuals, expanded, selectedId]);

  if (spans.length === 0) {
    return <div className="text-sm text-ink3 p-6">No spans recorded.</div>;
  }

  function expandAll() {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const s of spans) next.add(s.span_id);
      for (const v of virtuals) next.add(v.id);
      return next;
    });
  }
  function collapseToSpans() {
    setExpanded(new Set(spans.map((s) => s.span_id)));
  }

  return (
    <div className="w-full h-[720px] rounded-md border border-border bg-bg overflow-hidden relative">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button
          onClick={expandAll}
          className="h-7 px-3 rounded-pill border border-border bg-surface text-xs text-ink2 hover:text-ink hover:bg-hover transition-colors"
        >
          Expand all
        </button>
        <button
          onClick={collapseToSpans}
          className="h-7 px-3 rounded-pill border border-border bg-surface text-xs text-ink2 hover:text-ink hover:bg-hover transition-colors"
        >
          Collapse deep
        </button>
        {loadingVirtuals && (
          <span className="text-2xs font-mono text-ink3 bg-surface border border-divider rounded-sm px-2 py-0.5">
            expanding…
          </span>
        )}
        {virtualChildCount > 0 && !loadingVirtuals && (
          <span className="text-2xs font-mono text-ink3 bg-surface border border-divider rounded-sm px-2 py-0.5">
            {spans.length} spans · {virtualChildCount} deep nodes
          </span>
        )}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect(n.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={24} size={1} color="#282A2C" />
        <Controls showInteractive={false} className="!bg-surface !border-border" />
      </ReactFlow>
    </div>
  );
}
