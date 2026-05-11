import { join } from 'node:path';
import { getRootDir } from './store';

export type AnnotationSeverity = 'info' | 'good' | 'bug' | 'finetune';

export interface Annotation {
  id: string;
  trace_id: string;
  span_id: string | null;
  severity: AnnotationSeverity;
  body: string;
  created_at: number;
  updated_at: number;
}

const SEVERITY_VALUES: AnnotationSeverity[] = ['info', 'good', 'bug', 'finetune'];

function dbPath(): string {
  return join(getRootDir(), 'traces.sqlite3');
}

async function open() {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath(), { fileMustExist: false });
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS annotations (
      id          TEXT PRIMARY KEY,
      trace_id    TEXT NOT NULL,
      span_id     TEXT,
      severity    TEXT NOT NULL,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_trace ON annotations(trace_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_span ON annotations(span_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_updated ON annotations(updated_at DESC);
  `);
  return db;
}

function newId(): string {
  return `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function asSeverity(v: unknown): AnnotationSeverity {
  return SEVERITY_VALUES.includes(v as AnnotationSeverity) ? (v as AnnotationSeverity) : 'info';
}

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: String(row.id),
    trace_id: String(row.trace_id),
    span_id: row.span_id === null || row.span_id === undefined ? null : String(row.span_id),
    severity: asSeverity(row.severity),
    body: String(row.body ?? ''),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

export async function listAnnotationsForTrace(trace_id: string): Promise<Annotation[]> {
  const db = await open();
  try {
    const rows = db
      .prepare('SELECT * FROM annotations WHERE trace_id = ? ORDER BY created_at ASC')
      .all(trace_id) as Array<Record<string, unknown>>;
    return rows.map(rowToAnnotation);
  } finally {
    db.close();
  }
}

export async function countAnnotationsByTrace(): Promise<Map<string, number>> {
  const db = await open();
  try {
    const rows = db
      .prepare('SELECT trace_id, COUNT(*) AS n FROM annotations GROUP BY trace_id')
      .all() as Array<{ trace_id: string; n: number }>;
    return new Map(rows.map((r) => [r.trace_id, r.n]));
  } finally {
    db.close();
  }
}

export async function createAnnotation(input: {
  trace_id: string;
  span_id?: string | null;
  severity?: AnnotationSeverity;
  body: string;
}): Promise<Annotation> {
  const db = await open();
  try {
    const now = Date.now();
    const ann: Annotation = {
      id: newId(),
      trace_id: input.trace_id,
      span_id: input.span_id ?? null,
      severity: input.severity ?? 'info',
      body: input.body,
      created_at: now,
      updated_at: now,
    };
    db.prepare(
      `INSERT INTO annotations (id, trace_id, span_id, severity, body, created_at, updated_at)
       VALUES (@id, @trace_id, @span_id, @severity, @body, @created_at, @updated_at)`,
    ).run(ann);
    return ann;
  } finally {
    db.close();
  }
}

export async function updateAnnotation(
  id: string,
  patch: { severity?: AnnotationSeverity; body?: string },
): Promise<Annotation | null> {
  const db = await open();
  try {
    const now = Date.now();
    const existing = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) return null;
    const merged = {
      ...existing,
      severity: patch.severity ?? existing.severity,
      body: patch.body ?? existing.body,
      updated_at: now,
    };
    db.prepare(
      `UPDATE annotations SET severity = ?, body = ?, updated_at = ? WHERE id = ?`,
    ).run(merged.severity, merged.body, merged.updated_at, id);
    return rowToAnnotation(merged);
  } finally {
    db.close();
  }
}

export async function deleteAnnotation(id: string): Promise<boolean> {
  const db = await open();
  try {
    const res = db.prepare('DELETE FROM annotations WHERE id = ?').run(id);
    return res.changes > 0;
  } finally {
    db.close();
  }
}

export async function searchAnnotations(q: string, limit = 50): Promise<Annotation[]> {
  const db = await open();
  try {
    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT * FROM annotations
         WHERE body LIKE ? OR severity LIKE ?
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(like, like, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToAnnotation);
  } finally {
    db.close();
  }
}
