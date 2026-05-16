'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bot,
  ChevronRight,
  Clock,
  Cog,
  Database,
  GitCompare,
  History,
  Layers,
  LayoutGrid,
  LineChart,
  type LucideIcon,
  PanelsTopLeft,
  Settings2,
  Star,
  X,
} from 'lucide-react';
import { WyrdGlyph } from './WyrdGlyph';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  activePath: string;
}

interface HubItem {
  label: string;
  href: string;
  icon: LucideIcon;
  expandable?: boolean;
}

interface ProductItem {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
  expandable?: boolean;
}

const HUB: HubItem[] = [
  { label: 'Wyrd Hub', href: '/', icon: Settings2, expandable: true },
  { label: 'Console overview', href: '/insights', icon: PanelsTopLeft, expandable: true },
  { label: 'Solutions', href: '/replays', icon: LayoutGrid, expandable: true },
  { label: 'Recently visited', href: '/live', icon: Clock, expandable: true },
];

const PRODUCTS: ProductItem[] = [
  { label: 'Traces', href: '/', icon: Layers, match: (p) => p === '/' || p.startsWith('/trace/') },
  { label: 'Replays', href: '/replays', icon: History, match: (p) => p === '/replays' },
  { label: 'Live activity', href: '/live', icon: Activity, match: (p) => p === '/live' },
  { label: 'Insights', href: '/insights', icon: LineChart, match: (p) => p === '/insights' },
  { label: 'Diff', href: '/diff', icon: GitCompare, match: (p) => p === '/diff' },
  { label: 'Agents', href: '/agents', icon: Bot, match: (p) => p === '/agents' },
  { label: 'Store', href: '/store', icon: Database, match: (p) => p === '/store' },
  { label: 'Settings', href: '/settings', icon: Cog, match: (p) => p === '/settings' },
];

export function NavDrawer({ open, onClose, activePath }: DrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = '';
      };
    }
  }, [open]);

  // Active item in the Hub block (first item highlighted by default when on Home).
  const hubActive = HUB[0]!.href;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Wyrd navigation"
        aria-modal="true"
        className={`fixed top-0 left-0 z-50 h-full w-[268px] bg-bg border-r border-border flex flex-col shadow-e3 transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header row */}
        <div className="h-14 px-2 flex items-center gap-2 shrink-0 border-b border-divider">
          <button
            type="button"
            onClick={onClose}
            title="Close menu"
            aria-label="Close menu"
            className="inline-flex items-center justify-center h-10 w-10 rounded-full text-ink2 hover:text-ink hover:bg-hover transition-colors"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
          <Link href="/" onClick={onClose} className="inline-flex items-center gap-2 select-none">
            <WyrdGlyph size={22} />
            <span className="text-[18px] text-ink font-normal tracking-tight">
              <span className="font-medium">Wyrd</span>
            </span>
          </Link>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden py-1.5">
          {/* Hub block — highlighted "active" GCP style */}
          <ul>
            {HUB.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === 0 && (activePath === '/' || activePath === hubActive);
              return (
                <li key={item.label} className="relative">
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand"
                    />
                  )}
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center h-9 pl-4 pr-3 gap-3 text-[13px] transition-colors ${
                      isActive
                        ? 'bg-brandSoft text-brand'
                        : 'text-ink hover:bg-hover'
                    }`}
                  >
                    <Icon size={17} strokeWidth={1.75} className={isActive ? 'text-brand' : 'text-ink2'} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.expandable && (
                      <ChevronRight size={15} strokeWidth={1.75} className={isActive ? 'text-brand' : 'text-ink3'} />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-divider my-1.5" />

          {/* Products section */}
          <div className="px-4 pt-1.5 pb-1">
            <div className="text-[11px] uppercase tracking-wider text-faint font-medium">
              Products
            </div>
          </div>
          <ul>
            {PRODUCTS.map((p) => {
              const Icon = p.icon;
              const active = p.match(activePath);
              return (
                <li key={p.label} className="relative">
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand"
                    />
                  )}
                  <div className="flex items-center h-9 pl-4 pr-2 gap-3 group hover:bg-hover transition-colors">
                    <Link
                      href={p.href}
                      onClick={onClose}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <Icon
                        size={17}
                        strokeWidth={1.75}
                        className={active ? 'text-brand' : 'text-ink2'}
                      />
                      <span
                        className={`flex-1 text-[13px] truncate ${
                          active ? 'text-brand font-medium' : 'text-ink'
                        }`}
                      >
                        {p.label}
                      </span>
                    </Link>
                    <button
                      type="button"
                      title="Favorite (coming soon)"
                      aria-label="Favorite"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-full text-ink3 hover:text-warning hover:bg-subtle transition-colors"
                    >
                      <Star size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

      </aside>
    </>
  );
}
