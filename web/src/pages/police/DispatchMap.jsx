import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './DispatchMap.css';
import { api } from '../../api/client';
import { useDepartment } from '../../context/DepartmentContext';
import { useEventSource } from '../../hooks/useEventSource';

const GTA_MAP_TILE_UNITS = 4500;
const WORLD_BOUNDS = {
  minX: -GTA_MAP_TILE_UNITS,
  maxX: GTA_MAP_TILE_UNITS,
  minY: -GTA_MAP_TILE_UNITS,
  maxY: GTA_MAP_TILE_UNITS * 2,
};

const MAP_IMAGE_SRC = `${import.meta.env.BASE_URL || '/'}maps/FullMap.png`;
const MAP_IMAGE_SIZE = { width: 6144, height: 9216 };
const MAP_ALPHA_CONTENT_BOUNDS = { left: 75, top: 348, right: 6131, bottom: 8576 };
const MAP_ATLAS_RECT_NUDGE_PX = { x: 0, y: 0, width: 0, height: 0 };
const MAP_SUBGRID_WORLD_STEP = 1500;
const MAP_FIT_PADDING_PX = [16, 16];
const MAP_WHOLE_PADDING_PX = [8, 8];
const LEAFLET_DEFAULT_MIN_ZOOM = -2;
const LEAFLET_MAX_ZOOM = 4.5;

// Affine calibration maps the current/raw world solution (derived from the atlas rect)
// to observed GTA world coordinates using landmark samples (MRPD, Pillbox, Sandy SO).
// raw -> calibrated(actual)
const WORLD_CAL_A = 0.6667353755004273;
const WORLD_CAL_B = 0.06542524236688713;
const WORLD_CAL_C = -0.4296981536163556;
const WORLD_CAL_D = 1.0218909679548032;
const WORLD_CAL_TX = 470.0854845253253;
const WORLD_CAL_TY = -5.2163964132441265;
// calibrated(actual) -> raw (inverse matrix), used before plotting unit/call markers
const WORLD_CAL_INV_A = 1.4404111102320463;
const WORLD_CAL_INV_B = -0.09222045105604326;
const WORLD_CAL_INV_C = 0.6056830072135153;
const WORLD_CAL_INV_D = 0.9397999126830787;
const WORLD_CAL_INV_TX = -677.5974130992097;
const WORLD_CAL_INV_TY = -279.8204210210343;
// Additional control points can expose local non-linear distortion in the basemap image.
// Apply a localized residual warp on top of the affine model so we can refine one area
// without breaking previously-calibrated landmarks.
const WORLD_CAL_CONTROL_POINTS = [
  { raw: { x: 38, y: -944 }, actual: { x: 433.66, y: -986.21 } }, // MRPD
  { raw: { x: -193, y: -648 }, actual: { x: 299.01, y: -584.47 } }, // Pillbox
  { raw: { x: 1629, y: 4286 }, actual: { x: 1836.61, y: 3674.63 } }, // Sandy SO
  { raw: { x: -304, y: -1149 }, actual: { x: -206.92, y: -1307.73 } }, // User sample (Davis/impound area)
];
const WORLD_CAL_RESIDUAL_IDW_POWER = 2.2;
const WORLD_CAL_RESIDUAL_FALLOFF_UNITS = 2200;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function fitAspectRectInsideBounds(bounds, aspectWidth, aspectHeight) {
  const width = Math.max(0, Number(bounds.right) - Number(bounds.left));
  const height = Math.max(0, Number(bounds.bottom) - Number(bounds.top));
  const aspect = Number(aspectWidth) / Number(aspectHeight);
  let nextWidth = width;
  let nextHeight = nextWidth / aspect;
  if (nextHeight > height) {
    nextHeight = height;
    nextWidth = nextHeight * aspect;
  }
  return {
    x: Number(bounds.left) + ((width - nextWidth) / 2),
    y: Number(bounds.top) + ((height - nextHeight) / 2),
    width: nextWidth,
    height: nextHeight,
  };
}

function getAtlasRectPx() {
  const base = fitAspectRectInsideBounds(MAP_ALPHA_CONTENT_BOUNDS, 2, 3);
  return {
    x: base.x + (Number(MAP_ATLAS_RECT_NUDGE_PX.x) || 0),
    y: base.y + (Number(MAP_ATLAS_RECT_NUDGE_PX.y) || 0),
    width: Math.max(1, base.width + (Number(MAP_ATLAS_RECT_NUDGE_PX.width) || 0)),
    height: Math.max(1, base.height + (Number(MAP_ATLAS_RECT_NUDGE_PX.height) || 0)),
  };
}

const MAP_ATLAS_RECT = getAtlasRectPx();

function getImageBoundsLatLng() {
  return L.latLngBounds(L.latLng(0, 0), L.latLng(MAP_IMAGE_SIZE.height, MAP_IMAGE_SIZE.width));
}

function rectToLatLngBounds(rect) {
  const topLeft = imagePointToLatLng({ x: rect.x, y: rect.y });
  const bottomRight = imagePointToLatLng({ x: rect.x + rect.width, y: rect.y + rect.height });
  return L.latLngBounds(bottomRight, topLeft);
}

function isImagePointInsideAtlas(point) {
  if (!point) return false;
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x)
    && Number.isFinite(y)
    && x >= MAP_ATLAS_RECT.x
    && x <= (MAP_ATLAS_RECT.x + MAP_ATLAS_RECT.width)
    && y >= MAP_ATLAS_RECT.y
    && y <= (MAP_ATLAS_RECT.y + MAP_ATLAS_RECT.height);
}

function applyWorldAffineCalibrationOnly(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  return {
    x: (WORLD_CAL_A * x) + (WORLD_CAL_B * y) + WORLD_CAL_TX,
    y: (WORLD_CAL_C * x) + (WORLD_CAL_D * y) + WORLD_CAL_TY,
  };
}

function invertWorldAffineCalibrationOnly(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  return {
    x: (WORLD_CAL_INV_A * x) + (WORLD_CAL_INV_B * y) + WORLD_CAL_INV_TX,
    y: (WORLD_CAL_INV_C * x) + (WORLD_CAL_INV_D * y) + WORLD_CAL_INV_TY,
  };
}

function sampleWorldCalibrationResidual(point, direction = 'raw_to_actual') {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  if (!Array.isArray(WORLD_CAL_CONTROL_POINTS) || WORLD_CAL_CONTROL_POINTS.length === 0) return { x: 0, y: 0 };

  let weightedDx = 0;
  let weightedDy = 0;
  let weightTotal = 0;
  let nearestDistance = Infinity;

  for (const cp of WORLD_CAL_CONTROL_POINTS) {
    const source = direction === 'actual_to_raw' ? cp?.actual : cp?.raw;
    const target = direction === 'actual_to_raw' ? cp?.raw : cp?.actual;
    const sx = Number(source?.x);
    const sy = Number(source?.y);
    const tx = Number(target?.x);
    const ty = Number(target?.y);
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(tx) || !Number.isFinite(ty)) continue;

    const baseTarget = direction === 'actual_to_raw'
      ? invertWorldAffineCalibrationOnly(source)
      : applyWorldAffineCalibrationOnly(source);
    const dxResidual = tx - Number(baseTarget?.x || 0);
    const dyResidual = ty - Number(baseTarget?.y || 0);

    const dx = x - sx;
    const dy = y - sy;
    const distance = Math.hypot(dx, dy);
    nearestDistance = Math.min(nearestDistance, distance);

    if (distance < 0.0001) {
      return { x: dxResidual, y: dyResidual };
    }

    const weight = 1 / Math.pow(Math.max(distance, 1), WORLD_CAL_RESIDUAL_IDW_POWER);
    weightedDx += weight * dxResidual;
    weightedDy += weight * dyResidual;
    weightTotal += weight;
  }

  if (!Number.isFinite(weightTotal) || weightTotal <= 0) return { x: 0, y: 0 };

  const avgDx = weightedDx / weightTotal;
  const avgDy = weightedDy / weightTotal;
  const radius = Math.max(1, Number(WORLD_CAL_RESIDUAL_FALLOFF_UNITS || 0) || 1);
  const attenuation = 1 / (1 + Math.pow(Math.max(0, nearestDistance) / radius, 2.4));

  return {
    x: avgDx * attenuation,
    y: avgDy * attenuation,
  };
}

function applyWorldCalibration(point) {
  const base = applyWorldAffineCalibrationOnly(point);
  const residual = sampleWorldCalibrationResidual(point, 'raw_to_actual');
  return {
    x: base.x + residual.x,
    y: base.y + residual.y,
  };
}

function invertWorldCalibration(point) {
  const base = invertWorldAffineCalibrationOnly(point);
  const residual = sampleWorldCalibrationResidual(point, 'actual_to_raw');
  return {
    x: base.x + residual.x,
    y: base.y + residual.y,
  };
}

function rawWorldToImagePoint(x, y) {
  const relX = (Number(x) - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX);
  const relY = (Number(y) - WORLD_BOUNDS.minY) / (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY);
  return {
    x: MAP_ATLAS_RECT.x + (relX * MAP_ATLAS_RECT.width),
    y: MAP_ATLAS_RECT.y + MAP_ATLAS_RECT.height - (relY * MAP_ATLAS_RECT.height),
  };
}

function rawImageToWorldPoint(x, y) {
  const relX = (Number(x) - MAP_ATLAS_RECT.x) / MAP_ATLAS_RECT.width;
  const relY = (Number(y) - MAP_ATLAS_RECT.y) / MAP_ATLAS_RECT.height;
  return {
    x: WORLD_BOUNDS.minX + (relX * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)),
    y: WORLD_BOUNDS.minY + ((1 - relY) * (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY)),
  };
}

function worldToImagePoint(x, y) {
  const raw = invertWorldCalibration({ x, y });
  return rawWorldToImagePoint(raw.x, raw.y);
}

function imageToWorldPoint(x, y) {
  const raw = rawImageToWorldPoint(x, y);
  return applyWorldCalibration(raw);
}

function imagePointToLatLng(point) {
  const x = Number(point?.x) || 0;
  const yTop = Number(point?.y) || 0;
  // Leaflet CRS.Simple uses a "north-up" Y axis (lat increases upward), while image
  // pixels are top-origin (Y increases downward). Convert explicitly here.
  return L.latLng(MAP_IMAGE_SIZE.height - yTop, x);
}

function worldToLatLng(x, y) {
  return imagePointToLatLng(worldToImagePoint(x, y));
}

function latLngToImagePoint(latlng) {
  const x = Number(latlng?.lng) || 0;
  const yBottomOrigin = Number(latlng?.lat) || 0;
  return { x, y: MAP_IMAGE_SIZE.height - yBottomOrigin };
}

function worldDistanceToImagePixels(distance) {
  const sx = MAP_ATLAS_RECT.width / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX);
  const sy = MAP_ATLAS_RECT.height / (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY);
  return Math.max(1, Number(distance || 0) * Math.min(sx, sy));
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

function drawCalibrationGrid(group) {
  L.rectangle(rectToLatLngBounds(MAP_ATLAS_RECT), {
    pane: 'dispatchGridPane',
    color: 'rgba(148,163,184,0.38)',
    weight: 1,
    fillColor: 'rgba(2,6,23,0.06)',
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(group);

  for (let x = WORLD_BOUNDS.minX + MAP_SUBGRID_WORLD_STEP; x < WORLD_BOUNDS.maxX; x += MAP_SUBGRID_WORLD_STEP) {
    if ((x - WORLD_BOUNDS.minX) % GTA_MAP_TILE_UNITS === 0) continue;
    L.polyline([worldToLatLng(x, WORLD_BOUNDS.minY), worldToLatLng(x, WORLD_BOUNDS.maxY)], {
      pane: 'dispatchGridPane', color: 'rgba(148,163,184,0.2)', weight: 1, dashArray: '3 5', interactive: false,
    }).addTo(group);
  }
  for (let y = WORLD_BOUNDS.minY + MAP_SUBGRID_WORLD_STEP; y < WORLD_BOUNDS.maxY; y += MAP_SUBGRID_WORLD_STEP) {
    if ((y - WORLD_BOUNDS.minY) % GTA_MAP_TILE_UNITS === 0) continue;
    L.polyline([worldToLatLng(WORLD_BOUNDS.minX, y), worldToLatLng(WORLD_BOUNDS.maxX, y)], {
      pane: 'dispatchGridPane', color: 'rgba(148,163,184,0.2)', weight: 1, dashArray: '3 5', interactive: false,
    }).addTo(group);
  }
  for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += GTA_MAP_TILE_UNITS) {
    L.polyline([worldToLatLng(x, WORLD_BOUNDS.minY), worldToLatLng(x, WORLD_BOUNDS.maxY)], {
      pane: 'dispatchGridPane', color: 'rgba(96,165,250,0.42)', weight: 1.2, interactive: false,
    }).addTo(group);
  }
  for (let y = WORLD_BOUNDS.minY; y <= WORLD_BOUNDS.maxY; y += GTA_MAP_TILE_UNITS) {
    L.polyline([worldToLatLng(WORLD_BOUNDS.minX, y), worldToLatLng(WORLD_BOUNDS.maxX, y)], {
      pane: 'dispatchGridPane', color: 'rgba(96,165,250,0.42)', weight: 1.2, interactive: false,
    }).addTo(group);
  }
  L.polyline([worldToLatLng(0, WORLD_BOUNDS.minY), worldToLatLng(0, WORLD_BOUNDS.maxY)], {
    pane: 'dispatchGridPane', color: 'rgba(34,197,94,0.7)', weight: 1.6, dashArray: '8 6', interactive: false,
  }).addTo(group);
  L.polyline([worldToLatLng(WORLD_BOUNDS.minX, 0), worldToLatLng(WORLD_BOUNDS.maxX, 0)], {
    pane: 'dispatchGridPane', color: 'rgba(244,114,182,0.6)', weight: 1.6, dashArray: '8 6', interactive: false,
  }).addTo(group);
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
  const [cursorWorld, setCursorWorld] = useState(null);
  const [mapUi, setMapUi] = useState({ zoom: null, zoomPercent: 100, ready: false });
  const [mapInitError, setMapInitError] = useState('');
  const [mapImageError, setMapImageError] = useState('');
  const [layerVisibility, setLayerVisibility] = useState({
    basemap: true,
    grid: true,
    zones: true,
    labels: true,
  });

  const mapContainerRef = useRef(null);
  const leafletRef = useRef({ map: null, imageOverlay: null, groups: null, cleanupFns: [] });

  const atlasBounds = useMemo(() => rectToLatLngBounds(MAP_ATLAS_RECT), []);
  const imageBounds = useMemo(() => getImageBoundsLatLng(), []);

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

  useEffect(() => { loadMapData(); }, [loadMapData]);
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
    if (!isDispatch) setDepartmentFilter('all');
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
      return Number(c.department_id || 0) === target
        || (Array.isArray(c.requested_department_ids) && c.requested_department_ids.includes(target));
    });
  }, [calls, departmentFilter]);

  const filteredZones = useMemo(
    () => (Array.isArray(zones) ? zones : []).filter((zone) => zoneMatchesDepartment(zone, departmentFilter)),
    [zones, departmentFilter],
  );

  const unitMarkers = useMemo(() => filteredUnits
    .map((u) => {
      const x = parseNum(u.position_x);
      const y = parseNum(u.position_y);
      if (x === null || y === null) return null;
      const image = worldToImagePoint(x, y);
      return { ...u, __world: { x, y }, __image: image, __latlng: imagePointToLatLng(image) };
    })
    .filter(Boolean), [filteredUnits]);

  const callMarkers = useMemo(() => filteredCalls
    .map((c) => {
      const x = parseNum(c.position_x);
      const y = parseNum(c.position_y);
      if (x === null || y === null) return null;
      const image = worldToImagePoint(x, y);
      return { ...c, __world: { x, y }, __image: image, __latlng: imagePointToLatLng(image) };
    })
    .filter(Boolean), [filteredCalls]);

  const selectedCall = useMemo(
    () => filteredCalls.find((c) => Number(c.id) === Number(selectedCallId)) || null,
    [filteredCalls, selectedCallId],
  );
  const selectedUnit = useMemo(
    () => filteredUnits.find((u) => Number(u.id) === Number(selectedUnitId)) || null,
    [filteredUnits, selectedUnitId],
  );
  const selectedCallMarker = useMemo(
    () => callMarkers.find((c) => Number(c.id) === Number(selectedCallId)) || null,
    [callMarkers, selectedCallId],
  );
  const selectedUnitMarker = useMemo(
    () => unitMarkers.find((u) => Number(u.id) === Number(selectedUnitId)) || null,
    [unitMarkers, selectedUnitId],
  );

  useEffect(() => {
    if (selectedCallId && !filteredCalls.some((c) => Number(c.id) === Number(selectedCallId))) setSelectedCallId(null);
  }, [filteredCalls, selectedCallId]);
  useEffect(() => {
    if (selectedUnitId && !filteredUnits.some((u) => Number(u.id) === Number(selectedUnitId))) setSelectedUnitId(null);
  }, [filteredUnits, selectedUnitId]);

  const syncMapUiState = useCallback(() => {
    const map = leafletRef.current.map;
    if (!map) return;
    const zoom = map.getZoom();
    const atlasFitZoom = map.getBoundsZoom(atlasBounds, false, L.point(...MAP_FIT_PADDING_PX));
    const zoomPercent = Number.isFinite(atlasFitZoom) ? Math.round(map.getZoomScale(zoom, atlasFitZoom) * 100) : 100;
    setMapUi({ zoom, zoomPercent, ready: true });
  }, [atlasBounds]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || leafletRef.current.map) return undefined;
    setMapInitError('');
    setMapImageError('');
    setMapUi((prev) => ({ ...prev, ready: false }));

    let map = null;
    let imageOverlay = null;
    let groups = null;
    const cleanupFns = [];

    try {
      map = L.map(container, {
        crs: L.CRS.Simple,
        attributionControl: false,
        zoomControl: false,
        preferCanvas: false,
        minZoom: LEAFLET_DEFAULT_MIN_ZOOM,
        maxZoom: LEAFLET_MAX_ZOOM,
        zoomSnap: 0.1,
        zoomDelta: 0.25,
        wheelPxPerZoomLevel: 120,
        maxBoundsViscosity: 1,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      map.createPane('dispatchGridPane');
      map.getPane('dispatchGridPane').style.zIndex = '430';
      map.createPane('dispatchZonePane');
      map.getPane('dispatchZonePane').style.zIndex = '440';
      map.createPane('dispatchMarkerPane');
      map.getPane('dispatchMarkerPane').style.zIndex = '470';

      imageOverlay = L.imageOverlay(MAP_IMAGE_SRC, imageBounds, {
        interactive: false,
        opacity: 0.96,
        className: 'dispatch-avl-image-overlay',
      }).addTo(map);

      const onImageLoad = () => {
        setMapImageError('');
        requestAnimationFrame(() => {
          try {
            map.invalidateSize(false);
            syncMapUiState();
          } catch {
            // no-op
          }
        });
      };
      const onImageError = () => {
        setMapImageError(`Failed to load map image: ${MAP_IMAGE_SRC}`);
      };
      imageOverlay.on('load', onImageLoad);
      imageOverlay.on('error', onImageError);
      cleanupFns.push(() => {
        try { imageOverlay.off('load', onImageLoad); } catch { /* no-op */ }
        try { imageOverlay.off('error', onImageError); } catch { /* no-op */ }
      });

      groups = {
        grid: L.layerGroup().addTo(map),
        zones: L.layerGroup().addTo(map),
        calls: L.layerGroup().addTo(map),
        units: L.layerGroup().addTo(map),
        highlights: L.layerGroup().addTo(map),
      };

      map.setMaxBounds(imageBounds.pad(0.03));
      const wholeZoom = map.getBoundsZoom(imageBounds, false, L.point(...MAP_WHOLE_PADDING_PX));
      if (Number.isFinite(wholeZoom)) map.setMinZoom(Math.floor(wholeZoom * 10) / 10);
      map.fitBounds(atlasBounds, { padding: MAP_FIT_PADDING_PX, animate: false });

      const onMoveOrZoom = () => syncMapUiState();
      const onMouseMove = (e) => {
        const imagePoint = latLngToImagePoint(e.latlng);
        if (!isImagePointInsideAtlas(imagePoint)) return setCursorWorld(null);
        return setCursorWorld(imageToWorldPoint(imagePoint.x, imagePoint.y));
      };
      const onMouseOut = () => setCursorWorld(null);

      map.on('zoomend moveend', onMoveOrZoom);
      map.on('mousemove', onMouseMove);
      map.on('mouseout', onMouseOut);
      cleanupFns.push(() => {
        try {
          map.off('zoomend moveend', onMoveOrZoom);
          map.off('mousemove', onMouseMove);
          map.off('mouseout', onMouseOut);
        } catch {
          // no-op
        }
      });

      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          map.invalidateSize(false);
          syncMapUiState();
        });
        observer.observe(container);
        cleanupFns.push(() => observer.disconnect());
      } else {
        const onResize = () => {
          map.invalidateSize(false);
          syncMapUiState();
        };
        window.addEventListener('resize', onResize);
        cleanupFns.push(() => window.removeEventListener('resize', onResize));
      }

      // Leaflet often initializes before flex layouts settle. Re-run size calc a few times.
      [0, 16, 80, 240].forEach((delay) => {
        const timer = window.setTimeout(() => {
          try {
            map.invalidateSize(false);
            syncMapUiState();
          } catch {
            // no-op
          }
        }, delay);
        cleanupFns.push(() => window.clearTimeout(timer));
      });

      leafletRef.current = { map, imageOverlay, groups, cleanupFns };
      syncMapUiState();
    } catch (err) {
      setMapInitError(err?.message || 'Failed to initialise map view');
      try { map?.remove(); } catch { /* no-op */ }
      leafletRef.current = { map: null, imageOverlay: null, groups: null, cleanupFns: [] };
      return undefined;
    }

    return () => {
      cleanupFns.forEach((fn) => { try { fn(); } catch { /* no-op */ } });
      try { map?.remove(); } catch { /* no-op */ }
      leafletRef.current = { map: null, imageOverlay: null, groups: null, cleanupFns: [] };
    };
  }, [atlasBounds, imageBounds, syncMapUiState]);

  useEffect(() => {
    const { map, imageOverlay, groups } = leafletRef.current;
    if (!map || !imageOverlay || !groups) return;

    imageOverlay.setOpacity(layerVisibility.basemap ? 0.96 : 0);
    Object.values(groups).forEach((group) => group.clearLayers());

    if (layerVisibility.grid) drawCalibrationGrid(groups.grid);

    if (layerVisibility.zones) {
      filteredZones.forEach((zone) => {
        if (shapeIsPolygon(zone)) {
          const latlngs = (Array.isArray(zone.points) ? zone.points : [])
            .map((p) => ({ x: parseNum(p?.x), y: parseNum(p?.y) }))
            .filter((p) => p.x !== null && p.y !== null)
            .map((p) => worldToLatLng(p.x, p.y));
          if (latlngs.length >= 3) {
            L.polygon(latlngs, {
              pane: 'dispatchZonePane',
              color: 'rgba(251,191,36,0.45)',
              weight: 2,
              fillColor: 'rgba(251,191,36,0.08)',
              fillOpacity: 0.35,
              interactive: false,
            }).addTo(groups.zones);
          }
          return;
        }
        const x = parseNum(zone.x);
        const y = parseNum(zone.y);
        const radius = parseNum(zone.radius);
        if (x === null || y === null || radius === null || radius <= 0) return;
        L.circle(worldToLatLng(x, y), {
          pane: 'dispatchZonePane',
          radius: worldDistanceToImagePixels(radius),
          color: 'rgba(251,191,36,0.45)',
          weight: 2,
          fillColor: 'rgba(251,191,36,0.08)',
          fillOpacity: 0.35,
          interactive: false,
        }).addTo(groups.zones);
      });
    }

    callMarkers.forEach((call) => {
      const selected = Number(call.id) === Number(selectedCallId);
      const marker = L.circleMarker(call.__latlng, {
        pane: 'dispatchMarkerPane',
        radius: selected ? 8 : 6,
        color: 'rgba(15,23,42,0.9)',
        weight: 2,
        fillColor: priorityColor(call.priority),
        fillOpacity: 0.95,
      }).on('click', () => setSelectedCallId(Number(call.id))).addTo(groups.calls);
      if (layerVisibility.labels) {
        marker.bindTooltip(String(call.job_code || `C${call.id}`).slice(0, 10), {
          permanent: true, direction: 'right', offset: [8, 0], className: 'dispatch-avl-tooltip dispatch-avl-tooltip--call',
        });
      }
      if (selected) {
        L.circleMarker(call.__latlng, {
          pane: 'dispatchMarkerPane', radius: 16, color: 'rgba(251,191,36,0.75)', weight: 2, dashArray: '5 4', fillOpacity: 0,
        }).addTo(groups.highlights);
      }
    });

    unitMarkers.forEach((unit) => {
      const selected = Number(unit.id) === Number(selectedUnitId);
      const marker = L.circleMarker(unit.__latlng, {
        pane: 'dispatchMarkerPane',
        radius: selected ? 8 : 6,
        color: 'rgba(15,23,42,0.9)',
        weight: 2,
        fillColor: statusColor(unit.status),
        fillOpacity: 1,
      }).on('click', () => setSelectedUnitId(Number(unit.id))).addTo(groups.units);
      if (layerVisibility.labels) {
        marker.bindTooltip(String(unit.callsign || '').toUpperCase(), {
          permanent: true, direction: 'top', offset: [0, -8], className: 'dispatch-avl-tooltip dispatch-avl-tooltip--unit',
        });
      }
      if (selected) {
        L.circleMarker(unit.__latlng, {
          pane: 'dispatchMarkerPane', radius: 20, color: 'rgba(34,197,94,0.75)', weight: 2, dashArray: '4 4', fillOpacity: 0,
        }).addTo(groups.highlights);
      }
    });
  }, [callMarkers, filteredZones, layerVisibility, selectedCallId, selectedUnitId, unitMarkers]);

  const toggleLayer = (key) => setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  const fitAtlasView = () => {
    const map = leafletRef.current.map;
    if (map) map.fitBounds(atlasBounds, { padding: MAP_FIT_PADDING_PX, animate: true });
  };
  const fitWholeView = () => {
    const map = leafletRef.current.map;
    if (map) map.fitBounds(imageBounds, { padding: MAP_WHOLE_PADDING_PX, animate: true });
  };
  const zoomBy = (delta) => {
    const map = leafletRef.current.map;
    if (!map) return;
    map.setZoom(clamp(map.getZoom() + delta, map.getMinZoom(), map.getMaxZoom()));
  };
  const centerSelected = () => {
    const map = leafletRef.current.map;
    const target = selectedCallMarker?.__latlng || selectedUnitMarker?.__latlng;
    if (!map || !target) return;
    const atlasFitZoom = map.getBoundsZoom(atlasBounds, false, L.point(...MAP_FIT_PADDING_PX));
    map.flyTo(target, Math.max(map.getZoom(), atlasFitZoom + 0.8), { animate: true, duration: 0.35 });
  };

  const atlasCoveragePct = Math.round((MAP_ATLAS_RECT.width / MAP_IMAGE_SIZE.width) * 1000) / 10;
  const atlasRectText = `${Math.round(MAP_ATLAS_RECT.x)},${Math.round(MAP_ATLAS_RECT.y)} ${Math.round(MAP_ATLAS_RECT.width)}x${Math.round(MAP_ATLAS_RECT.height)}`;
  const unmappedCallsCount = Math.max(0, filteredCalls.length - callMarkers.length);

  return (
    <div className="h-[calc(100vh-56px)] min-h-0 flex flex-col gap-4 overflow-hidden">
      <div className="hidden bg-cad-card border border-cad-border rounded-lg p-4 flex-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-cad-muted">Dispatch Operations</div>
            <h1 className="text-xl font-bold mt-1">AVL Map</h1>
            <p className="text-xs sm:text-sm text-cad-muted mt-1.5 max-w-3xl">
              Leaflet-based dispatch map with a recalibrated GTA pause-map atlas overlay.
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

      <div className="grid grid-cols-1 gap-4 flex-1 min-h-0">
        <div className="overflow-hidden flex flex-col min-h-0">
          <div className="px-3 sm:px-4 py-2.5 border-b border-cad-border/80 bg-gradient-to-r from-slate-950/45 via-cad-card to-cad-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Dispatch Area Map</div>
              <div className="text-[11px] text-cad-muted mt-0.5">
                Calibrated to a 2x3 GTA/FiveM pause-map atlas (4500u tiles) inside `FullMap.png`
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-black/20 text-cad-muted"><span className="h-2 w-2 rounded-full bg-emerald-400" />Unit</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-black/20 text-cad-muted"><span className="h-2 w-2 rounded-full bg-amber-400" />Call</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-black/20 text-cad-muted"><span className="h-2 w-2 rounded-full border border-amber-300" />Zone</span>
            </div>
          </div>
          {error ? <div className="px-4 pt-4 text-sm text-rose-300">{error}</div> : null}
          <div className="p-2 sm:p-3 flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  ['basemap', 'Map'],
                  ['grid', 'Grid'],
                  ['zones', 'Zones'],
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
                  Atlas rect {atlasRectText}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => zoomBy(-0.35)} className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs">-</button>
                <div className="min-w-[68px] text-center text-xs text-cad-muted">{mapUi.ready ? `${mapUi.zoomPercent}%` : '...'}</div>
                <button type="button" onClick={() => zoomBy(0.35)} className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs">+</button>
                <button type="button" onClick={fitAtlasView} className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs">Fit Atlas</button>
                <button type="button" onClick={fitWholeView} className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs">Whole Map</button>
                <button
                  type="button"
                  onClick={centerSelected}
                  disabled={!selectedCallMarker && !selectedUnitMarker}
                  className="px-2.5 py-1 rounded-md border border-cad-border bg-cad-surface text-xs disabled:opacity-40"
                >
                  Center Selected
                </button>
              </div>
            </div>

            <div className="relative rounded-lg border border-cad-border bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 overflow-hidden flex-1 min-h-0 dispatch-avl-shell">
              <div className="absolute left-3 top-3 z-[500] rounded-md border border-white/10 bg-black/40 backdrop-blur px-3 py-2 min-w-[270px]">
                <div className="text-[10px] tracking-[0.16em] uppercase text-cad-muted">Cursor / Bounds</div>
                <div className="text-xs mt-1">
                  {cursorWorld ? (
                    <span className="text-slate-100">X {Math.round(cursorWorld.x)} | Y {Math.round(cursorWorld.y)}</span>
                  ) : (
                    <span className="text-cad-muted">Cursor outside calibrated atlas (image padding area)</span>
                  )}
                </div>
                <div className="text-[11px] text-cad-muted mt-1">
                  World X {WORLD_BOUNDS.minX}..{WORLD_BOUNDS.maxX} | Y {WORLD_BOUNDS.minY}..{WORLD_BOUNDS.maxY}
                </div>
              </div>

              <div className="absolute right-3 top-3 z-[500] rounded-md border border-white/10 bg-black/40 backdrop-blur px-3 py-2 text-xs min-w-[210px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-cad-muted">Map refresh</span>
                  <span className={loading ? 'text-amber-200' : 'text-slate-100'}>{loading ? 'Refreshing...' : 'Live'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <span className="text-cad-muted">Unmapped calls</span>
                  <span className={unmappedCallsCount > 0 ? 'text-amber-200' : 'text-emerald-200'}>{unmappedCallsCount}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <span className="text-cad-muted">Leaflet zoom</span>
                  <span className="text-slate-100">{mapUi.zoom != null ? round2(mapUi.zoom) : '-'}</span>
                </div>
              </div>

              <div className="absolute inset-0 p-2 sm:p-3">
                <div ref={mapContainerRef} className="dispatch-avl-leaflet h-full w-full rounded-md" />
                {(mapInitError || mapImageError || !mapUi.ready) ? (
                  <div className="absolute inset-2 sm:inset-3 pointer-events-none flex items-center justify-center">
                    <div className={`max-w-xl rounded-md border px-4 py-3 text-sm shadow-lg ${
                      (mapInitError || mapImageError)
                        ? 'border-rose-400/30 bg-rose-950/70 text-rose-100'
                        : 'border-white/10 bg-black/45 text-slate-200'
                    }`}>
                      <div className="font-semibold">
                        {mapInitError || mapImageError ? 'Map failed to render' : 'Loading map canvas...'}
                      </div>
                      {(mapInitError || mapImageError) ? (
                        <div className="mt-1 text-xs sm:text-sm">{mapInitError || mapImageError}</div>
                      ) : (
                        <div className="mt-1 text-xs sm:text-sm text-slate-300">
                          Initialising Leaflet and loading `FullMap.png`
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden grid grid-rows-2 gap-4 min-h-0">
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

      {false && (selectedCall || selectedUnit) ? (
        <div className="flex-none bg-cad-card border border-cad-border rounded-lg p-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-cad-border bg-cad-surface p-3">
              <div className="font-semibold mb-2">Selected Call {selectedCall ? `#${selectedCall.id}` : ''}</div>
              {!selectedCall ? <div className="text-cad-muted">Select a call marker or call list item.</div> : (
                <div className="space-y-1.5">
                  <div><span className="text-cad-muted">Title:</span> {selectedCall.title || '-'}</div>
                  <div><span className="text-cad-muted">Job Code:</span> {selectedCall.job_code || '-'}</div>
                  <div><span className="text-cad-muted">Location:</span> {selectedCall.location || '-'}</div>
                  <div><span className="text-cad-muted">Priority:</span> P{selectedCall.priority || '3'}</div>
                  <div><span className="text-cad-muted">Assigned Units:</span> {(selectedCall.assigned_units || []).map((u) => String(u.callsign || '').toUpperCase()).filter(Boolean).join(', ') || '-'}</div>
                  <div><span className="text-cad-muted">Coords:</span> {Number.isFinite(Number(selectedCall.position_x)) && Number.isFinite(Number(selectedCall.position_y)) ? `${Number(selectedCall.position_x).toFixed(1)}, ${Number(selectedCall.position_y).toFixed(1)}` : '-'}</div>
                </div>
              )}
            </div>
            <div className="rounded-md border border-cad-border bg-cad-surface p-3">
              <div className="font-semibold mb-2">Selected Unit {selectedUnit ? `#${selectedUnit.id}` : ''}</div>
              {!selectedUnit ? <div className="text-cad-muted">Select a unit marker or unit list item.</div> : (
                <div className="space-y-1.5">
                  <div><span className="text-cad-muted">Unit:</span> {String(selectedUnit.callsign || '').toUpperCase()}</div>
                  <div><span className="text-cad-muted">Officer:</span> {selectedUnit.user_name || '-'}</div>
                  <div><span className="text-cad-muted">Department:</span> {selectedUnit.department_name || selectedUnit.department_short_name || '-'}</div>
                  <div><span className="text-cad-muted">Status:</span> {labelize(selectedUnit.status)}</div>
                  <div><span className="text-cad-muted">Speed:</span> {Number.isFinite(Number(selectedUnit.position_speed)) ? `${Math.round(Number(selectedUnit.position_speed))} km/h` : '-'}</div>
                  <div><span className="text-cad-muted">Coords:</span> {Number.isFinite(Number(selectedUnit.position_x)) && Number.isFinite(Number(selectedUnit.position_y)) ? `${Number(selectedUnit.position_x).toFixed(1)}, ${Number(selectedUnit.position_y).toFixed(1)}` : '-'}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
