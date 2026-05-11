'use client';
import { CopyButton } from './CopyButton';
import type { VirtualNode } from '@/lib/expandTrace';

function payloadText(p: unknown): string {
  if (p === null || p === undefined) return '';
  if (typeof p === 'string') return p;
  try {
    return JSON.stringify(p, null, 2);
  } catch {
    return String(p);
  }
}

export function VirtualNodeInspector({ node }: { node: VirtualNode }) {
  const text = payloadText(node.payload);
  return (
    <div className="card sticky top-[110px] max-h-[calc(100vh-130px)] overflow-hidden flex flex-col shadow-e1">
      <div className="px-4 py-3 border-b border-border bg-elevated">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xs font-mono uppercase tracking-wider text-ink3 bg-subtle border border-divider rounded-sm px-1.5 py-0.5">
            {node.kind.replace('v.content_block.', 'block.').replace('v.', '')}
          </span>
          <span className="text-2xs font-mono uppercase tracking-wider text-faint">
            virtual
          </span>
          <div className="ml-auto">
            <CopyButton value={text} label="Payload" variant="outline" />
          </div>
        </div>
        <h3 className="text-base font-medium text-ink leading-snug break-words">{node.name}</h3>
        {node.size !== undefined && (
          <div className="text-2xs font-mono text-ink3 mt-1">
            {node.size.toLocaleString()} chars
          </div>
        )}
      </div>
      <div className="p-4 overflow-y-auto flex-1">
        {node.preview && node.preview !== text && (
          <div className="text-xs text-ink3 mb-3 italic">{node.preview}</div>
        )}
        <pre className="bg-subtle border border-divider rounded-md p-3 text-sm font-mono text-ink leading-relaxed whitespace-pre-wrap break-words">
          {text || '(empty)'}
        </pre>
      </div>
    </div>
  );
}
