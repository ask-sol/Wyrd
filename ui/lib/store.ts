import { join } from 'node:path';
import { FilesystemBlobStore, SqliteQueryStore } from 'wyrd';

const DEFAULT_DIR = join(process.cwd(), '..', '.wyrd');

function rootDir(): string {
  return process.env.WYRD_DIR ?? DEFAULT_DIR;
}

let _store: SqliteQueryStore | null = null;
let _blobs: FilesystemBlobStore | null = null;

export function getStore(): SqliteQueryStore {
  if (!_store) _store = new SqliteQueryStore(join(rootDir(), 'traces.sqlite3'));
  return _store;
}

export function getBlobs(): FilesystemBlobStore {
  if (!_blobs) _blobs = new FilesystemBlobStore(join(rootDir(), 'blobs'));
  return _blobs;
}

export function getRootDir(): string {
  return rootDir();
}
