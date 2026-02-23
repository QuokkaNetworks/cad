import Modal from './Modal';
import { formatDateTimeAU } from '../utils/dateTime';

function formatDuration(seconds) {
  const totalSeconds = Number(seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '-';
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function buildStatRows(summary) {
  const stats = summary?.stats || {};
  const candidates = [
    { key: 'call_assignments', label: 'Call Assignments' },
    { key: 'call_unassignments', label: 'Call Unassignments' },
    { key: 'calls_created', label: 'Calls Created' },
    { key: 'traffic_stops_created', label: 'Traffic Stops Logged' },
    { key: 'records_created', label: 'Reports / Records Filed' },
    { key: 'shift_notes_created', label: 'Shift Notes Added' },
    { key: 'warrants_created', label: 'Warrants Created' },
    { key: 'bolos_created', label: 'BOLOs Created' },
    { key: 'patient_analyses_created', label: 'Patient Analyses Created' },
    { key: 'patient_analyses_updated', label: 'Patient Analyses Updated' },
    { key: 'pursuit_outcomes_logged', label: 'Pursuit Outcomes Logged' },
    { key: 'evidence_created', label: 'Evidence Items Logged' },
  ];

  return candidates
    .map((item) => ({ ...item, value: Math.max(0, Number(stats?.[item.key] || 0)) }))
    .filter((item) => item.value > 0);
}

export default function OffDutySummaryModal({ open, summary, onClose }) {
  const statRows = buildStatRows(summary);
  const unit = summary?.unit || {};
  const activeCall = summary?.active_call_at_signoff || null;

  return (
    <Modal open={open} onClose={onClose} title="Shift Summary" wide>
      <div className="space-y-4">
        <div className="bg-cad-card border border-cad-border rounded-lg p-4">
          <h3 className="text-base font-semibold">Thanks for being on duty.</h3>
          <p className="text-sm text-cad-muted mt-1">
            You were on duty for <span className="text-cad-ink font-medium">{formatDuration(summary?.duration_seconds)}</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-cad-card border border-cad-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Unit</p>
            <p className="mt-1 text-sm text-cad-ink font-medium">
              {unit.callsign || '-'}
              {unit.sub_department_short_name ? ` (${unit.sub_department_short_name})` : ''}
            </p>
          </div>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Department</p>
            <p className="mt-1 text-sm text-cad-ink">{unit.department_short_name || unit.department_name || '-'}</p>
          </div>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Shift Started</p>
            <p className="mt-1 text-sm text-cad-ink">{formatDateTimeAU(summary?.shift_started_at, '-', false)}</p>
          </div>
          <div className="bg-cad-card border border-cad-border rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-cad-muted">Final Status</p>
            <p className="mt-1 text-sm text-cad-ink">{String(unit.status || 'unknown')}</p>
          </div>
        </div>

        {activeCall && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs uppercase tracking-wider text-amber-300">Active Call At Sign-Off</p>
            <p className="mt-1 text-sm text-amber-100 font-medium">
              #{activeCall.id} {activeCall.title || 'Active Call'}
            </p>
            <p className="text-xs text-amber-200/80 mt-1">
              {activeCall.location || 'No location'} | Priority {activeCall.priority || '-'}
            </p>
          </div>
        )}

        <div className="bg-cad-card border border-cad-border rounded-lg p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="text-sm font-semibold text-cad-muted uppercase tracking-wider">Shift Stats</h4>
          </div>
          {statRows.length === 0 ? (
            <p className="text-sm text-cad-muted">No tracked shift actions were recorded during this duty session.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {statRows.map((row) => (
                <div key={row.key} className="rounded border border-cad-border bg-cad-surface px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-cad-muted">{row.label}</span>
                  <span className="text-sm font-semibold text-cad-ink">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded bg-cad-accent hover:bg-cad-accent-light text-white text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
