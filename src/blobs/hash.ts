import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from '../canonical.js';

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hashCanonicalJson(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}
