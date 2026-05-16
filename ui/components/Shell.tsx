'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Database,
  ExternalLink,
  HelpCircle,
  Menu,
  MoreVertical,
  Sparkles,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { TopbarSearch } from './TopbarSearch';
import { NavDrawer } from './NavDrawer';
import { StorePanel } from './StorePanel';

interface Crumb {
  label: string;
  href?: string;
}

interface ShellProps {
  crumbs: Crumb[];
  storeDir: string;
  children: React.ReactNode;
  pageActions?: React.ReactNode;
  activePath?: string;
}

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

function HeaderIconButton({
  children,
  title,
  onClick,
  href,
  external,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const cls =
    'relative inline-flex items-center justify-center h-10 w-10 rounded-full text-ink2 hover:text-ink hover:bg-hover transition-colors';
  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" title={title} aria-label={title} className={cls}>
        {children}
      </a>
    ) : (
      <Link href={href} title={title} aria-label={title} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={cls}>
      {children}
    </button>
  );
}

function ProjectChip({ storeDir, onClick }: { storeDir: string; onClick: () => void }) {
  const short = storeDir.split('/').filter(Boolean).slice(-1)[0] ?? storeDir;
  return (
    <button
      type="button"
      onClick={onClick}
      title={storeDir}
      aria-label="Open store picker"
      className="hidden md:inline-flex items-center gap-2 h-9 pl-2 pr-3 rounded-pill border border-border hover:bg-hover hover:border-borderHi transition-colors"
    >
      <span className="inline-flex items-center justify-center h-6 w-6 rounded-sm bg-brandSoft">
        <Database size={13} strokeWidth={1.75} className="text-brand" />
      </span>
      <span className="text-sm text-ink max-w-[180px] truncate">{short}</span>
      <ChevronDown size={14} strokeWidth={1.75} className="text-ink3" />
    </button>
  );
}

function Avatar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Account · Settings"
      aria-label="Account"
      className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-brand to-brandStrong text-[12px] font-medium text-white ring-2 ring-bg ml-1 hover:brightness-110 transition"
    >
      W
    </button>
  );
}

interface MoreMenuItem {
  label: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  hint?: string;
}

function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <HeaderIconButton title="More" onClick={() => setOpen((v) => !v)}>
        <MoreVertical size={18} strokeWidth={1.75} />
      </HeaderIconButton>
      {open && (
        <div className="absolute top-full right-0 mt-1 card shadow-e2 min-w-[200px] py-1 z-50">
          {items.map((it, i) => {
            const inner = (
              <>
                <span className="flex-1 text-ink">{it.label}</span>
                {it.external && <ExternalLink size={12} strokeWidth={1.75} className="text-ink3" />}
                {it.hint && <span className="text-[11px] text-ink3 font-mono">{it.hint}</span>}
              </>
            );
            const cls =
              'flex items-center gap-2 h-9 px-3 text-sm hover:bg-hover transition-colors w-full text-left';
            if (it.href) {
              return it.external ? (
                <a
                  key={i}
                  href={it.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cls}
                  onClick={() => setOpen(false)}
                >
                  {inner}
                </a>
              ) : (
                <Link key={i} href={it.href} className={cls} onClick={() => setOpen(false)}>
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  it.onClick?.();
                  setOpen(false);
                }}
                className={cls}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Shell({ crumbs, storeDir, children, pageActions, activePath = '/' }: ShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeStartInCreate, setStoreStartInCreate] = useState(false);

  useEffect(() => {
    function onOpen() {
      setStoreStartInCreate(true);
      setStoreOpen(true);
    }
    window.addEventListener('wyrd:open-store', onOpen);
    return () => window.removeEventListener('wyrd:open-store', onOpen);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="h-14 bg-bg border-b border-border flex items-center pl-1 pr-2 sticky top-0 z-40">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          title="Open navigation"
          aria-label="Open navigation"
          className="inline-flex items-center justify-center h-10 w-10 rounded-full text-ink2 hover:text-ink hover:bg-hover transition-colors"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>
        <Link
          href="/"
          className="ml-1 mr-3 inline-flex items-center select-none shrink-0"
          aria-label="Wyrd Console"
        >
          <span className="text-[18px] text-ink font-normal tracking-tight">
            <span className="font-medium">Wyrd</span> Console
          </span>
        </Link>
        <ProjectChip storeDir={storeDir} onClick={() => setStoreOpen(true)} />
        <div className="flex-1 max-w-[760px] mx-auto px-4">
          <TopbarSearch />
        </div>
        <div className="ml-auto flex items-center">
          <HeaderIconButton title="New store / onboarding" onClick={() => setStoreOpen(true)}>
            <Sparkles size={18} strokeWidth={1.75} />
          </HeaderIconButton>
          <ThemeToggle />
          <HeaderIconButton
            title="Help · GitHub"
            href="https://github.com/ask-sol/Wyrd"
            external
          >
            <HelpCircle size={18} strokeWidth={1.75} />
          </HeaderIconButton>
          <MoreMenu
            items={[
              { label: 'Settings', href: '/settings' },
              { label: 'Store browser', onClick: () => setStoreOpen(true) },
              { label: 'Live activity', href: '/live' },
              { label: 'Insights', href: '/insights' },
              { label: 'Diff traces', href: '/diff' },
              { label: 'Wyrd on GitHub', href: 'https://github.com/ask-sol/Wyrd', external: true },
            ]}
          />
          <Avatar onClick={() => setStoreOpen(true)} />
        </div>
      </header>

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activePath={activePath}
      />

      <StorePanel
        open={storeOpen}
        onClose={() => {
          setStoreOpen(false);
          setStoreStartInCreate(false);
        }}
        activeDir={storeDir}
        startInCreate={storeStartInCreate}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-10 bg-bg border-b border-border flex items-center px-6 sticky top-14 z-30">
          <Breadcrumbs crumbs={crumbs} />
          {pageActions && <div className="ml-auto flex items-center gap-2">{pageActions}</div>}
        </div>
        <main className="flex-1 bg-bg">{children}</main>
      </div>
    </div>
  );
}
