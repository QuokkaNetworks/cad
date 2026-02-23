import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDepartment } from '../context/DepartmentContext';
import { useEventSource } from '../hooks/useEventSource';
import { api } from '../api/client';
import { DEPARTMENT_LAYOUT, getDepartmentLayoutType } from '../utils/departmentLayout';

const LAW_NAV = [
  { to: '/department', label: 'Home', icon: 'M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10' },
  { to: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { to: '/records', label: 'Records', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/warrants', label: 'Warrants', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/bolos', label: 'BOLOs', icon: 'M3 10h18M5 6h14M7 14h10M9 18h6' },
  { to: '/evidence', label: 'Evidence', icon: 'M9 3h6l1 2h3a1 1 0 011 1v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a1 1 0 011-1h3l1-2z' },
  { to: '/units', label: 'Units', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 4l-4.35 4.35M17 11h4m-2-2v4' },
];

const EMS_NAV = [
  { to: '/department', label: 'Home', icon: 'M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10' },
  { to: '/ems-treatment', label: 'Treatment Log', icon: 'M12 6v12m6-6H6' },
  { to: '/ems-transport', label: 'Transport Tracker', icon: 'M3 13h2l2-5 4 10 2-5h6' },
  { to: '/records', label: 'Patient Reports', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/units', label: 'Response Board', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 4l-4.35 4.35M17 11h4m-2-2v4' },
];

const FIRE_NAV = [
  { to: '/department', label: 'Home', icon: 'M3 12l9-9 9 9M4 10v10h5v-6h6v6h5V10' },
  { to: '/units', label: 'Response Board', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 4l-4.35 4.35M17 11h4m-2-2v4' },
  { to: '/records', label: 'Incident Reports', icon: 'M9 12h6m-6 4h6M8 2h8a2 2 0 012 2v16l-6-3-6 3V4a2 2 0 012-2z' },
  { to: '/search', label: 'Lookup', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { to: '/fire-apparatus', label: 'Apparatus', icon: 'M3 17h18M5 17V9h10v8M15 17V5h4v12M7 13h2' },
  { to: '/fire-preplans', label: 'Pre-Plans', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5a2 2 0 012-2h10a2 2 0 012 2v11.382a1 1 0 01-.553.894L11 20m0 0V4' },
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
  const { departments } = useAuth();
  const { activeDepartment } = useDepartment();
  const [dispatcherOnline, setDispatcherOnline] = useState(false);
  const [isDispatchDepartment, setIsDispatchDepartment] = useState(false);
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [onDutyDepartmentId, setOnDutyDepartmentId] = useState(0);
  const [hasActiveCall, setHasActiveCall] = useState(false);
  const callAssignAudioRef = useRef(null);
  const emergencyCallAudioRef = useRef(null);

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
    } catch (err) {
      if (err?.status === 404 || err?.status === 401) {
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
      fetchDispatcherStatus();
      fetchOnDutyStatus();
      fetchActiveCallStatus();
    },
    'unit:offline': () => {
      fetchDispatcherStatus();
      fetchOnDutyStatus();
      fetchActiveCallStatus();
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

  const navItems = getNavItemsForLayout(layoutType, activeDepartment).filter((item) => {
    const isDispatchTab = item.to === '/units' || item.to === '/dispatch';
    if (!isOnDuty && isDispatchTab) return false;
    return true;
  });

  const navWithCallDetails = hasActiveCall
    ? [...navItems, CALL_DETAILS_NAV_ITEM]
    : navItems;

  return (
    <aside className="w-56 bg-cad-surface border-r border-cad-border flex flex-col h-full">
      {/* Main navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {activeDepartment ? (
          <>
            <div className="text-xs text-cad-muted uppercase tracking-wider mb-2 px-3">
              {activeDepartment.short_name}
            </div>
            {navWithCallDetails.map(item => (
              <SidebarLink key={item.to} {...item} />
            ))}
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
