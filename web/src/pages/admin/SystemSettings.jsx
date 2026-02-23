import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import AdminPageHeader from '../../components/AdminPageHeader';

function formatErr(err) {
  if (!err) return 'Unknown error';
  const base = err.message || 'Request failed';
  if (!err.details) return base;
  if (Array.isArray(err.details?.errors) && err.details.errors.length > 0) {
    return `${base}\n- ${err.details.errors.join('\n- ')}`;
  }
  try {
    return `${base}\n${JSON.stringify(err.details, null, 2)}`;
  } catch {
    return base;
  }
}

export default function AdminSystemSettings() {
  const { key: locationKey } = useLocation();
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [installingBridge, setInstallingBridge] = useState(false);
  const [loadingBridgeStatus, setLoadingBridgeStatus] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState(null);
  const [purgingLicenses, setPurgingLicenses] = useState(false);
  const [purgingRegistrations, setPurgingRegistrations] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);
  const [testingWarrantWebhook, setTestingWarrantWebhook] = useState(false);
  const [warrantWebhookTestResult, setWarrantWebhookTestResult] = useState(null);

  async function fetchSettings() {
    try {
      const data = await api.get('/api/admin/settings');
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  async function fetchFiveMStatus() {
    setLoadingBridgeStatus(true);
    try {
      const status = await api.get('/api/admin/fivem-resource/status');
      setBridgeStatus(status);
    } catch (err) {
      setBridgeStatus({ error: err.message });
    } finally {
      setLoadingBridgeStatus(false);
    }
  }

  useEffect(() => {
    fetchSettings();
    fetchFiveMStatus();
  }, [locationKey]);

  function updateSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await api.put('/api/admin/settings', { settings });
      alert('Settings saved');
      fetchFiveMStatus();
    } catch (err) {
      alert('Failed to save:\n' + formatErr(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveAndTestWarrantWebhook() {
    setTestingWarrantWebhook(true);
    setWarrantWebhookTestResult(null);
    try {
      await api.put('/api/admin/settings', { settings });
      const result = await api.post('/api/admin/warrant-community-webhook/test', {});
      setWarrantWebhookTestResult({
        success: true,
        message: `Test webhook sent successfully${result?.location ? ` (location: ${result.location})` : ''}.`,
      });
      fetchSettings();
    } catch (err) {
      setWarrantWebhookTestResult({
        success: false,
        message: formatErr(err),
      });
    } finally {
      setTestingWarrantWebhook(false);
    }
  }

  async function installOrUpdateFiveMResource() {
    setInstallingBridge(true);
    try {
      await api.put('/api/admin/settings', { settings });
      const result = await api.post('/api/admin/fivem-resource/install', {});
      alert(`FiveM resource synced to:\n${result.targetDir}`);
      fetchFiveMStatus();
    } catch (err) {
      alert('Failed to sync FiveM resource:\n' + formatErr(err));
    } finally {
      setInstallingBridge(false);
    }
  }

  async function purgeLicenses() {
    const confirmed = window.confirm(
      'This will permanently delete ALL CAD driver licence records. Continue?'
    );
    if (!confirmed) return;
    setPurgingLicenses(true);
    setPurgeResult(null);
    try {
      const result = await api.delete('/api/admin/cad-records/licenses');
      setPurgeResult({
        success: true,
        message: `Purged ${Number(result?.cleared || 0)} driver licence record(s).`,
      });
    } catch (err) {
      setPurgeResult({ success: false, message: formatErr(err) });
    } finally {
      setPurgingLicenses(false);
    }
  }

  async function purgeRegistrations() {
    const confirmed = window.confirm(
      'This will permanently delete ALL CAD vehicle registration (rego) records. Continue?'
    );
    if (!confirmed) return;
    setPurgingRegistrations(true);
    setPurgeResult(null);
    try {
      const result = await api.delete('/api/admin/cad-records/registrations');
      setPurgeResult({
        success: true,
        message: `Purged ${Number(result?.cleared || 0)} registration record(s).`,
      });
    } catch (err) {
      setPurgeResult({ success: false, message: formatErr(err) });
    } finally {
      setPurgingRegistrations(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <AdminPageHeader
        title="System Settings"
        subtitle="Configure CAD integrations and backend data sources."
      />

      {/* FiveM Bridge */}
      <div className="bg-cad-card border border-cad-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-5">FiveM CAD Bridge</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-cad-muted mb-1">FiveM Resources Directory</label>
            <input
              type="text"
              value={settings.fivem_bridge_install_path || ''}
              onChange={e => updateSetting('fivem_bridge_install_path', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="e.g. C:\\txData\\YourServer\\resources\\[cad]"
            />
            <p className="text-xs text-cad-muted mt-1">
              CAD will install/update a resource folder named <span className="font-mono">cad_bridge</span> in this directory.
            </p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-cad-muted mb-1">CAD API Base URL</label>
            <input
              type="text"
              value={settings.fivem_bridge_base_url || ''}
              onChange={e => updateSetting('fivem_bridge_base_url', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              placeholder="http://127.0.0.1:3031"
            />
            <p className="text-xs text-cad-muted mt-1">
              Used as the default CAD endpoint inside the installed <span className="font-mono">cad_bridge</span> resource. Port 3031 is the plain HTTP bridge port (FiveM cannot use HTTPS with self-signed certs).
            </p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-cad-muted mb-1">Shared Bridge Token</label>
            <input
              type="text"
              value={settings.fivem_bridge_shared_token || ''}
              onChange={e => updateSetting('fivem_bridge_shared_token', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              placeholder="Set a long random token"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Enable Bridge</label>
            <select
              value={settings.fivem_bridge_enabled || 'false'}
              onChange={e => updateSetting('fivem_bridge_enabled', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Auto Update Resource</label>
            <select
              value={settings.fivem_bridge_auto_update || 'true'}
              onChange={e => updateSetting('fivem_bridge_auto_update', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Auto Sync Interval (minutes)</label>
            <input
              type="number"
              min="1"
              value={settings.fivem_bridge_sync_interval_minutes || '5'}
              onChange={e => updateSetting('fivem_bridge_sync_interval_minutes', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Queue QBox Fines From CAD</label>
            <select
              value={settings.fivem_bridge_qbox_fines_enabled || 'true'}
              onChange={e => updateSetting('fivem_bridge_qbox_fines_enabled', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Fine Delivery Mode</label>
            <select
              value={settings.fivem_bridge_qbox_fines_delivery_mode || 'bridge'}
              onChange={e => updateSetting('fivem_bridge_qbox_fines_delivery_mode', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="direct_db">Direct QBX DB</option>
              <option value="bridge">FiveM Bridge (In-Game)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Fine Account Key</label>
            <input
              type="text"
              value={settings.qbox_fine_account_key || 'bank'}
              onChange={e => updateSetting('qbox_fine_account_key', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="bank"
            />
          </div>
          {String(settings.fivem_bridge_qbox_fines_delivery_mode || 'bridge') === 'direct_db' && (
            <p className="col-span-2 text-xs text-amber-300">
              Direct QBX DB mode updates database money only. Live in-game fines and ox_lib notifications require
              <span className="font-semibold"> FiveM Bridge (In-Game)</span>.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={installOrUpdateFiveMResource}
            disabled={installingBridge}
            className="px-3 py-1.5 text-sm bg-cad-accent hover:bg-cad-accent-light text-white rounded border border-cad-accent/40 transition-colors disabled:opacity-50"
          >
            {installingBridge ? 'Syncing...' : 'Install / Update Resource'}
          </button>
          <button
            onClick={fetchFiveMStatus}
            disabled={loadingBridgeStatus}
            className="px-3 py-1.5 text-sm bg-cad-surface text-cad-muted hover:text-cad-ink rounded border border-cad-border transition-colors disabled:opacity-50"
          >
            {loadingBridgeStatus ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>

        {bridgeStatus && (
          <div className="mt-3 text-xs space-y-1">
            {bridgeStatus.error ? (
              <div className="text-red-400 whitespace-pre-wrap">{bridgeStatus.error}</div>
            ) : (
              <>
                <div className="text-cad-muted">
                  Resource: <span className="font-mono">{bridgeStatus.resourceName || 'cad_bridge'}</span>
                </div>
                <div className="text-cad-muted">
                  Installed: <span className={bridgeStatus.installed ? 'text-emerald-400' : 'text-red-400'}>{String(!!bridgeStatus.installed)}</span>
                </div>
                <div className="text-cad-muted">
                  Up To Date: <span className={bridgeStatus.upToDate ? 'text-emerald-400' : 'text-amber-300'}>{String(!!bridgeStatus.upToDate)}</span>
                </div>
                {bridgeStatus.targetDir && (
                  <div className="text-cad-muted whitespace-pre-wrap">Target: {bridgeStatus.targetDir}</div>
                )}
                {Array.isArray(bridgeStatus.resources) && bridgeStatus.resources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-cad-muted font-semibold">Synced Resources</p>
                    {bridgeStatus.resources.map((resource) => (
                      <div key={resource.resourceName} className="text-cad-muted">
                        <span className="font-mono">{resource.resourceName}</span>
                        {' | '}
                        installed: <span className={resource.installed ? 'text-emerald-400' : 'text-red-400'}>{String(!!resource.installed)}</span>
                        {' | '}
                        upToDate: <span className={resource.upToDate ? 'text-emerald-400' : 'text-amber-300'}>{String(!!resource.upToDate)}</span>
                        {resource.targetDir ? ` | target: ${resource.targetDir}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-5">Discord Sync</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-cad-muted mb-1">Periodic Discord Sync (minutes)</label>
            <input
              type="number"
              min="0"
              value={settings.discord_periodic_sync_minutes || ''}
              onChange={e => updateSetting('discord_periodic_sync_minutes', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="10"
            />
            <p className="text-xs text-cad-muted mt-1">
              Checks Discord role access sync and job-role sync for linked members on a timer. Set <span className="font-mono">0</span> to disable periodic checks.
            </p>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Fast Discord Sync (seconds, optional)</label>
            <input
              type="number"
              min="0"
              value={settings.discord_periodic_sync_seconds || ''}
              onChange={e => updateSetting('discord_periodic_sync_seconds', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="5"
            />
            <p className="text-xs text-cad-muted mt-1">
              Overrides the minute timer when set. Uses a minimum of <span className="font-mono">3</span> seconds to avoid excessive Discord/QBox polling.
            </p>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Reverse Job Role Sync</label>
            <select
              value={settings.fivem_bridge_job_sync_reverse_enabled || 'true'}
              onChange={e => updateSetting('fivem_bridge_job_sync_reverse_enabled', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
            <p className="text-xs text-cad-muted mt-1">
              When enabled, CAD applies/removes Discord roles based on QBox jobs (including multi-character checks).
            </p>
          </div>
        </div>
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-5">Warrant Community Alerts</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-cad-muted mb-1">Discord Webhook URL</label>
            <input
              type="text"
              value={settings.discord_warrant_community_webhook_url || ''}
              onChange={e => updateSetting('discord_warrant_community_webhook_url', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              placeholder="https://discord.com/api/webhooks/..."
            />
            <p className="text-xs text-cad-muted mt-1">
              Used for community wanted poster notifications when a warrant is created. Stored in CAD settings (not .env).
            </p>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Default Location Label</label>
            <input
              type="text"
              value={settings.discord_warrant_community_default_location || 'Los Santos'}
              onChange={e => updateSetting('discord_warrant_community_default_location', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="Los Santos"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Webhook Username (optional)</label>
            <input
              type="text"
              value={settings.discord_warrant_community_webhook_username || ''}
              onChange={e => updateSetting('discord_warrant_community_webhook_username', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="Community Wanted Alerts"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-cad-muted mb-1">Webhook Avatar URL (optional)</label>
            <input
              type="text"
              value={settings.discord_warrant_community_webhook_avatar_url || ''}
              onChange={e => updateSetting('discord_warrant_community_webhook_avatar_url', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="https://..."
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-cad-muted mb-1">Poster Template Path (optional)</label>
            <input
              type="text"
              value={settings.discord_warrant_community_poster_template_path || ''}
              onChange={e => updateSetting('discord_warrant_community_poster_template_path', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              placeholder="C:\\path\\to\\wanted-template.png"
            />
            <p className="text-xs text-cad-muted mt-1">
              Optional local image path to use as the exact poster background. CAD overlays the character photo and text onto this image.
            </p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-cad-muted mb-1">Poster Template URL (optional)</label>
            <input
              type="text"
              value={settings.discord_warrant_community_poster_template_url || ''}
              onChange={e => updateSetting('discord_warrant_community_poster_template_url', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-cad-accent"
              placeholder="https://.../wanted-template.png"
            />
            <p className="text-xs text-cad-muted mt-1">
              Optional fallback if no local template path is set. Local path takes priority.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            type="button"
            onClick={saveAndTestWarrantWebhook}
            disabled={testingWarrantWebhook || saving}
            className="px-3 py-1.5 text-sm bg-[#5865F2] hover:bg-[#4752C4] text-white rounded border border-[#5865F2]/40 transition-colors disabled:opacity-50"
          >
            {testingWarrantWebhook ? 'Sending Test...' : 'Save + Send Test Wanted Poster'}
          </button>
          <p className="text-xs text-cad-muted">
            Sends a sample wanted poster image (image-only message, no embed) to the currently entered webhook URL after saving settings.
          </p>
        </div>

        {warrantWebhookTestResult && (
          <p className={`text-xs mt-3 whitespace-pre-wrap ${warrantWebhookTestResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
            {warrantWebhookTestResult.message}
          </p>
        )}
      </div>

      <div className="bg-cad-card border border-red-500/30 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-red-300 uppercase tracking-wider mb-2">CAD Record Purge</h3>
        <p className="text-xs text-cad-muted mb-3">
          Dangerous actions. This permanently removes CAD licence/rego records from the CAD database.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={purgeLicenses}
            disabled={purgingLicenses || purgingRegistrations}
            className="px-3 py-1.5 text-xs bg-red-500/15 text-red-200 hover:bg-red-500/25 rounded border border-red-500/40 transition-colors disabled:opacity-50"
          >
            {purgingLicenses ? 'Purging Licences...' : 'Purge Licences'}
          </button>
          <button
            type="button"
            onClick={purgeRegistrations}
            disabled={purgingRegistrations || purgingLicenses}
            className="px-3 py-1.5 text-xs bg-red-500/15 text-red-200 hover:bg-red-500/25 rounded border border-red-500/40 transition-colors disabled:opacity-50"
          >
            {purgingRegistrations ? 'Purging Rego...' : 'Purge Registrations (Rego)'}
          </button>
        </div>
        {purgeResult && (
          <p className={`text-xs mt-3 whitespace-pre-wrap ${purgeResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
            {purgeResult.message}
          </p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
