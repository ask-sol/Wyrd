/**
 * Canonical JSON serializer (RFC 8785 / JCS-compatible subset).
 *
 * Used to produce stable byte representations of structured values for
 * content addressing — particularly LLM request payloads, where the same
 * logical request must hash to the same value regardless of property order.
 *
 * Rules:
 *   - Object keys are emitted in sorted (lexicographic) order.
 *   - Array order is preserved.
 *   - `undefined` and function/symbol values cause an error if encountered.
 *   - Numbers must be finite.
 */
export function canonicalJsonStringify(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    return Number.isInteger(value) ? value.toString() : JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(serialize).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const v = obj[key];
      if (v === undefined) continue;
      parts.push(JSON.stringify(key) + ':' + serialize(v));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}
