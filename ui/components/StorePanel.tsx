'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Database,
  Disc3,
  ExternalLink,
  Folder,
  Plus,
  X,
} from 'lucide-react';
import { Spinner } from './Spinner';
import { StoreOnboarding } from './StoreOnboarding';

interface Props {
  open: boolean;
  onClose: () => void;
  activeDir: string;
  startInCreate?: boolean;
}

interface StoreEntry {
  dir: string;
  name: string;
  created_at: number;
  last_used_at: number;
}
interface Registry {
  version: 1;
  stores: StoreEntry[];
  active?: string;
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export function StorePanel({ open, onClose, activeDir, startInCreate = false }: Props) {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    if (open && startInCreate) setCreating(true);
    if (!open) setCreating(false);
  }, [open, startInCreate]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/stores/register', { cache: 'no-store' });
      setRegistry((await r.json()) as Registry);
    } catch {
      setRegistry({ version: 1, stores: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const activate = useCallback(
    async (dir: string) => {
      setActivating(dir);
      try {
        const r = await fetch('/api/stores/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dir }),
        });
        const j = (await r.json()) as { ok: boolean; error?: string };
        if (!j.ok) throw new Error(j.error ?? 'activate failed');
        await refresh();
        router.refresh();
      } catch {
        /* swallow — registry refresh will still happen */
      } finally {
        setActivating(null);
      }
    },
    [refresh, router],
  );

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open && !creating) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, creating, onClose]);

  return (
    <>
      <div
        onClick={() => !creating && onClose()}
        aria-hidden
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        role="dialog"
        aria-label="Wyrd stores"
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-full w-[480px] max-w-[100vw] bg-bg border-l border-border shadow-e3 flex flex-col transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {creating ? (
          <StoreOnboarding
            onDone={() => {
              setCreating(false);
              void refresh();
              // The wizard may have set a new active store — re-render so the
              // chip + activation card pick up the change without a hard reload.
              router.refresh();
            }}
            onRegistered={() => {
              void refresh();
              router.refresh();
            }}
          />
        ) : (
          <>
            {/* Header */}
            <div className="h-14 px-3 flex items-center gap-2 shrink-0 border-b border-divider">
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="inline-flex items-center justify-center h-10 w-10 rounded-full text-ink2 hover:text-ink hover:bg-hover transition-colors"
              >
                <X size={20} strokeWidth={1.75} />
              </button>
              <div className="flex-1">
                <div className="text-[18px] text-ink font-normal tracking-tight">
                  <span className="font-medium">Stores</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-brand text-white text-sm font-medium hover:bg-brandStrong transition-colors"
              >
                <Plus size={14} strokeWidth={2} />
                New store
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Active store summary */}
              <div className="px-5 pt-5 pb-3">
                <div className="text-[11px] uppercase tracking-wider text-faint font-medium mb-2">
                  Active store
                </div>
                <div className="card bg-elevated p-4">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-brandSoft text-brand shrink-0">
                      <Disc3 size={20} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink truncate">
                        {registry?.stores.find((s) => s.dir === activeDir)?.name ??
                          activeDir.split('/').filter(Boolean).slice(-1)[0] ??
                          'wyrd'}
                      </div>
                      <div className="text-xs text-ink3 font-mono truncate mt-0.5" title={activeDir}>
                        {activeDir}
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-success">
                        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
                        Connected · this UI is reading from here
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Known stores */}
              <div className="px-5 pt-2 pb-1 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-faint font-medium">
                  Known stores
                </div>
                {loading && <Spinner size={12} className="text-ink3" />}
              </div>
              {!loading && registry && registry.stores.length === 0 && (
                <div className="px-5 py-6 text-center text-sm text-ink3">
                  No stores recorded yet. Click <b className="text-ink2">New store</b> to start an
                  onboarding.
                </div>
              )}
              {registry && registry.stores.length > 0 && (
                <ul className="px-2">
                  {registry.stores.map((s) => {
                    const isActive = s.dir === activeDir;
                    const isBusy = activating === s.dir;
                    return (
                      <li key={s.dir}>
                        <div
                          className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                            isActive ? 'bg-brandSoft' : 'hover:bg-hover'
                          }`}
                        >
                          <Folder
                            size={16}
                            strokeWidth={1.75}
                            className={isActive ? 'text-brand' : 'text-ink3'}
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className={`text-sm truncate ${
                                isActive ? 'text-brand font-medium' : 'text-ink'
                              }`}
                            >
                              {s.name}
                              {isActive && (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-brand font-medium">
                                  active
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-ink3 font-mono truncate" title={s.dir}>
                              {s.dir}
                            </div>
                          </div>
                          <div className="text-[11px] text-ink3 shrink-0 hidden sm:block">
                            {relTime(s.last_used_at)}
                          </div>
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => activate(s.dir)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-pill border border-border text-[11px] font-medium text-ink2 hover:text-brand hover:border-brandBorder hover:bg-brandSoft transition-colors disabled:opacity-50"
                            >
                              {isBusy ? (
                                <>
                                  <Spinner size={11} /> Switching
                                </>
                              ) : (
                                <>Use</>
                              )}
                            </button>
                          )}
                          <ChevronRight size={14} strokeWidth={1.75} className="text-ink3 shrink-0" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Hint */}
              <div className="px-5 py-6 mt-2">
                <div className="rounded-md border border-divider bg-subtle px-3 py-2.5 text-xs text-ink3">
                  <div className="flex items-center gap-1.5 text-ink2 font-medium mb-1">
                    <Database size={12} strokeWidth={1.75} /> How stores work
                  </div>
                  A store is a folder containing <code className="font-mono">traces.sqlite3</code>{' '}
                  plus a content-addressed <code className="font-mono">blobs/</code> tree. Wyrd
                  reads one at a time — set{' '}
                  <code className="font-mono text-ink">WYRD_DIR</code> to switch.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-divider px-5 py-3 flex items-center justify-between text-xs">
              <a
                href="https://github.com/ask-sol/Wyrd"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-brand hover:underline"
              >
                <ExternalLink size={12} strokeWidth={1.75} />
                Wyrd on GitHub
              </a>
              <span className="text-faint font-mono">wyrd-ui v0.0.1</span>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
