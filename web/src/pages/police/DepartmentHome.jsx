import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import GoOnDutyModal from '../../components/GoOnDutyModal';
import OffDutySummaryModal from '../../components/OffDutySummaryModal';
import { useDepartment } from '../../context/DepartmentContext';
import { useEventSource } from '../../hooks/useEventSource';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../../utils/departmentLayout';
import { formatDateAU, formatTimeAU } from '../../utils/dateTime';

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

function WatermarkPanel({ logo, accent, className = '', children }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-cad-card ${className}`}
      style={{ borderColor: colorWithAlpha(accent, 0.22, 'rgba(255,255,255,0.1)') }}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{ background: `linear-gradient(135deg, ${colorWithAlpha(accent, 0.08)}, transparent 55%)` }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export default function DepartmentHome() {
  const navigate = useNavigate();
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
        callsRequest,
        unitsRequest,
        bolosRequest,
        warrantsRequest,
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
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      fetchStats();
    }, REFRESH_DEBOUNCE_MS);
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
  const responseBoardLabel = isFireDepartment ? 'Response Board' : (isDispatch ? 'Dispatch Board' : 'Response Board');
  const primaryBoardRoute = isDispatch ? '/dispatch' : '/units';
  const dutyTone = onActiveDeptDuty
    ? 'On duty in this department'
    : (onOtherDeptDuty ? 'On duty in another department' : 'Currently off duty');
  const dutyToneColor = onActiveDeptDuty
    ? 'text-emerald-300'
    : (onOtherDeptDuty ? 'text-amber-300' : 'text-cad-muted');

  const statCards = [
    {
      label: isFireDepartment ? 'Active Incidents' : 'Active Calls',
      value: stats.active_calls,
      tone: 'text-cad-accent-light',
      help: isDispatch ? 'Open work on the board' : 'Current live workload',
    },
    { label: 'Urgent / 000', value: stats.urgent_calls, tone: 'text-red-400', help: 'Requires immediate triage' },
    {
      label: isFireDepartment ? 'Crews On Duty' : 'Units On Duty',
      value: stats.on_duty_units,
      tone: 'text-emerald-400',
      help: 'Staff currently signed on',
    },
    {
      label: isFireDepartment ? 'Crews Available' : 'Units Available',
      value: stats.available_units,
      tone: 'text-sky-400',
      help: 'Ready for allocation',
    },
    {
      label: isFireDepartment ? 'Crews Assigned' : 'Units Assigned',
      value: stats.assigned_units,
      tone: 'text-amber-300',
      help: 'Committed to active work',
    },
  ];

  const quickActions = (() => {
    if (isDispatch) {
      return [
        { label: 'Open Dispatch Board', route: '/dispatch', variant: 'primary' },
        { label: 'Lookup', route: '/search' },
        { label: 'Units', route: '/units' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    if (isPoliceDepartment) {
      return [
        { label: 'Response Board', route: '/units', variant: 'primary' },
        { label: 'Individual / Vehicle Lookup', route: '/search' },
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
        { label: 'Response Board', route: '/units', variant: 'primary' },
        { label: 'Treatment Log', route: '/ems-treatment' },
        { label: 'Transport Tracker', route: '/ems-transport' },
        { label: 'Patient Reports', route: '/records' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    if (isFireDepartment) {
      return [
        { label: 'Response Board', route: '/units', variant: 'primary' },
        { label: 'Incident Reports', route: '/records' },
        { label: 'Lookup', route: '/search' },
        { label: 'Apparatus', route: '/fire-apparatus' },
        { label: 'Pre-Plans', route: '/fire-preplans' },
        { label: 'Incidents', route: '/incidents' },
      ];
    }
    return [
      { label: responseBoardLabel, route: primaryBoardRoute, variant: 'primary' },
      { label: 'Lookup', route: '/search' },
      { label: 'Incidents', route: '/incidents' },
    ];
  })();

  const workflowChecklist = (() => {
    if (isDispatch) {
      return [
        'Monitor new calls, timers, and priority alerts on the dispatch board.',
        'Allocate the closest available units and track pursuits in real time.',
        'Use lookup for cross-checks before escalating or linking incidents.',
      ];
    }
    if (isPoliceDepartment) {
      return [
        'Use lookup to confirm licence and registration details before actioning.',
        'Create arrest reports for draft and supervisor review, then finalise when ready.',
        'Link records, warrants, POIs, and evidence under a shared incident or case.',
      ];
    }
    if (isEmsDepartment) {
      return [
        'Allocate crews on the response board, then document care in Treatment Log.',
        'Use Transport Tracker for destination, ETA, and handover status.',
        'Complete patient reports for clinical records and follow-up review.',
      ];
    }
    if (isFireDepartment) {
      return [
        'Use Response Board for live incident allocation and appliance coordination.',
        'Document post-incident outcomes in Incident Reports.',
        'Maintain pre-plans and apparatus readiness for repeat-risk locations.',
      ];
    }
    return [
      'Use the relevant tab workflow for live response, lookup, and documentation.',
    ];
  })();

  const departmentPanels = (() => {
    if (isPoliceDepartment) {
      return [
        {
          key: 'warrants',
          eyebrow: 'Warrants',
          title: 'Outstanding warrant workload',
          value: loading ? '...' : String(stats.active_warrants),
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
          title: 'Persons and vehicles of interest',
          value: loading ? '...' : String(stats.active_bolos),
          valueTone: 'text-cad-accent-light',
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
          title: 'Records and arrest workflow',
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
          body: 'Use the dispatch board for call triage, macros, priority tones, pursuit tracking, and unit allocation.',
          actions: [
            { label: 'Open Dispatch Board', route: '/dispatch', variant: 'primary' },
            { label: 'Lookup', route: '/search' },
          ],
        },
        {
          key: 'coordination',
          eyebrow: 'Coordination',
          title: 'Operational coordination',
          body: 'Monitor available units, active incidents, and escalation workload from the live overview above.',
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
          title: 'Treatment and transport workflow',
          body: 'Document treatment, medications and procedures first, then complete transport destination and handover details.',
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
          title: 'Readiness and pre-planning',
          body: 'Use Apparatus and Pre-Plans to maintain readiness, site knowledge, and recurring risk information.',
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

  return (
    <div className="space-y-5 relative">
      <section
        className="relative overflow-hidden rounded-3xl border p-5 sm:p-6"
        style={{
          borderColor: colorWithAlpha(deptColor, 0.24, 'rgba(255,255,255,0.1)'),
          background:
            `radial-gradient(circle at 10% 15%, ${colorWithAlpha(deptColor, 0.22)}, transparent 48%),` +
            `radial-gradient(circle at 90% 5%, ${colorWithAlpha(deptColor, 0.1)}, transparent 45%),` +
            'linear-gradient(180deg, rgba(16,22,33,0.96), rgba(12,16,25,0.97))',
          boxShadow: `0 18px 44px ${colorWithAlpha(deptColor, 0.14)}`,
        }}
      >
        <div className="absolute inset-0 cad-ambient-grid opacity-40" />
        <div className="cad-ambient-orb cad-orb-float-a -top-12 -left-10 w-44 h-44" style={{ backgroundColor: colorWithAlpha(deptColor, 0.24) }} />
        <div className="cad-ambient-orb cad-orb-float-b bottom-4 right-10 w-52 h-52" style={{ backgroundColor: colorWithAlpha(deptColor, 0.12) }} />

        {deptLogo ? (
          <div className="pointer-events-none absolute right-3 top-3 bottom-3 w-[38%] hidden xl:block opacity-25 cad-watermark-fade">
            <img src={deptLogo} alt="" className="w-full h-full object-contain cad-watermark-image" />
          </div>
        ) : null}

        <div className="relative grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-4">
          <div className="min-w-0 rounded-2xl border border-white/5 bg-black/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="px-3 py-1 rounded-full border border-cad-border bg-cad-surface/70 text-xs uppercase tracking-[0.16em] text-cad-muted">
                {departmentTypeLabel}
              </span>
              <span
                className="px-3 py-1 rounded-full border text-xs"
                style={{
                  borderColor: colorWithAlpha(deptColor, 0.28),
                  backgroundColor: colorWithAlpha(deptColor, 0.09),
                  color: '#d9e7ff',
                }}
              >
                {loading ? 'Syncing overview...' : `Live overview - ${stats.on_duty_units} on duty`}
              </span>
              {lastUpdated ? (
                <span className="text-xs text-cad-muted">
                  Refreshed {formatTimeAU(lastUpdated, '-', true)}
                </span>
              ) : null}
            </div>

            <div className="flex items-start gap-4">
              {deptLogo ? (
                <div
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl p-2 border bg-cad-surface/75 shadow-inner flex-shrink-0"
                  style={{ borderColor: colorWithAlpha(deptColor, 0.25) }}
                >
                  <img src={deptLogo} alt="" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border bg-cad-surface/75 text-lg text-cad-muted flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: colorWithAlpha(deptColor, 0.25) }}
                >
                  {activeDepartment?.short_name?.slice(0, 3) || 'DEP'}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-cad-ink leading-tight">
                  {activeDepartment?.name || 'Department'}
                </h2>
                <p className="text-base sm:text-lg text-cad-muted mt-2 max-w-3xl">{slogan}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                  <div className="rounded-xl border border-cad-border bg-cad-surface/55 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-cad-muted">Duty</p>
                    <p className={`text-sm font-medium mt-1 ${dutyToneColor}`}>{dutyTone}</p>
                  </div>
                  <div className="rounded-xl border border-cad-border bg-cad-surface/55 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-cad-muted">{unitLabel}</p>
                    <p className="text-sm font-medium mt-1 text-cad-ink truncate">
                      {onActiveDeptDuty ? (myUnit?.callsign || 'On duty') : 'Not signed on'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cad-border bg-cad-surface/55 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.15em] text-cad-muted">Status</p>
                    <p className="text-sm font-medium mt-1 text-cad-ink capitalize">
                      {onActiveDeptDuty ? String(myUnit?.status || 'available').replace(/_/g, ' ') : 'Offline'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            <WatermarkPanel logo={deptLogo} accent={deptColor} className="px-4 py-3">
              <p className="text-xs text-cad-muted uppercase tracking-[0.15em]">Local Time</p>
              <p className="text-2xl sm:text-3xl font-semibold mt-1 tabular-nums">{clockTimeLabel}</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-sm text-cad-muted">{clockDateLabel}</p>
                {lastUpdated ? (
                  <p className="text-xs text-cad-muted">Updated {formatTimeAU(lastUpdated, '-', true)}</p>
                ) : null}
              </div>
            </WatermarkPanel>

            <WatermarkPanel logo={deptLogo} accent={deptColor} className="px-4 py-3">
              <p className="text-xs text-cad-muted uppercase tracking-[0.15em] mb-2">Duty Controls</p>
              {onActiveDeptDuty ? (
                <>
                  <div className="text-xs text-cad-muted mb-2">
                    Signed on as <span className="text-cad-ink font-medium">{myUnit?.callsign || unitLabel}</span>
                  </div>
                  <button
                    onClick={goOffDuty}
                    disabled={offDutyLoading}
                    className="w-full px-3 py-2 text-sm bg-red-500/12 text-red-300 border border-red-500/30 rounded-lg font-medium hover:bg-red-500/18 transition-colors disabled:opacity-50"
                  >
                    {offDutyLoading ? 'Processing...' : 'Go Off Duty'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={goOnDuty}
                    disabled={onOtherDeptDuty || onDutyLoading}
                    className="w-full px-3 py-2 text-sm text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: deptColor }}
                    title={onOtherDeptDuty ? 'You are already on duty in another department' : 'Go On Duty'}
                  >
                    {onOtherDeptDuty ? 'On Duty Elsewhere' : (onDutyLoading ? 'Processing...' : 'Go On Duty')}
                  </button>
                  <p className="text-xs text-cad-muted mt-2">
                    {onOtherDeptDuty
                      ? 'Sign off from your current department before joining this one.'
                      : 'Sign on to begin live response and operational actions.'}
                  </p>
                </>
              )}
            </WatermarkPanel>
          </div>
        </div>
      </section>

      <div className="relative isolate">
        {deptLogo ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 hidden sm:flex items-start justify-center">
            <div className="w-[620px] h-[620px] mt-10 cad-page-watermark-mask opacity-90">
              <img src={deptLogo} alt="" className="w-full h-full object-contain cad-page-watermark-image" />
            </div>
          </div>
        ) : null}

        <div className="relative space-y-4">
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {statCards.map((card) => (
              <WatermarkPanel key={card.label} logo={deptLogo} accent={deptColor} className="p-4">
                <p className="text-[11px] text-cad-muted uppercase tracking-[0.15em]">{card.label}</p>
                <p className={`text-2xl font-semibold mt-1 ${card.tone}`}>{loading ? '...' : card.value}</p>
                <p className="text-xs text-cad-muted mt-1">{card.help}</p>
              </WatermarkPanel>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-4">
            <WatermarkPanel logo={deptLogo} accent={deptColor} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] text-cad-muted uppercase tracking-[0.15em]">Operational Workspace</p>
                  <h3 className="text-xl font-semibold mt-1">Quick launch</h3>
                  <p className="text-sm text-cad-muted mt-1">
                    Open the most-used workflows for {activeDepartment?.name || 'this department'}.
                  </p>
                </div>
                <div
                  className="hidden sm:block rounded-full border px-3 py-1 text-xs"
                  style={{
                    borderColor: colorWithAlpha(deptColor, 0.28),
                    backgroundColor: colorWithAlpha(deptColor, 0.08),
                    color: '#d9e7ff',
                  }}
                >
                  {departmentTypeLabel}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                {quickActions.map((action) => (
                  <button
                    key={`${action.route}:${action.label}`}
                    type="button"
                    onClick={() => navigate(action.route)}
                    className={
                      action.variant === 'primary'
                        ? 'text-left rounded-xl border px-3 py-3 text-white font-medium transition-colors'
                        : 'text-left rounded-xl border border-cad-border bg-cad-surface/70 px-3 py-3 text-cad-ink hover:border-cad-accent/40 hover:bg-cad-surface transition-colors'
                    }
                    style={
                      action.variant === 'primary'
                        ? {
                            backgroundColor: colorWithAlpha(deptColor, 0.92, deptColor),
                            borderColor: colorWithAlpha(deptColor, 0.7),
                            boxShadow: `0 10px 24px ${colorWithAlpha(deptColor, 0.2)}`,
                          }
                        : undefined
                    }
                  >
                    <div className="text-sm">{action.label}</div>
                    <div className={`text-xs mt-1 ${action.variant === 'primary' ? 'text-white/85' : 'text-cad-muted'}`}>
                      Open workspace
                    </div>
                  </button>
                ))}
              </div>
            </WatermarkPanel>

            <WatermarkPanel logo={deptLogo} accent={deptColor} className="p-4 sm:p-5">
              <p className="text-[11px] text-cad-muted uppercase tracking-[0.15em]">Workflow Guidance</p>
              <h3 className="text-lg font-semibold mt-1">Recommended operating flow</h3>
              <ol className="space-y-2 mt-4">
                {workflowChecklist.map((item, index) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 w-5 h-5 rounded-full text-[11px] flex items-center justify-center border shrink-0"
                      style={{
                        borderColor: colorWithAlpha(deptColor, 0.32),
                        backgroundColor: colorWithAlpha(deptColor, 0.12),
                        color: '#d9e7ff',
                      }}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm text-cad-muted leading-5">{item}</span>
                  </li>
                ))}
              </ol>
            </WatermarkPanel>
          </section>

          {departmentPanels.length > 0 && (
            <section className={`grid grid-cols-1 gap-4 ${departmentPanels.length > 2 ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
              {departmentPanels.map((panel) => (
                <WatermarkPanel key={panel.key} logo={deptLogo} accent={deptColor} className="p-4 sm:p-5">
                  <p className="text-[11px] text-cad-muted uppercase tracking-[0.15em]">{panel.eyebrow}</p>
                  {panel.value ? (
                    <div className="flex items-end justify-between gap-3 mt-2">
                      <h3 className="text-lg font-semibold leading-tight">{panel.title}</h3>
                      <p className={`text-3xl font-semibold ${panel.valueTone || 'text-cad-accent-light'}`}>{panel.value}</p>
                    </div>
                  ) : (
                    <h3 className="text-lg font-semibold mt-2 leading-tight">{panel.title}</h3>
                  )}
                  <p className="text-sm text-cad-muted mt-2">{panel.body}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {panel.actions.map((action) => (
                      <button
                        key={`${panel.key}:${action.route}`}
                        type="button"
                        onClick={() => navigate(action.route)}
                        className={
                          action.variant === 'primary'
                            ? 'px-3 py-1.5 rounded-lg text-white text-sm font-medium transition-colors'
                            : 'px-3 py-1.5 rounded-lg bg-cad-surface border border-cad-border text-cad-ink text-sm hover:border-cad-accent/50 transition-colors'
                        }
                        style={action.variant === 'primary' ? { backgroundColor: deptColor } : undefined}
                      >
                        {action.variant === 'primary' ? `+ ${action.label}` : action.label}
                      </button>
                    ))}
                  </div>
                </WatermarkPanel>
              ))}
            </section>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-xs text-red-300 whitespace-pre-wrap">{error}</p>
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
