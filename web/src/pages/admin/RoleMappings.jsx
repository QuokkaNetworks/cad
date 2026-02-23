import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import AdminPageHeader from '../../components/AdminPageHeader';

function renderTarget(mapping) {
  if (mapping.target_type === 'sub_department') {
    return `${mapping.sub_department_name} (${mapping.sub_department_short_name}) -> ${mapping.parent_department_name} (${mapping.parent_department_short_name})`;
  }
  return `${mapping.department_name} (${mapping.department_short_name})`;
}

export default function AdminRoleMappings() {
  const { key: locationKey } = useLocation();
  const navigate = useNavigate();
  const [mappings, setMappings] = useState([]);
  const [discordRoles, setDiscordRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [subDepartments, setSubDepartments] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [targetType, setTargetType] = useState('department');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [syncing, setSyncing] = useState(false);

  async function fetchData() {
    try {
      const [mappingsData, deptsData, subDeptsData] = await Promise.all([
        api.get('/api/admin/role-mappings'),
        api.get('/api/admin/departments'),
        api.get('/api/admin/sub-departments'),
      ]);
      setMappings((mappingsData || []).filter(m => m.target_type !== 'job'));
      setDepartments(deptsData);
      setSubDepartments(subDeptsData);

      try {
        const rolesData = await api.get('/api/admin/discord/roles');
        setDiscordRoles(rolesData);
      } catch {
        // Bot may not be running
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  useEffect(() => { fetchData(); }, [locationKey]);

  const targetOptions = useMemo(() => {
    if (targetType === 'sub_department') {
      return subDepartments.map(sd => ({
        id: sd.id,
        label: `${sd.name} (${sd.short_name}) - ${sd.department_name}`,
      }));
    }
    return departments.map(d => ({
      id: d.id,
      label: `${d.name} (${d.short_name})`,
    }));
  }, [targetType, departments, subDepartments]);

  const canAddMapping = useMemo(() => {
    if (!selectedRole) return false;
    return !!selectedTarget;
  }, [selectedRole, selectedTarget]);

  async function addMapping() {
    if (!canAddMapping) return;
    const role = discordRoles.find(r => r.id === selectedRole);
    try {
      const payload = {
        discord_role_id: selectedRole,
        discord_role_name: role?.name || '',
        target_type: targetType,
        target_id: selectedTarget,
      };

      await api.post('/api/admin/role-mappings', {
        ...payload,
      });
      setSelectedRole('');
      setSelectedTarget('');
      fetchData();
    } catch (err) {
      alert('Failed to create mapping: ' + err.message);
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

  return (
    <div className="max-w-6xl space-y-6">
      <AdminPageHeader
        title="Role Access Sync"
        subtitle="Map Discord roles to department and sub-department access."
        links={[
          { to: '/admin/job-bindings', label: 'Job Role Sync' },
          { to: '/admin/qbox-settings', label: 'QBox Settings' },
          { to: '/admin/settings', label: 'System Settings' },
        ]}
      />
      <div className="bg-cad-card border border-cad-border rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Discord Access Sync</p>
            <p className="text-xs text-cad-muted mt-1">
              Department/sub-department access is managed here. Job/grade Discord role mappings are managed in Job Role Sync.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/admin/job-bindings')}
              className="px-4 py-2 bg-cad-surface hover:bg-cad-card text-cad-ink rounded-lg text-sm font-medium border border-cad-border transition-colors"
            >
              Open Job Role Sync
            </button>
            <button
              onClick={syncAll}
              disabled={syncing}
              className="px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync All Members'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-cad-border">
          <h3 className="text-sm font-semibold">Current Mappings</h3>
        </div>
        {mappings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cad-border text-left text-xs text-cad-muted uppercase tracking-wider">
                  <th className="px-4 py-2">Discord Role</th>
                  <th className="px-4 py-2">Role ID</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.id} className="border-b border-cad-border/50">
                    <td className="px-4 py-2 font-medium">{m.discord_role_name || '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-cad-muted">{m.discord_role_id}</td>
                    <td className="px-4 py-2 text-xs uppercase text-cad-muted">{m.target_type}</td>
                    <td className="px-4 py-2">
                      {renderTarget(m)}
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
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-cad-muted text-center">No mappings configured</p>
        )}
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Add Mapping</h3>
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
            <label className="block text-xs text-cad-muted mb-1">Target Type</label>
            <select
              value={targetType}
              onChange={e => {
                setTargetType(e.target.value);
                setSelectedTarget('');
              }}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="department">Department</option>
              <option value="sub_department">Sub-Department</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-cad-muted mb-1">
              {targetType === 'sub_department' ? 'Sub-Department' : 'Department'}
            </label>
            <select
              value={selectedTarget}
              onChange={e => setSelectedTarget(e.target.value)}
              className="w-full bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
            >
              <option value="">Select...</option>
              {targetOptions.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={addMapping}
            disabled={!canAddMapping}
            className="px-4 py-2 bg-cad-accent hover:bg-cad-accent-light text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {discordRoles.length === 0 && (
          <p className="text-xs text-cad-muted mt-2">Discord bot may not be connected. Roles will appear when the bot is online.</p>
        )}
      </div>
    </div>
  );
}
