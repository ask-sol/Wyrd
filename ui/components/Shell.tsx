import Link from 'next/link';
import {
  Activity,
  Bot,
  Cog,
  Database,
  GitCompare,
  History,
  Layers,
  LineChart,
  type LucideIcon,
} from 'lucide-react';
import { TopbarSearch } from './TopbarSearch';

interface Crumb {
  label: string;
  href?: string;
}

interface ShellProps {
  crumbs: Crumb[];
  storeDir: string;
  children: React.ReactNode;
  pageActions?: React.ReactNode;
  /** Path used to highlight the active sidebar item. */
  activePath?: '/' | '/replays' | '/live' | string;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
  soon?: boolean;
}

const NAV_GROUPS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: 'Observability',
    items: [
      { label: 'Traces', href: '/', icon: Layers, match: (p) => p === '/' || p.startsWith('/trace/') },
      { label: 'Replays', href: '/replays', icon: History, match: (p) => p === '/replays' },
      { label: 'Live activity', href: '/live', icon: Activity, match: (p) => p === '/live' },
      { label: 'Insights', href: '/insights', icon: LineChart, match: (p) => p === '/insights' },
      { label: 'Diff', href: '/diff', icon: GitCompare, match: (p) => p === '/diff' },
    ],
  },
  {
    heading: 'Resources',
    items: [
      { label: 'Agents', href: '/agents', icon: Bot, match: (p) => p === '/agents' },
      { label: 'Store', href: '/store', icon: Database, match: (p) => p === '/store' },
    ],
  },
  {
    heading: 'Workspace',
    items: [{ label: 'Settings', href: '/settings', icon: Cog, match: (p) => p === '/settings' }],
  },
];

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-faint">/</span>}
            {c.href && !isLast ? (
              <Link href={c.href} className="text-ink3 hover:text-ink transition-colors">
                {c.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-ink font-medium' : 'text-ink3'}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function Shell({ crumbs, storeDir, children, pageActions, activePath = '/' }: ShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Top app bar */}
      <header className="h-12 bg-surface border-b border-border flex items-center px-4 sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2 select-none" aria-label="Wyrd Console">
          <span className="font-medium text-ink text-[15px]">Wyrd</span>
          <span className="text-ink3 text-[15px]">Console</span>
        </Link>
        <div className="flex-1 max-w-[720px] mx-6">
          <TopbarSearch />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-subtle text-xs font-mono text-ink2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" aria-hidden />
            <span className="truncate max-w-[280px]" title={storeDir}>
              {storeDir}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col sticky top-12 self-start h-[calc(100vh-3rem)]">
          <nav className="flex-1 overflow-y-auto py-4">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.heading} className={gi > 0 ? 'mt-6' : ''}>
                <div className="px-5 mb-1.5 text-[11px] font-medium tracking-wider text-faint uppercase">
                  {group.heading}
                </div>
                <ul>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = !!item.match && item.match(activePath);
                    const cls = `flex items-center gap-3 px-5 h-9 text-sm transition-colors ${
                      active
                        ? 'bg-brandSoft text-brand font-medium border-r-[3px] border-brand'
                        : item.soon
                          ? 'text-faint cursor-not-allowed select-none'
                          : 'text-ink2 hover:bg-hover hover:text-ink'
                    }`;
                    const inner = (
                      <>
                        <Icon size={18} strokeWidth={1.75} />
                        <span className="flex-1">{item.label}</span>
                        {item.soon && (
                          <span className="text-[10px] uppercase tracking-wide text-faint">
                            soon
                          </span>
                        )}
                      </>
                    );
                    return (
                      <li key={item.label}>
                        {item.soon ? (
                          <span className={cls} aria-disabled>
                            {inner}
                          </span>
                        ) : (
                          <Link
                            href={item.href}
                            className={cls}
                            aria-current={active ? 'page' : undefined}
                          >
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-divider p-4 text-xs text-ink3 leading-snug">
            <div className="font-mono">wyrd-ui v0.0.1</div>
            <div className="mt-0.5">Local · single user</div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="h-10 bg-surface border-b border-border flex items-center px-6 sticky top-12 z-30">
            <Breadcrumbs crumbs={crumbs} />
            {pageActions && <div className="ml-auto flex items-center gap-2">{pageActions}</div>}
          </div>
          <main className="flex-1 bg-bg">{children}</main>
        </div>
      </div>
    </div>
  );
}
