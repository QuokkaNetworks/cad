import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useDepartment } from '../../context/DepartmentContext';
import { useEventSource } from '../../hooks/useEventSource';

// GTA V/FiveM pause map uses a 2x3 tile grid. Community mapping references
// and Cfx minimap tile research commonly treat each tile as 4500 world units.
// This gives a 9000 x 13500 world-space extent that matches the 2:3 atlas ratio.
// We anchor it so Y=0 sits on the lower third boundary, which matches typical
// GTA world coordinate distribution (Los Santos in the southern portion, Blaine north).
const GTA_MAP_TILE_UNITS = 4500;
const WORLD_BOUNDS = {
  minX: -GTA_MAP_TILE_UNITS,
  maxX: GTA_MAP_TILE_UNITS,
  minY: -GTA_MAP_TILE_UNITS,
  maxY: GTA_MAP_TILE_UNITS * 2,
};
const MAP_CANVAS_WIDTH = 1000;
const MAP_CANVAS_HEIGHT = 1500;
const MAP_IMAGE_SRC = '/maps/FullMap.png';
// `FullMap.png` contains transparent padding/non-atlas artwork around the pause-map atlas.
// These normalized values define the calibrated atlas rectangle inside the image.
// The rect was derived from the image alpha bounds (6144x9216 source; alpha bbox
// 75,348 -> 6131,8576) and then fit to the exact 2:3 pause-map atlas ratio.
const MAP_WORLD_IMAGE_RECT_NORMALIZED = {
  x: 0.0586751302083333,
  y: 0.0377604166666667,
  width: 0.892903645833333,
  height: 0.892903645833333,
};
const MAP_SUBGRID_WORLD_STEP = 1500;
const MAP_WHOLE_IMAGE_ZOOM = 1;
const MAP_ATLAS_FIT_ZOOM = Number((1 / MAP_WORLD_IMAGE_RECT_NORMALIZED.width).toFixed(2));
const MAP_DEFAULT_ZOOM = MAP_ATLAS_FIT_ZOOM;
const MAP_MIN_ZOOM = MAP_WHOLE_IMAGE_ZOOM;
const MAP_MAX_ZOOM = 12;
const MAP_BUTTON_ZOOM_STEP = 0.2;
const MAP_KEYBOARD_PAN_STEP = 80;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clampPanToViewport(viewport, scale, x, y) {
  const width = Number(viewport?.width || 0);
  const height = Number(viewport?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { x, y };
  }

  const atlasRect = getWorldImageRect(width, height);
  const scaledAtlasWidth = atlasRect.width * scale;
  const scaledAtlasHeight = atlasRect.height * scale;
  let nextX = Number(x) || 0;
  let nextY = Number(y) || 0;

  if (scaledAtlasWidth <= width) {
    nextX = ((width - scaledAtlasWidth) / 2) - (atlasRect.x * scale);
  } else {
    const maxX = -(atlasRect.x * scale);
    const minX = width - ((atlasRect.x + atlasRect.width) * scale);
    nextX = clamp(nextX, minX, maxX);
  }

  if (scaledAtlasHeight <= height) {
    nextY = ((height - scaledAtlasHeight) / 2) - (atlasRect.y * scale);
  } else {
    const maxY = -(atlasRect.y * scale);
    const minY = height - ((atlasRect.y + atlasRect.height) * scale);
    nextY = clamp(nextY, minY, maxY);
  }

  return { x: round2(nextX), y: round2(nextY) };
}

function parseNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getWorldImageRect(width = MAP_CANVAS_WIDTH, height = MAP_CANVAS_HEIGHT) {
  return {
    x: width * MAP_WORLD_IMAGE_RECT_NORMALIZED.x,
    y: height * MAP_WORLD_IMAGE_RECT_NORMALIZED.y,
    width: width * MAP_WORLD_IMAGE_RECT_NORMALIZED.width,
    height: height * MAP_WORLD_IMAGE_RECT_NORMALIZED.height,
  };
}

function isPointInsideRect(pointX, pointY, rect) {
  if (!rect) return false;
  return (
    Number(pointX) >= rect.x
    && Number(pointX) <= (rect.x + rect.width)
    && Number(pointY) >= rect.y
    && Number(pointY) <= (rect.y + rect.height)
  );
}

function toMapPoint(x, y, width = MAP_CANVAS_WIDTH, height = MAP_CANVAS_HEIGHT) {
  const rect = getWorldImageRect(width, height);
  const px = rect.x + (((x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)) * rect.width);
  const py = rect.y + rect.height - (((y - WORLD_BOUNDS.minY) / (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY)) * rect.height);
  return {
    x: Math.max(rect.x, Math.min(rect.x + rect.width, px)),
    y: Math.max(rect.y, Math.min(rect.y + rect.height, py)),
  };
}

function toWorldPoint(mapX, mapY, width = MAP_CANVAS_WIDTH, height = MAP_CANVAS_HEIGHT) {
  const rect = getWorldImageRect(width, height);
  const relX = (Number(mapX) - rect.x) / rect.width;
  const relY = (Number(mapY) - rect.y) / rect.height;
  const x = WORLD_BOUNDS.minX + (relX * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX));
  const y = WORLD_BOUNDS.minY + ((1 - relY) * (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY));
  return { x, y };
}

function headingLineFromMapPoint(point, heading, length = 18) {
  const h = Number(heading);
  if (!point || !Number.isFinite(h)) return null;
  // GTA heading 0 is north; convert into SVG x/y vector.
  const radians = ((h - 90) * Math.PI) / 180;
  return {
    x1: point.x,
    y1: point.y,
    x2: point.x + (Math.cos(radians) * length),
    y2: point.y + (Math.sin(radians) * length),
  };
}

function statusColor(status) {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'available') return '#22c55e';
  if (key === 'enroute' || key === 'en_route') return '#38bdf8';
  if (key === 'on-scene' || key === 'on_scene') return '#f97316';
  if (key === 'busy') return '#f59e0b';
  return '#94a3b8';
}

function priorityColor(priority) {
  const p = String(priority || '').trim();
  if (p === '1') return '#fb7185';
  if (p === '2') return '#f59e0b';
  if (p === '3') return '#60a5fa';
  return '#94a3b8';
}

function labelize(value) {
  return String(value || '').trim().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '-';
}

function formatRelativeAge(value) {
  if (!value) return '-';
  const ms = Date.parse(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(ms)) return '-';
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.round(seconds / 60);
  return `${mins}m ago`;
}

function distanceMetres(a, b) {
  if (!a || !b) return null;
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return Math.sqrt((dx * dx) + (dy * dy));
}

function shapeIsPolygon(zone) {
  return String(zone?.shape || '').trim().toLowerCase() === 'polygon';
}

function zoneMatchesDepartment(zone, departmentFilter) {
  if (departmentFilter === 'all') return true;
  const target = Number(departmentFilter || 0);
  if (!target) return true;
  const primary = Number(zone?.department_id || 0);
  const backup = Number(zone?.backup_department_id || 0);
  if (!primary && !backup) return true;
  return primary === target || backup === target;
}

function ZoneOverlay({ zone, width = MAP_CANVAS_WIDTH, height = MAP_CANVAS_HEIGHT }) {
  if (!zone) return null;
  if (shapeIsPolygon(zone)) {
    const points = Array.isArray(zone.points) ? zone.points : [];
    const mapped = points
      .map((p) => ({ x: parseNum(p?.x), y: parseNum(p?.y) }))
      .filter((p) => p.x !== null && p.y !== null)
      .map((p) => toMapPoint(p.x, p.y, width, height));
    if (mapped.length < 3) return null;
    const d = mapped.map((p) => `${p.x},${p.y}`).join(' ');
    return <polygon points={d} fill="rgba(251, 191, 36, 0.08)" stroke="rgba(251, 191, 36, 0.45)" strokeWidth="2" />;
  }
  const x = parseNum(zone.x);
  const y = parseNum(zone.y);
  const radius = parseNum(zone.radius);
  if (x === null || y === null || radius === null || radius <= 0) return null;
  const center = toMapPoint(x, y, width, height);
  const rect = getWorldImageRect(width, height);
  const sx = rect.width / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX);
  const sy = rect.height / (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY);
  const r = Math.max(2, radius * Math.min(sx, sy));
  return <circle cx={center.x} cy={center.y} r={r} fill="rgba(251, 191, 36, 0.08)" stroke="rgba(251, 191, 36, 0.45)" strokeWidth="2" />;
}

function MapGridOverlay({
  width = MAP_CANVAS_WIDTH,
  height = MAP_CANVAS_HEIGHT,
  showGrid = true,
  showLabels = true,
}) {
  const rect = getWorldImageRect(width, height);
  const majorXStep = GTA_MAP_TILE_UNITS;
  const majorYStep = GTA_MAP_TILE_UNITS;
  const subStep = MAP_SUBGRID_WORLD_STEP;

  const subVerticals = [];
  for (let x = WORLD_BOUNDS.minX + subStep; x < WORLD_BOUNDS.maxX; x += subStep) {
    if ((x - WORLD_BOUNDS.minX) % majorXStep === 0) continue;
    const p = toMapPoint(x, WORLD_BOUNDS.minY, width, height);
    subVerticals.push({ x, px: p.x });
  }

  const subHorizontals = [];
  for (let y = WORLD_BOUNDS.minY + subStep; y < WORLD_BOUNDS.maxY; y += subStep) {
    if ((y - WORLD_BOUNDS.minY) % majorYStep === 0) continue;
    const p = toMapPoint(WORLD_BOUNDS.minX, y, width, height);
    subHorizontals.push({ y, py: p.y });
  }

  const majorVerticals = [];
  for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += majorXStep) {
    const p = toMapPoint(x, WORLD_BOUNDS.minY, width, height);
    majorVerticals.push({ x, px: p.x });
  }

  const majorHorizontals = [];
  for (let y = WORLD_BOUNDS.minY; y <= WORLD_BOUNDS.maxY; y += majorYStep) {
    const p = toMapPoint(WORLD_BOUNDS.minX, y, width, height);
    majorHorizontals.push({ y, py: p.y });
  }

  const axisX = toMapPoint(0, WORLD_BOUNDS.minY, width, height).x;
  const axisY = toMapPoint(WORLD_BOUNDS.minX, 0, width, height).y;

  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width={width} height={rect.y} fill="rgba(2, 6, 23, 0.36)" />
      <rect x={0} y={rect.y + rect.height} width={width} height={Math.max(0, height - (rect.y + rect.height))} fill="rgba(2, 6, 23, 0.36)" />
      <rect x={0} y={rect.y} width={rect.x} height={rect.height} fill="rgba(2, 6, 23, 0.36)" />
      <rect x={rect.x + rect.width} y={rect.y} width={Math.max(0, width - (rect.x + rect.width))} height={rect.height} fill="rgba(2, 6, 23, 0.36)" />

      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="rgba(2, 6, 23, 0.08)" stroke="rgba(148, 163, 184, 0.28)" strokeWidth="1.5" />

      {showGrid ? (
        <>
          {subVerticals.map((line) => (
            <line
              key={`subvx-${line.x}`}
              x1={line.px}
              y1={rect.y}
              x2={line.px}
              y2={rect.y + rect.height}
              stroke="rgba(148, 163, 184, 0.16)"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
          ))}
          {subHorizontals.map((line) => (
            <line
              key={`subhy-${line.y}`}
              x1={rect.x}
              y1={line.py}
              x2={rect.x + rect.width}
              y2={line.py}
              stroke="rgba(148, 163, 184, 0.16)"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
          ))}

          {majorVerticals.map((line) => (
            <line
              key={`majorvx-${line.x}`}
              x1={line.px}
              y1={rect.y}
              x2={line.px}
              y2={rect.y + rect.height}
              stroke="rgba(96, 165, 250, 0.38)"
              strokeWidth="1.6"
            />
          ))}
          {majorHorizontals.map((line) => (
            <line
              key={`majorhy-${line.y}`}
              x1={rect.x}
              y1={line.py}
              x2={rect.x + rect.width}
              y2={line.py}
              stroke="rgba(96, 165, 250, 0.38)"
              strokeWidth="1.6"
            />
          ))}

          <line
            x1={axisX}
            y1={rect.y}
            x2={axisX}
            y2={rect.y + rect.height}
            stroke="rgba(34, 197, 94, 0.55)"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
          <line
            x1={rect.x}
            y1={axisY}
            x2={rect.x + rect.width}
            y2={axisY}
            stroke="rgba(244, 114, 182, 0.45)"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
        </>
      ) : null}

      {showLabels ? (
        <>
          <text x={rect.x + 8} y={rect.y + 18} fill="rgba(226,232,240,0.86)" fontSize="11" fontWeight="600">
            Calibrated GTA Pause-Map Atlas (2x3 tiles)
          </text>
          <text x={rect.x + 8} y={rect.y + 33} fill="rgba(148,163,184,0.95)" fontSize="10">
            Tile size 4500u | Subgrid 1500u | X axis = green | Y=0 boundary = pink
          </text>
          <text x={rect.x + 8} y={rect.y + rect.height - 10} fill="rgba(148,163,184,0.92)" fontSize="10">
            X {WORLD_BOUNDS.minX}..{WORLD_BOUNDS.maxX} | Y {WORLD_BOUNDS.minY}..{WORLD_BOUNDS.maxY}
          </text>
        </>
      ) : null}
    </g>
  );
}

export default function DispatchMap() {
  const { activeDepartment } = useDepartment();
  const departmentId = Number(activeDepartment?.id || 0) || null;
  const isDispatch = !!activeDepartment?.is_dispatch;

  const [units, setUnits] = useState([]);
  const [calls, setCalls] = useState([]);
  const [zones, setZones] = useState([]);
  const [visibleDepartments, setVisibleDepartments] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState('');
  const mapViewportRef = useRef(null);
  const dragStateRef = useRef(null);
  const suppressMarkerClickUntilRef = useRef(0);
  const [mapViewportSize, setMapViewportSize] = useState({ width: 0, height: 0 });
  const [mapView, setMapView] = useState({ scale: MAP_DEFAULT_ZOOM, x: 0, y: 0 });
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [cursorWorld, setCursorWorld] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({
    basemap: true,
    grid: true,
    zones: true,
    pursuits: true,
    recommendations: true,
    labels: true,
  });
  const mapZoom = mapView.scale;
  const atlasCoveragePct = Math.round(MAP_WORLD_IMAGE_RECT_NORMALIZED.width * 1000) / 10;
  const atlasFitZoomPct = Math.round(MAP_DEFAULT_ZOOM * 100);
  const wholeImageZoomPct = Math.round(MAP_WHOLE_IMAGE_ZOOM * 100);

  const loadMapData = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    setError('');
    try {
      if (isDispatch) {
        const [callsData, unitsData, dispatchableData, alarmData] = await Promise.all([
          api.get(`/api/calls?department_id=${departmentId}&dispatch=true`),
          api.get(`/api/units/map?department_id=${departmentId}&dispatch=true`),
          api.get('/api/units/dispatchable').catch(() => ({ departments: [], units: [] })),
          api.get(`/api/alarm-zones?department_id=${departmentId}&dispatch=true`).catch(() => ({ zones: [] })),
        ]);
        setCalls(Array.isArray(callsData) ? callsData : []);
        setUnits(Array.isArray(unitsData) ? unitsData : []);
        setVisibleDepartments(Array.isArray(dispatchableData?.departments) ? dispatchableData.departments : []);
        setZones(Array.isArray(alarmData?.zones) ? alarmData.zones : []);
      } else {
        const [callsData, unitsData, alarmData] = await Promise.all([
          api.get(`/api/calls?department_id=${departmentId}`),
          api.get(`/api/units/map?department_id=${departmentId}`),
          api.get(`/api/alarm-zones?department_id=${departmentId}`).catch(() => ({ zones: [] })),
        ]);
        setCalls(Array.isArray(callsData) ? callsData : []);
        setUnits(Array.isArray(unitsData) ? unitsData : []);
        setVisibleDepartments(activeDepartment ? [activeDepartment] : []);
        setZones(Array.isArray(alarmData?.zones) ? alarmData.zones : []);
      }
      setLastLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err?.message || 'Failed to load AVL map');
      setUnits([]);
      setCalls([]);
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, [activeDepartment, departmentId, isDispatch]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  useEffect(() => {
    const id = setInterval(() => loadMapData(), 5000);
    return () => clearInterval(id);
  }, [loadMapData]);

  useEventSource({
    'call:create': () => loadMapData(),
    'call:update': () => loadMapData(),
    'call:close': () => loadMapData(),
    'call:assign': () => loadMapData(),
    'call:unassign': () => loadMapData(),
    'unit:online': () => loadMapData(),
    'unit:offline': () => loadMapData(),
    'unit:update': () => loadMapData(),
    'pursuit:update': () => loadMapData(),
  });

  useEffect(() => {
    if (!isDispatch) {
      setDepartmentFilter('all');
    }
  }, [isDispatch]);

  const departmentOptions = useMemo(() => {
    const rows = Array.isArray(visibleDepartments) ? visibleDepartments : [];
    return rows.filter(Boolean).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [visibleDepartments]);

  const filteredUnits = useMemo(() => {
    const target = Number(departmentFilter || 0);
    return (Array.isArray(units) ? units : []).filter((u) => {
      if (String(departmentFilter) === 'all' || !target) return true;
      return Number(u.department_id || 0) === target;
    });
  }, [units, departmentFilter]);

  const filteredCalls = useMemo(() => {
    const target = Number(departmentFilter || 0);
    return (Array.isArray(calls) ? calls : []).filter((c) => {
      if (String(departmentFilter) === 'all' || !target) return true;
      return Number(c.department_id || 0) === target || (Array.isArray(c.requested_department_ids) && c.requested_department_ids.includes(target));
    });
  }, [calls, departmentFilter]);

  const filteredZones = useMemo(() => {
    return (Array.isArray(zones) ? zones : []).filter((zone) => zoneMatchesDepartment(zone, departmentFilter));
  }, [zones, departmentFilter]);

  const unitMarkers = useMemo(() => {
    return filteredUnits
      .map((u) => {
        const x = parseNum(u.position_x);
        const y = parseNum(u.position_y);
        if (x === null || y === null) return null;
        return { ...u, __map: toMapPoint(x, y) };
      })
      .filter(Boolean);
  }, [filteredUnits]);

  const unitPositionById = useMemo(() => {
    const map = new Map();
    for (const unit of unitMarkers) map.set(Number(unit.id), unit.__map);
    return map;
  }, [unitMarkers]);

  const callMarkers = useMemo(() => {
    return filteredCalls
      .map((c) => {
        const x = parseNum(c.position_x);
        const y = parseNum(c.position_y);
        if (x === null || y === null) return null;
        return { ...c, __map: toMapPoint(x, y) };
      })
      .filter(Boolean);
  }, [filteredCalls]);

  const pursuitLines = useMemo(() => {
    const lines = [];
    for (const call of filteredCalls) {
      if (!call?.pursuit_mode_enabled) continue;
      const primaryId = Number(call?.pursuit_primary_unit_id || 0);
      if (!primaryId) continue;
      const primaryPos = unitPositionById.get(primaryId);
      if (!primaryPos) continue;
      const assigned = Array.isArray(call?.assigned_units) ? call.assigned_units : [];
      for (const unit of assigned) {
        const id = Number(unit?.id || 0);
        if (!id || id === primaryId) continue;
        const followerPos = unitPositionById.get(id);
        if (!followerPos) continue;
        lines.push({ callId: Number(call.id), primaryPos, followerPos });
      }
    }
    return lines;
  }, [filteredCalls, unitPositionById]);

  const selectedCall = useMemo(
    () => filteredCalls.find((c) => Number(c.id) === Number(selectedCallId)) || null,
    [filteredCalls, selectedCallId],
  );
  const selectedUnit = useMemo(
    () => filteredUnits.find((u) => Number(u.id) === Number(selectedUnitId)) || null,
    [filteredUnits, selectedUnitId],
  );

  const closestUnitRecommendations = useMemo(() => {
    if (!selectedCall) return [];
    const callPos = {
      x: parseNum(selectedCall.position_x),
      y: parseNum(selectedCall.position_y),
    };
    if (callPos.x === null || callPos.y === null) return [];
    const assignedIds = new Set(
      (Array.isArray(selectedCall.assigned_units) ? selectedCall.assigned_units : [])
        .map((u) => Number(u?.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    );

    return filteredUnits
      .map((unit) => {
        const ux = parseNum(unit.position_x);
        const uy = parseNum(unit.position_y);
        if (ux === null || uy === null) return null;
        const metres = distanceMetres(callPos, { x: ux, y: uy });
        if (metres === null) return null;
        const status = String(unit.status || '').trim().toLowerCase();
        const available = status === 'available';
        return { unit, metres, available, assigned: assignedIds.has(Number(unit.id)) };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.assigned !== b.assigned) return a.assigned ? 1 : -1;
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.metres - b.metres;
      })
      .slice(0, 5);
  }, [filteredUnits, selectedCall]);

  const closestRecommendationLines = useMemo(() => {
    if (!selectedCall || closestUnitRecommendations.length === 0) return [];
    const cx = parseNum(selectedCall.position_x);
    const cy = parseNum(selectedCall.position_y);
    if (cx === null || cy === null) return [];
    const callMap = toMapPoint(cx, cy);
    return closestUnitRecommendations
      .filter((item) => item.available && !item.assigned)
      .map((item) => {
        const u = item.unit;
        const ux = parseNum(u.position_x);
        const uy = parseNum(u.position_y);
        if (ux === null || uy === null) return null;
        return {
          unitId: Number(u.id),
          callMap,
          unitMap: toMapPoint(ux, uy),
        };
      })
      .filter(Boolean)
      .slice(0, 3);
  }, [selectedCall, closestUnitRecommendations]);

  const unmappedCallsCount = Math.max(0, filteredCalls.length - callMarkers.length);
  const selectedCallMarker = useMemo(
    () => callMarkers.find((call) => Number(call.id) === Number(selectedCallId)) || null,
    [callMarkers, selectedCallId],
  );
  const selectedUnitMarker = useMemo(
    () => unitMarkers.find((unit) => Number(unit.id) === Number(selectedUnitId)) || null,
    [unitMarkers, selectedUnitId],
  );

  useEffect(() => {
    if (selectedCallId && !filteredCalls.some((c) => Number(c.id) === Number(selectedCallId))) {
      setSelectedCallId(null);
    }
  }, [filteredCalls, selectedCallId]);

  useEffect(() => {
    if (selectedUnitId && !filteredUnits.some((u) => Number(u.id) === Number(selectedUnitId))) {
      setSelectedUnitId(null);
    }
  }, [filteredUnits, selectedUnitId]);

  useEffect(() => {
    const element = mapViewportRef.current;
    if (!element) return undefined;

    const updateViewportSize = () => {
      const nextSize = {
        width: element.clientWidth || 0,
        height: element.clientHeight || 0,
      };
      setMapViewportSize((prev) => (
        prev.width === nextSize.width && prev.height === nextSize.height ? prev : nextSize
      ));
      setMapView((prev) => {
        const clamped = clampPanToViewport(nextSize, prev.scale, prev.x, prev.y);
        if (clamped.x === prev.x && clamped.y === prev.y) return prev;
        return { ...prev, ...clamped };
      });
    };

    updateViewportSize();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateViewportSize());
      resizeObserver.observe(element);
    } else {
      window.addEventListener('resize', updateViewportSize);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateViewportSize);
      }
    };
  }, []);

  const toggleLayer = (key) => {
    setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  function getViewportRelativePoint(event) {
    const element = mapViewportRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function updateMapView(nextScale, focusPoint = null) {
    setMapView((prev) => {
      const scale = clamp(round2(nextScale), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
      if (!Number.isFinite(scale)) return prev;
      const viewport = mapViewportSize;
      let nextX = prev.x;
      let nextY = prev.y;

      if (scale !== prev.scale && viewport.width > 0 && viewport.height > 0) {
        const focusX = Number(focusPoint?.x);
        const focusY = Number(focusPoint?.y);
        const px = Number.isFinite(focusX) ? focusX : (viewport.width / 2);
        const py = Number.isFinite(focusY) ? focusY : (viewport.height / 2);
        const mapX = (px - prev.x) / prev.scale;
        const mapY = (py - prev.y) / prev.scale;
        nextX = px - (mapX * scale);
        nextY = py - (mapY * scale);
      }

      const clamped = clampPanToViewport(viewport, scale, nextX, nextY);
      if (scale === prev.scale && clamped.x === prev.x && clamped.y === prev.y) return prev;
      return {
        scale,
        x: clamped.x,
        y: clamped.y,
      };
    });
  }

  function zoomIn() {
    updateMapView(mapZoom + MAP_BUTTON_ZOOM_STEP);
  }

  function zoomOut() {
    updateMapView(mapZoom - MAP_BUTTON_ZOOM_STEP);
  }

  function setMapZoomFromSlider(nextZoom) {
    updateMapView(Number(nextZoom));
  }

  function fitAtlasMapView() {
    updateMapView(MAP_DEFAULT_ZOOM);
  }

  function showWholeImageView() {
    updateMapView(MAP_WHOLE_IMAGE_ZOOM);
  }

  function resetMapView() {
    fitAtlasMapView();
  }

  function nudgeMapBy(dx = 0, dy = 0) {
    setMapView((prev) => {
      const clamped = clampPanToViewport(
        mapViewportSize,
        prev.scale,
        prev.x + (Number(dx) || 0),
        prev.y + (Number(dy) || 0),
      );
      if (clamped.x === prev.x && clamped.y === prev.y) return prev;
      return { ...prev, ...clamped };
    });
  }

  function centerMapOnMarker(marker, targetScale = null) {
    if (!marker || !mapViewportSize.width || !mapViewportSize.height) return;
    const point = marker.__map || marker;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    setMapView((prev) => {
      const scale = clamp(round2(targetScale || prev.scale), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
      const px = (point.x / MAP_CANVAS_WIDTH) * mapViewportSize.width;
      const py = (point.y / MAP_CANVAS_HEIGHT) * mapViewportSize.height;
      const nextX = (mapViewportSize.width / 2) - (px * scale);
      const nextY = (mapViewportSize.height / 2) - (py * scale);
      const clamped = clampPanToViewport(mapViewportSize, scale, nextX, nextY);
      if (scale === prev.scale && clamped.x === prev.x && clamped.y === prev.y) return prev;
      return { scale, x: clamped.x, y: clamped.y };
    });
  }

  function handleMapWheel(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    const point = getViewportRelativePoint(event);
    if (!point) return;
    if (event.shiftKey) {
      const panMultiplier = event.ctrlKey ? 2.4 : 1.35;
      const delta = Number(event.deltaY || 0);
      nudgeMapBy(0, -round2(delta * panMultiplier));
      return;
    }
    const wheelDelta = Math.sign(event.deltaY);
    const directionFactor = wheelDelta === 0 ? 0 : -wheelDelta;
    const zoomSpeed = event.ctrlKey ? 0.28 : 0.2;
    const smoothFactor = 1 + (Math.min(1, Math.abs(event.deltaY) / 240) * zoomSpeed * directionFactor);
    const next = clamp(mapZoom * (smoothFactor || 1), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
    updateMapView(next, point);
  }

  function handleMapPointerDown(event) {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    if (event.button === 2) {
      event.preventDefault();
    }
    const point = getViewportRelativePoint(event);
    if (!point) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: mapView.x,
      startY: mapView.y,
      moved: false,
    };
    setIsMapDragging(true);
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleMapDoubleClick(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    const point = getViewportRelativePoint(event);
    if (!point) return;
    updateMapView(mapZoom + Math.max(MAP_BUTTON_ZOOM_STEP, 0.35), point);
  }

  function handleMapKeyDown(event) {
    if (!event) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomOut();
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      fitAtlasMapView();
      return;
    }
    if (event.key === '1') {
      event.preventDefault();
      showWholeImageView();
      return;
    }

    const fast = event.shiftKey ? 2.2 : 1;
    const step = Math.round(MAP_KEYBOARD_PAN_STEP * fast);
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudgeMapBy(0, step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudgeMapBy(0, -step);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nudgeMapBy(step, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nudgeMapBy(-step, 0);
    }
  }

  function handleMapPointerMove(event) {
    const point = getViewportRelativePoint(event);
    if (point && mapViewportSize.width > 0 && mapViewportSize.height > 0) {
      const unscaledX = (point.x - mapView.x) / mapView.scale;
      const unscaledY = (point.y - mapView.y) / mapView.scale;
      if (
        Number.isFinite(unscaledX)
        && Number.isFinite(unscaledY)
        && unscaledX >= 0
        && unscaledX <= mapViewportSize.width
        && unscaledY >= 0
        && unscaledY <= mapViewportSize.height
      ) {
        const mapPoint = {
          x: (unscaledX / mapViewportSize.width) * MAP_CANVAS_WIDTH,
          y: (unscaledY / mapViewportSize.height) * MAP_CANVAS_HEIGHT,
        };
        const atlasRect = getWorldImageRect(MAP_CANVAS_WIDTH, MAP_CANVAS_HEIGHT);
        if (isPointInsideRect(mapPoint.x, mapPoint.y, atlasRect)) {
          setCursorWorld(toWorldPoint(mapPoint.x, mapPoint.y));
        } else {
          setCursorWorld(null);
        }
      } else {
        setCursorWorld(null);
      }
    }

    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.moved = true;
    }
    const clamped = clampPanToViewport(mapViewportSize, mapView.scale, drag.startX + dx, drag.startY + dy);
    setMapView((prev) => {
      if (prev.x === clamped.x && prev.y === clamped.y) return prev;
      return { ...prev, ...clamped };
    });
  }

  function endMapPointerInteraction(event) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressMarkerClickUntilRef.current = Date.now() + 150;
    }
    dragStateRef.current = null;
    setIsMapDragging(false);
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    }
  }

  function allowMarkerClick() {
    return Date.now() >= suppressMarkerClickUntilRef.current;
  }

  function handleSelectCall(callId) {
    if (!allowMarkerClick()) return;
    setSelectedCallId(Number(callId));
  }

  function handleSelectUnit(unitId) {
    if (!allowMarkerClick()) return;
    setSelectedUnitId(Number(unitId));
  }

  return (
    <div className="h-[calc(100vh-56px)] min-h-0 flex flex-col gap-4 overflow-hidden">
      <div className="bg-cad-card border border-cad-border rounded-lg p-4 flex-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-cad-muted">Dispatch Operations</div>
            <h1 className="text-xl font-bold mt-1">AVL Map</h1>
            <p className="text-xs sm:text-sm text-cad-muted mt-1.5 max-w-3xl">
              Live unit positions, call pins, pursuit overlays, and alarm zones for dispatch coordination.
              {isDispatch ? '' : ' This view is primarily intended for dispatch centres.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDispatch && departmentOptions.length > 0 ? (
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="rounded-md border border-cad-border bg-cad-surface px-3 py-2"
              >
                <option value="all">All Visible Departments</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.id} value={String(dept.id)}>
                    {dept.short_name ? `${dept.short_name} - ${dept.name}` : dept.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" onClick={loadMapData} className="px-4 py-2 rounded-md border border-cad-border bg-cad-surface hover:border-cad-accent/40 transition">
              Refresh
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3">
          <div className="rounded-md border border-cad-border bg-cad-surface px-3 py-2">
            <div className="text-xs text-cad-muted uppercase tracking-wide">Units on Map</div>
            <div className="text-lg font-semibold mt-0.5">{unitMarkers.length}</div>
          </div>
          <div className="rounded-md border border-cad-border bg-cad-surface px-3 py-2">
            <div className="text-xs text-cad-muted uppercase tracking-wide">Active Calls</div>
            <div className="text-lg font-semibold mt-0.5">{filteredCalls.length}</div>
          </div>
          <div className="rounded-md border border-cad-border bg-cad-surface px-3 py-2">
            <div className="text-xs text-cad-muted uppercase tracking-wide">Alarm Zones</div>
            <div className="text-lg font-semibold mt-0.5">{filteredZones.length}</div>
          </div>
          <div className="rounded-md border border-cad-border bg-cad-surface px-3 py-2">
            <div className="text-xs text-cad-muted uppercase tracking-wide">Last Refresh</div>
            <div className="text-xs sm:text-sm font-medium mt-0.5">{lastLoadedAt ? formatRelativeAge(lastLoadedAt) : (loading ? 'Loading...' : '-')}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.85fr)_400px] gap-4 flex-1 min-h-0">
        <div className="bg-cad-card border border-cad-border rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-cad-border/80 bg-gradient-to-r from-slate-950/45 via-cad-card to-cad-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Dispatch Area Map</div>
              <div className="text-[11px] text-cad-muted mt-0.5">
                Calibrated to GTA/FiveM pause-map atlas (2x3 tiles, 4500u per tile)
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-black/20 text-cad-muted"><span className="h-2 w-2 rounded-full bg-emerald-400" />Unit</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-black/20 text-cad-muted"><span className="h-2 w-2 rotate-45 bg-amber-400" />Call</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-black/20 text-cad-muted"><span className="h-2 w-2 rounded-full border border-amber-300" />Alarm Zone</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-black/20 text-cad-muted"><span className="h-px w-4 bg-fuchsia-300" />Pursuit</span>
            </div>
          </div>
          {error ? <div className="px-4 pt-4 text-sm text-rose-300">{error}</div> : null}
          <div className="p-4 flex-1 min-h-0 flex flex-col">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  ['basemap', 'Map'],
                  ['grid', 'Grid'],
                  ['zones', 'Zones'],
                  ['pursuits', 'Pursuits'],
                  ['recommendations', 'Closest'],
                  ['labels', 'Labels'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleLayer(key)}
                    className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                      layerVisibility[key]
                        ? 'border-cad-accent/30 bg-cad-accent/10 text-cad-accent-light'
                        : 'border-cad-border bg-cad-surface text-cad-muted hover:text-cad-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="inline-flex items-center rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-100">
                  Atlas coverage {atlasCoveragePct}%
                </span>
                <span className="inline-flex items-center rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-cad-muted">
                  Atlas-fit zoom {atlasFitZoomPct}%
                </span>
                <span className="inline-flex items-center rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-cad-muted">
                  Whole image {wholeImageZoomPct}%
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <button type="button" onClick={zoomOut} disabled={mapZoom <= MAP_MIN_ZOOM} className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs disabled:opacity-40">-</button>
                <div className="min-w-[60px] text-center text-xs text-cad-muted">{Math.round(mapZoom * 100)}%</div>
                <button type="button" onClick={zoomIn} disabled={mapZoom >= MAP_MAX_ZOOM} className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs disabled:opacity-40">+</button>
                <input
                  type="range"
                  min={MAP_MIN_ZOOM}
                  max={MAP_MAX_ZOOM}
                  step="0.01"
                  value={mapZoom}
                  onChange={(e) => setMapZoomFromSlider(e.target.value)}
                  className="w-28 accent-blue-400"
                  aria-label="Map zoom"
                />
                <button
                  type="button"
                  onClick={fitAtlasMapView}
                  className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs disabled:opacity-40"
                >
                  Fit Atlas
                </button>
                <button
                  type="button"
                  onClick={showWholeImageView}
                  className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs disabled:opacity-40"
                >
                  Whole Map
                </button>
                <button
                  type="button"
                  onClick={() => centerMapOnMarker(selectedCallMarker || selectedUnitMarker, Math.max(1.6, mapZoom))}
                  disabled={!selectedCallMarker && !selectedUnitMarker}
                  className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs disabled:opacity-40"
                >
                  Center Selected
                </button>
                <div className="inline-flex items-center rounded-md border border-cad-border bg-cad-surface overflow-hidden">
                  <button type="button" onClick={() => nudgeMapBy(0, MAP_KEYBOARD_PAN_STEP)} className="px-2 py-1 text-xs text-cad-muted hover:text-cad-ink" aria-label="Pan up">↑</button>
                  <button type="button" onClick={() => nudgeMapBy(MAP_KEYBOARD_PAN_STEP, 0)} className="px-2 py-1 text-xs text-cad-muted hover:text-cad-ink border-l border-cad-border" aria-label="Pan left">←</button>
                  <button type="button" onClick={() => nudgeMapBy(-MAP_KEYBOARD_PAN_STEP, 0)} className="px-2 py-1 text-xs text-cad-muted hover:text-cad-ink border-l border-cad-border" aria-label="Pan right">→</button>
                  <button type="button" onClick={() => nudgeMapBy(0, -MAP_KEYBOARD_PAN_STEP)} className="px-2 py-1 text-xs text-cad-muted hover:text-cad-ink border-l border-cad-border" aria-label="Pan down">↓</button>
                </div>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-cad-muted">Drag (left or right mouse) to pan. Mouse wheel zooms. Double-click zooms in. Hold `Shift` while wheeling to pan. Cursor coordinates only report inside the calibrated map atlas.</span>
              <span className="inline-flex items-center rounded border border-cad-border bg-cad-surface/70 px-2 py-0.5 text-cad-muted">
                Grid aligns to GTA pause-map tile boundaries
              </span>
              <span className="inline-flex items-center rounded border border-cad-border bg-cad-surface/70 px-2 py-0.5 text-cad-muted">
                Keyboard: arrows pan, `+/-` zoom, `0` fit, `1` whole map
              </span>
            </div>

            <div className="relative rounded-lg border border-cad-border bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 overflow-hidden flex-1 min-h-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="absolute left-4 top-3 z-20 rounded-md border border-white/10 bg-black/35 backdrop-blur px-3 py-2">
                <div className="text-[10px] tracking-[0.16em] uppercase text-cad-muted">Dispatch Atlas</div>
                <div className="text-xs font-semibold text-slate-100 mt-0.5">Los Santos / Blaine County</div>
              </div>
              <div className="absolute right-4 top-3 z-20 rounded-md border border-white/10 bg-black/35 backdrop-blur px-3 py-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />X-axis</span>
                  <span className="inline-flex items-center gap-1 text-pink-200"><span className="h-px w-3 bg-pink-400" />Y=0</span>
                  <span className="inline-flex items-center gap-1 text-cyan-200"><span className="h-px w-3 bg-cyan-300" />4500u tile</span>
                </div>
              </div>
              <div className="absolute inset-0 p-2 sm:p-3">
                <div className="relative h-full w-full flex items-center justify-center">
              <div
                ref={mapViewportRef}
                className="relative h-full max-h-full w-auto max-w-full mx-auto overflow-hidden"
                style={{
                  aspectRatio: `${MAP_CANVAS_WIDTH} / ${MAP_CANVAS_HEIGHT}`,
                  touchAction: 'none',
                  overscrollBehavior: 'contain',
                }}
                tabIndex={0}
                role="application"
                aria-label="Dispatch AVL map"
                onWheelCapture={handleMapWheel}
                onDoubleClick={handleMapDoubleClick}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={handleMapKeyDown}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={endMapPointerInteraction}
                onPointerCancel={endMapPointerInteraction}
                onPointerLeave={() => {
                  if (!dragStateRef.current) setCursorWorld(null);
                }}
              >
                <div
                  className={`absolute inset-0 origin-top-left ${isMapDragging ? '' : 'transition-transform duration-150'} ${isMapDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{ transform: `translate3d(${mapView.x}px, ${mapView.y}px, 0) scale(${mapZoom})` }}
                >
                  {layerVisibility.basemap ? (
                    <img
                      src={MAP_IMAGE_SRC}
                      alt="Los Santos dispatch map"
                      className="absolute inset-0 w-full h-full object-contain opacity-95 pointer-events-none select-none"
                      draggable={false}
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-transparent to-slate-950/30 pointer-events-none" />
                  <svg viewBox={`0 0 ${MAP_CANVAS_WIDTH} ${MAP_CANVAS_HEIGHT}`} className="absolute inset-0 w-full h-full">
                <MapGridOverlay showGrid={layerVisibility.grid} showLabels={layerVisibility.grid} />
                {layerVisibility.zones && filteredZones.map((zone, idx) => (
                  <ZoneOverlay key={`zone-${String(zone.id || idx)}`} zone={zone} />
                ))}
                {layerVisibility.pursuits && pursuitLines.map((line, idx) => (
                  <line
                    key={`${line.callId}-${idx}`}
                    x1={line.primaryPos.x}
                    y1={line.primaryPos.y}
                    x2={line.followerPos.x}
                    y2={line.followerPos.y}
                    stroke="rgba(232,121,249,0.65)"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                  />
                ))}
                {layerVisibility.recommendations && closestRecommendationLines.map((line) => (
                  <line
                    key={`closest-${line.unitId}`}
                    x1={line.callMap.x}
                    y1={line.callMap.y}
                    x2={line.unitMap.x}
                    y2={line.unitMap.y}
                    stroke="rgba(34, 197, 94, 0.55)"
                    strokeWidth="2"
                    strokeDasharray="4 5"
                  />
                ))}
                {callMarkers.map((call) => {
                  const p = call.__map;
                  const selected = Number(selectedCallId) === Number(call.id);
                  const size = selected ? 14 : 10;
                  const color = priorityColor(call.priority);
                  return (
                    <g key={`call-${call.id}`} onClick={() => handleSelectCall(call.id)} style={{ cursor: 'pointer' }}>
                      <rect x={p.x - (size / 2)} y={p.y - (size / 2)} width={size} height={size} fill={color} transform={`rotate(45 ${p.x} ${p.y})`} opacity={0.95} />
                      {selected ? <circle cx={p.x} cy={p.y} r={16} fill="none" stroke={color} strokeWidth="2" opacity="0.85" /> : null}
                      {layerVisibility.labels ? (
                        <text x={p.x + 9} y={p.y + 4} fill="#f8fafc" fontSize="12" fontWeight="700" stroke="rgba(2,6,23,0.9)" strokeWidth="3" paintOrder="stroke">
                          {String(call.job_code || `C${call.id}`).slice(0, 10)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {unitMarkers.map((unit) => {
                  const p = unit.__map;
                  const selected = Number(selectedUnitId) === Number(unit.id);
                  const color = statusColor(unit.status);
                  const headingLine = headingLineFromMapPoint(p, unit.position_heading, selected ? 22 : 16);
                  return (
                    <g key={`unit-${unit.id}`} onClick={() => handleSelectUnit(unit.id)} style={{ cursor: 'pointer' }}>
                      {headingLine ? (
                        <line
                          x1={headingLine.x1}
                          y1={headingLine.y1}
                          x2={headingLine.x2}
                          y2={headingLine.y2}
                          stroke="rgba(226,232,240,0.7)"
                          strokeWidth={selected ? 2.4 : 1.8}
                          strokeLinecap="round"
                        />
                      ) : null}
                      <circle cx={p.x} cy={p.y} r={selected ? 8 : 6} fill={color} stroke="rgba(15,23,42,0.85)" strokeWidth="2" />
                      {layerVisibility.labels ? (
                        <text x={p.x + 10} y={p.y - 8} fill="#e2e8f0" fontSize="13" fontWeight="600" stroke="rgba(2,6,23,0.9)" strokeWidth="3" paintOrder="stroke">
                          {String(unit.callsign || '').toUpperCase()}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {selectedCallMarker ? (
                  <circle cx={selectedCallMarker.__map.x} cy={selectedCallMarker.__map.y} r="26" fill="none" stroke="rgba(251,191,36,0.7)" strokeWidth="2" strokeDasharray="5 4" />
                ) : null}
                {selectedUnitMarker ? (
                  <circle cx={selectedUnitMarker.__map.x} cy={selectedUnitMarker.__map.y} r="22" fill="none" stroke="rgba(34,197,94,0.7)" strokeWidth="2" strokeDasharray="4 4" />
                ) : null}
                  </svg>
                </div>
              </div>
                </div>
              </div>
              <div className="absolute left-3 bottom-3 z-20 rounded-md border border-white/10 bg-black/40 backdrop-blur px-3 py-2 min-w-[260px]">
                <div className="text-[10px] tracking-[0.16em] uppercase text-cad-muted">Cursor / Bounds</div>
                <div className="text-xs mt-1">
                  {cursorWorld ? (
                    <span className="text-slate-100">
                      X {Math.round(cursorWorld.x)} | Y {Math.round(cursorWorld.y)}
                    </span>
                  ) : (
                    <span className="text-cad-muted">
                      Cursor outside calibrated atlas (image padding area)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-cad-muted mt-1">
                  World bounds X {WORLD_BOUNDS.minX}..{WORLD_BOUNDS.maxX} | Y {WORLD_BOUNDS.minY}..{WORLD_BOUNDS.maxY}
                </div>
              </div>
              <div className="absolute right-3 bottom-3 z-20 rounded-md border border-white/10 bg-black/40 backdrop-blur px-3 py-2 text-xs min-w-[210px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-cad-muted">Map refresh</span>
                  <span className={loading ? 'text-amber-200' : 'text-slate-100'}>{loading ? 'Refreshing...' : 'Live'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <span className="text-cad-muted">Unmapped calls</span>
                  <span className={unmappedCallsCount > 0 ? 'text-amber-200' : 'text-emerald-200'}>{unmappedCallsCount}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <span className="text-cad-muted">Zoom</span>
                  <span className="text-slate-100">{Math.round(mapZoom * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-rows-2 gap-4 min-h-0">
          <div className="bg-cad-card border border-cad-border rounded-lg overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-cad-border flex items-center justify-between">
              <div className="font-semibold">Active Calls</div>
              <div className="text-xs text-cad-muted">{filteredCalls.length}</div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {filteredCalls.length === 0 ? <div className="text-sm text-cad-muted px-1 py-2">No active calls in view.</div> : null}
              {filteredCalls.map((call) => (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => setSelectedCallId(Number(call.id))}
                  className={`w-full text-left rounded-md border px-3 py-2 transition ${Number(selectedCallId) === Number(call.id) ? 'border-cad-accent bg-cad-accent/10' : 'border-cad-border bg-cad-surface hover:border-cad-accent/40'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{call.title || `Call #${call.id}`}</div>
                      <div className="text-xs text-cad-muted mt-1">{call.job_code || 'No code'} | {call.location || 'No location'}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded border border-transparent" style={{ color: priorityColor(call.priority), backgroundColor: 'rgba(15,23,42,.55)' }}>
                      P{call.priority || '3'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-cad-muted mt-2">
                    <span>{Array.isArray(call.assigned_units) ? call.assigned_units.length : 0} assigned</span>
                    {call.pursuit_mode_enabled ? <span className="text-fuchsia-300">Pursuit</span> : null}
                    {call.postal ? <span>Postal {call.postal}</span> : null}
                    {call.position_x != null && call.position_y != null ? <span>Mapped</span> : <span>Unmapped</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-cad-card border border-cad-border rounded-lg overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-cad-border flex items-center justify-between">
              <div className="font-semibold">Units</div>
              <div className="text-xs text-cad-muted">{filteredUnits.length}</div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {filteredUnits.length === 0 ? <div className="text-sm text-cad-muted px-1 py-2">No units in view.</div> : null}
              {filteredUnits.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => setSelectedUnitId(Number(unit.id))}
                  className={`w-full text-left rounded-md border px-3 py-2 transition ${Number(selectedUnitId) === Number(unit.id) ? 'border-cad-accent bg-cad-accent/10' : 'border-cad-border bg-cad-surface hover:border-cad-accent/40'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{String(unit.callsign || '').toUpperCase()} {unit.user_name ? `- ${unit.user_name}` : ''}</div>
                      <div className="text-xs text-cad-muted mt-1">{labelize(unit.status)} | {unit.department_short_name || unit.department_name || 'Dept'}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(unit.status) }} />
                      <span className="text-cad-muted">{formatRelativeAge(unit.position_updated_at)}</span>
                    </span>
                  </div>
                  <div className="text-xs text-cad-muted mt-2">
                    {unit.position_stale ? 'Position stale' : 'Live position'}
                    {Number.isFinite(Number(unit.position_speed)) ? ` | ${Math.round(Number(unit.position_speed))} km/h` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(selectedCall || selectedUnit) ? (
        <details className="flex-none bg-cad-card border border-cad-border rounded-lg overflow-hidden">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold border-b border-cad-border bg-cad-surface/30">
            Selection Inspector ({selectedCall ? 'Call' : 'No Call'} / {selectedUnit ? 'Unit' : 'No Unit'})
          </summary>
          <div className="p-4 max-h-[28vh] overflow-y-auto">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-cad-card border border-cad-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Selected Call</h3>
              {selectedCall ? <span className="text-xs text-cad-muted">#{selectedCall.id}</span> : null}
            </div>
            {!selectedCall ? <div className="text-sm text-cad-muted mt-2">Select a call marker or call list item.</div> : (
              <div className="text-sm mt-3 space-y-2">
                <div><span className="text-cad-muted">Title:</span> {selectedCall.title || '-'}</div>
                <div><span className="text-cad-muted">Job Code:</span> {selectedCall.job_code || '-'}</div>
                <div><span className="text-cad-muted">Location:</span> {selectedCall.location || '-'}</div>
                <div><span className="text-cad-muted">Postal:</span> {selectedCall.postal || '-'}</div>
                <div><span className="text-cad-muted">Priority:</span> P{selectedCall.priority || '3'}</div>
                <div><span className="text-cad-muted">Pursuit:</span> {selectedCall.pursuit_mode_enabled ? 'Active' : 'No'}</div>
                <div><span className="text-cad-muted">Assigned Units:</span> {(selectedCall.assigned_units || []).map((u) => String(u.callsign || '').toUpperCase()).filter(Boolean).join(', ') || '-'}</div>
                {closestUnitRecommendations.length > 0 ? (
                  <div>
                    <div className="text-cad-muted mb-1">Closest Units (Visual Recommendation)</div>
                    <div className="space-y-1">
                      {closestUnitRecommendations.map((entry) => (
                        <button
                          key={`rec-${entry.unit.id}`}
                          type="button"
                          onClick={() => setSelectedUnitId(Number(entry.unit.id))}
                          className="w-full text-left rounded border border-cad-border bg-cad-surface px-2 py-1 hover:border-cad-accent/40"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-cad-ink">
                              {String(entry.unit.callsign || '').toUpperCase()} {entry.unit.user_name ? `- ${entry.unit.user_name}` : ''}
                            </span>
                            <span className="text-cad-muted">{Math.round(entry.metres)}m</span>
                          </div>
                          <div className="text-[11px] mt-0.5">
                            <span className={entry.available ? 'text-emerald-300' : 'text-amber-300'}>
                              {labelize(entry.unit.status)}
                            </span>
                            {entry.assigned ? <span className="text-cad-muted"> | Already assigned</span> : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div><span className="text-cad-muted">Closest Units:</span> {selectedCall.position_x != null && selectedCall.position_y != null ? 'No unit positions available' : 'Call has no map coordinates'}</div>
                )}
              </div>
            )}
          </div>
          <div className="bg-cad-card border border-cad-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Selected Unit</h3>
              {selectedUnit ? <span className="text-xs text-cad-muted">#{selectedUnit.id}</span> : null}
            </div>
            {!selectedUnit ? <div className="text-sm text-cad-muted mt-2">Select a unit marker or unit list item.</div> : (
              <div className="text-sm mt-3 space-y-2">
                <div><span className="text-cad-muted">Unit:</span> {String(selectedUnit.callsign || '').toUpperCase()}</div>
                <div><span className="text-cad-muted">Officer:</span> {selectedUnit.user_name || '-'}</div>
                <div><span className="text-cad-muted">Department:</span> {selectedUnit.department_name || selectedUnit.department_short_name || '-'}</div>
                <div><span className="text-cad-muted">Status:</span> {labelize(selectedUnit.status)}</div>
                <div><span className="text-cad-muted">Speed:</span> {Number.isFinite(Number(selectedUnit.position_speed)) ? `${Math.round(Number(selectedUnit.position_speed))} km/h` : '-'}</div>
                <div><span className="text-cad-muted">Position Update:</span> {selectedUnit.position_updated_at ? formatRelativeAge(selectedUnit.position_updated_at) : '-'}</div>
                <div><span className="text-cad-muted">Coords:</span> {Number.isFinite(Number(selectedUnit.position_x)) && Number.isFinite(Number(selectedUnit.position_y)) ? `${Number(selectedUnit.position_x).toFixed(1)}, ${Number(selectedUnit.position_y).toFixed(1)}` : '-'}</div>
              </div>
            )}
          </div>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
