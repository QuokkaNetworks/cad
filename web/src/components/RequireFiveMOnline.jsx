import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDepartment } from '../context/DepartmentContext';

export default function RequireFiveMOnline({ children, featureLabel = 'this area' }) {
  const { user, isFiveMOnline } = useAuth();
  const { activeDepartment } = useDepartment();
  const isDispatchWorkspace = !!activeDepartment?.is_dispatch;

  const reasonLabel = useMemo(() => {
    const reason = String(user?.fivem_online_reason || '').trim();
    if (reason === 'stale_link') return 'Your in-game connection heartbeat is stale.';
    if (reason === 'no_link') return 'No active in-game session is linked to your CAD account.';
    if (reason === 'missing_steam_id') return 'Your CAD account is missing a Steam identifier.';
    return 'You are not currently connected to the game server.';
  }, [user?.fivem_online_reason]);

  if (isFiveMOnline || isDispatchWorkspace) return children;

  return (
    <div className="h-full flex items-center justify-center py-8">
      <div className="w-full max-w-xl rounded-2xl border border-amber-500/25 bg-cad-card p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-300 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.03 13.9A1 1 0 003.13 19h17.74a1 1 0 00.87-1.24l-8.03-13.9a1 1 0 00-1.74 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-cad-ink">In-Game Connection Required</h2>
            <p className="text-sm text-cad-muted mt-2">
              You must be online in the FiveM server to access {featureLabel}.
            </p>
            <p className="text-xs text-cad-muted mt-2">{reasonLabel}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Link
                to="/department"
                className="px-3 py-1.5 rounded bg-cad-accent text-white text-sm font-medium hover:bg-cad-accent-light transition-colors"
              >
                Back to Department Home
              </Link>
              <Link
                to="/home"
                className="px-3 py-1.5 rounded border border-cad-border bg-cad-surface text-cad-ink text-sm hover:border-cad-accent/40 transition-colors"
              >
                Department Selection
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
