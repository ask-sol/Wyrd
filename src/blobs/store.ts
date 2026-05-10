import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BlobRef } from '../schema/blob.js';
import { sha256Hex } from './hash.js';

export interface BlobStore {
  put(content: Uint8Array, contentType: string): Promise<BlobRef>;
  putJson(value: unknown, contentType?: string): Promise<BlobRef>;
  putText(text: string, contentType?: string): Promise<BlobRef>;
  get(ref: BlobRef): Promise<Uint8Array>;
  getJson<T = unknown>(ref: BlobRef): Promise<T>;
  getText(ref: BlobRef): Promise<string>;
  has(hash: string): Promise<boolean>;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/**
 * Content-addressed filesystem blob store.
 *
 * Layout: <rootDir>/sha256/<hh>/<hh>/<full-hex>
 *
 * Two-level prefix keeps any single directory under ~64k entries even at
 * tens of millions of blobs. Writes are atomic via temp-file + rename;
 * concurrent writers of the same content converge on the same final path.
 */
export class FilesystemBlobStore implements BlobStore {
  constructor(private readonly rootDir: string) {}

  async put(content: Uint8Array, contentType: string): Promise<BlobRef> {
    const hash = sha256Hex(content);
    const path = this.pathFor(hash);

    if (!(await this.fileExists(path))) {
      await fs.mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
      await fs.writeFile(tmp, content, { flag: 'wx' });
      try {
        await fs.rename(tmp, path);
      } catch (err) {
        await fs.unlink(tmp).catch(() => undefined);
        if (!(await this.fileExists(path))) throw err;
      }
    }

    return {
      algo: 'sha256',
      hash,
      size: content.byteLength,
      content_type: contentType,
      encoding: 'raw',
    };
  }

  async putJson(value: unknown, contentType = 'application/json'): Promise<BlobRef> {
    return this.put(TEXT_ENCODER.encode(JSON.stringify(value)), contentType);
  }

  async putText(text: string, contentType = 'text/plain; charset=utf-8'): Promise<BlobRef> {
    return this.put(TEXT_ENCODER.encode(text), contentType);
  }

  async get(ref: BlobRef): Promise<Uint8Array> {
    const buf = await fs.readFile(this.pathFor(ref.hash));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async getJson<T = unknown>(ref: BlobRef): Promise<T> {
    return JSON.parse(TEXT_DECODER.decode(await this.get(ref))) as T;
  }

  async getText(ref: BlobRef): Promise<string> {
    return TEXT_DECODER.decode(await this.get(ref));
  }

  async has(hash: string): Promise<boolean> {
    return this.fileExists(this.pathFor(hash));
  }

  private pathFor(hash: string): string {
    return join(
      this.rootDir,
      'sha256',
      hash.slice(0, 2),
      hash.slice(2, 4),
      hash,
    );
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
