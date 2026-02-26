import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDepartment } from '../context/DepartmentContext';
import { useEventSource } from '../hooks/useEventSource';
import { useDeveloperCadPreview } from '../hooks/useDeveloperCadPreview';
import { api } from '../api/client';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../utils/departmentLayout';
import { UNIT_DUTY_CHANGED_EVENT } from '../utils/unitDutyEvents';

const LAW_NAV = [
  { to: '/department', label: 'Home', icon: 'M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10' },
  { to: '/incidents', label: 'Incidents', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/records', label: 'Arrest Reports', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/infringements', label: 'Infringement Notices', icon: 'M9 12h6m-6 4h6M7 3h10l1 2h2a1 1 0 011 1v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a1 1 0 011-1h2l1-2z' },
  { to: '/warrants', label: 'Warrants', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/bolos', label: 'POI / VOI', icon: 'M3 10h18M5 6h14M7 14h10M9 18h6' },
  { to: '/evidence', label: 'Evidence', icon: 'M9 3h6l1 2h3a1 1 0 011 1v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a1 1 0 011-1h3l1-2z' },
  { to: '/units', label: 'Units', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 4l-4.35 4.35M17 11h4m-2-2v4' },
];

const EMS_NAV = [
  { to: '/department', label: 'Home', icon: 'M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10' },
  { to: '/units', label: 'Response Board', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 4l-4.35 4.35M17 11h4m-2-2v4' },
  { to: '/incidents', label: 'Incidents', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/ems-treatment', label: 'Treatment Log', icon: 'M12 6v12m6-6H6' },
  { to: '/ems-transport', label: 'Transport Tracker', icon: 'M3 13h2l2-5 4 10 2-5h6' },
  { to: '/records', label: 'Patient Reports', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
];

const FIRE_NAV = [
  { to: '/department', label: 'Home', icon: 'M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10' },
  { to: '/units', label: 'Response Board', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 4l-4.35 4.35M17 11h4m-2-2v4' },
  { to: '/incidents', label: 'Incidents', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/records', label: 'Incident Reports', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/search', label: 'Lookup', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
];

const DISPATCH_NAV = [
  { to: '/department', label: 'Home', icon: 'M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10' },
  { to: '/dispatch', label: 'Dispatch', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 4l-4.35 4.35M17 11h4m-2-2v4' },
  { to: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
];

const CALL_DETAILS_NAV_ITEM = {
  to: '/call-details',
  label: 'Call Details',
  icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z',
};
function requiresOnDutyForNavItem(item) {
  const route = String(item?.to || '').trim();
  if (!route) return false;
  return route !== '/department';
}

function requiresFiveMOnlineForNavItem(item) {
  return item?.to === '/incidents'
    || item?.to === '/records'
    || item?.to === '/infringements'
    || item?.to === '/warrants'
    || item?.to === '/evidence';
}

function formatHiddenNavLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function getNavItemsForLayout(layoutType, activeDepartment) {
  if (activeDepartment?.is_dispatch) return DISPATCH_NAV;
  if (layoutType === DEPARTMENT_LAYOUT.PARAMEDICS) return EMS_NAV;
  if (layoutType === DEPARTMENT_LAYOUT.FIRE) return FIRE_NAV;
  return LAW_NAV;
}

function isEmergency000CallEvent(payload) {
  return String(payload?.call?.job_code || '').trim() === '000';
}

function normalizeDepartmentIds(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .map(item => Number(item))
        .filter(item => Number.isInteger(item) && item > 0)
    ));
  }

  if (typeof value === 'string') {
    const text = String(value || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return Array.from(new Set(
        parsed
          .map(item => Number(item))
          .filter(item => Number.isInteger(item) && item > 0)
      ));
    } catch {
      return [];
    }
  }

  return [];
}

function getRequestedDepartmentIdsFromEvent(payload) {
  const call = payload?.call || {};
  const fromArray = normalizeDepartmentIds(call.requested_department_ids);
  if (fromArray.length > 0) return fromArray;

  const fromJson = normalizeDepartmentIds(call.requested_department_ids_json);
  if (fromJson.length > 0) return fromJson;

  const fallbackDepartmentId = Number(call.department_id || payload?.departmentId || payload?.department_id || 0);
  if (Number.isInteger(fallbackDepartmentId) && fallbackDepartmentId > 0) return [fallbackDepartmentId];
  return [];
}

function isCallSoundRelevantToActiveDepartment(payload, activeDepartmentId, isDispatchDepartment) {
  if (!activeDepartmentId) return false;
  if (isDispatchDepartment) return true;

  const requestedDepartmentIds = getRequestedDepartmentIdsFromEvent(payload);
  if (requestedDepartmentIds.length === 0) return false;
  return requestedDepartmentIds.includes(activeDepartmentId);
}

function SidebarLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-cad-accent/20 text-cad-accent-light font-medium'
            : 'text-cad-muted hover:text-cad-ink hover:bg-cad-card'
        }`
      }
    >
      {icon && (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      )}
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { departments, isFiveMOnline, refreshUser } = useAuth();
  const { activeDepartment } = useDepartment();
  const { enabled: developerPreviewEnabled } = useDeveloperCadPreview();
  const [dispatcherOnline, setDispatcherOnline] = useState(false);
  const [isDispatchDepartment, setIsDispatchDepartment] = useState(false);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [onDutyDepartmentId, setOnDutyDepartmentId] = useState(0);
  const [hasActiveCall, setHasActiveCall] = useState(false);
  const [assumeFiveMOnlineUntil, setAssumeFiveMOnlineUntil] = useState(0);
  const callAssignAudioRef = useRef(null);
  const emergencyCallAudioRef = useRef(null);
  const dutyRefreshTimersRef = useRef([]);
  const pendingDutyTransitionRef = useRef({ action: '', expiresAt: 0 });

  const deptId = activeDepartment?.id;
  const layoutType = getDepartmentLayoutType(activeDepartment);

  useEffect(() => {
    const callAssignAudio = new Audio('/sounds/cad-added-call.mp3');
    callAssignAudio.preload = 'auto';
    callAssignAudioRef.current = callAssignAudio;

    const emergencyCallAudio = new Audio('/sounds/000call.mp3');
    emergencyCallAudio.preload = 'auto';
    emergencyCallAudioRef.current = emergencyCallAudio;

    return () => {
      if (callAssignAudioRef.current) {
        callAssignAudioRef.current.pause();
        callAssignAudioRef.current = null;
      }
      if (emergencyCallAudioRef.current) {
        emergencyCallAudioRef.current.pause();
        emergencyCallAudioRef.current = null;
      }
    };
  }, []);

  const playCallAssignSound = useCallback(() => {
    const audio = callAssignAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const maybePromise = audio.play();
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore autoplay/user gesture restrictions.
    }
  }, []);

  const playEmergencyCallSound = useCallback(() => {
    const audio = emergencyCallAudioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const maybePromise = audio.play();
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore autoplay/user gesture restrictions.
    }
  }, []);

  const fetchDispatcherStatus = useCallback(async () => {
    if (!deptId) {
      setDispatcherOnline(false);
      setIsDispatchDepartment(false);
      return;
    }

    try {
      const status = await api.get(`/api/units/dispatcher-status?department_id=${deptId}`);
      setDispatcherOnline(!!status?.dispatcher_online);
      setIsDispatchDepartment(!!status?.is_dispatch_department);
    } catch {
      // Keep sidebar usable even if dispatcher status lookup fails.
    }
  }, [deptId]);

  const fetchOnDutyStatus = useCallback(async () => {
    try {
      const unit = await api.get('/api/units/me');
      setIsOnDuty(true);
      const unitDepartmentId = Number(unit?.department_id || 0);
      setOnDutyDepartmentId(Number.isInteger(unitDepartmentId) && unitDepartmentId > 0 ? unitDepartmentId : 0);
      pendingDutyTransitionRef.current = { action: '', expiresAt: 0 };
    } catch (err) {
      if (err?.status === 404 || err?.status === 401) {
        const pending = pendingDutyTransitionRef.current || {};
        const withinOnDutyGrace = pending.action === 'on_duty' && Number(pending.expiresAt || 0) > Date.now();
        if (withinOnDutyGrace) {
          return;
        }
        setIsOnDuty(false);
        setOnDutyDepartmentId(0);
        setHasActiveCall(false);
      }
    }
  }, []);

  const fetchActiveCallStatus = useCallback(async () => {
    if (!deptId) {
      setHasActiveCall(false);
      return;
    }

    try {
      const activeCall = await api.get('/api/units/me/active-call');
      setHasActiveCall(!!activeCall?.id);
    } catch (err) {
      if (err?.status === 404 || err?.status === 401) {
        setHasActiveCall(false);
      }
    }
  }, [deptId]);

  useEffect(() => {
    fetchDispatcherStatus();
    fetchOnDutyStatus();
    fetchActiveCallStatus();
  }, [fetchDispatcherStatus, fetchOnDutyStatus, fetchActiveCallStatus]);

  const refreshSidebarStatus = useCallback(() => {
    fetchDispatcherStatus();
    fetchOnDutyStatus();
    fetchActiveCallStatus();
  }, [fetchDispatcherStatus, fetchOnDutyStatus, fetchActiveCallStatus]);

  const clearDutyRefreshTimers = useCallback(() => {
    for (const timerId of dutyRefreshTimersRef.current) {
      clearTimeout(timerId);
    }
    dutyRefreshTimersRef.current = [];
  }, []);

  const scheduleDutyReconcileRefresh = useCallback(() => {
    clearDutyRefreshTimers();

    const runRefresh = () => {
      refreshSidebarStatus();
      if (typeof refreshUser === 'function') {
        refreshUser();
      }
    };

    runRefresh();
    [250, 800, 1600, 3000].forEach((delay) => {
      const timerId = window.setTimeout(runRefresh, delay);
      dutyRefreshTimersRef.current.push(timerId);
    });
  }, [clearDutyRefreshTimers, refreshSidebarStatus, refreshUser]);

  useEffect(() => {
    return () => {
      clearDutyRefreshTimers();
    };
  }, [clearDutyRefreshTimers]);

  useEffect(() => {
    function handleDutyChanged(event) {
      const detail = event?.detail || {};
      const action = String(detail?.action || '').trim().toLowerCase();
      const changedDepartmentId = Number(detail?.department_id || detail?.departmentId || 0);

      // Optimistically update duty state so the sidebar tabs change immediately,
      // then reconcile with the API refresh below.
      if (action === 'on_duty') {
        pendingDutyTransitionRef.current = { action: 'on_duty', expiresAt: Date.now() + 5000 };
        setIsOnDuty(true);
        if (Number.isInteger(changedDepartmentId) && changedDepartmentId > 0) {
          setOnDutyDepartmentId(changedDepartmentId);
        }
        // Auth/FiveM online state can lag behind the duty create call; keep tabs visible
        // briefly while auth/me catches up so the sidebar fully expands immediately.
        setAssumeFiveMOnlineUntil(Date.now() + 5000);
      } else if (action === 'off_duty') {
        pendingDutyTransitionRef.current = { action: 'off_duty', expiresAt: Date.now() + 2000 };
        setIsOnDuty(false);
        setOnDutyDepartmentId(0);
        setHasActiveCall(false);
        setAssumeFiveMOnlineUntil(0);
      }

      scheduleDutyReconcileRefresh();
    }
    window.addEventListener(UNIT_DUTY_CHANGED_EVENT, handleDutyChanged);
    return () => window.removeEventListener(UNIT_DUTY_CHANGED_EVENT, handleDutyChanged);
  }, [scheduleDutyReconcileRefresh]);

  useEventSource({
    'call:create': (payload) => {
      if (!isOnDuty) return;
      if (onDutyDepartmentId > 0 && deptId && onDutyDepartmentId !== deptId) return;
      if (!isCallSoundRelevantToActiveDepartment(payload, Number(deptId || 0), isDispatchDepartment)) return;
      if (isEmergency000CallEvent(payload)) {
        const fromPendingDispatch = payload?.from_fivem_pending_dispatch === true;
        if (fromPendingDispatch && payload?.play_emergency_sound !== true) {
          return;
        }
        playEmergencyCallSound();
      }
    },
    'unit:online': () => {
      refreshSidebarStatus();
    },
    'unit:offline': () => {
      refreshSidebarStatus();
    },
    'call:assign': (payload) => {
      fetchActiveCallStatus();
      if (payload?.suppress_assignment_sound === true) {
        return;
      }
      if (!isOnDuty) return;
      if (onDutyDepartmentId > 0 && deptId && onDutyDepartmentId !== deptId) return;
      if (!isCallSoundRelevantToActiveDepartment(payload, Number(deptId || 0), isDispatchDepartment)) return;
      playCallAssignSound();
    },
    'call:unassign': () => {
      fetchActiveCallStatus();
    },
    'call:close': () => {
      fetchActiveCallStatus();
    },
  });

  const baseNavItems = getNavItemsForLayout(layoutType, activeDepartment);
  const activeDepartmentId = Number(deptId || 0);
  const isOnDutyForActiveDepartment = !!isOnDuty && (
    activeDepartmentId <= 0
    || onDutyDepartmentId <= 0
    || onDutyDepartmentId === activeDepartmentId
  );
  const effectiveOnDutyForActiveDepartment = developerPreviewEnabled || isOnDutyForActiveDepartment;
  const effectiveIsFiveMOnline = developerPreviewEnabled
    || !!isFiveMOnline
    || (isOnDutyForActiveDepartment && Date.now() < Number(assumeFiveMOnlineUntil || 0));
  const hideInGameProtectedItems = !effectiveIsFiveMOnline && !activeDepartment?.is_dispatch;
  const hiddenInGameNavLabels = hideInGameProtectedItems
    ? baseNavItems
      .filter((item) => requiresFiveMOnlineForNavItem(item))
      .map((item) => item.label)
    : [];
  const hiddenInGameNavText = formatHiddenNavLabels(hiddenInGameNavLabels);

  const navItems = baseNavItems.filter((item) => {
    if (requiresOnDutyForNavItem(item) && !effectiveOnDutyForActiveDepartment) return false;
    if (requiresFiveMOnlineForNavItem(item) && hideInGameProtectedItems) return false;
    return true;
  });

  const navWithCallDetails = (hasActiveCall && effectiveOnDutyForActiveDepartment)
    ? [...navItems, CALL_DETAILS_NAV_ITEM]
    : navItems;

  // Department sidebar should not appear at all until the user is on duty in that department.
  if (activeDepartment && !effectiveOnDutyForActiveDepartment) {
    return null;
  }

  return (
    <aside className="cad-app-sidebar-shell w-56 bg-cad-surface border-r border-cad-border flex flex-col h-full">
      {/* Main navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {activeDepartment ? (
          <>
            <div className="text-xs text-cad-muted uppercase tracking-wider mb-2 px-3">
              {activeDepartment.short_name}
            </div>
            {developerPreviewEnabled && (
              <div className="mb-2 mx-1 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-sky-300">Developer Preview</p>
                <p className="text-xs text-cad-muted mt-1">
                  Duty/FiveM sidebar gating is temporarily bypassed in this browser.
                </p>
              </div>
            )}
            {navWithCallDetails.map(item => (
              <SidebarLink key={item.to} {...item} />
            ))}
            {hiddenInGameNavLabels.length > 0 && (
              <div className="mt-3 mx-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-amber-300">In-Game Required</p>
                <p className="text-xs text-cad-muted mt-1">
                  Connect to the FiveM server to access {hiddenInGameNavText} in this {activeDepartment?.is_dispatch ? 'dispatch' : 'department'} workspace.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <SidebarLink to="/home" label="Home" icon="M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10" />
          </>
        )}

        {!activeDepartment && departments.length === 0 && (
          <div className="px-3 py-4 text-sm text-cad-muted">
            <p className="mb-2">No department access.</p>
            <p>Link your Discord account in Profile Settings to get access.</p>
          </div>
        )}
      </nav>
    </aside>
  );
}
