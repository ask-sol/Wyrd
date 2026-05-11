import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { SettingsForm } from './SettingsForm';
import { loadSettings } from '@/lib/settings';
import { getRootDir } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await loadSettings();
  const dir = getRootDir();
  const envOverride = typeof process.env.WYRD_DIR === 'string' && process.env.WYRD_DIR.length > 0;

  return (
    <Shell crumbs={[{ label: 'Settings' }]} storeDir={dir} activePath="/settings">
      <div className="max-w-[900px] mx-auto px-6 py-6">
        <PageHeader
          title="Settings"
          subtitle={
            <span>
              Local configuration. Persisted at{' '}
              <code className="font-mono text-ink2">{dir}/console-config.json</code>.
            </span>
          }
        />
        <SettingsForm initial={settings} storeDir={dir} envOverride={envOverride} />
      </div>
    </Shell>
  );
}
