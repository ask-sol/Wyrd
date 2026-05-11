import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { getRootDir } from './store';
import { scanText } from './wyrdGuard';

const BUNDLE_VERSION = 1;
const BUNDLE_MAGIC = 'WYRDPACK';

interface RawSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  kind: string;
  name: string;
  status: string;
  started_at: number;
  ended_at: number | null;
  attributes: string;
  refs: string;
}

interface RawTrace {
  trace_id: string;
  agent_id: string;
  agent_version: string | null;
  root_span_id: string;
  status: string;
  started_at: number;
  ended_at: number | null;
  attributes: string;
}

interface RawEvent {
  trace_id: string;
  span_id: string;
  event_id: string;
  ts: number;
  name: string;
  attributes: string;
  ref: string | null;
}

interface RawLink {
  trace_id: string;
  from_span_id: string;
  to_span_id: string;
  relation: string;
  attributes: string;
}

interface BlobPayload {
  hash: string;
  size: number;
  content_type: string;
  /** Base64-encoded content. */
  data: string;
}

interface BundleFile {
  magic: typeof BUNDLE_MAGIC;
  version: number;
  exported_at: number;
  trace: RawTrace;
  spans: RawSpan[];
  events: RawEvent[];
  links: RawLink[];
  blobs: BlobPayload[];
  /** Annotations attached to this trace at export time. */
  annotations: Array<{
    id: string;
    trace_id: string;
    span_id: string | null;
    severity: string;
    body: string;
    created_at: number;
    updated_at: number;
  }>;
  /** Map of hashes whose blob content was scrubbed for secrets / PII. */
  scrubbed_blobs: string[];
}

interface BlobRefShape {
  hash: string;
  size?: number;
  content_type?: string;
}

function collectRefs(refsJson: string | null | undefined): BlobRefShape[] {
  if (!refsJson) return [];
  try {
    const obj = JSON.parse(refsJson) as Record<string, BlobRefShape | null>;
    return Object.values(obj).filter((v): v is BlobRefShape => !!v && typeof v.hash === 'string');
  } catch {
    return [];
  }
}

function dbPath(): string {
  return join(getRootDir(), 'traces.sqlite3');
}

function blobsDir(): string {
  return join(getRootDir(), 'blobs');
}

function blobPathFor(hash: string): string {
  const a = hash.slice(0, 2);
  const b = hash.slice(2, 4);
  return join(blobsDir(), 'sha256', a, b, hash);
}

async function readBlob(hash: string): Promise<{ size: number; data: Uint8Array } | null> {
  try {
    const buf = await fs.readFile(blobPathFor(hash));
    return { size: buf.byteLength, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  } catch {
    return null;
  }
}

async function writeBlob(hash: string, data: Uint8Array): Promise<void> {
  const path = blobPathFor(hash);
  await fs.mkdir(join(path, '..'), { recursive: true });
  try {
    await fs.access(path);
    return; // already present, content-addressed → identical content
  } catch {
    /* not present */
  }
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, data, { flag: 'wx' });
  try {
    await fs.rename(tmp, path);
  } catch {
    await fs.unlink(tmp).catch(() => undefined);
  }
}

function maybeScrub(data: Uint8Array, sanitize: boolean): { data: Uint8Array; scrubbed: boolean } {
  if (!sanitize) return { data, scrubbed: false };
  const text = new TextDecoder().decode(data);
  const verdict = scanText(text, 'output');
  if (verdict.decision === 'allow') return { data, scrubbed: false };
  // Replace each match with a redaction marker. Pattern-based scrubbing.
  let scrubbed = text;
  for (const m of verdict.matches) {
    // Naive: replace literal matched_text occurrences (may not catch all).
    const safe = m.matched_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    scrubbed = scrubbed.replace(
      new RegExp(safe, 'g'),
      `«REDACTED:${m.signature_id}»`,
    );
  }
  return { data: new TextEncoder().encode(scrubbed), scrubbed: true };
}

export interface ExportOpts {
  sanitize?: boolean;
}

/** Produce a gzipped JSON bundle representing a single trace. */
export async function exportTrace(trace_id: string, opts: ExportOpts = {}): Promise<Buffer> {
  const sanitize = opts.sanitize ?? false;
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath(), { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 2000');
  try {
    const trace = db
      .prepare('SELECT * FROM traces WHERE trace_id = ?')
      .get(trace_id) as RawTrace | undefined;
    if (!trace) throw new Error('trace not found');

    const spans = db
      .prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC')
      .all(trace_id) as RawSpan[];
    const events = db
      .prepare('SELECT * FROM events WHERE trace_id = ?')
      .all(trace_id) as RawEvent[];
    const links = db
      .prepare('SELECT * FROM span_links WHERE trace_id = ?')
      .all(trace_id) as RawLink[];

    // Annotations (table may not exist on first run).
    let annotations: BundleFile['annotations'] = [];
    try {
      annotations = db
        .prepare(
          'SELECT id, trace_id, span_id, severity, body, created_at, updated_at FROM annotations WHERE trace_id = ?',
        )
        .all(trace_id) as BundleFile['annotations'];
    } catch {
      /* no annotations table */
    }

    // Collect referenced blob hashes.
    const hashes = new Set<string>();
    for (const s of spans) {
      for (const r of collectRefs(s.refs)) hashes.add(r.hash);
    }
    for (const e of events) {
      for (const r of collectRefs(e.ref)) hashes.add(r.hash);
    }

    const blobs: BlobPayload[] = [];
    const scrubbed_blobs: string[] = [];
    for (const hash of hashes) {
      const blob = await readBlob(hash);
      if (!blob) continue;
      const { data, scrubbed } = maybeScrub(blob.data, sanitize);
      if (scrubbed) scrubbed_blobs.push(hash);
      blobs.push({
        hash,
        size: data.byteLength,
        content_type: 'application/octet-stream',
        data: Buffer.from(data).toString('base64'),
      });
    }

    const bundle: BundleFile = {
      magic: BUNDLE_MAGIC,
      version: BUNDLE_VERSION,
      exported_at: Date.now(),
      trace,
      spans,
      events,
      links,
      blobs,
      annotations,
      scrubbed_blobs,
    };
    return gzipSync(Buffer.from(JSON.stringify(bundle)));
  } finally {
    db.close();
  }
}

export interface ImportResult {
  ok: boolean;
  trace_id?: string;
  spans?: number;
  blobs?: number;
  annotations?: number;
  warning?: string;
  error?: string;
}

/** Read a .wyrdpack into the local store. Overwrites by trace_id. */
export async function importBundle(buf: Buffer): Promise<ImportResult> {
  let parsed: BundleFile;
  try {
    const unzipped = gunzipSync(buf);
    parsed = JSON.parse(unzipped.toString('utf8')) as BundleFile;
  } catch (err) {
    return { ok: false, error: `not a valid .wyrdpack: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (parsed.magic !== BUNDLE_MAGIC) {
    return { ok: false, error: 'wrong file magic (not a wyrdpack)' };
  }
  if (parsed.version !== BUNDLE_VERSION) {
    return { ok: false, error: `unsupported bundle version ${parsed.version}` };
  }

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath(), { fileMustExist: false });
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');

  // Ensure schema exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS traces (
      trace_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, agent_version TEXT,
      root_span_id TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL,
      ended_at INTEGER, attributes TEXT
    );
    CREATE TABLE IF NOT EXISTS spans (
      trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT,
      kind TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER, attributes TEXT, refs TEXT,
      PRIMARY KEY (trace_id, span_id)
    );
    CREATE TABLE IF NOT EXISTS events (
      trace_id TEXT NOT NULL, span_id TEXT NOT NULL, event_id TEXT NOT NULL,
      ts INTEGER NOT NULL, name TEXT NOT NULL, attributes TEXT, ref TEXT,
      PRIMARY KEY (trace_id, span_id, event_id)
    );
    CREATE TABLE IF NOT EXISTS span_links (
      trace_id TEXT NOT NULL, from_span_id TEXT NOT NULL, to_span_id TEXT NOT NULL,
      relation TEXT NOT NULL, attributes TEXT,
      PRIMARY KEY (trace_id, from_span_id, to_span_id, relation)
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, span_id TEXT,
      severity TEXT NOT NULL, body TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);

  try {
    let blobCount = 0;
    for (const b of parsed.blobs) {
      const bytes = Buffer.from(b.data, 'base64');
      await writeBlob(b.hash, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      blobCount++;
    }

    const txn = db.transaction(() => {
      db.prepare(
        `INSERT INTO traces (trace_id, agent_id, agent_version, root_span_id, status, started_at, ended_at, attributes)
         VALUES (@trace_id, @agent_id, @agent_version, @root_span_id, @status, @started_at, @ended_at, @attributes)
         ON CONFLICT(trace_id) DO UPDATE SET
           status=excluded.status, ended_at=excluded.ended_at, attributes=excluded.attributes`,
      ).run(parsed.trace);

      const insSpan = db.prepare(
        `INSERT INTO spans (trace_id, span_id, parent_span_id, kind, name, status, started_at, ended_at, attributes, refs)
         VALUES (@trace_id, @span_id, @parent_span_id, @kind, @name, @status, @started_at, @ended_at, @attributes, @refs)
         ON CONFLICT(trace_id, span_id) DO UPDATE SET
           status=excluded.status, ended_at=excluded.ended_at, attributes=excluded.attributes, refs=excluded.refs`,
      );
      for (const s of parsed.spans) insSpan.run(s);

      const insEvent = db.prepare(
        `INSERT INTO events (trace_id, span_id, event_id, ts, name, attributes, ref)
         VALUES (@trace_id, @span_id, @event_id, @ts, @name, @attributes, @ref)
         ON CONFLICT(trace_id, span_id, event_id) DO NOTHING`,
      );
      for (const e of parsed.events) insEvent.run(e);

      const insLink = db.prepare(
        `INSERT INTO span_links (trace_id, from_span_id, to_span_id, relation, attributes)
         VALUES (@trace_id, @from_span_id, @to_span_id, @relation, @attributes)
         ON CONFLICT(trace_id, from_span_id, to_span_id, relation) DO NOTHING`,
      );
      for (const l of parsed.links) insLink.run(l);

      const insAnn = db.prepare(
        `INSERT INTO annotations (id, trace_id, span_id, severity, body, created_at, updated_at)
         VALUES (@id, @trace_id, @span_id, @severity, @body, @created_at, @updated_at)
         ON CONFLICT(id) DO NOTHING`,
      );
      for (const a of parsed.annotations) insAnn.run(a);
    });
    txn();

    return {
      ok: true,
      trace_id: parsed.trace.trace_id,
      spans: parsed.spans.length,
      blobs: blobCount,
      annotations: parsed.annotations.length,
      ...(parsed.scrubbed_blobs.length > 0
        ? { warning: `${parsed.scrubbed_blobs.length} blobs had content redacted before export` }
        : {}),
    };
  } finally {
    db.close();
  }
}
