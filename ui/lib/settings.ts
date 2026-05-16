import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getRootDir } from './store';

export interface InferwallSettings {
  base_url: string;
  api_key: string;
  auto_manage: boolean;
}

export interface ReexecuteSettings {
  /** Absolute path to a local OpenAgent checkout, or empty to auto-discover. */
  openagent_path: string;
  /** Bun / Node binary used to spawn OpenAgent. Default: 'bun'. */
  runtime: 'bun' | 'node';
}

export interface ConsoleSettings {
  inferwall: InferwallSettings;
  retention_days: number | null;
  live_poll_ms: number;
  reexecute: ReexecuteSettings;
}

export const DEFAULT_SETTINGS: ConsoleSettings = {
  inferwall: {
    base_url: 'http://localhost:8000',
    api_key: '',
    auto_manage: true,
  },
  retention_days: null,
  live_poll_ms: 2000,
  reexecute: {
    openagent_path: '',
    runtime: 'bun',
  },
};

function configPath(): string {
  return join(getRootDir(), 'console-config.json');
}

export async function loadSettings(): Promise<ConsoleSettings> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ConsoleSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      inferwall: { ...DEFAULT_SETTINGS.inferwall, ...(parsed.inferwall ?? {}) },
      reexecute: { ...DEFAULT_SETTINGS.reexecute, ...(parsed.reexecute ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(next: ConsoleSettings): Promise<void> {
  const path = configPath();
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, JSON.stringify(next, null, 2), 'utf8');
}
