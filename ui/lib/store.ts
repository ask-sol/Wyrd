import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FilesystemBlobStore, SqliteQueryStore } from 'wyrd';

const DEFAULT_DIR = join(process.cwd(), '..', '.wyrd');
const REGISTRY_PATH = join(homedir(), '.wyrd-stores', '.registry.json');

interface Registry {
  version: 1;
  stores: Array<{ dir: string; name: string }>;
  active?: string;
}

/**
 * Resolve the active store directory. Precedence:
 *   1. registry `active` field (set via /api/stores/activate)
 *   2. WYRD_DIR env var
 *   3. fallback to ../.wyrd
 *
 * The registry is read fresh on every call so switching the active store
 * from the UI takes effect without restarting the server.
 */
function rootDir(): string {
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    const r = JSON.parse(raw) as Registry;
    if (r.active && typeof r.active === 'string') return r.active;
  } catch {
    /* registry missing or unreadable — fall through */
  }
  return process.env.WYRD_DIR ?? DEFAULT_DIR;
}

// Cache by path so swapping the active store doesn't lock us into the first
// SQLite handle we ever opened.
const _stores = new Map<string, SqliteQueryStore>();
const _blobs = new Map<string, FilesystemBlobStore>();

export function getStore(): SqliteQueryStore {
  const dir = rootDir();
  let s = _stores.get(dir);
  if (!s) {
    s = new SqliteQueryStore(join(dir, 'traces.sqlite3'));
    _stores.set(dir, s);
  }
  return s;
}

export function getBlobs(): FilesystemBlobStore {
  const dir = rootDir();
  let b = _blobs.get(dir);
  if (!b) {
    b = new FilesystemBlobStore(join(dir, 'blobs'));
    _blobs.set(dir, b);
  }
  return b;
}

export function getRootDir(): string {
  return rootDir();
}
