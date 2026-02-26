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
        x: imageMinX + ((ref.x / referencePlanePx) * imageWorldWidth),
        y: imageMinY + ((ref.y / referencePlanePx) * imageWorldHeight),
      };
    },

    imageToWorldPoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const refX = ((x - imageMinX) / imageWorldWidth) * referencePlanePx;
      const refY = ((y - imageMinY) / imageWorldHeight) * referencePlanePx;
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
