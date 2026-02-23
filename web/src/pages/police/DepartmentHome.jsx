import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import GoOnDutyModal from '../../components/GoOnDutyModal';
import OffDutySummaryModal from '../../components/OffDutySummaryModal';
import { useAuth } from '../../context/AuthContext';
import { useDepartment } from '../../context/DepartmentContext';
import { useEventSource } from '../../hooks/useEventSource';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';
import { formatDateAU, formatTimeAU } from '../../utils/dateTime';

// Mirror the sidebar's visibility rules so hidden items don't appear on the home screen.
// Route → whether it requires FiveM to be online (same list as requiresFiveMOnlineForNavItem in Sidebar.jsx)
const FIVEM_REQUIRED_ROUTES = new Set(['/incidents', '/records', '/arrest-reports', '/warrants', '/evidence']);
// Routes that only appear when the user is on duty in this department
const DUTY_REQUIRED_ROUTES = new Set(['/units', '/dispatch']);

const DEFAULT_STATS = Object.freeze({
  active_calls: 0,
  urgent_calls: 0,
  on_duty_units: 0,
  available_units: 0,
  assigned_units: 0,
  active_bolos: 0,
  active_warrants: 0,
});
const REFRESH_DEBOUNCE_MS = 350;

function getDefaultSlogan(department, layoutType) {
  if (department?.is_dispatch) return 'Coordinating every response in real time.';
  if (layoutType === DEPARTMENT_LAYOUT.PARAMEDICS) return 'Care when every second counts.';
  if (layoutType === DEPARTMENT_LAYOUT.FIRE) return 'Ready to respond, built to protect.';
  return 'Protecting the community with professionalism and integrity.';
}

function normalizeUnitsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.units)) return payload.units;
  return [];
}

function normalizeCallsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  return [];
}

function normalizeBolosPayload(payload) {
  if (Array.isArray(payload)) return payload;
  return [];
}

function colorWithAlpha(color, alpha, fallback = `rgba(0,82,194,${alpha})`) {
  const value = String(color || '').trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return fallback;
  const raw = hex[1];
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const int = Number.parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Live stat cell in the top strip
function StatCell({ label, value, tone = 'default', loading, pulse }) {
  const tones = {
    default: { num: 'text-cad-ink', bg: 'border-cad-border bg-cad-surface/50' },
    blue: { num: 'text-sky-400', bg: 'border-sky-500/20 bg-sky-500/5' },
    red: { num: 'text-red-400', bg: 'border-red-500/20 bg-red-500/5' },
    green: { num: 'text-emerald-400', bg: 'border-emerald-500/20 bg-emerald-500/5' },
    amber: { num: 'text-amber-300', bg: 'border-amber-500/20 bg-amber-500/5' },
  };
  const t = tones[tone] || tones.default;

  return (
    <div className={`relative flex-1 min-w-0 rounded-xl border px-3.5 py-3 ${t.bg}`}>
      {pulse && value > 0 && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(248,113,113,0.8)' }} />
      )}
      <p className="text-[9px] uppercase tracking-[0.18em] text-cad-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${t.num}`}>
        {loading ? <span className="text-cad-muted text-xl">–</span> : value}
      </p>
    </div>
  );
}

// Section heading
function SectionHeading({ children }) {
  return (
    <p className="text-[9px] uppercase tracking-[0.2em] text-cad-muted mb-2">{children}</p>
  );
}

// A navigation action button in the quick-launch grid
function ActionButton({ label, sublabel, route, variant = 'default', accent, navigate }) {
  if (variant === 'primary') {
    return (
      <button
        type="button"
        onClick={() => navigate(route)}
        className="relative group col-span-2 flex items-center gap-3 rounded-xl border px-4 py-3.5 text-white font-semibold text-sm overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl"
        style={{
          borderColor: colorWithAlpha(accent, 0.5),
          background: `linear-gradient(135deg, ${accent}, ${colorWithAlpha(accent, 0.7)})`,
          boxShadow: `0 8px 24px ${colorWithAlpha(accent, 0.3)}`,
        }}
      >
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="truncate">{label}</div>
          {sublabel && <div className="text-xs font-normal text-white/70 mt-0.5 truncate">{sublabel}</div>}
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      className="flex items-center gap-2.5 rounded-xl border border-cad-border bg-cad-surface/60 hover:border-cad-border hover:bg-cad-surface px-3.5 py-2.5 text-left text-sm text-cad-ink transition-all hover:-translate-y-0.5 group"
      style={{ '--hover-border': colorWithAlpha(accent, 0.4) }}
      onMouseEnter={e => e.currentTarget.style.borderColor = colorWithAlpha(accent, 0.35)}
      onMouseLeave={e => e.currentTarget.style.borderColor = ''}
    >
      <svg className="w-3.5 h-3.5 text-cad-muted group-hover:text-cad-ink transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      <span className="truncate">{label}</span>
    </button>
  );
}

// A department-specific panel card
function PanelCard({ panel, accent, navigate }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: colorWithAlpha(accent, 0.18, 'rgba(42,58,78,1)') }}
    >
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-3"
        style={{
          borderColor: colorWithAlpha(accent, 0.15, 'rgba(42,58,78,1)'),
          background: colorWithAlpha(accent, 0.07),
        }}
      >
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-cad-muted">{panel.eyebrow}</p>
          <p className="text-sm font-semibold text-cad-ink mt-0.5">{panel.title}</p>
        </div>
        {panel.value && (
          <p className={`text-3xl font-bold tabular-nums ${panel.valueTone || 'text-cad-accent-light'}`}>
            {panel.value}
          </p>
        )}
      </div>
      <div className="px-4 py-3 bg-cad-card/60">
        <p className="text-xs text-cad-muted leading-relaxed mb-3">{panel.body}</p>
        <div className="flex flex-wrap gap-2">
          {panel.actions.map((action) => (
            <button
              key={`${panel.key}:${action.route}`}
              type="button"
              onClick={() => navigate(action.route)}
              className={
                action.variant === 'primary'
                  ? 'px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors'
                  : 'px-3 py-1.5 rounded-lg bg-cad-surface border border-cad-border text-cad-ink text-xs hover:bg-cad-card transition-colors'
              }
              style={action.variant === 'primary' ? { backgroundColor: accent, boxShadow: `0 4px 12px ${colorWithAlpha(accent, 0.3)}` } : undefined}
            >
              {action.variant === 'primary' ? `+ ${action.label}` : action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DepartmentHome() {
  const navigate = useNavigate();
  const { isFiveMOnline } = useAuth();
  const { activeDepartment } = useDepartment();
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [myUnit, setMyUnit] = useState(null);
  const [showOnDutyModal, setShowOnDutyModal] = useState(false);
  const [offDutySummary, setOffDutySummary] = useState(null);
  const [onDutyLoading, setOnDutyLoading] = useState(false);
  const [offDutyLoading, setOffDutyLoading] = useState(false);
  const refreshTimerRef = useRef(null);
  const requestInFlightRef = useRef(false);

  const deptId = activeDepartment?.id;
  const isDispatch = !!activeDepartment?.is_dispatch;
  const layoutType = getDepartmentLayoutType(activeDepartment);
  const isPoliceDepartment = layoutType === DEPARTMENT_LAYOUT.LAW_ENFORCEMENT;
  const isFireDepartment = layoutType === DEPARTMENT_LAYOUT.FIRE;
  const isEmsDepartment = layoutType === DEPARTMENT_LAYOUT.PARAMEDICS;
  const slogan = String(activeDepartment?.slogan || '').trim() || getDefaultSlogan(activeDepartment, layoutType);
  const deptColor = String(activeDepartment?.color || '#0052C2').trim() || '#0052C2';
  const deptLogo = String(activeDepartment?.icon || '').trim();
  const onActiveDeptDuty = !!(myUnit && activeDepartment && myUnit.department_id === activeDepartment.id);
  const onOtherDeptDuty = !!(myUnit && activeDepartment && myUnit.department_id !== activeDepartment.id);

  const refreshMyUnit = useCallback(async () => {
    try {
      const unit = await api.get('/api/units/me');
      setMyUnit(unit);
    } catch {
      setMyUnit(null);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    if (!deptId || requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setError('');
    try {
      const callsRequest = isDispatch
        ? api.get(`/api/calls?department_id=${deptId}&dispatch=true`)
        : api.get(`/api/calls?department_id=${deptId}`);
      const unitsRequest = isDispatch
        ? api.get('/api/units/dispatchable')
        : api.get(`/api/units?department_id=${deptId}`);
      const bolosRequest = isPoliceDepartment
        ? api.get(`/api/bolos?department_id=${deptId}`)
        : Promise.resolve([]);
      const warrantsRequest = isPoliceDepartment
        ? api.get(`/api/warrants?department_id=${deptId}`)
        : Promise.resolve([]);

      const [callsPayload, unitsPayload, bolosPayload, warrantsPayload] = await Promise.all([
        callsRequest, unitsRequest, bolosRequest, warrantsRequest,
      ]);
      const calls = normalizeCallsPayload(callsPayload);
      const units = normalizeUnitsPayload(unitsPayload);
      const bolos = normalizeBolosPayload(bolosPayload);
      const warrants = Array.isArray(warrantsPayload) ? warrantsPayload : [];

      const activeCalls = calls.filter(call => String(call?.status || '').toLowerCase() !== 'closed');
      const urgentCalls = activeCalls.filter((call) => {
        if (String(call?.priority || '') === '1') return true;
        return /000/i.test(String(call?.job_code || '')) || /000/i.test(String(call?.title || ''));
      });
      const availableUnits = units.filter(unit => String(unit?.status || '').toLowerCase() === 'available');
      const assignedUnits = activeCalls.reduce((total, call) => (
        total + (Array.isArray(call?.assigned_units) ? call.assigned_units.length : 0)
      ), 0);

      setStats({
        active_calls: activeCalls.length,
        urgent_calls: urgentCalls.length,
        on_duty_units: units.length,
        available_units: availableUnits.length,
        assigned_units: assignedUnits,
        active_bolos: bolos.length,
        active_warrants: warrants.length,
      });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || 'Failed to load department stats');
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  }, [deptId, isDispatch, isPoliceDepartment]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(fetchStats, REFRESH_DEBOUNCE_MS);
  }, [fetchStats]);

  useEffect(() => {
    setLoading(true);
    setStats(DEFAULT_STATS);
    setLastUpdated(null);
    fetchStats();
    refreshMyUnit();
  }, [fetchStats, refreshMyUnit]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const handleUnitEvent = useCallback(() => {
    refreshMyUnit();
    scheduleRefresh();
  }, [refreshMyUnit, scheduleRefresh]);

  useEventSource({
    'unit:online': handleUnitEvent,
    'unit:offline': handleUnitEvent,
    'unit:update': handleUnitEvent,
    'call:create': scheduleRefresh,
    'call:update': scheduleRefresh,
    'call:close': scheduleRefresh,
    'call:assign': scheduleRefresh,
    'call:unassign': scheduleRefresh,
    'bolo:create': scheduleRefresh,
    'bolo:resolve': scheduleRefresh,
    'bolo:cancel': scheduleRefresh,
    'warrant:create': scheduleRefresh,
    'warrant:serve': scheduleRefresh,
    'warrant:cancel': scheduleRefresh,
    'sync:department': handleUnitEvent,
  });

  async function goOffDuty() {
    setOffDutyLoading(true);
    try {
      const response = await api.delete('/api/units/me');
      setMyUnit(null);
      setOffDutySummary(response?.summary || null);
      scheduleRefresh();
    } catch (err) {
      alert('Failed to go off duty: ' + err.message);
    } finally {
      setOffDutyLoading(false);
    }
  }

  async function goOnDuty() {
    if (!activeDepartment) return;
    if (!activeDepartment.is_dispatch) {
      setShowOnDutyModal(true);
      return;
    }
    setOnDutyLoading(true);
    try {
      const unit = await api.post('/api/units/me', {
        callsign: 'DISPATCH',
        department_id: activeDepartment.id,
      });
      setMyUnit(unit);
      scheduleRefresh();
    } catch (err) {
      alert('Failed to go on duty: ' + err.message);
    } finally {
      setOnDutyLoading(false);
    }
  }

  const clockDateLabel = useMemo(() => formatDateAU(now, '-'), [now]);
  const clockTimeLabel = useMemo(() => formatTimeAU(now, '-', true), [now]);

  const departmentTypeLabel = isDispatch
    ? 'Dispatch'
    : (isFireDepartment ? 'Fire & Rescue' : (isEmsDepartment ? 'Paramedic' : 'Law Enforcement'));
  const unitLabel = isFireDepartment ? 'Crew' : 'Unit';
  const primaryBoardRoute = isDispatch ? '/dispatch' : '/units';

  const quickActions = (() => {
    if (isDispatch) {
      return [
        { label: 'Dispatch Board', sublabel: 'Live call management', route: '/dispatch', variant: 'primary' },
        { label: 'Lookup', route: '/search' },
        { label: 'Units', route: '/units' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    if (isPoliceDepartment) {
      return [
        { label: 'Response Board', sublabel: 'Live unit & call management', route: '/units', variant: 'primary' },
        { label: 'Lookup', route: '/search' },
        { label: 'Records', route: '/records' },
        { label: 'Arrest Reports', route: '/arrest-reports' },
        { label: 'Warrants', route: '/warrants' },
        { label: 'POIs', route: '/bolos' },
        { label: 'Evidence', route: '/evidence' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    if (isEmsDepartment) {
      return [
        { label: 'Response Board', sublabel: 'Live crew & job management', route: '/units', variant: 'primary' },
        { label: 'Treatment Log', route: '/ems-treatment' },
        { label: 'Transport Tracker', route: '/ems-transport' },
        { label: 'Patient Reports', route: '/records' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    if (isFireDepartment) {
      return [
        { label: 'Response Board', sublabel: 'Live appliance & incident management', route: '/units', variant: 'primary' },
        { label: 'Incident Reports', route: '/records' },
        { label: 'Lookup', route: '/search' },
        { label: 'Apparatus', route: '/fire-apparatus' },
        { label: 'Pre-Plans', route: '/fire-preplans' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    return [
      { label: 'Response Board', sublabel: 'Live operational overview', route: primaryBoardRoute, variant: 'primary' },
      { label: 'Lookup', route: '/search' },
      { label: 'Incidents', route: '/incidents' },
    ];
  })();

  const departmentPanels = (() => {
    if (isPoliceDepartment) {
      return [
        {
          key: 'warrants',
          eyebrow: 'Warrants',
          title: 'Outstanding warrant workload',
          value: loading ? '–' : String(stats.active_warrants),
          valueTone: 'text-amber-300',
          body: 'Create, review, and action outstanding warrants for active investigations.',
          actions: [
            { label: 'New Warrant', route: '/warrants?new=1', variant: 'primary' },
            { label: 'View Warrants', route: '/warrants' },
          ],
        },
        {
          key: 'pois',
          eyebrow: 'POIs',
          title: 'Persons & vehicles of interest',
          value: loading ? '–' : String(stats.active_bolos),
          valueTone: 'text-sky-400',
          body: 'Track POIs linked to investigations, vehicles, and current operational activity.',
          actions: [
            { label: 'New POI', route: '/bolos?new=1', variant: 'primary' },
            { label: 'View POIs', route: '/bolos' },
            { label: 'Evidence', route: '/evidence' },
          ],
        },
        {
          key: 'casework',
          eyebrow: 'Casework',
          title: 'Records & arrest workflow',
          body: 'Use arrest reports for draft and supervisor review, then finalise to apply fines or custodial outcomes.',
          actions: [
            { label: 'Records', route: '/records' },
            { label: 'Arrest Reports', route: '/arrest-reports' },
            { label: 'Incidents', route: '/incidents' },
          ],
        },
      ];
    }
    if (isDispatch) {
      return [
        {
          key: 'dispatch-board',
          eyebrow: 'Dispatch',
          title: 'Live call management',
          body: 'Call triage, macros, priority tones, pursuit tracking, and unit allocation.',
          actions: [
            { label: 'Open Dispatch Board', route: '/dispatch', variant: 'primary' },
            { label: 'Lookup', route: '/search' },
          ],
        },
        {
          key: 'coordination',
          eyebrow: 'Coordination',
          title: 'Operational coordination',
          body: 'Monitor available units, active incidents, and escalation workload from the live overview.',
          actions: [
            { label: 'Units', route: '/units' },
            { label: 'Incidents', route: '/incidents' },
          ],
        },
      ];
    }
    if (isEmsDepartment) {
      return [
        {
          key: 'clinical',
          eyebrow: 'Clinical',
          title: 'Treatment & transport',
          body: 'Document treatment, medications and procedures, then complete transport destination and handover details.',
          actions: [
            { label: 'Treatment Log', route: '/ems-treatment', variant: 'primary' },
            { label: 'Transport Tracker', route: '/ems-transport' },
            { label: 'Patient Reports', route: '/records' },
          ],
        },
        {
          key: 'response',
          eyebrow: 'Operations',
          title: 'Crew response board',
          body: 'Manage active jobs, crew availability, and incident assignment from the response board.',
          actions: [
            { label: 'Response Board', route: '/units' },
            { label: 'Incidents', route: '/incidents' },
          ],
        },
      ];
    }
    if (isFireDepartment) {
      return [
        {
          key: 'operations',
          eyebrow: 'Operations',
          title: 'Live incident response',
          body: 'Coordinate appliances and crews on the response board, then capture outcomes in Incident Reports.',
          actions: [
            { label: 'Response Board', route: '/units', variant: 'primary' },
            { label: 'Incident Reports', route: '/records' },
            { label: 'Lookup', route: '/search' },
          ],
        },
        {
          key: 'planning',
          eyebrow: 'Planning',
          title: 'Readiness & pre-planning',
          body: 'Maintain apparatus readiness, site knowledge, and recurring risk information.',
          actions: [
            { label: 'Apparatus', route: '/fire-apparatus' },
            { label: 'Pre-Plans', route: '/fire-preplans' },
            { label: 'Incidents', route: '/incidents' },
          ],
        },
      ];
    }
    return [];
  })();

  // Mirror the sidebar's visibility rules:
  // 1. /units and /dispatch only appear when the user is on duty in this department.
  // 2. FiveM-protected routes only appear when FiveM is online (or it's a dispatch workspace).
  const hideInGameItems = !isFiveMOnline && !isDispatch;
  const visibleQuickActions = quickActions.filter(action => {
    if (DUTY_REQUIRED_ROUTES.has(action.route) && !onActiveDeptDuty) return false;
    if (FIVEM_REQUIRED_ROUTES.has(action.route) && hideInGameItems) return false;
    return true;
  });

  // Department panels that link exclusively to hidden routes should also be removed.
  const visibleDepartmentPanels = departmentPanels.filter(panel => {
    // If every action in this panel links to a hidden route, hide the whole panel.
    const visibleActions = panel.actions.filter(action => {
      const route = action.route.split('?')[0]; // strip query string
      if (DUTY_REQUIRED_ROUTES.has(route) && !onActiveDeptDuty) return false;
      if (FIVEM_REQUIRED_ROUTES.has(route) && hideInGameItems) return false;
      return true;
    });
    return visibleActions.length > 0;
  }).map(panel => ({
    ...panel,
    actions: panel.actions.filter(action => {
      const route = action.route.split('?')[0];
      if (DUTY_REQUIRED_ROUTES.has(route) && !onActiveDeptDuty) return false;
      if (FIVEM_REQUIRED_ROUTES.has(route) && hideInGameItems) return false;
      return true;
    }),
  }));

  // Track what's been hidden so we can show a contextual notice
  const hiddenDutyRoutes = quickActions.filter(a => DUTY_REQUIRED_ROUTES.has(a.route) && !onActiveDeptDuty);
  const hiddenFiveMRoutes = quickActions.filter(a => FIVEM_REQUIRED_ROUTES.has(a.route) && hideInGameItems);

  // Split quickActions: primary is first (col-span-2), rest are regular
  const primaryAction = visibleQuickActions.find(a => a.variant === 'primary');
  const secondaryActions = visibleQuickActions.filter(a => a.variant !== 'primary');

  return (
    <div className="flex flex-col gap-4">

      {/* ── Department hero strip ──────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl border"
        style={{
          borderColor: colorWithAlpha(deptColor, 0.22, 'rgba(42,58,78,1)'),
          background: `linear-gradient(135deg, ${colorWithAlpha(deptColor, 0.18)} 0%, rgba(12,16,25,0.97) 55%)`,
          boxShadow: `0 12px 40px ${colorWithAlpha(deptColor, 0.12)}`,
        }}
      >
        {/* Ambient grid */}
        <div className="absolute inset-0 cad-ambient-grid opacity-25 pointer-events-none" />

        {/* Accent top border */}
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${deptColor}, transparent)` }} />

        {/* Background watermark */}
        {deptLogo && (
          <div className="pointer-events-none absolute right-4 top-0 bottom-0 hidden xl:flex items-center opacity-[0.06]" style={{ width: '22%' }}>
            <img src={deptLogo} alt="" className="w-full h-full object-contain" style={{ filter: 'grayscale(1) brightness(2)' }} />
          </div>
        )}

        <div className="relative px-5 py-4 sm:px-6">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ borderColor: colorWithAlpha(deptColor, 0.3), backgroundColor: colorWithAlpha(deptColor, 0.1) }}
            >
              {deptLogo ? (
                <img src={deptLogo} alt="" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
              ) : (
                <span className="text-sm font-bold text-cad-muted">{activeDepartment?.short_name?.slice(0, 3) || 'DEP'}</span>
              )}
            </div>

            {/* Name / slogan */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-md border"
                  style={{
                    borderColor: colorWithAlpha(deptColor, 0.3),
                    backgroundColor: colorWithAlpha(deptColor, 0.1),
                    color: '#c8d8f4',
                  }}
                >
                  {departmentTypeLabel}
                </span>
                <span className="text-[9px] uppercase tracking-[0.15em] text-cad-muted">
                  {loading ? 'Syncing...' : `${stats.on_duty_units} on duty`}
                </span>
                {lastUpdated && (
                  <span className="text-[9px] text-cad-muted hidden sm:inline">· Updated {formatTimeAU(lastUpdated, '-', true)}</span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-cad-ink leading-tight">
                {activeDepartment?.name || 'Department'}
              </h2>
              <p className="text-xs sm:text-sm text-cad-muted mt-1">{slogan}</p>
            </div>

            {/* Clock */}
            <div className="hidden md:flex flex-col items-end flex-shrink-0">
              <p className="text-2xl font-bold tabular-nums text-cad-ink">{clockTimeLabel}</p>
              <p className="text-xs text-cad-muted mt-0.5">{clockDateLabel}</p>
            </div>
          </div>

          {/* Duty & unit status row */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* Duty status indicator */}
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
              onActiveDeptDuty ? 'border-emerald-500/25 bg-emerald-500/8' :
              onOtherDeptDuty ? 'border-amber-500/25 bg-amber-500/8' :
              'border-cad-border bg-cad-surface/40'
            }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                onActiveDeptDuty ? 'bg-emerald-400' :
                onOtherDeptDuty ? 'bg-amber-400' :
                'bg-cad-muted'
              }`} style={onActiveDeptDuty ? { boxShadow: '0 0 8px rgba(52,211,153,0.7)' } : {}} />
              <div>
                <p className="text-[9px] uppercase tracking-[0.15em] text-cad-muted">Duty</p>
                <p className={`text-xs font-semibold ${onActiveDeptDuty ? 'text-emerald-300' : onOtherDeptDuty ? 'text-amber-300' : 'text-cad-muted'}`}>
                  {onActiveDeptDuty ? 'Active in this dept.' : onOtherDeptDuty ? 'In another dept.' : 'Off duty'}
                </p>
              </div>
            </div>

            {onActiveDeptDuty && (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-cad-border bg-cad-surface/40 px-3 py-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.15em] text-cad-muted">{unitLabel}</p>
                    <p className="text-xs font-semibold text-cad-ink">{myUnit?.callsign || 'On duty'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-cad-border bg-cad-surface/40 px-3 py-2">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.15em] text-cad-muted">Status</p>
                    <p className="text-xs font-semibold text-cad-ink capitalize">{String(myUnit?.status || 'available').replace(/_/g, ' ')}</p>
                  </div>
                </div>
              </>
            )}

            {/* Duty controls */}
            <div className="ml-auto flex gap-2">
              {onActiveDeptDuty ? (
                <button
                  onClick={goOffDuty}
                  disabled={offDutyLoading}
                  className="px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm font-semibold hover:bg-red-500/15 transition-colors disabled:opacity-50"
                >
                  {offDutyLoading ? 'Processing...' : 'Go Off Duty'}
                </button>
              ) : (
                <button
                  onClick={goOnDuty}
                  disabled={onOtherDeptDuty || onDutyLoading}
                  className="px-4 py-2 rounded-xl border text-white text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50"
                  style={{
                    borderColor: colorWithAlpha(deptColor, 0.5),
                    background: onOtherDeptDuty ? undefined : `linear-gradient(135deg, ${deptColor}, ${colorWithAlpha(deptColor, 0.75)})`,
                    boxShadow: onOtherDeptDuty ? undefined : `0 6px 18px ${colorWithAlpha(deptColor, 0.3)}`,
                    backgroundColor: onOtherDeptDuty ? 'rgba(42,58,78,0.8)' : undefined,
                  }}
                  title={onOtherDeptDuty ? 'You are already on duty in another department' : undefined}
                >
                  {onOtherDeptDuty ? 'On Duty Elsewhere' : (onDutyLoading ? 'Processing...' : 'Go On Duty')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Live stat strip ────────────────────────────────── */}
      {/* Only the 5 core counters — dept-specific counts (warrants, POIs) live in the panels below */}
      <div className="flex gap-3 flex-wrap sm:flex-nowrap">
        <StatCell
          label={isFireDepartment ? 'Active Incidents' : 'Active Calls'}
          value={stats.active_calls}
          tone="blue"
          loading={loading}
        />
        <StatCell
          label="Urgent / 000"
          value={stats.urgent_calls}
          tone="red"
          loading={loading}
          pulse
        />
        <StatCell
          label={isFireDepartment ? 'Crews On Duty' : 'Units On Duty'}
          value={stats.on_duty_units}
          tone="green"
          loading={loading}
        />
        <StatCell
          label={isFireDepartment ? 'Available' : 'Available'}
          value={stats.available_units}
          tone="default"
          loading={loading}
        />
        <StatCell
          label="Assigned"
          value={stats.assigned_units}
          tone="amber"
          loading={loading}
        />
      </div>

      {/* ── Quick launch (full width, workflow steps inlined below) ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: colorWithAlpha(deptColor, 0.16, 'rgba(42,58,78,1)') }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{
            borderColor: colorWithAlpha(deptColor, 0.14, 'rgba(42,58,78,1)'),
            background: colorWithAlpha(deptColor, 0.06),
          }}
        >
          <div>
            <SectionHeading>Operational Workspace</SectionHeading>
            <p className="text-sm font-semibold text-cad-ink">Quick Launch</p>
          </div>
          <span
            className="text-[9px] uppercase tracking-wider px-2 py-1 rounded-lg border"
            style={{
              borderColor: colorWithAlpha(deptColor, 0.25),
              backgroundColor: colorWithAlpha(deptColor, 0.08),
              color: '#c8d8f4',
            }}
          >
            {departmentTypeLabel}
          </span>
        </div>

        <div className="p-4 bg-cad-card/50">
          {/* Primary action (full width) */}
          {primaryAction && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <ActionButton {...primaryAction} accent={deptColor} navigate={navigate} />
            </div>
          )}
          {/* Secondary actions grid */}
          {secondaryActions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2">
              {secondaryActions.map(action => (
                <ActionButton key={action.route} {...action} accent={deptColor} navigate={navigate} />
              ))}
            </div>
          )}

          {/* Contextual notices for hidden items — mirrors sidebar banners */}
          {hiddenDutyRoutes.length > 0 && (
            <div className="mt-3 rounded-lg border border-cad-border bg-cad-surface/60 px-3 py-2 flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-cad-muted mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-cad-muted">
                <span className="text-cad-ink font-medium">Go on duty</span> to access the response board and dispatch tools.
              </p>
            </div>
          )}
          {hiddenFiveMRoutes.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-amber-200">
                <span className="font-medium">In-game required</span> — connect to the FiveM server to access {hiddenFiveMRoutes.map(a => a.label).join(', ')}.
              </p>
            </div>
          )}

          {/* Workflow steps — compact inline strip */}
          {(() => {
            const steps = isDispatch
              ? [
                  'Monitor new calls, timers, and priority alerts on the dispatch board.',
                  'Allocate the closest available units and track pursuits in real time.',
                  'Use lookup for cross-checks before escalating or linking incidents.',
                ]
              : isPoliceDepartment
              ? [
                  'Use lookup to confirm licence and registration details before actioning.',
                  'Create arrest reports for draft and supervisor review, then finalise when ready.',
                  'Link records, warrants, POIs, and evidence under a shared incident.',
                ]
              : isEmsDepartment
              ? [
                  'Allocate crews on the response board, then document care in Treatment Log.',
                  'Use Transport Tracker for destination, ETA, and handover status.',
                  'Complete patient reports for clinical records and follow-up review.',
                ]
              : isFireDepartment
              ? [
                  'Use Response Board for live incident allocation and appliance coordination.',
                  'Document post-incident outcomes in Incident Reports.',
                  'Maintain pre-plans and apparatus readiness for repeat-risk locations.',
                ]
              : ['Use the relevant workflow for live response, lookup, and documentation.'];
            return (
              <div className="mt-4 pt-3 border-t flex flex-wrap gap-3" style={{ borderColor: colorWithAlpha(deptColor, 0.12, 'rgba(42,58,78,0.5)') }}>
                <p className="text-[9px] uppercase tracking-[0.18em] text-cad-muted self-center flex-none">Workflow</p>
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-1.5 flex-1 min-w-[180px]">
                    <span
                      className="mt-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center border shrink-0"
                      style={{
                        borderColor: colorWithAlpha(deptColor, 0.3),
                        backgroundColor: colorWithAlpha(deptColor, 0.1),
                        color: '#b0c4e0',
                      }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[11px] text-cad-muted leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Department-specific panels ─────────────────────── */}
      {visibleDepartmentPanels.length > 0 && (
        <div className={`grid grid-cols-1 gap-4 ${visibleDepartmentPanels.length >= 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
          {visibleDepartmentPanels.map((panel) => (
            <PanelCard key={panel.key} panel={panel} accent={deptColor} navigate={navigate} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 flex items-center gap-3">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <GoOnDutyModal
        open={showOnDutyModal}
        onClose={() => setShowOnDutyModal(false)}
        department={activeDepartment}
        onSuccess={async () => {
          await refreshMyUnit();
          scheduleRefresh();
        }}
      />

      <OffDutySummaryModal
        open={!!offDutySummary}
        summary={offDutySummary}
        onClose={() => setOffDutySummary(null)}
      />
    </div>
  );
}
