import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import AdminPageHeader from '../../components/AdminPageHeader';

function renderJobTarget(mapping) {
  const jobName = String(mapping.job_name || '').trim() || 'Unspecified';
  const parsedGrade = Number(mapping?.job_grade);
  if (!Number.isFinite(parsedGrade) || parsedGrade < 0) {
    return `${jobName} / Any Rank`;
  }
  return `${jobName} / Rank ${Math.max(0, Math.trunc(parsedGrade))}`;
}

function describePreviewReason(reason) {
  const normalized = String(reason || '').trim();
  if (!normalized) return '';
  if (normalized === 'ok') return 'Preview loaded';
  if (normalized === 'no_preferred_citizen_id') return 'User has no preferred citizen ID in CAD';
  if (normalized === 'no_linked_citizen_ids') return 'User has no linked citizen IDs (preferred ID, active FiveM link, or job sync history)';
  if (normalized === 'no_job_mappings') return 'No job role mappings are configured';
  if (normalized === 'no_jobs_detected') return 'No jobs were detected from the configured QBox job source';
  if (normalized === 'no_matching_mappings') return 'Jobs were detected, but none match current job role bindings';
  if (normalized === 'lookup_failed') return 'QBox lookup failed';
  if (normalized === 'reverse_job_role_sync_disabled') return 'Reverse job role sync is disabled in System Settings';
  return normalized;
}

export default function AdminJobBindings() {
  const { key: locationKey } = useLocation();
  const [mappings, setMappings] = useState([]);
  const [discordRoles, setDiscordRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [jobName, setJobName] = useState('');
  const [jobGrade, setJobGrade] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [debugUserId, setDebugUserId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [syncingUser, setSyncingUser] = useState(false);

  async function fetchData() {
    try {
      const [mappingsData, usersData] = await Promise.all([
        api.get('/api/admin/role-mappings'),
        api.get('/api/admin/users'),
      ]);
      setMappings((mappingsData || []).filter(m => m.target_type === 'job'));
      setUsers(Array.isArray(usersData) ? usersData : []);

      try {
        const rolesData = await api.get('/api/admin/discord/roles');
        setDiscordRoles(rolesData);
      } catch {
        // Bot may not be running.
      }
    } catch (err) {
      console.error('Failed to load job bindings:', err);
    }
  }

  useEffect(() => { fetchData(); }, [locationKey]);

  const canAddMapping = useMemo(() => {
    if (!selectedRole) return false;
    const name = String(jobName || '').trim();
    const gradeText = String(jobGrade ?? '').trim();
    if (!name.length) return false;
    if (!gradeText) return true;
    const parsed = Number(gradeText);
    return Number.isFinite(parsed) && parsed >= 0;
  }, [selectedRole, jobName, jobGrade]);

  async function addMapping() {
    if (!canAddMapping) return;
    const role = discordRoles.find(r => r.id === selectedRole);
    try {
      const trimmedGrade = String(jobGrade ?? '').trim();
      await api.post('/api/admin/role-mappings', {
        discord_role_id: selectedRole,
        discord_role_name: role?.name || '',
        target_type: 'job',
        job_name: String(jobName || '').trim(),
        job_grade: trimmedGrade ? Math.max(0, Number(trimmedGrade || 0)) : null,
      });
      setSelectedRole('');
      setJobName('');
      setJobGrade('');
      fetchData();
    } catch (err) {
      alert('Failed to create job binding: ' + err.message);
    }
  }

  async function deleteMapping(id) {
    try {
      await api.delete(`/api/admin/role-mappings/${id}`);
      fetchData();
    } catch (err) {
      alert('Failed to delete mapping: ' + err.message);
    }
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const result = await api.post('/api/admin/discord/sync');
      alert(`Synced ${result.synced} users (${result.skipped} skipped)`);
      fetchData();
    } catch (err) {
      alert('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function previewUserJobSync() {
    const userId = parseInt(String(debugUserId || '').trim(), 10);
    if (!userId) {
      alert('Enter a valid CAD User ID');
      return;
    }

    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const result = await api.get(`/api/admin/discord/job-sync-preview?user_id=${userId}`);
      setPreviewResult(result);
    } catch (err) {
      setPreviewResult({
        error: err.message || 'Preview failed',
        reason: 'lookup_failed',
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function syncSelectedUser() {
    const userId = parseInt(String(debugUserId || '').trim(), 10);
    if (!userId) {
      alert('Enter a valid CAD User ID');
      return;
    }

    setSyncingUser(true);
    try {
      const result = await api.post('/api/admin/discord/sync-user', { user_id: userId });
      const summary = result?.result;
      const reverse = summary?.reverse_job_role_sync;
      const reason = String(reverse?.reason || summary?.reason || 'unknown');
      alert(`User sync complete.\nReason: ${reason}`);
      await previewUserJobSync();
    } catch (err) {
      alert('User sync failed: ' + err.message);
    } finally {
      setSyncingUser(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Job Bindings"
        subtitle="Bind Discord roles directly to in-game jobs with optional rank matching."
      />

      <div className="flex items-center justify-between mb-6">
        <button
          onClick={syncAll}
          disabled={syncing}
          className="px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync All Members'}
        </button>
      </div>

      <div className="bg-cad-card border border-cad-border rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">Debug User Job Sync</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs text-cad-muted mb-1">CAD User</label>
            <select
              value={debugUserId}
              onChange={e => setDebugUserId(e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="">Select user...</option>
              {users
                .slice()
                .sort((a, b) => {
                  const aName = String(a?.steam_name || '').toLowerCase();
                  const bName = String(b?.steam_name || '').toLowerCase();
                  if (aName && bName && aName !== bName) return aName.localeCompare(bName);
                  return Number(a?.id || 0) - Number(b?.id || 0);
                })
                .map((user) => {
                  const userId = String(user?.id || '');
                  const name = String(user?.steam_name || '').trim() || 'Unnamed';
                  const cid = String(user?.preferred_citizen_id || '').trim();
                  const discordLinked = String(user?.discord_id || '').trim() ? 'Discord Linked' : 'No Discord';
                  const label = `#${userId} - ${name}${cid ? ` - CID ${cid}` : ''} - ${discordLinked}`;
                  return (
                    <option key={userId} value={userId}>
                      {label}
                    </option>
                  );
                })}
            </select>
          </div>
          <div>
            <button
              onClick={previewUserJobSync}
              disabled={previewLoading}
              className="w-full px-4 py-2 bg-cad-surface hover:bg-cad-card border border-cad-border text-cad-ink rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {previewLoading ? 'Loading...' : 'Preview'}
            </button>
          </div>
          <div>
            <button
              onClick={syncSelectedUser}
              disabled={syncingUser}
              className="w-full px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              {syncingUser ? 'Syncing...' : 'Sync This User'}
            </button>
          </div>
        </div>
        <p className="text-xs text-cad-muted mt-2">
          Shows detected jobs from the configured QBox job source and which Discord job bindings match before syncing.
        </p>

        {previewResult && (
          <div className="mt-4 space-y-3 text-sm">
            {previewResult.error ? (
              <div className="text-red-400">{String(previewResult.error || 'Preview failed')}</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-cad-surface border border-cad-border rounded p-3">
                    <div className="text-xs uppercase tracking-wider text-cad-muted mb-2">User</div>
                    <div className="space-y-1 text-xs">
                      <div>ID: <span className="font-mono">{previewResult.user?.id || '-'}</span></div>
                      <div>Name: <span className="text-cad-ink">{previewResult.user?.steam_name || '-'}</span></div>
                      <div>Discord: <span className="font-mono">{previewResult.user?.discord_id || '-'}</span></div>
                      <div>Preferred CID: <span className="font-mono">{previewResult.user?.preferred_citizen_id || '-'}</span></div>
                      <div>
                        Linked CIDs:{' '}
                        <span className="font-mono">
                          {Array.isArray(previewResult.user?.linked_citizen_ids) && previewResult.user.linked_citizen_ids.length > 0
                            ? previewResult.user.linked_citizen_ids.join(', ')
                            : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-cad-surface border border-cad-border rounded p-3">
                    <div className="text-xs uppercase tracking-wider text-cad-muted mb-2">Job Source Config</div>
                    <div className="space-y-1 text-xs">
                      <div>Players Table: <span className="font-mono">{previewResult.qbox?.players_table || '-'}</span></div>
                      <div>Table: <span className="font-mono">{previewResult.qbox?.job_table || '-'}</span></div>
                      <div>Match Col: <span className="font-mono">{previewResult.qbox?.job_match_col || '-'}</span></div>
                      <div>Job Col: <span className="font-mono">{previewResult.qbox?.job_col || '-'}</span></div>
                      <div>Grade Col: <span className="font-mono">{previewResult.qbox?.job_grade_col || '(embedded in job column)'}</span></div>
                      <div>
                        Players Job Fallback:{' '}
                        <span className={`font-mono ${previewResult.players_job_fallback_allowed ? 'text-amber-300' : 'text-emerald-400'}`}>
                          {previewResult.players_job_fallback_allowed ? 'allowed' : 'disabled (custom job table)'}
                        </span>
                        {previewResult.players_job_fallback_used ? (
                          <span className="text-amber-300"> (used in this preview)</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`text-xs ${previewResult.reason === 'ok' ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {describePreviewReason(previewResult.reason)}
                  {previewResult.error ? `: ${previewResult.error}` : ''}
                </div>

                <div className="bg-cad-surface border border-cad-border rounded p-3">
                  <div className="text-xs uppercase tracking-wider text-cad-muted mb-2">
                    Detected Jobs ({Array.isArray(previewResult.detected_jobs) ? previewResult.detected_jobs.length : 0})
                  </div>
                  {Array.isArray(previewResult.detected_jobs) && previewResult.detected_jobs.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.detected_jobs.map((job, index) => (
                        <div key={`${job.citizen_id || 'cid'}-${job.job_name || 'job'}-${job.job_grade}-${index}`} className="border border-cad-border/60 rounded p-2">
                          <div className="text-sm">
                            <span className="font-mono">{job.job_name}</span>{' '}
                            <span className="text-cad-muted">/ Rank {Number(job.job_grade || 0)}</span>
                          </div>
                          <div className="text-xs text-cad-muted mt-1">
                            CID: <span className="font-mono">{job.citizen_id || '-'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-cad-muted">No jobs detected.</p>
                  )}
                </div>

                <div className="bg-cad-surface border border-cad-border rounded p-3">
                  <div className="text-xs uppercase tracking-wider text-cad-muted mb-2">
                    Matching Job Bindings ({Array.isArray(previewResult.matched_mappings) ? previewResult.matched_mappings.length : 0} / {Number(previewResult.mapping_count || 0)})
                  </div>
                  {Array.isArray(previewResult.matched_mappings) && previewResult.matched_mappings.length > 0 ? (
                    <div className="space-y-2">
                      {previewResult.matched_mappings.map((mapping) => (
                        <div key={mapping.id} className="border border-cad-border/60 rounded p-2 text-xs">
                          <div className="text-cad-ink">
                            <span className="font-medium">{mapping.discord_role_name || '(Unnamed Role)'}</span>{' '}
                            <span className="font-mono text-cad-muted">({mapping.discord_role_id})</span>
                          </div>
                          <div className="text-cad-muted mt-1">
                            Job: <span className="font-mono">{mapping.job_name}</span>{' '}
                            | Rank: <span className="font-mono">{Number(mapping.job_grade) < 0 ? 'Any' : Number(mapping.job_grade || 0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-cad-muted">No current job bindings match the detected jobs.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-cad-card border border-cad-border rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-cad-border">
          <h3 className="text-sm font-semibold">Current Job Bindings</h3>
        </div>
        {mappings.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cad-border text-left text-xs text-cad-muted uppercase tracking-wider">
                <th className="px-4 py-2">Discord Role</th>
                <th className="px-4 py-2">Role ID</th>
                <th className="px-4 py-2">Job Target</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.id} className="border-b border-cad-border/50">
                  <td className="px-4 py-2 font-medium">{m.discord_role_name || '-'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-cad-muted">{m.discord_role_id}</td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-cad-ink">{renderJobTarget(m)}</span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => deleteMapping(m.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-6 text-sm text-cad-muted text-center">No job bindings configured</p>
        )}
      </div>

      <div className="bg-cad-card border border-cad-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Add Job Binding</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-cad-muted mb-1">Discord Role</label>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="">Select role...</option>
              {discordRoles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Job Name</label>
            <input
              type="text"
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="police"
            />
          </div>
          <div>
            <label className="block text-xs text-cad-muted mb-1">Job Rank (Optional)</label>
            <input
              type="number"
              min="0"
              value={jobGrade}
              onChange={e => setJobGrade(e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
              placeholder="Any"
            />
          </div>
          <div>
            <button
              onClick={addMapping}
              disabled={!canAddMapping}
              className="w-full px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
            >
              Add Binding
            </button>
          </div>
        </div>
        <p className="text-xs text-cad-muted mt-2">
          Leave rank blank to match <span className="font-mono">any rank</span> for that job. Example: map a role to <span className="font-mono">police</span> (any rank), or set rank <span className="font-mono">5</span> for a specific grade.
        </p>
        <p className="text-xs text-cad-muted mt-3">
          Removing a mapped role will queue the role-removal fallback job target (default: <span className="font-mono">unemployed</span> rank <span className="font-mono">0</span>).
        </p>
        {discordRoles.length === 0 && (
          <p className="text-xs text-cad-muted mt-2">Discord bot may not be connected. Roles will appear when the bot is online.</p>
        )}
      </div>
    </div>
  );
}
