import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { AttributeValue, Attributes } from '../schema/attributes.js';
import type { BlobRefMap } from '../schema/blob.js';
import type { Event } from '../schema/event.js';
import {
  asEventId,
  asSpanId,
  asTraceId,
  type SpanId,
} from '../schema/ids.js';
import type {
  Span,
  SpanKind,
  SpanLink,
  SpanLinkRelation,
  SpanStatus,
} from '../schema/span.js';
import type { Trace } from '../schema/trace.js';
import type { SpanRecorder } from '../recorder/recorder.js';
import type { TraceWithSpans } from './types.js';

export type { TraceWithSpans } from './types.js';

/* ──────────────────────────────────────────────────────────────────────
 * Runtime detection + uniform adapter for `bun:sqlite` and `better-sqlite3`.
 * `bun:sqlite` is the only SQLite that works inside Bun (OpenAgent runs
 * via bun). `better-sqlite3` is required for Node (the Next.js console).
 * Both use the same database file, both honor WAL mode, both speak SQL.
 * ────────────────────────────────────────────────────────────────────── */

type Param = string | number | bigint | null | Uint8Array;

interface Stmt {
  run(...params: Param[]): void;
  all(...params: Param[]): Array<Record<string, unknown>>;
  get(...params: Param[]): Record<string, unknown> | undefined;
}

interface DbAdapter {
  prepare(sql: string): Stmt;
  exec(sql: string): void;
  close(): void;
}

function isBun(): boolean {
  return typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
}

async function openDb(path: string, readOnly: boolean): Promise<DbAdapter> {
  if (isBun()) {
    // Use Bun's built-in SQLite when available.
    const mod = (await import('bun:sqlite')) as typeof import('bun:sqlite');
    const Database = mod.Database;
    const db = readOnly
      ? new Database(path, { readonly: true })
      : new Database(path, { create: true });
    if (!readOnly) {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
      db.exec('PRAGMA foreign_keys = ON');
      db.exec('PRAGMA busy_timeout = 5000');
    } else {
      db.exec('PRAGMA busy_timeout = 2000');
    }
    return {
      prepare(sql) {
        const s = db.prepare(sql);
        return {
          run: (...args) => {
            s.run(...(args as Param[]));
          },
          all: (...args) => s.all(...(args as Param[])) as Array<Record<string, unknown>>,
          get: (...args) =>
            (s.get(...(args as Param[])) as Record<string, unknown> | undefined) ?? undefined,
        };
      },
      exec(sql) {
        db.exec(sql);
      },
      close() {
        db.close();
      },
    };
  }

  // Node.js path: better-sqlite3.
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(path, { readonly: readOnly, fileMustExist: readOnly });
  if (!readOnly) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
  } else {
    db.pragma('busy_timeout = 2000');
  }
  return {
    prepare(sql) {
      const s = db.prepare(sql);
      return {
        run: (...args) => {
          s.run(...args);
        },
        all: (...args) => s.all(...args) as Array<Record<string, unknown>>,
        get: (...args) => s.get(...args) as Record<string, unknown> | undefined,
      };
    },
    exec(sql) {
      db.exec(sql);
    },
    close() {
      db.close();
    },
  };
}

const DDL = `
CREATE TABLE IF NOT EXISTS traces (
  trace_id       TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL,
  agent_version  TEXT,
  root_span_id   TEXT NOT NULL,
  status         TEXT NOT NULL,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  attributes     TEXT
);

CREATE INDEX IF NOT EXISTS idx_traces_started ON traces (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_traces_status ON traces (status);

CREATE TABLE IF NOT EXISTS spans (
  trace_id        TEXT NOT NULL,
  span_id         TEXT NOT NULL,
  parent_span_id  TEXT,
  kind            TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  attributes      TEXT,
  refs            TEXT,
  PRIMARY KEY (trace_id, span_id)
);

CREATE INDEX IF NOT EXISTS idx_spans_trace_started ON spans (trace_id, started_at);

CREATE TABLE IF NOT EXISTS events (
  trace_id    TEXT NOT NULL,
  span_id     TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  name        TEXT NOT NULL,
  attributes  TEXT,
  ref         TEXT,
  PRIMARY KEY (trace_id, span_id, event_id)
);

CREATE TABLE IF NOT EXISTS span_links (
  trace_id      TEXT NOT NULL,
  from_span_id  TEXT NOT NULL,
  to_span_id    TEXT NOT NULL,
  relation      TEXT NOT NULL,
  attributes    TEXT,
  PRIMARY KEY (trace_id, from_span_id, to_span_id, relation)
);
`;

async function ensureParentDir(path: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    if (value === '') return {};
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function rowToTrace(row: Record<string, unknown>): Trace {
  return {
    trace_id: asTraceId(String(row.trace_id)),
    agent_id: String(row.agent_id),
    agent_version:
      row.agent_version === null || row.agent_version === undefined
        ? null
        : String(row.agent_version),
    root_span_id: asSpanId(String(row.root_span_id)),
    status: String(row.status) as SpanStatus,
    started_at: Number(row.started_at),
    ended_at: row.ended_at === null || row.ended_at === undefined ? null : Number(row.ended_at),
    attributes: parseJsonObject(row.attributes) as Attributes,
  };
}

function rowToSpan(row: Record<string, unknown>): Span {
  return {
    trace_id: asTraceId(String(row.trace_id)),
    span_id: asSpanId(String(row.span_id)),
    parent_span_id: row.parent_span_id ? asSpanId(String(row.parent_span_id)) : null,
    kind: String(row.kind) as SpanKind,
    name: String(row.name),
    status: String(row.status) as SpanStatus,
    started_at: Number(row.started_at),
    ended_at: row.ended_at === null || row.ended_at === undefined ? null : Number(row.ended_at),
    attributes: parseJsonObject(row.attributes) as Record<string, AttributeValue>,
    refs: parseJsonObject(row.refs) as BlobRefMap,
  };
}

function rowToEvent(row: Record<string, unknown>): Event {
  return {
    trace_id: asTraceId(String(row.trace_id)),
    span_id: asSpanId(String(row.span_id)),
    event_id: asEventId(String(row.event_id)),
    ts: Number(row.ts),
    name: String(row.name),
    attributes: parseJsonObject(row.attributes) as Record<string, AttributeValue>,
    ref:
      row.ref && typeof row.ref === 'string'
        ? (JSON.parse(row.ref) as Event['ref'])
        : null,
  };
}

function rowToLink(row: Record<string, unknown>): SpanLink {
  return {
    trace_id: asTraceId(String(row.trace_id)),
    from_span_id: asSpanId(String(row.from_span_id)) as SpanId,
    to_span_id: asSpanId(String(row.to_span_id)) as SpanId,
    relation: String(row.relation) as SpanLinkRelation,
    attributes: parseJsonObject(row.attributes) as Record<string, AttributeValue>,
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * Writer (Bun- and Node-compatible). WAL mode allows concurrent readers.
 * ────────────────────────────────────────────────────────────────────── */

export class SqliteSpanRecorder implements SpanRecorder {
  private db: DbAdapter | null = null;
  private insTrace: Stmt | null = null;
  private insSpan: Stmt | null = null;
  private insEvent: Stmt | null = null;
  private insLink: Stmt | null = null;

  constructor(private readonly path: string) {}

  private async open(): Promise<DbAdapter> {
    if (this.db) return this.db;
    await ensureParentDir(this.path);
    this.db = await openDb(this.path, false);
    this.db.exec(DDL);
    this.insTrace = this.db.prepare(
      `INSERT INTO traces (trace_id, agent_id, agent_version, root_span_id, status, started_at, ended_at, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(trace_id) DO UPDATE SET
         status = excluded.status,
         ended_at = excluded.ended_at,
         attributes = excluded.attributes`,
    );
    this.insSpan = this.db.prepare(
      `INSERT INTO spans (trace_id, span_id, parent_span_id, kind, name, status, started_at, ended_at, attributes, refs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(trace_id, span_id) DO UPDATE SET
         status = excluded.status,
         ended_at = excluded.ended_at,
         attributes = excluded.attributes,
         refs = excluded.refs`,
    );
    this.insEvent = this.db.prepare(
      `INSERT INTO events (trace_id, span_id, event_id, ts, name, attributes, ref)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(trace_id, span_id, event_id) DO NOTHING`,
    );
    this.insLink = this.db.prepare(
      `INSERT INTO span_links (trace_id, from_span_id, to_span_id, relation, attributes)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(trace_id, from_span_id, to_span_id, relation) DO NOTHING`,
    );
    return this.db;
  }

  async recordTrace(trace: Trace): Promise<void> {
    await this.open();
    this.insTrace!.run(
      trace.trace_id,
      trace.agent_id,
      trace.agent_version,
      trace.root_span_id,
      trace.status,
      trace.started_at,
      trace.ended_at,
      JSON.stringify(trace.attributes ?? {}),
    );
  }

  async recordSpan(span: Span): Promise<void> {
    await this.open();
    this.insSpan!.run(
      span.trace_id,
      span.span_id,
      span.parent_span_id,
      span.kind,
      span.name,
      span.status,
      span.started_at,
      span.ended_at,
      JSON.stringify(span.attributes ?? {}),
      JSON.stringify(span.refs ?? {}),
    );
  }

  async recordEvent(event: Event): Promise<void> {
    await this.open();
    this.insEvent!.run(
      event.trace_id,
      event.span_id,
      event.event_id,
      event.ts,
      event.name,
      JSON.stringify(event.attributes ?? {}),
      event.ref ? JSON.stringify(event.ref) : null,
    );
  }

  async recordLink(link: SpanLink): Promise<void> {
    await this.open();
    this.insLink!.run(
      link.trace_id,
      link.from_span_id,
      link.to_span_id,
      link.relation,
      JSON.stringify(link.attributes ?? {}),
    );
  }

  async flush(): Promise<void> {}

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Reader (per-call open in RO mode; sees WAL commits on every query)
 * ────────────────────────────────────────────────────────────────────── */

export class SqliteQueryStore {
  constructor(private readonly path: string) {}

  private async withConn<T>(fn: (db: DbAdapter) => T): Promise<T | null> {
    if (!(await fileExists(this.path))) return null;
    const db = await openDb(this.path, true);
    try {
      return fn(db);
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }

  async listTraces(opts: { limit?: number; offset?: number; status?: SpanStatus } = {}): Promise<Trace[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const out = await this.withConn((db) => {
      const stmt = opts.status
        ? db.prepare(
            `SELECT trace_id, agent_id, agent_version, root_span_id, status, started_at, ended_at, attributes
             FROM traces WHERE status = ?
             ORDER BY started_at DESC LIMIT ? OFFSET ?`,
          )
        : db.prepare(
            `SELECT trace_id, agent_id, agent_version, root_span_id, status, started_at, ended_at, attributes
             FROM traces
             ORDER BY started_at DESC LIMIT ? OFFSET ?`,
          );
      const rows = opts.status
        ? (stmt.all(opts.status, limit, offset) as Array<Record<string, unknown>>)
        : (stmt.all(limit, offset) as Array<Record<string, unknown>>);
      return rows.map(rowToTrace);
    });
    return out ?? [];
  }

  async getTrace(trace_id: string): Promise<TraceWithSpans | null> {
    return this.withConn((db) => {
      const traceRow = db
        .prepare(
          `SELECT trace_id, agent_id, agent_version, root_span_id, status, started_at, ended_at, attributes
           FROM traces WHERE trace_id = ?`,
        )
        .get(trace_id);
      if (!traceRow) return null;
      const trace = rowToTrace(traceRow);

      const spans = db
        .prepare(
          `SELECT trace_id, span_id, parent_span_id, kind, name, status, started_at, ended_at, attributes, refs
           FROM spans WHERE trace_id = ?
           ORDER BY started_at ASC`,
        )
        .all(trace_id)
        .map(rowToSpan);

      const events = db
        .prepare(
          `SELECT trace_id, span_id, event_id, ts, name, attributes, ref
           FROM events WHERE trace_id = ? ORDER BY ts ASC`,
        )
        .all(trace_id)
        .map(rowToEvent);

      const links = db
        .prepare(
          `SELECT trace_id, from_span_id, to_span_id, relation, attributes
           FROM span_links WHERE trace_id = ?`,
        )
        .all(trace_id)
        .map(rowToLink);

      return { trace, spans, events, links };
    });
  }

  async close(): Promise<void> {}
}
