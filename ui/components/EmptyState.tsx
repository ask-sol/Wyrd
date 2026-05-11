import { Inbox, Terminal } from 'lucide-react';
import { CopyButton } from './CopyButton';

interface Step {
  label: string;
  command?: string;
  note?: React.ReactNode;
  alternatives?: { label: string; command: string }[];
}

const STEPS: Step[] = [
  {
    label: 'Build and link wyrd',
    command: 'cd ~/Documents/GitHub/Wyrd && npm run build && npm link',
  },
  {
    label: 'Link wyrd into OpenAgent',
    command: 'cd ~/Documents/GitHub/openagent && npm link wyrd',
  },
  {
    label: 'Run OpenAgent from source with tracing on',
    command: 'WYRD_ENABLED=1 WYRD_DIR=$HOME/.wyrd bun run dev',
    alternatives: [
      {
        label: 'No bun installed',
        command:
          'npm install -g tsx && WYRD_ENABLED=1 WYRD_DIR=$HOME/.wyrd tsx src/entrypoints/cli.tsx',
      },
    ],
    note: 'Run inside the openagent repo. Each prompt you send becomes one trace.',
  },
  {
    label: 'Boot this console pointed at the same store',
    command: 'cd ~/Documents/GitHub/Wyrd/ui && WYRD_DIR=$HOME/.wyrd npm run dev',
  },
];

function CommandRow({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 bg-subtle border border-divider rounded-md px-3 h-10">
      <Terminal size={14} className="text-ink3 shrink-0" strokeWidth={1.75} />
      <code className="font-mono text-sm text-ink flex-1 truncate" title={command}>
        {command}
      </code>
      <CopyButton value={command} variant="ghost" />
    </div>
  );
}

export function EmptyState({ dir }: { dir: string }) {
  return (
    <div className="card max-w-3xl mx-auto mt-10 overflow-hidden shadow-e1">
      <div className="px-6 py-5 border-b border-divider bg-elevated flex items-center gap-4">
        <div className="w-10 h-10 rounded-md bg-brandSoft border border-brandBorder flex items-center justify-center text-brand">
          <Inbox size={20} strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-medium text-ink">No traces captured yet</h2>
          <p className="text-sm text-ink3 mt-0.5">
            Wyrd is local-first. Traces appear here after you run an instrumented agent.
          </p>
        </div>
        <span className="hidden md:inline-flex items-center text-xs font-mono text-ink3 bg-subtle rounded-md h-7 px-2.5">
          {dir}
        </span>
      </div>

      <ol className="px-6 py-6 space-y-5">
        {STEPS.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_1fr] gap-3 items-start">
            <span className="font-mono text-xs text-ink2 bg-subtle border border-divider rounded-pill h-7 w-7 inline-flex items-center justify-center mt-px">
              {i + 1}
            </span>
            <div className="space-y-2 min-w-0">
              <div className="text-sm font-medium text-ink">{s.label}</div>
              {s.command && <CommandRow command={s.command} />}
              {s.alternatives?.map((alt, j) => (
                <div key={j} className="pl-3 border-l-2 border-divider space-y-1.5 ml-0.5">
                  <div className="text-xs text-ink3 font-medium">{alt.label}</div>
                  <CommandRow command={alt.command} />
                </div>
              ))}
              {s.note && <div className="text-xs text-ink3">{s.note}</div>}
            </div>
          </li>
        ))}
      </ol>

      <div className="px-6 py-3 border-t border-divider bg-elevated text-xs text-ink3 flex flex-wrap items-center gap-2">
        <span>Tip:</span>
        <code className="font-mono bg-surface border border-divider rounded-sm px-1.5 py-0.5 text-ink2">
          WYRD_DIR=$HOME/.wyrd
        </code>
        <span>in every shell so agent, console, and the wyrd CLI share one store.</span>
      </div>
    </div>
  );
}
