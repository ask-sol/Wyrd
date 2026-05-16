'use client';
import { ArrowRight, Inbox } from 'lucide-react';

export function EmptyState({ dir: _dir }: { dir: string }) {
  function openOnboarding() {
    window.dispatchEvent(new CustomEvent('wyrd:open-store'));
  }

  return (
    <div className="card max-w-xl mx-auto mt-12 overflow-hidden bg-elevated">
      <div className="px-8 py-10 flex flex-col items-center text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-md bg-brandSoft border border-brandBorder text-brand mb-5">
          <Inbox size={22} strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-medium text-ink">No traces captured</h2>
        <p className="mt-2 text-sm text-ink3 max-w-sm">
          Your woven web of agent runs starts here. Link a store and every prompt, tool call, and
          token lands on this page in real time.
        </p>
        <button
          type="button"
          onClick={openOnboarding}
          className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-pill bg-brand text-white text-sm font-medium hover:bg-brandStrong transition-colors"
        >
          Learn how to link a store
          <ArrowRight size={14} strokeWidth={2} />
        </button>
        <p className="mt-4 text-[11px] text-ink3">
          One command creates the store, exports the env vars, and launches your agent.
        </p>
      </div>
    </div>
  );
}
