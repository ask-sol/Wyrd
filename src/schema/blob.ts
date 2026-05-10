export interface BlobRef {
  readonly algo: 'sha256';
  readonly hash: string;
  readonly size: number;
  readonly content_type: string;
  readonly encoding: 'raw';
}

export type BlobRole =
  | 'prompt'
  | 'completion'
  | 'request'
  | 'response'
  | 'tool_args'
  | 'tool_result'
  | 'snapshot'
  | (string & {});

export type BlobRefMap = Readonly<Partial<Record<BlobRole, BlobRef>>>;

export function isBlobRef(value: unknown): value is BlobRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.algo === 'sha256' &&
    typeof v.hash === 'string' &&
    typeof v.size === 'number' &&
    typeof v.content_type === 'string' &&
    v.encoding === 'raw'
  );
}
