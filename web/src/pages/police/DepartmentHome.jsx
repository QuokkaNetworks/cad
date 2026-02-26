import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import GoOnDutyModal from '../../components/GoOnDutyModal';
import OffDutySummaryModal from '../../components/OffDutySummaryModal';
import { useAuth } from '../../context/AuthContext';
import { useDepartment } from '../../context/DepartmentContext';
import { useDeveloperCadPreview } from '../../hooks/useDeveloperCadPreview';
import { useEventSource } from '../../hooks/useEventSource';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';
import { formatDateAU, formatTimeAU } from '../../utils/dateTime';
import { emitUnitDutyChanged } from '../../utils/unitDutyEvents';

// Mirror the sidebar's visibility rules so hidden items don't appear on the home screen.
// Route -> whether it requires FiveM to be online (same list as requiresFiveMOnlineForNavItem in Sidebar.jsx)
const FIVEM_REQUIRED_ROUTES = new Set(['/incidents', '/records', '/warrants', '/evidence', '/infringements']);
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
const DEFAULT_LIVE_SNAPSHOT = Object.freeze({
  calls: [],
  units: [],
  bolos: [],
  warrants: [],
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

function parseSqliteUtc(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = text.replace(' ', 'T');
  const withZone = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const ts = Date.parse(withZone);
  return Number.isFinite(ts) ? ts : 0;
}

function formatElapsedSinceTimestamp(ts, nowMs) {
  if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(nowMs)) return '-';
  const diffMs = Math.max(0, nowMs - ts);
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatElapsedSinceSqlite(value, nowMs) {
  return formatElapsedSinceTimestamp(parseSqliteUtc(value), nowMs);
}

function titleCaseWords(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Open';
  if (normalized === 'on_scene' || normalized === 'on-scene') return 'On Scene';
  if (normalized === 'enroute') return 'En Route';
  return titleCaseWords(normalized);
}

function getCallPriorityRank(call) {
  const raw = Number.parseInt(String(call?.priority || '').trim(), 10);
  if (Number.isInteger(raw) && raw > 0) return raw;
  if (String(call?.job_code || '').trim() === '000') return 1;
  return 3;
}

function isPursuitCallLike(call) {
  const hay = `${String(call?.title || '')} ${String(call?.description || '')} ${String(call?.job_code || '')}`.toLowerCase();
  return /\bpursuit\b|\bvehicle pursuit\b|\bpolice pursuit\b/.test(hay) || !!call?.pursuit_mode_enabled;
}

function joinLabelsNatural(labels) {
  const clean = Array.from(new Set((labels || []).map((x) => String(x || '').trim()).filter(Boolean)));
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

function badgeClassesForTone(tone) {
  if (tone === 'red') return 'border-red-500/25 bg-red-500/10 text-red-200';
  if (tone === 'amber') return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
  if (tone === 'green') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
  if (tone === 'blue') return 'border-sky-500/25 bg-sky-500/10 text-sky-200';
  return 'border-cad-border bg-cad-surface/60 text-cad-ink';
}

function getUnitStatusTone(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'available') return 'green';
  if (value === 'enroute' || value === 'on_scene' || value === 'on-scene') return 'blue';
  if (value === 'busy' || value === 'assigned') return 'amber';
  if (value === 'unavailable') return 'red';
  return 'default';
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
        {loading ? <span className="text-cad-muted text-xl">-</span> : value}
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

function SectionCard({ title, subtitle, accent, actionLabel, actionRoute, navigate, children }) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: colorWithAlpha(accent, 0.16, 'rgba(42,58,78,1)') }}
    >
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-3"
        style={{
          borderColor: colorWithAlpha(accent, 0.12, 'rgba(42,58,78,1)'),
          background: colorWithAlpha(accent, 0.05),
        }}
      >
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.18em] text-cad-muted">{subtitle}</p>
          <p className="text-sm font-semibold text-cad-ink mt-0.5 truncate">{title}</p>
        </div>
        {actionLabel && actionRoute && (
          <button
            type="button"
            onClick={() => navigate(actionRoute)}
            className="px-2.5 py-1 rounded-lg border border-cad-border bg-cad-surface/60 text-[11px] font-medium text-cad-ink hover:bg-cad-surface transition-colors whitespace-nowrap"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="p-4 bg-cad-card/50">
        {children}
      </div>
    </div>
  );
}

export default function DepartmentHome() {
  const navigate = useNavigate();
  const { isFiveMOnline } = useAuth();
  const { enabled: developerPreviewEnabled } = useDeveloperCadPreview();
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
  const [liveSnapshot, setLiveSnapshot] = useState(DEFAULT_LIVE_SNAPSHOT);
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
      setLiveSnapshot({
        calls: activeCalls,
        units,
        bolos,
        warrants,
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
    setLiveSnapshot(DEFAULT_LIVE_SNAPSHOT);
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
      emitUnitDutyChanged({
        action: 'off_duty',
        department_id: activeDepartment?.id || null,
      });
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
      emitUnitDutyChanged({
        action: 'on_duty',
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
  const nowMs = now.getTime();

  const quickActions = (() => {
    if (isDispatch) {
      return [
        { label: 'Dispatch Board', sublabel: 'Live call management', route: '/dispatch', variant: 'primary' },
        { label: 'Lookup', route: '/search' },
        { label: 'Units', route: '/units' },
      ];
    }
    if (isPoliceDepartment) {
      return [
        { label: 'Response Board', sublabel: 'Live unit & call management', route: '/units', variant: 'primary' },
        { label: 'Lookup', route: '/search' },
        { label: 'Arrest Reports', route: '/records' },
        { label: 'Infringement Notices', route: '/infringements' },
        { label: 'Warrants', route: '/warrants' },
        { label: 'POI / VOI', route: '/bolos' },
        { label: 'Evidence', route: '/evidence' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    if (isEmsDepartment) {
      return [
        { label: 'Response Board', sublabel: 'Live crew and call management', route: '/units', variant: 'primary' },
        { label: 'Incidents', route: '/incidents' },
        { label: 'Treatment Log', route: '/ems-treatment' },
        { label: 'Transport Tracker', route: '/ems-transport' },
        { label: 'Patient Reports', route: '/records' },
      ];
    }
    if (isFireDepartment) {
      return [
        { label: 'Response Board', sublabel: 'Live appliance and incident management', route: '/units', variant: 'primary' },
        { label: 'Incidents', route: '/incidents' },
        { label: 'Incident Reports', route: '/records' },
        { label: 'Lookup', route: '/search' },
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
          value: loading ? '-' : String(stats.active_warrants),
          valueTone: 'text-amber-300',
          body: 'Create, review, and action outstanding warrants for active investigations.',
          actions: [
            { label: 'New Warrant', route: '/warrants?new=1', variant: 'primary' },
            { label: 'View Warrants', route: '/warrants' },
          ],
        },
        {
          key: 'pois',
          eyebrow: 'POI / VOI',
          title: 'Persons & vehicles of interest',
          value: loading ? '-' : String(stats.active_bolos),
          valueTone: 'text-sky-400',
          body: 'Track POI / VOI entries linked to investigations, vehicles, and current operational activity.',
          actions: [
            { label: 'New POI / VOI', route: '/bolos?new=1', variant: 'primary' },
            { label: 'View POI / VOI', route: '/bolos' },
            { label: 'Evidence', route: '/evidence' },
          ],
        },
        {
          key: 'casework',
          eyebrow: 'Casework',
          title: 'Arrest workflow',
          body: 'Use arrest reports for draft and supervisor review, then finalise to apply fines or custodial outcomes.',
          actions: [
            { label: 'Arrest Reports', route: '/records' },
            { label: 'Infringements', route: '/infringements' },
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
          ],
        },
      ];
    }
    if (isEmsDepartment) {
      return [
        {
          key: 'ems-response',
          eyebrow: 'Response',
          title: 'Live ambulance operations',
          body: 'Use the Response Board for dispatching crews, scene coordination, and status updates during active jobs.',
          actions: [
            { label: 'Response Board', route: '/units', variant: 'primary' },
            { label: 'Incidents', route: '/incidents' },
          ],
        },
        {
          key: 'ems-documentation',
          eyebrow: 'Documentation',
          title: 'Patient care workflow',
          body: 'Capture treatment, transport, and final patient reporting with a simple end-to-end CAD workflow after each job.',
          actions: [
            { label: 'Treatment Log', route: '/ems-treatment', variant: 'primary' },
            { label: 'Transport Tracker', route: '/ems-transport' },
            { label: 'Patient Reports', route: '/records' },
            { label: 'Incidents', route: '/incidents' },
          ],
        },
      ];
    }
    if (isFireDepartment) {
      return [
        {
          key: 'fire-operations',
          eyebrow: 'Operations',
          title: 'Live fireground coordination',
          body: 'Run appliance and crew response from the board, monitor incident load, and keep active jobs moving cleanly in-game.',
          actions: [
            { label: 'Response Board', route: '/units', variant: 'primary' },
            { label: 'Incidents', route: '/incidents' },
          ],
        },
        {
          key: 'fire-reporting',
          eyebrow: 'Reporting',
          title: 'Simple incident documentation',
          body: 'Write incident reports, use lookup only when needed, and link supporting records under incidents without extra planning modules.',
          actions: [
            { label: 'Incident Reports', route: '/records', variant: 'primary' },
            { label: 'Lookup', route: '/search' },
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
  const previewOnActiveDeptDuty = developerPreviewEnabled || onActiveDeptDuty;
  const previewFiveMOnline = developerPreviewEnabled || isFiveMOnline;
  const hideInGameItems = !previewFiveMOnline && !isDispatch;
  const visibleQuickActions = quickActions.filter(action => {
    if (DUTY_REQUIRED_ROUTES.has(action.route) && !previewOnActiveDeptDuty) return false;
    if (FIVEM_REQUIRED_ROUTES.has(action.route) && hideInGameItems) return false;
    return true;
  });

  // Department panels that link exclusively to hidden routes should also be removed.
  const visibleDepartmentPanels = departmentPanels.filter(panel => {
    // If every action in this panel links to a hidden route, hide the whole panel.
    const visibleActions = panel.actions.filter(action => {
      const route = action.route.split('?')[0]; // strip query string
      if (DUTY_REQUIRED_ROUTES.has(route) && !previewOnActiveDeptDuty) return false;
      if (FIVEM_REQUIRED_ROUTES.has(route) && hideInGameItems) return false;
      return true;
    });
    return visibleActions.length > 0;
  }).map(panel => ({
    ...panel,
    actions: panel.actions.filter(action => {
      const route = action.route.split('?')[0];
      if (DUTY_REQUIRED_ROUTES.has(route) && !previewOnActiveDeptDuty) return false;
      if (FIVEM_REQUIRED_ROUTES.has(route) && hideInGameItems) return false;
      return true;
    }),
  }));

  // Track what's been hidden so we can show a contextual notice
  const hiddenDutyRoutes = quickActions.filter(a => DUTY_REQUIRED_ROUTES.has(a.route) && !previewOnActiveDeptDuty);
  const hiddenFiveMRoutes = quickActions.filter(a => FIVEM_REQUIRED_ROUTES.has(a.route) && hideInGameItems);

  // Split quickActions: primary is first (col-span-2), rest are regular
  const primaryAction = visibleQuickActions.find(a => a.variant === 'primary');
  const secondaryActions = visibleQuickActions.filter(a => a.variant !== 'primary');

  const sortedActiveCalls = useMemo(() => {
    const calls = Array.isArray(liveSnapshot.calls) ? [...liveSnapshot.calls] : [];
    calls.sort((a, b) => {
      const priorityDiff = getCallPriorityRank(a) - getCallPriorityRank(b);
      if (priorityDiff !== 0) return priorityDiff;
      const aUpdated = parseSqliteUtc(a?.updated_at || a?.created_at);
      const bUpdated = parseSqliteUtc(b?.updated_at || b?.created_at);
      if (aUpdated !== bUpdated) return bUpdated - aUpdated;
      return parseSqliteUtc(b?.created_at) - parseSqliteUtc(a?.created_at);
    });
    return calls;
  }, [liveSnapshot.calls]);

  const unitStatusBreakdown = useMemo(() => {
    const counts = new Map();
    for (const unit of (Array.isArray(liveSnapshot.units) ? liveSnapshot.units : [])) {
      const key = String(unit?.status || 'unknown').trim().toLowerCase() || 'unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const preferredOrder = ['available', 'enroute', 'on_scene', 'on-scene', 'busy', 'unavailable', 'unknown'];
    const entries = Array.from(counts.entries());
    entries.sort((a, b) => {
      const aIdx = preferredOrder.indexOf(a[0]);
      const bIdx = preferredOrder.indexOf(b[0]);
      if (aIdx !== -1 || bIdx !== -1) {
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        if (aIdx !== bIdx) return aIdx - bIdx;
      }
      return b[1] - a[1];
    });
    return entries.map(([status, count]) => ({
      key: status,
      label: formatStatusLabel(status),
      count,
      tone: getUnitStatusTone(status),
    }));
  }, [liveSnapshot.units]);

  const queueHeadline = useMemo(() => {
    const unassigned = sortedActiveCalls.filter(call => (Array.isArray(call?.assigned_units) ? call.assigned_units.length : 0) === 0).length;
    const pursuits = sortedActiveCalls.filter(isPursuitCallLike).length;
    const stale = sortedActiveCalls.filter((call) => {
      const updatedTs = parseSqliteUtc(call?.updated_at || call?.created_at);
      return updatedTs && (nowMs - updatedTs) > (10 * 60 * 1000);
    }).length;
    return { open: stats.active_calls, unassigned, pursuits, stale };
  }, [sortedActiveCalls, nowMs, stats.active_calls]);

  const watchTiles = useMemo(() => {
    const latestQueueUpdateTs = sortedActiveCalls.length
      ? Math.max(...sortedActiveCalls.map(call => parseSqliteUtc(call?.updated_at || call?.created_at)).filter(Boolean))
      : 0;
    if (isPoliceDepartment) {
      return [
        { label: 'Active Warrants', value: stats.active_warrants, tone: stats.active_warrants > 0 ? 'amber' : 'default' },
        { label: 'POI / VOI', value: stats.active_bolos, tone: stats.active_bolos > 0 ? 'blue' : 'default' },
        { label: 'Urgent / 000', value: stats.urgent_calls, tone: stats.urgent_calls > 0 ? 'red' : 'default' },
        { label: 'Available Units', value: stats.available_units, tone: stats.available_units > 0 ? 'green' : 'default' },
      ];
    }
    if (isDispatch) {
      return [
        { label: 'Unassigned Calls', value: queueHeadline.unassigned, tone: queueHeadline.unassigned > 0 ? 'amber' : 'default' },
        { label: 'Pursuits', value: queueHeadline.pursuits, tone: queueHeadline.pursuits > 0 ? 'red' : 'default' },
        { label: 'Urgent / 000', value: stats.urgent_calls, tone: stats.urgent_calls > 0 ? 'red' : 'default' },
        { label: 'Available Units', value: stats.available_units, tone: stats.available_units > 0 ? 'green' : 'default' },
      ];
    }
    return [
      { label: isFireDepartment ? 'Active Incidents' : 'Active Calls', value: stats.active_calls, tone: stats.active_calls > 0 ? 'blue' : 'default' },
      { label: 'Urgent / 000', value: stats.urgent_calls, tone: stats.urgent_calls > 0 ? 'red' : 'default' },
      { label: isFireDepartment ? 'Crews Available' : 'Available Units', value: stats.available_units, tone: stats.available_units > 0 ? 'green' : 'default' },
      { label: 'Latest Queue Update', value: latestQueueUpdateTs ? formatElapsedSinceTimestamp(latestQueueUpdateTs, nowMs) : '-', tone: 'default', isText: true },
    ];
  }, [sortedActiveCalls, isPoliceDepartment, isDispatch, isFireDepartment, stats, queueHeadline, nowMs]);

  const attentionItems = useMemo(() => {
    const items = [];
    const unassignedCalls = sortedActiveCalls.filter(call => (Array.isArray(call?.assigned_units) ? call.assigned_units.length : 0) === 0);
    const priorityOneCalls = sortedActiveCalls.filter(call => getCallPriorityRank(call) === 1);
    const staleCalls = sortedActiveCalls.filter((call) => {
      const updatedTs = parseSqliteUtc(call?.updated_at || call?.created_at);
      if (!updatedTs) return false;
      return (nowMs - updatedTs) > (10 * 60 * 1000);
    });

    if (priorityOneCalls.length > 0) {
      items.push({
        tone: 'red',
        title: `${priorityOneCalls.length} urgent / 000 ${priorityOneCalls.length === 1 ? 'call requires attention' : 'calls require attention'}`,
        detail: 'Review allocation and maintain active status updates on high priority jobs.',
        route: primaryBoardRoute,
        actionLabel: isDispatch ? 'Dispatch Board' : 'Response Board',
      });
    }
    if (unassignedCalls.length > 0) {
      items.push({
        tone: 'amber',
        title: `${unassignedCalls.length} ${unassignedCalls.length === 1 ? 'call is' : 'calls are'} unassigned`,
        detail: 'Allocate an available unit or crew to reduce queue drift.',
        route: primaryBoardRoute,
        actionLabel: 'Allocate',
      });
    }
    if (stats.active_calls > 0 && stats.available_units === 0) {
      items.push({
        tone: 'amber',
        title: 'No available units while jobs are active',
        detail: 'All on-duty members are committed or unavailable.',
        route: '/units',
        actionLabel: 'Unit Board',
      });
    }
    if (staleCalls.length > 0) {
      items.push({
        tone: 'blue',
        title: `${staleCalls.length} ${staleCalls.length === 1 ? 'call has' : 'calls have'} no update in 10+ minutes`,
        detail: 'Review for closure, follow-up, or updated status.',
        route: primaryBoardRoute,
        actionLabel: 'Review Queue',
      });
    }
    if (onOtherDeptDuty) {
      items.push({
        tone: 'amber',
        title: 'You are already on duty in another department',
        detail: 'Go off duty there before joining this department workflow.',
      });
    }
    if (!items.length) {
      items.push({
        tone: 'green',
        title: 'No immediate issues detected',
        detail: 'Queue, unit availability, and operational updates look healthy.',
      });
    }
    return items.slice(0, 5);
  }, [sortedActiveCalls, nowMs, stats.active_calls, stats.available_units, onOtherDeptDuty, primaryBoardRoute, isDispatch]);

  const myUnitAssignments = useMemo(() => {
    if (!myUnit) return [];
    const myId = Number(myUnit.id);
    const myCallsign = String(myUnit.callsign || '').trim().toLowerCase();
    return sortedActiveCalls.filter((call) => {
      const assigned = Array.isArray(call?.assigned_units) ? call.assigned_units : [];
      return assigned.some((entry) => {
        const entryId = Number(entry?.unit_id ?? entry?.id);
        if (Number.isInteger(myId) && myId > 0 && entryId === myId) return true;
        return myCallsign && String(entry?.callsign || '').trim().toLowerCase() === myCallsign;
      });
    });
  }, [myUnit, sortedActiveCalls]);

  const workflowSteps = useMemo(() => {
    if (isDispatch) {
      return [
        'Monitor new calls, timers, and priority alerts on the dispatch board.',
        'Allocate the closest available units and monitor pursuits or alarms.',
        'Use lookup to support live coordination decisions.',
      ];
    }
    if (isPoliceDepartment) {
      return [
        'Use lookup to confirm licence and registration details before taking action.',
        'Draft arrest reports for review, finalise records, and issue infringement notices as required.',
        'Link records, warrants, POI / VOI entries, and evidence under a shared incident.',
      ];
    }
    if (isEmsDepartment) {
      return [
        'Run live jobs from the Response Board.',
        'Record treatment and transport details after scene care.',
        'Complete a patient report and link the job to an incident when needed.',
      ];
    }
    if (isFireDepartment) {
      return [
        'Run appliances and crews from the Response Board during active incidents.',
        'Use Incidents to group related calls, units, and case notes when required.',
        'Complete Incident Reports after response with only the details needed for CAD.',
      ];
    }
    return ['Use the relevant workflow for live response, lookup, and documentation.'];
  }, [isDispatch, isPoliceDepartment, isEmsDepartment, isFireDepartment]);

  return (
    <div className="flex flex-col gap-4">

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Department hero strip Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
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
                  <span className="text-[9px] text-cad-muted hidden sm:inline">Updated {formatTimeAU(lastUpdated, '-', true)}</span>
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Live stat strip Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {/* Only the 5 core counters Ã¢â‚¬â€ dept-specific counts (warrants, POIs) live in the panels below */}
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
          label="Available"
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Quick launch (full width, workflow steps inlined below) Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 flex flex-col gap-4">
          <SectionCard
            title={isFireDepartment ? 'Active Incident Queue' : 'Active Call Queue'}
            subtitle="Live Operations"
            accent={deptColor}
            actionLabel={isDispatch ? 'Dispatch Board' : 'Response Board'}
            actionRoute={primaryBoardRoute}
            navigate={navigate}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <div className="rounded-xl border border-cad-border bg-cad-surface/50 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.16em] text-cad-muted">Open</p>
                <p className="text-lg font-bold text-cad-ink tabular-nums">{queueHeadline.open}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-surface/50 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.16em] text-cad-muted">Unassigned</p>
                <p className={`text-lg font-bold tabular-nums ${queueHeadline.unassigned > 0 ? 'text-amber-300' : 'text-cad-ink'}`}>{queueHeadline.unassigned}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-surface/50 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.16em] text-cad-muted">Pursuits</p>
                <p className={`text-lg font-bold tabular-nums ${queueHeadline.pursuits > 0 ? 'text-red-300' : 'text-cad-ink'}`}>{queueHeadline.pursuits}</p>
              </div>
              <div className="rounded-xl border border-cad-border bg-cad-surface/50 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.16em] text-cad-muted">Stale 10m+</p>
                <p className={`text-lg font-bold tabular-nums ${queueHeadline.stale > 0 ? 'text-amber-300' : 'text-cad-ink'}`}>{queueHeadline.stale}</p>
              </div>
            </div>

            {sortedActiveCalls.length > 0 ? (
              <div className="space-y-2">
                {sortedActiveCalls.slice(0, 6).map((call, index) => {
                  const assignedCount = Array.isArray(call?.assigned_units) ? call.assigned_units.length : 0;
                  const priorityRank = getCallPriorityRank(call);
                  const title = String(call?.title || '').trim() || String(call?.job_code || '').trim() || 'Untitled call';
                  const location = String(call?.location || '').trim();
                  const isPursuit = isPursuitCallLike(call);
                  return (
                    <div key={`call-${call?.id ?? index}`} className="rounded-xl border border-cad-border bg-cad-surface/35 px-3 py-2.5">
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-0.5 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          priorityRank === 1
                            ? 'border-red-500/25 bg-red-500/10 text-red-200'
                            : priorityRank === 2
                              ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                              : 'border-cad-border bg-cad-card/70 text-cad-muted'
                        }`}>
                          P{priorityRank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold text-cad-ink truncate">{title}</p>
                            {String(call?.job_code || '').trim() === '000' && (
                              <span className="inline-flex items-center rounded-md border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">000</span>
                            )}
                            {isPursuit && (
                              <span className="inline-flex items-center rounded-md border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">Pursuit</span>
                            )}
                            {assignedCount === 0 && (
                              <span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">Unassigned</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-cad-muted">
                            <span>{location || 'Location pending'}</span>
                            <span>{formatStatusLabel(call?.status)}</span>
                            <span>{assignedCount} assigned</span>
                            <span>Open {formatElapsedSinceSqlite(call?.created_at, nowMs)}</span>
                            <span>Upd {formatElapsedSinceSqlite(call?.updated_at || call?.created_at, nowMs)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sortedActiveCalls.length > 6 && (
                  <p className="text-xs text-cad-muted pt-1">+{sortedActiveCalls.length - 6} more {isFireDepartment ? 'incidents' : 'calls'} in queue.</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-cad-border bg-cad-surface/30 px-4 py-5">
                <p className="text-sm font-semibold text-cad-ink">Queue clear</p>
                <p className="text-xs text-cad-muted mt-1">No active {isFireDepartment ? 'incidents' : 'calls'} are currently open for this department.</p>
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Needs Attention" subtitle="Operational Signals" accent={deptColor} navigate={navigate}>
              <div className="space-y-2">
                {attentionItems.map((item, idx) => (
                  <div key={`${item.title}:${idx}`} className={`rounded-xl border px-3 py-2.5 ${badgeClassesForTone(item.tone)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-snug">{item.title}</p>
                        <p className="text-[11px] opacity-90 mt-1 leading-relaxed">{item.detail}</p>
                      </div>
                      {item.route && item.actionLabel && (
                        <button
                          type="button"
                          onClick={() => navigate(item.route)}
                          className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-[10px] font-semibold whitespace-nowrap hover:bg-white/10 transition-colors"
                        >
                          {item.actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Team & Unit Readiness" subtitle="Resource Availability" accent={deptColor} actionLabel="Unit Board" actionRoute="/units" navigate={navigate}>
              <div className="space-y-3">
                <div className="rounded-xl border border-cad-border bg-cad-surface/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-cad-muted">Availability Coverage</p>
                    <p className="text-xs font-semibold text-cad-ink tabular-nums">{stats.available_units}/{Math.max(stats.on_duty_units, 0)}</p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-cad-surface overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${stats.on_duty_units > 0 ? Math.min(100, Math.round((stats.available_units / stats.on_duty_units) * 100)) : 0}%`,
                        background: `linear-gradient(90deg, ${colorWithAlpha(deptColor, 0.9, 'rgba(0,82,194,0.9)')}, ${colorWithAlpha(deptColor, 0.55, 'rgba(0,82,194,0.55)')})`,
                      }}
                    />
                  </div>
                </div>

                {unitStatusBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {unitStatusBreakdown.slice(0, 6).map((row) => (
                      <div key={row.key} className="rounded-lg border border-cad-border bg-cad-surface/25 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              row.tone === 'green'
                                ? 'bg-emerald-400'
                                : row.tone === 'blue'
                                  ? 'bg-sky-400'
                                  : row.tone === 'amber'
                                    ? 'bg-amber-300'
                                    : row.tone === 'red'
                                      ? 'bg-red-400'
                                      : 'bg-cad-muted'
                            }`} />
                            <span className="text-xs text-cad-ink truncate">{row.label}</span>
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-cad-ink">{row.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-cad-muted">No units currently on duty for this view.</p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-4">
          <SectionCard title="Your Operational Status" subtitle="Member Snapshot" accent={deptColor} navigate={navigate}>
            <div className="space-y-3">
              <div className={`rounded-xl border px-3 py-3 ${
                onActiveDeptDuty ? 'border-emerald-500/20 bg-emerald-500/5' :
                onOtherDeptDuty ? 'border-amber-500/20 bg-amber-500/5' :
                'border-cad-border bg-cad-surface/40'
              }`}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Duty State</p>
                <p className={`text-sm font-semibold mt-1 ${
                  onActiveDeptDuty ? 'text-emerald-300' : onOtherDeptDuty ? 'text-amber-300' : 'text-cad-ink'
                }`}>
                  {onActiveDeptDuty ? 'On duty in this department' : onOtherDeptDuty ? 'On duty in another department' : 'Off duty'}
                </p>
                {onActiveDeptDuty && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-cad-border bg-cad-surface/40 px-2.5 py-2">
                      <p className="text-cad-muted uppercase tracking-[0.14em] text-[9px]">{unitLabel}</p>
                      <p className="text-cad-ink font-semibold mt-0.5">{myUnit?.callsign || 'On duty'}</p>
                    </div>
                    <div className="rounded-lg border border-cad-border bg-cad-surface/40 px-2.5 py-2">
                      <p className="text-cad-muted uppercase tracking-[0.14em] text-[9px]">Status</p>
                      <p className="text-cad-ink font-semibold mt-0.5">{formatStatusLabel(myUnit?.status || 'available')}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {watchTiles.map((tile) => (
                  <div key={tile.label} className={`rounded-lg border px-3 py-2 ${badgeClassesForTone(tile.tone)}`}>
                    <p className="text-[9px] uppercase tracking-[0.14em] opacity-80">{tile.label}</p>
                    <p className={`mt-1 font-semibold ${tile.isText ? 'text-xs' : 'text-sm tabular-nums'}`}>{tile.value}</p>
                  </div>
                ))}
              </div>

              {onActiveDeptDuty && (
                <div className="rounded-xl border border-cad-border bg-cad-surface/30 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Current Assignments</p>
                    <span className="text-xs font-semibold text-cad-ink tabular-nums">{myUnitAssignments.length}</span>
                  </div>
                  {myUnitAssignments.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {myUnitAssignments.slice(0, 3).map((call, idx) => (
                        <div key={`my-assignment-${call?.id ?? idx}`} className="rounded-lg border border-cad-border bg-cad-card/60 px-2.5 py-2">
                          <p className="text-xs font-semibold text-cad-ink truncate">
                            {String(call?.title || '').trim() || String(call?.job_code || '').trim() || 'Active call'}
                          </p>
                          <p className="text-[11px] text-cad-muted mt-0.5 truncate">
                            {String(call?.location || '').trim() || 'Location pending'} | {formatStatusLabel(call?.status)}
                          </p>
                        </div>
                      ))}
                      {myUnitAssignments.length > 3 && (
                        <p className="text-[11px] text-cad-muted">+{myUnitAssignments.length - 3} more assignments active.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-cad-muted mt-2">No active assignments linked to your unit in this queue.</p>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-cad-border bg-cad-surface/30 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-cad-muted">Connection & Access</p>
                <div className="mt-2 space-y-2 text-xs">
                  {developerPreviewEnabled && (
                    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-2 text-sky-100">
                      Developer Preview is enabled in this browser. Duty/FiveM UI gating is bypassed for navigation and quick actions.
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-cad-muted">FiveM Link</span>
                    <span className={`font-semibold ${previewFiveMOnline ? 'text-emerald-300' : 'text-amber-200'}`}>
                      {developerPreviewEnabled
                        ? (isFiveMOnline ? 'Connected (preview active)' : 'Bypassed (developer preview)')
                        : (isDispatch ? (isFiveMOnline ? 'Connected (optional)' : 'Not required for dispatch') : (isFiveMOnline ? 'Connected' : 'Offline'))}
                    </span>
                  </div>
                  {hiddenDutyRoutes.length > 0 && (
                    <div className="rounded-lg border border-cad-border bg-cad-card/50 px-2.5 py-2 text-cad-muted">
                      Go on duty to access {joinLabelsNatural(hiddenDutyRoutes.map(a => a.label))}.
                    </div>
                  )}
                  {hideInGameItems && hiddenFiveMRoutes.length > 0 && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-amber-100">
                      Connect in-game to access {joinLabelsNatural(hiddenFiveMRoutes.map(a => a.label))}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

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

          {/* Contextual notices for hidden items Ã¢â‚¬â€ mirrors sidebar banners */}
          {hiddenDutyRoutes.length > 0 && (
            <div className="mt-3 rounded-lg border border-cad-border bg-cad-surface/60 px-3 py-2 flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-cad-muted mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-cad-muted">
                <span className="text-cad-ink font-medium">Go on duty</span> to access {joinLabelsNatural(hiddenDutyRoutes.map(a => a.label))}.
              </p>
            </div>
          )}
          {/* Workflow steps Ã¢â‚¬â€ compact inline strip */}
          <div className="mt-4 pt-3 border-t flex flex-wrap gap-3" style={{ borderColor: colorWithAlpha(deptColor, 0.12, 'rgba(42,58,78,0.5)') }}>
            <p className="text-[9px] uppercase tracking-[0.18em] text-cad-muted self-center flex-none">Workflow</p>
            {workflowSteps.map((step, i) => (
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
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Department-specific panels Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

