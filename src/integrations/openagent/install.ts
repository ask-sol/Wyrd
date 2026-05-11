import { join } from 'node:path';
import { FilesystemBlobStore } from '../../blobs/store.js';
import { Tracer } from '../../tracer/tracer.js';
import { SqliteSpanRecorder } from '../../storage/sqlite.js';
import { wrapProvider } from './wrapProvider.js';
import { wrapTool, wrapToolLookup } from './wrapTool.js';
import type { OAProvider, OATool } from './types.js';

export interface WyrdSession {
  readonly tracer: Tracer;
  readonly recorder: SqliteSpanRecorder;
  readonly blobs: FilesystemBlobStore;
  readonly wrapProvider: <P extends OAProvider>(p: P) => P;
  readonly wrapTool: <T extends OATool>(t: T, opts?: { safe_to_replay?: boolean }) => T;
  readonly wrapToolLookup: (
    lookup: (name: string) => OATool | undefined,
  ) => (name: string) => OATool | undefined;
  readonly run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  readonly step: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  readonly close: () => Promise<void>;
}

export interface CreateWyrdSessionOptions {
  /** Root directory for trace storage. Default `./.wyrd`. */
  dir?: string;
  /** Identifier for the host runtime, e.g. `openagent`. */
  agent_id: string;
  /** Version string for the host runtime. */
  agent_version?: string;
  /** Wyrd SDK version. */
  sdk_version?: string;
}

/**
 * Construct a fully wired Wyrd session for an OpenAgent process. Sets up
 * the DuckDB recorder, content-addressed blob store, and a `Tracer`, then
 * exposes wrappers for OpenAgent's `Provider` and `Tool` types.
 *
 *   const wyrd = await createWyrdSession({ agent_id: 'openagent', agent_version });
 *   const provider = wyrd.wrapProvider(originalProvider);
 *   const getTool = wyrd.wrapToolLookup(originalGetTool);
 *   await wyrd.run('user-prompt', async () => { ... agent loop ... });
 *   await wyrd.close();
 */
export async function createWyrdSession(
  opts: CreateWyrdSessionOptions,
): Promise<WyrdSession> {
  const dir =
    opts.dir ??
    process.env.WYRD_DIR ??
    join(process.cwd(), '.wyrd');
  const blobs = new FilesystemBlobStore(join(dir, 'blobs'));
  const recorder = new SqliteSpanRecorder(join(dir, 'traces.sqlite3'));
  const tracer = new Tracer({
    recorder,
    blobs,
    agent_id: opts.agent_id,
    ...(opts.agent_version !== undefined ? { agent_version: opts.agent_version } : {}),
    ...(opts.sdk_version !== undefined ? { sdk_version: opts.sdk_version } : {}),
  });

  return {
    tracer,
    recorder,
    blobs,
    wrapProvider: (p) => wrapProvider(p, { tracer }),
    wrapTool: (t, o) => wrapTool(t, { tracer, ...(o?.safe_to_replay !== undefined ? { safe_to_replay: o.safe_to_replay } : {}) }),
    wrapToolLookup: (lookup) => wrapToolLookup(lookup, { tracer }),
    run: (name, fn) => tracer.run(name, fn),
    step: (name, fn) => tracer.step(name, fn),
    close: async () => {
      await recorder.flush();
      await recorder.close();
    },
  };
}
