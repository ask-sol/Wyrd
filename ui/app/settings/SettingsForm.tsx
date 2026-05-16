'use client';
import { useState } from 'react';
import { Check, Loader2, Plug, Save } from 'lucide-react';
import { InferwallManager } from './InferwallManager';
import type { ConsoleSettings } from '@/lib/settings';

type TestResult = { ok: true; latencyMs: number } | { ok: false; error: string };

export function SettingsForm({
  initial,
  storeDir,
  envOverride,
}: {
  initial: ConsoleSettings;
  storeDir: string;
  envOverride: boolean;
}) {
  const [settings, setSettings] = useState<ConsoleSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  async function testInferwall() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/inferwall/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings.inferwall),
      });
      const json = (await r.json()) as TestResult;
      setTestResult(json);
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Storage" subtitle="Where the SQLite database and content-addressed blobs live.">
        <Row label="WYRD_DIR">
          <code className="font-mono text-sm text-ink2 bg-subtle border border-divider rounded-sm px-2 py-1">
            {storeDir}
          </code>
          {envOverride && (
            <span className="ml-2 text-2xs text-ink3 font-mono uppercase tracking-wider">
              from env
            </span>
          )}
          <p className="mt-2 text-xs text-ink3">
            Set the <code className="font-mono text-ink2">WYRD_DIR</code> environment variable to
            change this. Both OpenAgent and the console must point at the same path.
          </p>
        </Row>
      </Section>

      <Section title="Security scanner" subtitle="Wyrd ships with a built-in offline scanner (wyrd-guard) that works with any provider. Inferwall is an optional, more powerful local firewall when its upstream wheel is fixed.">
        <Row label="Process">
          <InferwallManager />
        </Row>
        <Row label="Base URL">
          <input
            type="text"
            value={settings.inferwall.base_url}
            onChange={(e) =>
              setSettings((s) => ({ ...s, inferwall: { ...s.inferwall, base_url: e.target.value } }))
            }
            className="w-full max-w-md h-9 px-3 bg-surface border border-border rounded-sm text-sm font-mono focus:border-brand focus:border-2 outline-none transition-colors"
            placeholder="http://localhost:8000"
          />
        </Row>
        <Row label="API key">
          <input
            type="password"
            value={settings.inferwall.api_key}
            onChange={(e) =>
              setSettings((s) => ({ ...s, inferwall: { ...s.inferwall, api_key: e.target.value } }))
            }
            className="w-full max-w-md h-9 px-3 bg-surface border border-border rounded-sm text-sm font-mono focus:border-brand focus:border-2 outline-none transition-colors"
            placeholder="iwk_scan_..."
          />
          <p className="mt-2 text-xs text-ink3">
            Leave blank to let wyrd auto-generate via <code className="font-mono text-ink2">inferwall admin setup</code>.
          </p>
        </Row>
        <Row label="">
          <button
            onClick={testInferwall}
            disabled={testing}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-pill border border-border bg-surface text-sm text-ink2 hover:text-ink hover:bg-hover transition-colors disabled:opacity-60"
          >
            {testing ? (
              <Loader2 size={14} className="animate-spin" strokeWidth={1.75} />
            ) : (
              <Plug size={14} strokeWidth={1.75} />
            )}
            Test connection
          </button>
          {testResult && (
            <span
              className={`ml-3 text-xs font-mono ${
                testResult.ok ? 'text-success' : 'text-danger'
              }`}
            >
              {testResult.ok
                ? `connected · ${testResult.latencyMs}ms`
                : `failed · ${testResult.error}`}
            </span>
          )}
        </Row>
      </Section>

      <Section title="Live activity" subtitle="How often the /live page polls for new spans.">
        <Row label="Poll interval (ms)">
          <input
            type="number"
            min={250}
            step={250}
            value={settings.live_poll_ms}
            onChange={(e) =>
              setSettings((s) => ({ ...s, live_poll_ms: parseInt(e.target.value, 10) || 2000 }))
            }
            className="w-40 h-9 px-3 bg-surface border border-border rounded-sm text-sm font-mono focus:border-brand focus:border-2 outline-none transition-colors"
          />
          <p className="mt-2 text-xs text-ink3">
            500ms feels real-time. Below 250ms is wasteful for typical agent runs.
          </p>
        </Row>
      </Section>

      <Section
        title="Re-execute"
        subtitle="The Re-execute button on a trace spawns OpenAgent's headless mode (--prompt) with WYRD_ENABLED=1, producing a fresh, captured run."
      >
        <Row label="OpenAgent path">
          <input
            type="text"
            value={settings.reexecute.openagent_path}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                reexecute: { ...s.reexecute, openagent_path: e.target.value },
              }))
            }
            placeholder="auto-detect (~/Documents/GitHub/openagent, ~/code/openagent, ...)"
            className="w-full max-w-xl h-9 px-3 bg-surface border border-border rounded-sm text-sm font-mono focus:border-brand focus:border-2 outline-none transition-colors"
          />
          <p className="mt-2 text-xs text-ink3">
            Leave blank and Wyrd will probe common locations. Required only if your checkout lives somewhere unusual.
          </p>
        </Row>
        <Row label="Runtime">
          <div className="flex items-center gap-3">
            {(['bun', 'node'] as const).map((rt) => (
              <label
                key={rt}
                className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-ink2"
              >
                <input
                  type="radio"
                  checked={settings.reexecute.runtime === rt}
                  onChange={() =>
                    setSettings((s) => ({ ...s, reexecute: { ...s.reexecute, runtime: rt } }))
                  }
                  className="accent-brand"
                />
                <code className="font-mono">{rt}</code>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink3">
            Bun is the default. Node uses <code className="font-mono">npx tsx</code> as a fallback if Bun isn't on PATH.
          </p>
        </Row>
      </Section>

      <Section title="Retention" subtitle="Automatically prune old traces. Off by default.">
        <Row label="Delete traces older than">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={settings.retention_days ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                setSettings((s) => ({ ...s, retention_days: Number.isFinite(v as number) ? (v as number) : null }));
              }}
              placeholder="off"
              className="w-32 h-9 px-3 bg-surface border border-border rounded-sm text-sm font-mono focus:border-brand focus:border-2 outline-none transition-colors"
            />
            <span className="text-sm text-ink3">days</span>
          </div>
        </Row>
      </Section>

      <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-bg/95 backdrop-blur border-t border-border flex items-center justify-end gap-3">
        {savedAt && (
          <span className="text-xs text-success font-mono inline-flex items-center gap-1">
            <Check size={12} strokeWidth={2} />
            Saved
          </span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-brand text-bg text-sm font-medium hover:bg-brandStrong transition-colors disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" strokeWidth={2} />
          ) : (
            <Save size={14} strokeWidth={2} />
          )}
          Save settings
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-divider">
        <div className="text-base font-medium text-ink">{title}</div>
        {subtitle && <div className="text-sm text-ink3 mt-0.5">{subtitle}</div>}
      </div>
      <div className="divide-y divide-divider">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 grid grid-cols-[200px_1fr] gap-6 items-start">
      <div className="text-sm text-ink2 pt-2">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
