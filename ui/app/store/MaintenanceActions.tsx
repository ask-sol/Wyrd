'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eraser, Loader2, Trash2, Wrench } from 'lucide-react';

type Msg = { tone: 'success' | 'danger'; text: string };

export function MaintenanceActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'vacuum' | 'gc' | 'prune'>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function vacuum() {
    if (!confirm('Run VACUUM on traces.sqlite3? Rewrites the file to reclaim space.')) return;
    setBusy('vacuum');
    setMsg(null);
    try {
      const r = await fetch('/api/store/vacuum', { method: 'POST' });
      const j = (await r.json()) as { ok: boolean; saved_bytes?: number; error?: string };
      setMsg(
        j.ok
          ? { tone: 'success', text: `Reclaimed ${(j.saved_bytes ?? 0).toLocaleString()} bytes.` }
          : { tone: 'danger', text: j.error ?? 'vacuum failed' },
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function gc() {
    if (!confirm('Delete blobs not referenced by any span/event? Irreversible.')) return;
    setBusy('gc');
    setMsg(null);
    try {
      const r = await fetch('/api/store/gc', { method: 'POST' });
      const j = (await r.json()) as {
        ok: boolean;
        deleted_blobs?: number;
        reclaimed_bytes?: number;
        error?: string;
      };
      setMsg(
        j.ok
          ? {
              tone: 'success',
              text: `Deleted ${j.deleted_blobs ?? 0} orphan blob${j.deleted_blobs === 1 ? '' : 's'} · ${(j.reclaimed_bytes ?? 0).toLocaleString()} bytes.`,
            }
          : { tone: 'danger', text: j.error ?? 'gc failed' },
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function prune() {
    if (!confirm('Apply retention pruner now? Deletes traces older than the configured cutoff in Settings.')) return;
    setBusy('prune');
    setMsg(null);
    try {
      const r = await fetch('/api/store/prune', { method: 'POST' });
      const j = (await r.json()) as { ok: boolean; deleted_traces?: number; error?: string };
      setMsg(
        j.ok
          ? { tone: 'success', text: `Pruned ${j.deleted_traces ?? 0} trace${j.deleted_traces === 1 ? '' : 's'}.` }
          : { tone: 'danger', text: j.error ?? 'prune failed' },
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Btn onClick={vacuum} busy={busy === 'vacuum'} disabled={busy !== null} Icon={Wrench}>
        Compact
      </Btn>
      <Btn onClick={gc} busy={busy === 'gc'} disabled={busy !== null} Icon={Eraser}>
        GC orphan blobs
      </Btn>
      <Btn onClick={prune} busy={busy === 'prune'} disabled={busy !== null} Icon={Trash2}>
        Prune by retention
      </Btn>
      {msg && (
        <span
          className={`text-xs font-mono ${msg.tone === 'success' ? 'text-success' : 'text-danger'}`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  busy,
  disabled,
  Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  Icon: typeof Wrench;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors disabled:opacity-50"
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" strokeWidth={1.75} />
      ) : (
        <Icon size={14} strokeWidth={1.75} />
      )}
      {children}
    </button>
  );
}
