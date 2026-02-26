// GTA/FiveM pause map atlas projection helpers.
//
// References (used for the projection model and tile assumptions):
// - Cfx.re forum (Extra map tiles): pause map uses a 2x3 tile grid and each tile spans 4500 world units.
// - Cfx.re forum (custom maps): minimap/map tiles are typically 3072x3072 textures (`minimap_sea_*_*`).
//
// Inference:
// - A 6144x9216 PNG is a standard 2x3 atlas canvas (2 * 3072 by 3 * 3072).
// - The atlas canvas size does NOT imply the playable GTA V world bounds are exactly 9000 x 13500 units.
// - Common GTA V/FiveM map overlays align using the standard world bounds below
//   (x: -4000..6000, y: -4000..8000), while still rendering on the full atlas canvas.
// - Do not "re-fit" coordinates to an inner content rect; transparent padding is part of the atlas canvas.

export const GTA_MAP_TILE_WORLD_UNITS = 4500;
export const GTA_MAP_ATLAS_TILE_PX = 3072;
export const GTA_MAP_ATLAS_COLS = 2;
export const GTA_MAP_ATLAS_ROWS = 3;

export const GTA_FULL_MAP_IMAGE_SIZE = {
  width: GTA_MAP_ATLAS_TILE_PX * GTA_MAP_ATLAS_COLS,
  height: GTA_MAP_ATLAS_TILE_PX * GTA_MAP_ATLAS_ROWS,
};

// Standard GTA V/FiveM world extents used by many Leaflet-based overlays.
// Source example: GIS StackExchange answer showing GTA V map bounds in Leaflet's CRS.Simple notation.
export const GTA_DEFAULT_WORLD_BOUNDS = {
  minX: -4000,
  maxX: 6000,
  minY: -4000,
  maxY: 8000,
};

// Measured from the current `web/public/maps/FullMap.png` alpha channel.
// Used for viewport fitting / cursor UI only, not for coordinate projection.
export const GTA_FULL_MAP_CONTENT_BOUNDS = {
  left: 75,
  top: 348,
  right: 6131,
  bottom: 8576,
};

// Ported from an existing Leaflet GTA V map CRS implementation and adapted as a
// projection reference for the CAD postal map image.
// Ref: https://github.com/RiceaRaul/gta-v-map-leaflet/blob/master/scripts/script.js
export const GTA_LEAFLET_REFERENCE_CRS = {
  centerX: 117.3,
  centerY: 172.8,
  scaleX: 0.02072,
  scaleY: 0.0205,
  referenceZoom: 5,
  referencePlanePx: 8192, // 256 * 2^5
};

// Small post-projection image nudge for the local postal FullMap.png variant.
// Different postal-map renders can be slightly shifted even when using the same
// GTA V world transform. Positive X moves right, positive Y moves down.
export const GTA_POSTAL_MAP_IMAGE_NUDGE = {
  x: 21,
  y: -148,
};

// Flamm64 GTA-V-World-Map in-game coordinate conversion constants (Google custom map version).
// Ref: https://github.com/Flamm64/GTA-V-World-Map (gtamp2googlepx in index.html)
export const FLAMM_GTAV_WORLD_MAP_CALIBRATION = {
  mx: 0.05030,
  my: -0.05030,
  offsetX: -486.97,
  offsetY: 408.9,
  mapDivWidth: 1126.69,
  mapDivHeight: 600,
  referenceZoom: 2, // Google custom map zoom used in the original conversion helper
  targetZoom: 5, // we stitch z5 tiles into a single 8192x8192 image
  referencePlanePx: 1024, // 256 * (2 ** 2)
};

export const FLAMM_GTAV_WORLD_MAP_IMAGE_SIZE = {
  width: 8192,
  height: 8192,
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function rectWidth(rect) {
  return Math.max(0, Number(rect?.right) - Number(rect?.left));
}

function rectHeight(rect) {
  return Math.max(0, Number(rect?.bottom) - Number(rect?.top));
}

export function getRectSize(rect) {
  return { width: rectWidth(rect), height: rectHeight(rect) };
}

export function isPointInsideRect(point, rect) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x)
    && Number.isFinite(y)
    && x >= Number(rect?.left)
    && x <= Number(rect?.right)
    && y >= Number(rect?.top)
    && y <= Number(rect?.bottom);
}

export function isGtaAtlasCanvasSize(imageSize) {
  const width = Number(imageSize?.width);
  const height = Number(imageSize?.height);
  return width === GTA_FULL_MAP_IMAGE_SIZE.width && height === GTA_FULL_MAP_IMAGE_SIZE.height;
}

function normalizeImageRect(imageSize, imageRect = null) {
  const width = Math.max(1, Number(imageSize?.width) || 1);
  const height = Math.max(1, Number(imageSize?.height) || 1);
  const rectLeftRaw = Number(imageRect?.left);
  const rectTopRaw = Number(imageRect?.top);
  const rectRightRaw = Number(imageRect?.right);
  const rectBottomRaw = Number(imageRect?.bottom);
  const rectLeft = Number.isFinite(rectLeftRaw) ? rectLeftRaw : 0;
  const rectTop = Number.isFinite(rectTopRaw) ? rectTopRaw : 0;
  const rectRight = Number.isFinite(rectRightRaw) ? rectRightRaw : width;
  const rectBottom = Number.isFinite(rectBottomRaw) ? rectBottomRaw : height;
  const imageMinX = Math.max(0, Math.min(width, rectLeft));
  const imageMinY = Math.max(0, Math.min(height, rectTop));
  const imageMaxX = Math.max(imageMinX + 1, Math.min(width, rectRight));
  const imageMaxY = Math.max(imageMinY + 1, Math.min(height, rectBottom));
  const imageWorldWidth = Math.max(1, imageMaxX - imageMinX);
  const imageWorldHeight = Math.max(1, imageMaxY - imageMinY);
  return {
    width,
    height,
    imageMinX,
    imageMinY,
    imageMaxX,
    imageMaxY,
    imageWorldWidth,
    imageWorldHeight,
  };
}

export function createGtaLeafletReferenceProjection({
  imageSize = GTA_FULL_MAP_IMAGE_SIZE,
  imageRect = null,
  crs = GTA_LEAFLET_REFERENCE_CRS,
  imageNudge = GTA_POSTAL_MAP_IMAGE_NUDGE,
} = {}) {
  const {
    imageMinX,
    imageMinY,
    imageWorldWidth,
    imageWorldHeight,
  } = normalizeImageRect(imageSize, imageRect);

  const centerX = Number(crs?.centerX || 0);
  const centerY = Number(crs?.centerY || 0);
  const scaleX = Number(crs?.scaleX || 0.02072);
  const scaleY = Number(crs?.scaleY || 0.0205);
  const nudgeX = Number(imageNudge?.x || 0);
  const nudgeY = Number(imageNudge?.y || 0);
  const referenceZoom = Number.isFinite(Number(crs?.referenceZoom)) ? Number(crs.referenceZoom) : 5;
  const zoomScale = Math.pow(2, referenceZoom);
  const referencePlanePx = Math.max(1, Number(crs?.referencePlanePx) || (256 * zoomScale));

  const worldToReferencePlane = (x, y) => ({
    x: ((scaleX * x) + centerX) * zoomScale,
    y: ((-scaleY * y) + centerY) * zoomScale,
  });

  const referencePlaneToWorld = (x, y) => ({
    x: ((x / zoomScale) - centerX) / scaleX,
    y: (centerY - (y / zoomScale)) / scaleY,
  });

  return {
    worldToImagePoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const ref = worldToReferencePlane(x, y);
      return {
        x: imageMinX + ((ref.x / referencePlanePx) * imageWorldWidth) + nudgeX,
        y: imageMinY + ((ref.y / referencePlanePx) * imageWorldHeight) + nudgeY,
      };
    },

    imageToWorldPoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const refX = ((x - nudgeX - imageMinX) / imageWorldWidth) * referencePlanePx;
      const refY = ((y - nudgeY - imageMinY) / imageWorldHeight) * referencePlanePx;
      return referencePlaneToWorld(refX, refY);
    },

    worldDistanceToImagePixels(distance) {
      const d = Math.max(0, Number(distance || 0));
      const sx = Math.abs(scaleX) * zoomScale * (imageWorldWidth / referencePlanePx);
      const sy = Math.abs(scaleY) * zoomScale * (imageWorldHeight / referencePlanePx);
      return Math.max(1, d * Math.min(sx, sy));
    },
  };
}

export function createFlammGtaWorldMapProjection({
  imageSize = FLAMM_GTAV_WORLD_MAP_IMAGE_SIZE,
  imageRect = null,
  calibration = FLAMM_GTAV_WORLD_MAP_CALIBRATION,
  worldBounds = GTA_DEFAULT_WORLD_BOUNDS,
} = {}) {
  const {
    imageMinX,
    imageMinY,
    imageWorldWidth,
    imageWorldHeight,
  } = normalizeImageRect(imageSize, imageRect);

  const mx = Number(calibration?.mx || 0.05030);
  const my = Number(calibration?.my || -0.05030);
  const offsetX = Number(calibration?.offsetX || -486.97);
  const offsetY = Number(calibration?.offsetY || 408.9);
  const mapDivWidth = Number(calibration?.mapDivWidth || 1126.69);
  const mapDivHeight = Number(calibration?.mapDivHeight || 600);
  const referencePlanePx = Math.max(1, Number(calibration?.referencePlanePx) || 1024);
  const referenceZoom = Number.isFinite(Number(calibration?.referenceZoom)) ? Number(calibration.referenceZoom) : 2;
  const targetZoom = Number.isFinite(Number(calibration?.targetZoom)) ? Number(calibration.targetZoom) : 5;
  const zoomScale = Math.pow(2, targetZoom - referenceZoom);
  const targetPlanePx = referencePlanePx * zoomScale;

  // Original helper converts in-game coords to container pixels with the map centered at [0,0]
  // on a fixed-size Google map. Convert those container pixels into the underlying world-pixel
  // plane, then scale into the stitched z5 image plane.
  const referenceCenterPx = referencePlanePx / 2;
  const refPixelOffsetX = offsetX + (referenceCenterPx - (mapDivWidth / 2));
  const refPixelOffsetY = offsetY + (referenceCenterPx - (mapDivHeight / 2));
  const xWrapPeriodWorldUnits = Math.abs(referencePlanePx / (mx || 1));
  const minX = Number(worldBounds?.minX || 0);
  const maxX = Number(worldBounds?.maxX || 0);
  const minY = Number(worldBounds?.minY || 0);
  const maxY = Number(worldBounds?.maxY || 0);

  function wrapRefX(refX) {
    if (!Number.isFinite(refX)) return 0;
    const wrapped = ((refX % referencePlanePx) + referencePlanePx) % referencePlanePx;
    return wrapped;
  }

  function unwrapWorldX(worldX) {
    if (!Number.isFinite(worldX) || !Number.isFinite(xWrapPeriodWorldUnits) || xWrapPeriodWorldUnits <= 0) return worldX;
    let x = worldX;
    // Bring cursor conversions back into the playable GTA/FiveM range.
    while (x < minX) x += xWrapPeriodWorldUnits;
    while (x > maxX) x -= xWrapPeriodWorldUnits;
    return x;
  }

  return {
    worldToImagePoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const refX = wrapRefX((mx * x) + refPixelOffsetX);
      const refY = (my * y) + refPixelOffsetY;
      return {
        x: imageMinX + ((refX * zoomScale) / targetPlanePx) * imageWorldWidth,
        y: imageMinY + ((refY * zoomScale) / targetPlanePx) * imageWorldHeight,
      };
    },

    imageToWorldPoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const refXWrapped = ((x - imageMinX) / imageWorldWidth) * targetPlanePx / zoomScale;
      const refY = ((y - imageMinY) / imageWorldHeight) * targetPlanePx / zoomScale;
      const worldXWrapped = (refXWrapped - refPixelOffsetX) / (mx || 1);
      const worldY = (refY - refPixelOffsetY) / (my || -0.05030);
      return {
        x: unwrapWorldX(worldXWrapped),
        y: Number.isFinite(worldY) ? Math.min(maxY, Math.max(minY, worldY)) : 0,
      };
    },

    worldDistanceToImagePixels(distance) {
      const d = Math.max(0, Number(distance || 0));
      const sx = Math.abs(mx) * zoomScale * (imageWorldWidth / targetPlanePx);
      const sy = Math.abs(my) * zoomScale * (imageWorldHeight / targetPlanePx);
      return Math.max(1, d * Math.min(sx, sy));
    },
  };
}

export function createGtaAtlasProjection({
  imageSize = GTA_FULL_MAP_IMAGE_SIZE,
  imageRect = null,
  worldBounds = GTA_DEFAULT_WORLD_BOUNDS,
} = {}) {
  const {
    imageMinX,
    imageMinY,
    imageWorldWidth,
    imageWorldHeight,
  } = normalizeImageRect(imageSize, imageRect);
  const minX = Number(worldBounds?.minX || 0);
  const maxX = Number(worldBounds?.maxX || 0);
  const minY = Number(worldBounds?.minY || 0);
  const maxY = Number(worldBounds?.maxY || 0);
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);

  return {
    worldToImagePoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const relX = (x - minX) / worldWidth;
      const relY = (y - minY) / worldHeight;
      return {
        x: imageMinX + (clamp01(relX) * imageWorldWidth),
        y: imageMinY + ((1 - clamp01(relY)) * imageWorldHeight),
      };
    },

    imageToWorldPoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const relX = (x - imageMinX) / imageWorldWidth;
      const relY = (y - imageMinY) / imageWorldHeight;
      return {
        x: minX + (clamp01(relX) * worldWidth),
        y: minY + ((1 - clamp01(relY)) * worldHeight),
      };
    },

    worldDistanceToImagePixels(distance) {
      const d = Math.max(0, Number(distance || 0));
      const sx = imageWorldWidth / worldWidth;
      const sy = imageWorldHeight / worldHeight;
      return Math.max(1, d * Math.min(sx, sy));
    },
  };
}
