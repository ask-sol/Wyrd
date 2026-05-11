import type { BlobStore } from '../blobs/store.js';
import type { Span } from '../schema/span.js';
import { buildSpanTree, rollupCost, type SpanNode } from '../storage/treeBuilder.js';
import type { TraceWithSpans } from '../storage/types.js';

export interface PlaybackOptions {
  showPrompts?: boolean;
  showResponses?: boolean;
  maxBodyChars?: number;
  out?: NodeJS.WritableStream;
}

const KIND_GLYPHS: Record<Span['kind'], string> = {
  'agent.step': '◆',
  'llm.call': '⟶',
  'tool.call': '⚒',
  'tool.result': '✓',
};

const STATUS_GLYPH: Record<Span['status'], string> = {
  running: '…',
  ok: ' ',
  error: '!',
};

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function attrNum(span: Span, key: string): number | null {
  const v = span.attributes[key];
  return typeof v === 'number' ? v : null;
}

function attrStr(span: Span, key: string): string | null {
  const v = span.attributes[key];
  return typeof v === 'string' ? v : null;
}

function fmtDuration(span: Span): string {
  if (span.ended_at === null) return '       ';
  const ms = span.ended_at - span.started_at;
  if (ms < 1000) return `${ms.toString().padStart(5, ' ')}ms`;
  return `${(ms / 1000).toFixed(2).padStart(5, ' ')}s `;
}

function fmtCost(span: Span): string {
  const c = attrNum(span, 'gen_ai.usage.cost_usd');
  if (c === null || c === 0) return '         ';
  return ` $${c.toFixed(5)}`;
}

function fmtTokens(span: Span): string {
  const i = attrNum(span, 'gen_ai.usage.input_tokens');
  const o = attrNum(span, 'gen_ai.usage.output_tokens');
  if (i === null && o === null) return '';
  return ` ${i ?? 0}↓ ${o ?? 0}↑`;
}

function fmtSpanLine(node: SpanNode, depth: number): string {
  const span = node.span;
  const indent = '  '.repeat(depth);
  const glyph = KIND_GLYPHS[span.kind] ?? '?';
  const status = STATUS_GLYPH[span.status] ?? '?';
  let line = `${indent}${glyph} ${status} [${span.kind}] ${span.name}`;
  line += `  ${fmtDuration(span)}`;
  if (span.kind === 'llm.call') {
    line += `${fmtTokens(span)}${fmtCost(span)}`;
  }
  return line;
}

async function printNode(
  node: SpanNode,
  depth: number,
  blobs: BlobStore,
  opts: PlaybackOptions,
): Promise<void> {
  const out = opts.out ?? process.stdout;
  const maxBody = opts.maxBodyChars ?? 240;
  out.write(fmtSpanLine(node, depth) + '\n');

  const span = node.span;
  if (span.kind === 'llm.call') {
    if (opts.showPrompts && span.refs.request) {
      const req = (await blobs.getJson(span.refs.request)) as { messages?: unknown };
      const body = clamp(JSON.stringify(req.messages ?? req), maxBody);
      out.write(`${'  '.repeat(depth + 1)}↳ prompt: ${body}\n`);
    }
    if (opts.showResponses && span.refs.response) {
      const resp = (await blobs.getJson(span.refs.response)) as { text?: string };
      const body = clamp(typeof resp?.text === 'string' ? resp.text : JSON.stringify(resp), maxBody);
      out.write(`${'  '.repeat(depth + 1)}↳ response: ${body}\n`);
    }
  } else if (span.kind === 'tool.call') {
    const toolName = attrStr(span, 'tool.name');
    if (opts.showPrompts && span.refs.tool_args) {
      const args = await blobs.getJson(span.refs.tool_args);
      out.write(`${'  '.repeat(depth + 1)}↳ args: ${clamp(JSON.stringify(args), maxBody)}\n`);
    }
    if (opts.showResponses && span.refs.tool_result) {
      const r = (await blobs.getJson(span.refs.tool_result)) as { output?: string; error?: string };
      const body = r?.error
        ? `ERROR: ${clamp(String(r.error), maxBody)}`
        : clamp(String(r?.output ?? JSON.stringify(r)), maxBody);
      out.write(`${'  '.repeat(depth + 1)}↳ result${toolName ? ` (${toolName})` : ''}: ${body}\n`);
    }
  }

  for (const child of node.children) {
    await printNode(child, depth + 1, blobs, opts);
  }
}

/**
 * Print a textual step-by-step playback of a trace to `out` (default
 * `process.stdout`). Intended as the no-UI replay surface for v0.1.
 */
export async function playbackTrace(
  traceWithSpans: TraceWithSpans,
  blobs: BlobStore,
  opts: PlaybackOptions = {},
): Promise<void> {
  const out = opts.out ?? process.stdout;
  const tree = buildSpanTree(traceWithSpans.spans);
  const summary = rollupCost(traceWithSpans.spans);

  out.write(`trace ${traceWithSpans.trace.trace_id}  agent=${traceWithSpans.trace.agent_id}`);
  if (traceWithSpans.trace.agent_version) {
    out.write(` v${traceWithSpans.trace.agent_version}`);
  }
  out.write(`  status=${traceWithSpans.trace.status}\n`);
  out.write(
    `  llm.calls=${summary.llmCalls}  tool.calls=${summary.toolCalls}  ` +
      `tokens=${summary.totalInputTokens}↓ ${summary.totalOutputTokens}↑  ` +
      `cost=$${summary.totalCostUsd.toFixed(5)}\n\n`,
  );
  for (const root of tree) {
    await printNode(root, 0, blobs, opts);
  }
}
