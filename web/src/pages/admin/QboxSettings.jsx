import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import AdminPageHeader from '../../components/AdminPageHeader';

const QBOX_SETTING_KEYS = [
  'qbox_host',
  'qbox_port',
  'qbox_user',
  'qbox_password',
  'qbox_database',
  'qbox_players_table',
  'qbox_job_table',
  'qbox_job_match_col',
  'qbox_job_grade_col',
  'qbox_vehicles_table',
  'qbox_citizenid_col',
  'qbox_charinfo_col',
  'qbox_money_col',
  'qbox_job_col',
];

function formatErr(err) {
  if (!err) return 'Unknown error';
  const base = err.message || 'Request failed';
  if (Array.isArray(err.details?.errors) && err.details.errors.length > 0) {
    return `${base}\n- ${err.details.errors.join('\n- ')}`;
  }
  return base;
}

export default function AdminQboxSettings() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [schemaResult, setSchemaResult] = useState(null);
  const [tableInspectName, setTableInspectName] = useState('');
  const [tableInspectColumns, setTableInspectColumns] = useState([]);
  const [inspectingTable, setInspectingTable] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const allSettings = await api.get('/api/admin/settings');
      const next = {};
      for (const key of QBOX_SETTING_KEYS) {
        next[key] = String(allSettings?.[key] ?? '');
      }
      setSettings(next);
    } catch (err) {
      alert(`Failed to load QBox settings:\n${formatErr(err)}`);
    }
  }

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload() {
    const payload = {};
    for (const key of QBOX_SETTING_KEYS) {
      payload[key] = String(settings?.[key] ?? '');
    }
    return payload;
  }

  async function saveSettings(showAlert = true) {
    setSaving(true);
    try {
      await api.put('/api/admin/settings', { settings: buildPayload() });
      if (showAlert) alert('QBox settings saved.');
      return true;
    } catch (err) {
      alert(`Failed to save QBox settings:\n${formatErr(err)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setSchemaResult(null);
    try {
      await api.put('/api/admin/settings', { settings: buildPayload() });
      const connection = await api.get('/api/admin/qbox/test');
      setTestResult({
        success: true,
        message: connection?.message || 'Connection successful',
      });
      const schema = await api.get('/api/admin/qbox/schema');
      setSchemaResult(schema);
    } catch (err) {
      setTestResult({ success: false, message: formatErr(err) });
      if (err.details) setSchemaResult(err.details);
    } finally {
      setTesting(false);
    }
  }

  async function inspectColumns() {
    const tableName = String(tableInspectName || '').trim();
    if (!tableName) return;
    setInspectingTable(true);
    try {
      const columns = await api.get(`/api/admin/qbox/table-columns?table_name=${encodeURIComponent(tableName)}`);
      setTableInspectColumns(Array.isArray(columns) ? columns : []);
    } catch (err) {
      setTableInspectColumns([]);
      alert(`Failed to inspect table:\n${formatErr(err)}`);
    } finally {
      setInspectingTable(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="QBox Settings"
        subtitle="Configure direct QBox MySQL connection and default table/column bindings."
      />

      <div className="bg-cad-card border border-cad-border rounded-lg p-5 mb-4">
        <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-4">MySQL Connection</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-cad-muted mb-1">Host</label>
            <input
              type="text"
              value={settings.qbox_host || ''}
              onChange={(e) => updateSetting('qbox_host', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="127.0.0.1"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Port</label>
            <input
              type="text"
              value={settings.qbox_port || ''}
              onChange={(e) => updateSetting('qbox_port', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="3306"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Username</label>
            <input
              type="text"
              value={settings.qbox_user || ''}
              onChange={(e) => updateSetting('qbox_user', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="root"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Password</label>
            <input
              type="password"
              value={settings.qbox_password || ''}
              onChange={(e) => updateSetting('qbox_password', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-cad-muted mb-1">Database</label>
            <input
              type="text"
              value={settings.qbox_database || ''}
              onChange={(e) => updateSetting('qbox_database', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="qbox"
            />
          </div>
        </div>

        <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mt-5 mb-3">Default Table Bindings</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-cad-muted mb-1">Players Table</label>
            <input
              type="text"
              value={settings.qbox_players_table || ''}
              onChange={(e) => updateSetting('qbox_players_table', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="players"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Job Source Table</label>
            <input
              type="text"
              value={settings.qbox_job_table || ''}
              onChange={(e) => updateSetting('qbox_job_table', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="players (leave blank to use Players Table)"
            />
            <p className="text-[11px] text-cad-muted mt-1">
              Used for job-role sync lookups. Must contain the configured citizen ID column and job column.
            </p>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Job Match Column</label>
            <input
              type="text"
              value={settings.qbox_job_match_col || ''}
              onChange={(e) => updateSetting('qbox_job_match_col', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="license"
            />
            <p className="text-[11px] text-cad-muted mt-1">
              Column used to match the player account in the job table (for <span className="font-mono">q_multipjob</span> use <span className="font-mono">identifier</span>).
            </p>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Vehicles Table</label>
            <input
              type="text"
              value={settings.qbox_vehicles_table || ''}
              onChange={(e) => updateSetting('qbox_vehicles_table', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="player_vehicles"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Citizen ID Column</label>
            <input
              type="text"
              value={settings.qbox_citizenid_col || ''}
              onChange={(e) => updateSetting('qbox_citizenid_col', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="citizenid"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Charinfo Column</label>
            <input
              type="text"
              value={settings.qbox_charinfo_col || ''}
              onChange={(e) => updateSetting('qbox_charinfo_col', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="charinfo"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Money Column</label>
            <input
              type="text"
              value={settings.qbox_money_col || ''}
              onChange={(e) => updateSetting('qbox_money_col', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="money"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Job Column</label>
            <input
              type="text"
              value={settings.qbox_job_col || ''}
              onChange={(e) => updateSetting('qbox_job_col', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="job"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Job Grade Column (Optional)</label>
            <input
              type="text"
              value={settings.qbox_job_grade_col || ''}
              onChange={(e) => updateSetting('qbox_job_grade_col', e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-1.5 text-xs focus:outline-none focus:border-cad-accent"
              placeholder="grade"
            />
            <p className="text-[11px] text-cad-muted mt-1">
              Use when grade is stored in a separate column (for <span className="font-mono">q_multipjob</span> set this to <span className="font-mono">grade</span>).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            onClick={() => saveSettings(true)}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-cad-accent hover:bg-cad-accent-light text-white rounded transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save QBox Settings'}
          </button>
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-3 py-1.5 text-sm bg-cad-surface text-cad-muted hover:text-cad-ink rounded border border-cad-border transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {testResult && (
            <span className={`text-sm whitespace-pre-wrap ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
              {testResult.message}
            </span>
          )}
        </div>

        {schemaResult && (
          <div className="mt-3 text-xs">
            {Array.isArray(schemaResult.errors) && schemaResult.errors.length > 0 && (
              <div className="text-red-400 whitespace-pre-wrap">
                {'Errors:\n- ' + schemaResult.errors.join('\n- ')}
              </div>
            )}
            {Array.isArray(schemaResult.players?.warnings) && schemaResult.players.warnings.length > 0 && (
              <div className="text-amber-300 whitespace-pre-wrap mt-2">
                {'Player Warnings:\n- ' + schemaResult.players.warnings.join('\n- ')}
              </div>
            )}
            {Array.isArray(schemaResult.jobs?.warnings) && schemaResult.jobs.warnings.length > 0 && (
              <div className="text-amber-300 whitespace-pre-wrap mt-2">
                {'Job Source Warnings:\n- ' + schemaResult.jobs.warnings.join('\n- ')}
              </div>
            )}
            {Array.isArray(schemaResult.vehicles?.warnings) && schemaResult.vehicles.warnings.length > 0 && (
              <div className="text-amber-300 whitespace-pre-wrap mt-2">
                {'Vehicle Warnings:\n- ' + schemaResult.vehicles.warnings.join('\n- ')}
              </div>
            )}
            {schemaResult.success && (
              <div className="text-emerald-400 mt-2">
                Schema check passed.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-cad-card border border-cad-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-cad-muted uppercase tracking-wider mb-3">Table Inspector</h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={tableInspectName}
            onChange={(e) => setTableInspectName(e.target.value)}
            className="min-w-[220px] flex-1 bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            placeholder="Enter table name (example: players)"
          />
          <button
            onClick={inspectColumns}
            disabled={inspectingTable}
            className="px-3 py-2 text-sm bg-cad-surface text-cad-muted hover:text-cad-ink rounded border border-cad-border transition-colors disabled:opacity-50"
          >
            {inspectingTable ? 'Inspecting...' : 'Inspect Columns'}
          </button>
        </div>

        {tableInspectColumns.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-cad-muted border-b border-cad-border">
                  <th className="py-2 pr-3">Column</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Nullable</th>
                  <th className="py-2">JSON</th>
                </tr>
              </thead>
              <tbody>
                {tableInspectColumns.map((column) => (
                  <tr key={column.name} className="border-b border-cad-border/40">
                    <td className="py-2 pr-3 font-mono">{column.name}</td>
                    <td className="py-2 pr-3">{column.columnType || column.dataType}</td>
                    <td className="py-2 pr-3">{column.nullable ? 'Yes' : 'No'}</td>
                    <td className="py-2">{column.isJson ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
