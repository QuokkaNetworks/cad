// GTA/FiveM pause map atlas projection helpers.
//
// References (used for the projection model and tile assumptions):
// - Cfx.re forum (Extra map tiles): pause map uses a 2x3 tile grid and each tile spans 4500 world units.
// - Cfx.re forum (custom maps): minimap/map tiles are typically 3072x3072 textures (`minimap_sea_*_*`).
//
// Inference:
// - A 6144x9216 PNG is a standard 2x3 atlas canvas (2 * 3072 by 3 * 3072).
// - That canvas should be projected linearly to the 9000 x 13500 world-unit atlas space.
// - Do not "re-fit" coordinates to an inner content rect; transparent padding is part of the atlas canvas.

export const GTA_MAP_TILE_WORLD_UNITS = 4500;
export const GTA_MAP_ATLAS_TILE_PX = 3072;
export const GTA_MAP_ATLAS_COLS = 2;
export const GTA_MAP_ATLAS_ROWS = 3;

export const GTA_FULL_MAP_IMAGE_SIZE = {
  width: GTA_MAP_ATLAS_TILE_PX * GTA_MAP_ATLAS_COLS,
  height: GTA_MAP_ATLAS_TILE_PX * GTA_MAP_ATLAS_ROWS,
};

export const GTA_DEFAULT_WORLD_BOUNDS = {
  minX: -GTA_MAP_TILE_WORLD_UNITS,
  maxX: GTA_MAP_TILE_WORLD_UNITS,
  minY: -GTA_MAP_TILE_WORLD_UNITS,
  maxY: GTA_MAP_TILE_WORLD_UNITS * (GTA_MAP_ATLAS_ROWS - 1),
};

// Measured from the current `web/public/maps/FullMap.png` alpha channel.
// Used for viewport fitting / cursor UI only, not for coordinate projection.
export const GTA_FULL_MAP_CONTENT_BOUNDS = {
  left: 75,
  top: 348,
  right: 6131,
  bottom: 8576,
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

export function createGtaAtlasProjection({
  imageSize = GTA_FULL_MAP_IMAGE_SIZE,
  worldBounds = GTA_DEFAULT_WORLD_BOUNDS,
} = {}) {
  const width = Math.max(1, Number(imageSize?.width) || 1);
  const height = Math.max(1, Number(imageSize?.height) || 1);
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
        x: clamp01(relX) * width,
        y: (1 - clamp01(relY)) * height,
      };
    },

    imageToWorldPoint(point) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
      const relX = x / width;
      const relY = y / height;
      return {
        x: minX + (clamp01(relX) * worldWidth),
        y: minY + ((1 - clamp01(relY)) * worldHeight),
      };
    },

    worldDistanceToImagePixels(distance) {
      const d = Math.max(0, Number(distance || 0));
      const sx = width / worldWidth;
      const sy = height / worldHeight;
      return Math.max(1, d * Math.min(sx, sy));
    },
  };
}
