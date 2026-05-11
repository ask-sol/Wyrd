/**
 * Lightweight, dependency-free word/line diff. Produces a side-by-side
 * "ops" array that the UI can render with red-removed / green-added strips.
 */

export type DiffOp =
  | { kind: 'equal'; text: string }
  | { kind: 'del'; text: string }
  | { kind: 'ins'; text: string };

function tokens(s: string): string[] {
  // Split on whitespace boundaries, keep delimiters so reconstruction is exact.
  return s.split(/(\s+)/);
}

export function diffWords(a: string, b: string): DiffOp[] {
  const A = tokens(a);
  const B = tokens(b);
  // LCS table.
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  let bufEqual = '';
  let bufDel = '';
  let bufIns = '';
  const flush = () => {
    if (bufEqual) {
      out.push({ kind: 'equal', text: bufEqual });
      bufEqual = '';
    }
    if (bufDel) {
      out.push({ kind: 'del', text: bufDel });
      bufDel = '';
    }
    if (bufIns) {
      out.push({ kind: 'ins', text: bufIns });
      bufIns = '';
    }
  };
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      if (bufDel || bufIns) flush();
      bufEqual += A[i]!;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      if (bufEqual || bufIns) flush();
      bufDel += A[i]!;
      i++;
    } else {
      if (bufEqual || bufDel) flush();
      bufIns += B[j]!;
      j++;
    }
  }
  while (i < n) {
    if (bufEqual || bufIns) flush();
    bufDel += A[i++]!;
  }
  while (j < m) {
    if (bufEqual || bufDel) flush();
    bufIns += B[j++]!;
  }
  flush();
  return out;
}

export interface SpanDiffRow {
  span_id: string;
  name: string;
  kind: string;
  status: 'a-only' | 'b-only' | 'matched' | 'changed';
  duration_a: number | null;
  duration_b: number | null;
  cost_a: number | null;
  cost_b: number | null;
  tokens_a: { in: number; out: number } | null;
  tokens_b: { in: number; out: number } | null;
}

interface SpanLike {
  span_id: string;
  name: string;
  kind: string;
  started_at: number;
  ended_at: number | null;
  attributes: Record<string, unknown>;
}

function spanKey(s: SpanLike): string {
  // Match spans by (kind, name) — that's what semantically corresponds across
  // two runs of the same agent. Order disambiguates duplicates with a counter.
  return `${s.kind}::${s.name}`;
}

function tokensOf(s: SpanLike): { in: number; out: number } | null {
  const i = s.attributes['gen_ai.usage.input_tokens'];
  const o = s.attributes['gen_ai.usage.output_tokens'];
  if (typeof i !== 'number' && typeof o !== 'number') return null;
  return { in: typeof i === 'number' ? i : 0, out: typeof o === 'number' ? o : 0 };
}

function costOf(s: SpanLike): number | null {
  const c = s.attributes['gen_ai.usage.cost_usd'];
  return typeof c === 'number' ? c : null;
}

export function diffSpans(spansA: SpanLike[], spansB: SpanLike[]): SpanDiffRow[] {
  // Group by key, walk in order, pair up first-fit.
  const sortByStart = (a: SpanLike, b: SpanLike) => a.started_at - b.started_at;
  const A = [...spansA].sort(sortByStart);
  const B = [...spansB].sort(sortByStart);
  const byKeyB = new Map<string, SpanLike[]>();
  for (const s of B) {
    const k = spanKey(s);
    const arr = byKeyB.get(k) ?? [];
    arr.push(s);
    byKeyB.set(k, arr);
  }
  const matchedB = new Set<string>();
  const rows: SpanDiffRow[] = [];
  for (const a of A) {
    const k = spanKey(a);
    const candidates = byKeyB.get(k);
    const b = candidates?.find((bs) => !matchedB.has(bs.span_id));
    if (!b) {
      rows.push({
        span_id: a.span_id,
        name: a.name,
        kind: a.kind,
        status: 'a-only',
        duration_a: a.ended_at !== null ? a.ended_at - a.started_at : null,
        duration_b: null,
        cost_a: costOf(a),
        cost_b: null,
        tokens_a: tokensOf(a),
        tokens_b: null,
      });
      continue;
    }
    matchedB.add(b.span_id);
    const durA = a.ended_at !== null ? a.ended_at - a.started_at : null;
    const durB = b.ended_at !== null ? b.ended_at - b.started_at : null;
    const tokA = tokensOf(a);
    const tokB = tokensOf(b);
    const costA = costOf(a);
    const costB = costOf(b);
    const changed =
      durA !== durB ||
      costA !== costB ||
      tokA?.in !== tokB?.in ||
      tokA?.out !== tokB?.out;
    rows.push({
      span_id: a.span_id,
      name: a.name,
      kind: a.kind,
      status: changed ? 'changed' : 'matched',
      duration_a: durA,
      duration_b: durB,
      cost_a: costA,
      cost_b: costB,
      tokens_a: tokA,
      tokens_b: tokB,
    });
  }
  for (const b of B) {
    if (matchedB.has(b.span_id)) continue;
    rows.push({
      span_id: b.span_id,
      name: b.name,
      kind: b.kind,
      status: 'b-only',
      duration_a: null,
      duration_b: b.ended_at !== null ? b.ended_at - b.started_at : null,
      cost_a: null,
      cost_b: costOf(b),
      tokens_a: null,
      tokens_b: tokensOf(b),
    });
  }
  return rows;
}
