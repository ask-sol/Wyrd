'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface Props {
  value: string;
  label?: string;
  variant?: 'ghost' | 'outline' | 'tonal';
  className?: string;
}

export function CopyButton({ value, label, variant = 'outline', className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const variantClass =
    variant === 'ghost'
      ? 'border border-transparent hover:bg-subtle text-ink3 hover:text-ink'
      : variant === 'tonal'
        ? 'bg-brandSoft text-brandStrong hover:bg-brandBorder/40 border border-transparent'
        : 'border border-border hover:border-borderHi bg-surface text-ink2 hover:text-ink';

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label ? `Copy ${label}` : 'Copy'}
      title={label ? `Copy ${label}` : 'Copy'}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-sm font-medium transition-colors ${variantClass} ${className}`}
    >
      {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
      {label && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}
