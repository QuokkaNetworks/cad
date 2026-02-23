import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDepartment } from '../context/DepartmentContext';
import { useEventSource } from '../hooks/useEventSource';

const UNIT_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'enroute', label: 'En Route' },
  { value: 'on-scene', label: 'On Scene' },
  { value: 'unavailable', label: 'Unavailable' },
];

export default function Header() {
  const { user, logout, refreshUser } = useAuth();
  const { activeDepartment } = useDepartment();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [myUnit, setMyUnit] = useState(null);
  const [statusLoading, setStatusLoading] = useState('');
  const onDepartmentPage = /^\/(department|dispatch|units|map|search|bolos|warrants|records|call-details)(\/|$)/.test(location.pathname);

  const refreshAuth = useCallback(async () => {
    if (!user) return;
    await refreshUser();
  }, [user, refreshUser]);

  const refreshMyUnit = useCallback(async () => {
    if (!user) {
      setMyUnit(null);
      return;
    }

    try {
      const unit = await api.get('/api/units/me');
      setMyUnit(unit);
    } catch (err) {
      if (err?.status === 401) {
        await refreshUser();
      }
      setMyUnit(null);
    }
  }, [user, refreshUser]);

  const handleLiveUnitEvent = useCallback((payload) => {
    if (!user?.id) return;
    const eventUserId = payload?.unit?.user_id;
    if (!eventUserId || Number(eventUserId) === Number(user.id)) {
      refreshMyUnit();
    }
  }, [user?.id, refreshMyUnit]);

  useEventSource({
    'unit:online': handleLiveUnitEvent,
    'unit:offline': handleLiveUnitEvent,
    'unit:update': handleLiveUnitEvent,
    'sync:department': async () => {
      await refreshAuth();
      await refreshMyUnit();
    },
  });

  useEffect(() => {
    refreshMyUnit();
  }, [refreshMyUnit, activeDepartment?.id]);

  useEffect(() => {
    if (!user) return undefined;

    const pollId = setInterval(() => {
      refreshMyUnit();
    }, 15000);

    const onFocus = () => {
      refreshUser();
      refreshMyUnit();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onFocus();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(pollId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user, refreshMyUnit, refreshUser]);

  async function updateStatus(status) {
    if (!status || !myUnit) return;
    setStatusLoading(status);
    try {
      await api.patch('/api/units/me', { status });
      await refreshMyUnit();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setStatusLoading('');
    }
  }

  const departmentColor = String(activeDepartment?.color || '#3b82f6').trim() || '#3b82f6';
  const onActiveDeptDuty = !!(myUnit && activeDepartment && myUnit.department_id === activeDepartment.id);
  const showHeaderStatus = !!(activeDepartment && onDepartmentPage && onActiveDeptDuty);
  const showDepartmentBadge = !!(activeDepartment && onDepartmentPage);

  return (
    <header>
      <div className="sillitoe-bar" />
      <div className="cad-app-header-surface bg-cad-surface border-b border-cad-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-cad-gold tracking-wide">
            Quokka Networks Emergency Services CAD
          </h1>
          {showDepartmentBadge && (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md border"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.78)',
                borderColor: departmentColor,
                color: '#e2e8f0',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: departmentColor }} />
              {activeDepartment.short_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-end">
          {showHeaderStatus && (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                On Duty: {myUnit.callsign}{myUnit.sub_department_short_name ? ` (${myUnit.sub_department_short_name})` : ''}
              </span>
              <div className="flex items-center gap-1">
                {UNIT_STATUSES.map((status) => {
                  const selected = myUnit.status === status.value;
                  const disabled = selected || !!statusLoading;
                  return (
                    <button
                      key={status.value}
                      onClick={() => updateStatus(status.value)}
                      disabled={disabled}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        selected
                          ? 'bg-cad-accent/20 text-cad-accent-light cursor-default'
                          : 'bg-cad-surface text-cad-muted hover:text-cad-ink hover:bg-cad-card'
                      } ${statusLoading && !selected ? 'opacity-60' : ''}`}
                    >
                      {statusLoading === status.value ? '...' : status.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {user && (
            <div className="relative">
              <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-cad-card transition-colors"
              >
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-cad-card border border-cad-border" />
                )}
                <span className="text-sm text-cad-muted">{user.steam_name}</span>
                <span className="text-cad-muted text-xs">v</span>
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-44 bg-cad-surface border border-cad-border rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => { setOpen(false); navigate('/home'); }}
                    className="w-full text-left px-3 py-2 text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card rounded-t-lg transition-colors"
                  >
                    Home
                  </button>
                  <button
                    onClick={() => { setOpen(false); navigate('/settings'); }}
                    className="w-full text-left px-3 py-2 text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors"
                  >
                    Profile Settings
                  </button>
                  <button
                    onClick={() => { setOpen(false); logout(); }}
                    className="w-full text-left px-3 py-2 text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card rounded-b-lg transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
