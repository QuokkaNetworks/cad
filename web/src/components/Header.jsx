import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useDepartment } from '../context/DepartmentContext';
import { useEventSource } from '../hooks/useEventSource';

const UNIT_STATUSES = [
  { value: 'available',   label: 'Available',   color: '#10b981' },
  { value: 'busy',        label: 'Busy',         color: '#f59e0b' },
  { value: 'enroute',     label: 'En Route',     color: '#3b82f6' },
  { value: 'on-scene',    label: 'On Scene',     color: '#8b5cf6' },
  { value: 'unavailable', label: 'Unavailable',  color: '#6b7280' },
];

const HEADER_NAV_ITEMS = [
  { to: '/home', label: 'Home' },
  { to: '/departments', label: 'Departments' },
  { to: '/rules', label: 'Rules' },
];

function colorWithAlpha(color, alpha) {
  const hex = String(color || '').match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return `rgba(0,82,194,${alpha})`;
  const raw = hex[1];
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  const int = Number.parseInt(full, 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

export default function Header() {
  const { user, isAdmin, canManageAnnouncements, logout, refreshUser } = useAuth();
  const { activeDepartment } = useDepartment();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [myUnit, setMyUnit] = useState(null);
  const [statusLoading, setStatusLoading] = useState('');
  const menuRef = useRef(null);

  const onDepartmentPage = /^\/(department|dispatch|units|map|search|bolos|warrants|records|call-details|arrest-reports|infringements|incidents|evidence|ems-|fire-)(\/|$)/.test(location.pathname);

  const refreshAuth = useCallback(async () => {
    if (!user) return;
    await refreshUser();
  }, [user, refreshUser]);

  const refreshMyUnit = useCallback(async () => {
    if (!user) { setMyUnit(null); return; }
    try {
      const unit = await api.get('/api/units/me');
      setMyUnit(unit);
    } catch (err) {
      if (err?.status === 401) await refreshUser();
      setMyUnit(null);
    }
  }, [user, refreshUser]);

  const handleLiveUnitEvent = useCallback((payload) => {
    if (!user?.id) return;
    const eventUserId = payload?.unit?.user_id;
    if (!eventUserId || Number(eventUserId) === Number(user.id)) refreshMyUnit();
  }, [user?.id, refreshMyUnit]);

  useEventSource({
    'unit:online': handleLiveUnitEvent,
    'unit:offline': handleLiveUnitEvent,
    'unit:update': handleLiveUnitEvent,
    'sync:department': async () => { await refreshAuth(); await refreshMyUnit(); },
  });

  useEffect(() => { refreshMyUnit(); }, [refreshMyUnit, activeDepartment?.id]);

  useEffect(() => {
    if (!user) return undefined;
    const pollId = setInterval(refreshMyUnit, 15000);
    const onFocus = () => { refreshUser(); refreshMyUnit(); };
    const onVis = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(pollId); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); };
  }, [user, refreshMyUnit, refreshUser]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  async function updateStatus(status) {
    if (!status || !myUnit || statusLoading) return;
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

  const deptColor = String(activeDepartment?.color || '#0052C2').trim() || '#0052C2';
  const onActiveDeptDuty = !!(myUnit && activeDepartment && myUnit.department_id === activeDepartment.id);
  const showStatus = !!(activeDepartment && onDepartmentPage && onActiveDeptDuty);
  const showDeptBadge = !!(activeDepartment && onDepartmentPage);
  return (
    <header className="flex-none">
      {/* Sillitoe tartan stripe */}
      <div className="sillitoe-bar" />

      {/* Main header bar */}
      <div className="cad-app-header-surface bg-cad-surface border-b border-cad-border h-12 px-4 flex items-center gap-3">

        {/* ── Left: brand + dept badge ─────────────────── */}
        <div className="flex items-center gap-2.5 flex-none min-w-0">
          <button
            onClick={() => navigate('/home')}
            className="text-sm font-bold text-cad-gold tracking-wide hover:text-cad-gold/80 transition-colors truncate"
            title="Go to home"
          >
            Quokka Networks CAD
          </button>

          {showDeptBadge && (
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider flex-shrink-0"
              style={{
                borderColor: colorWithAlpha(deptColor, 0.45),
                backgroundColor: colorWithAlpha(deptColor, 0.12),
                color: '#dce8ff',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: deptColor, boxShadow: `0 0 5px ${colorWithAlpha(deptColor, 0.7)}` }}
              />
              {activeDepartment.short_name}
            </span>
          )}
        </div>

        {/* ── Centre: unit status strip (only when on duty) ── */}
        <nav className="hidden sm:flex items-center gap-1 flex-none" aria-label="CAD primary navigation">
          {HEADER_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => {
                const active = isActive || (item.to === '/departments' && onDepartmentPage);
                return (
                `px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  active
                    ? 'bg-cad-accent/15 text-cad-accent-light border-cad-accent/25'
                    : 'text-cad-muted hover:text-cad-ink hover:bg-cad-card border-transparent'
                }`
                );
              }}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {showStatus && (
          <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0 overflow-hidden">
            {/* Callsign chip */}
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 flex-shrink-0">
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
                style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }}
              />
              <span className="text-xs font-mono font-semibold text-emerald-300 truncate max-w-[120px]">
                {myUnit.callsign}
                {myUnit.sub_department_short_name ? ` · ${myUnit.sub_department_short_name}` : ''}
              </span>
            </div>

            {/* Status selector — current status shown prominently, others as pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {UNIT_STATUSES.map((s) => {
                const selected = myUnit.status === s.value;
                const loading = statusLoading === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => updateStatus(s.value)}
                    disabled={selected || !!statusLoading}
                    title={selected ? `Current status: ${s.label}` : `Set status to ${s.label}`}
                    className={`text-[11px] px-2 py-0.5 rounded-md border font-medium transition-all ${
                      selected
                        ? 'cursor-default'
                        : 'hover:-translate-y-0.5 hover:shadow-sm'
                    } ${statusLoading && !selected ? 'opacity-40' : ''}`}
                    style={
                      selected
                        ? {
                            borderColor: colorWithAlpha(s.color, 0.5),
                            backgroundColor: colorWithAlpha(s.color, 0.18),
                            color: s.color,
                          }
                        : {
                            borderColor: 'rgba(42,58,78,0.8)',
                            backgroundColor: 'rgba(17,24,39,0.5)',
                            color: '#7a8ea6',
                          }
                    }
                  >
                    {loading ? '…' : s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Spacer when no status strip */}
        {!showStatus && <div className="flex-1" />}

        {/* ── Right: user menu ──────────────────────────── */}
        {user && (
          <div className="relative flex-none" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-cad-card transition-colors"
              aria-label="User menu"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full ring-1 ring-cad-border" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-cad-card border border-cad-border flex items-center justify-center text-[10px] text-cad-muted font-semibold">
                  {String(user.steam_name || '?')[0].toUpperCase()}
                </div>
              )}
              <span className="text-xs text-cad-muted hidden sm:block max-w-[120px] truncate">{user.steam_name}</span>
              <svg className={`w-3 h-3 text-cad-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-cad-surface border border-cad-border rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                {/* User info header */}
                <div className="px-3 py-2 border-b border-cad-border">
                  <p className="text-xs font-semibold text-cad-ink truncate">{user.steam_name}</p>
                  {user.discord_name && (
                    <p className="text-[10px] text-cad-muted truncate mt-0.5">Discord: {user.discord_name}</p>
                  )}
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/home'); }}
                  className="w-full text-left px-3 py-2 text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10" />
                  </svg>
                  Home
                </button>
                {canManageAnnouncements && (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/admin/announcements'); }}
                    className="w-full text-left px-3 py-2 text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h6M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                    </svg>
                    Announcements
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                  className="w-full text-left px-3 py-2 text-sm text-cad-muted hover:text-cad-ink hover:bg-cad-card transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Profile Settings
                </button>
                {isAdmin && (
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/admin'); }}
                    className="w-full text-left px-3 py-2 text-sm text-cad-gold hover:text-cad-gold/90 hover:bg-cad-card transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Admin Panel
                  </button>
                )}
                <div className="border-t border-cad-border my-1" />
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
