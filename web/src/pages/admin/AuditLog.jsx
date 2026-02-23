import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import AdminPageHeader from '../../components/AdminPageHeader';
import { formatDateTimeAU } from '../../utils/dateTime';

export default function AdminAuditLog() {
  const { key: locationKey } = useLocation();
  const [entries, setEntries] = useState([]);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  async function fetchLog() {
    try {
      const data = await api.get(`/api/admin/audit-log?limit=${limit}&offset=${offset}`);
      setEntries(data);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    }
  }

  useEffect(() => { fetchLog(); }, [offset, locationKey]);

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Audit Log"
        subtitle="Review administrative and system activity events."
        links={[
          { to: '/admin/users', label: 'Users' },
          { to: '/admin/departments', label: 'Departments' },
          { to: '/admin/settings', label: 'System Settings' },
        ]}
      />

      <div className="bg-cad-card border border-cad-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cad-border text-left text-xs text-cad-muted uppercase tracking-wider">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id} className="border-b border-cad-border/50">
                <td className="px-3 py-2 text-xs text-cad-muted whitespace-nowrap">
                  {formatDateTimeAU(entry.created_at ? `${entry.created_at}Z` : '', '-')}
                </td>
                <td className="px-3 py-2">{entry.user_name || '-'}</td>
                <td className="px-3 py-2 font-mono text-xs">{entry.action}</td>
                <td className="px-3 py-2 text-xs text-cad-muted max-w-md truncate">{entry.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-3 py-1.5 text-sm bg-cad-card text-cad-muted rounded disabled:opacity-30 hover:bg-cad-border transition-colors"
        >
          Previous
        </button>
        <span className="text-sm text-cad-muted">Showing {offset + 1} - {offset + entries.length}</span>
        <button
          onClick={() => setOffset(offset + limit)}
          disabled={entries.length < limit}
          className="px-3 py-1.5 text-sm bg-cad-card text-cad-muted rounded disabled:opacity-30 hover:bg-cad-border transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
