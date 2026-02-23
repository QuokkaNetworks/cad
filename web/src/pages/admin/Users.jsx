import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import AdminPageHeader from '../../components/AdminPageHeader';

export default function AdminUsers() {
  const { key: locationKey } = useLocation();
  const [users, setUsers] = useState([]);
  const [activeLinks, setActiveLinks] = useState([]);
  const [characterInputs, setCharacterInputs] = useState({});
  const [savingCharacterFor, setSavingCharacterFor] = useState(null);
  const [search, setSearch] = useState('');

  async function fetchUsers() {
    try {
      const data = await api.get('/api/admin/users');
      setUsers(data);
      const nextInputs = {};
      for (const user of data) {
        nextInputs[user.id] = user.preferred_citizen_id || '';
      }
      setCharacterInputs(nextInputs);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  async function fetchLinks() {
    try {
      const links = await api.get('/api/admin/fivem/links');
      setActiveLinks(Array.isArray(links) ? links : []);
    } catch {
      setActiveLinks([]);
    }
  }

  useEffect(() => {
    fetchUsers();
    fetchLinks();
  }, [locationKey]);

  async function toggleAdmin(userId, isAdmin) {
    try {
      await api.patch(`/api/admin/users/${userId}`, { is_admin: !isAdmin });
      fetchUsers();
    } catch (err) {
      alert('Failed to update user: ' + err.message);
    }
  }

  async function toggleBan(userId, isBanned) {
    try {
      await api.patch(`/api/admin/users/${userId}`, { is_banned: !isBanned });
      fetchUsers();
    } catch (err) {
      alert('Failed to update user: ' + err.message);
    }
  }

  async function savePreferredCharacter(userId) {
    try {
      setSavingCharacterFor(userId);
      await api.patch(`/api/admin/users/${userId}`, {
        preferred_citizen_id: characterInputs[userId] || '',
      });
      fetchUsers();
    } catch (err) {
      alert('Failed to update preferred character: ' + err.message);
    } finally {
      setSavingCharacterFor(null);
    }
  }

  const filtered = users.filter(u =>
    u.steam_name.toLowerCase().includes(search.toLowerCase()) ||
    u.discord_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.steam_id.includes(search)
  );

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="User Management"
        subtitle="Manage user access, roles, bans, and department membership."
        links={[
          { to: '/admin/departments', label: 'Departments' },
          { to: '/admin/role-mappings', label: 'Role Access Sync' },
          { to: '/admin/audit-log', label: 'Audit Log' },
        ]}
      />

      <div className="bg-cad-card border border-cad-border rounded-xl p-4">
        <label className="block text-xs uppercase tracking-wider text-cad-muted mb-2">Search Users</label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Steam name, Discord name, or Steam ID..."
          className="w-full max-w-lg bg-cad-surface border border-cad-border rounded px-3 py-2 text-sm focus:outline-none focus:border-cad-accent"
        />
      </div>

      <div className="bg-cad-card border border-cad-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cad-border text-left text-xs text-cad-muted uppercase tracking-wider">
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Steam ID</th>
              <th className="px-3 py-2">Discord</th>
              <th className="px-3 py-2">Preferred Character</th>
              <th className="px-3 py-2">Departments</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <tr key={user.id} className={`border-b border-cad-border/50 ${user.is_banned ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {user.avatar_url && <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full" />}
                    <span className="font-medium">{user.steam_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-cad-muted">{user.steam_id}</td>
                <td className="px-3 py-2 text-cad-muted">{user.discord_name || '-'}</td>
                <td className="px-3 py-2">
                  {(() => {
                    const linkedCharacters = Array.from(new Map(
                      activeLinks
                        .filter(link => link.cad_user_id === user.id && String(link.citizen_id || '').trim())
                        .map(link => [String(link.citizen_id || '').trim(), link])
                    ).values());
                    return (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={characterInputs[user.id] || ''}
                      onChange={e => setCharacterInputs(prev => ({ ...prev, [user.id]: e.target.value }))}
                      placeholder="citizenid (manual or quick-pick)"
                      className="w-40 bg-cad-surface border border-cad-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-cad-accent"
                    />
                    <div className="flex flex-wrap gap-1">
                      {linkedCharacters.map(link => (
                          <button
                            key={`${user.id}-${link.steam_id}-${link.citizen_id}`}
                            onClick={() => setCharacterInputs(prev => ({ ...prev, [user.id]: link.citizen_id }))}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-cad-card border border-cad-border text-cad-muted hover:text-cad-ink"
                            title={`#${link.game_id || '?'} ${link.player_name || 'Unknown'}`}
                          >
                            {link.citizen_id}
                          </button>
                        ))}
                    </div>
                    <button
                      onClick={() => savePreferredCharacter(user.id)}
                      disabled={savingCharacterFor === user.id}
                      className="text-[10px] px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors disabled:opacity-50"
                    >
                      {savingCharacterFor === user.id ? 'Saving...' : 'Save Character'}
                    </button>
                  </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {user.departments?.map(d => (
                      <span key={d.id} className="text-xs px-1.5 py-0.5 rounded bg-cad-surface" style={{ color: d.color }}>
                        {d.short_name}
                      </span>
                    ))}
                    {(!user.departments || user.departments.length === 0) && <span className="text-xs text-cad-muted">-</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {user.is_admin ? (
                    <span className="text-xs px-2 py-0.5 bg-cad-gold/20 text-cad-gold rounded">Admin</span>
                  ) : (
                    <span className="text-xs text-cad-muted">User</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={() => toggleAdmin(user.id, user.is_admin)}
                      className="text-xs px-2 py-1 bg-cad-surface text-cad-muted hover:text-cad-ink rounded transition-colors"
                    >
                      {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    <button
                      onClick={() => toggleBan(user.id, user.is_banned)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        user.is_banned
                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                      }`}
                    >
                      {user.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
