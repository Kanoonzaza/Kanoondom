// Isometric projection.
//
// The map was drawn straight down onto a square grid, and the buildings were
// drawn from the side — two different cameras in one picture. That is why it
// read as a village on a boardgame rather than as a town you are running.
//
// Everything is now on a 2:1 isometric grid: a tile is twice as wide as it is
// tall, the world runs diagonally, and a building is a ROOM seen from above at
// an angle rather than a house seen from the front.
//
// The whole projection is these four functions. Nothing else in the game needs
// to know about it: the simulation still thinks in plain tile coordinates and
// always will.

/** Screen width of one tile, given the camera's zoom. Height is half of it. */
export const tileWidth = (zoom) => zoom * 2;
export const tileHeight = (zoom) => zoom;

/**
 * Tile coordinates to screen pixels.
 *
 * The returned point is the TOP CORNER of the tile's diamond, which is the
 * anchor everything else is drawn from — a floor tile, a building's footprint,
 * a person standing on it.
 */
export function toScreen(tx, ty, camera, cssWidth, cssHeight) {
  const halfW = tileWidth(camera.zoom) / 2;
  const halfH = tileHeight(camera.zoom) / 2;
  const dx = tx - camera.x;
  const dy = ty - camera.y;

  return {
    x: cssWidth / 2 + (dx - dy) * halfW,
    y: cssHeight / 2 + (dx + dy) * halfH,
  };
}

/**
 * Screen pixels back to tile coordinates.
 *
 * The inverse of the above, and the reason tapping still works: a diamond grid
 * cannot be hit-tested by dividing by a tile size the way a square one can.
 * Returns fractional tiles; callers floor them.
 */
export function toTile(px, py, camera, cssWidth, cssHeight) {
  const halfW = tileWidth(camera.zoom) / 2;
  const halfH = tileHeight(camera.zoom) / 2;
  const dx = (px - cssWidth / 2) / halfW;
  const dy = (py - cssHeight / 2) / halfH;

  return {
    x: camera.x + (dx + dy) / 2,
    y: camera.y + (dy - dx) / 2,
  };
}

/**
 * Which tiles could possibly be on screen.
 *
 * In a square projection this is a rectangle of tiles. In isometric it is a
 * diamond, so the cheap thing to do is take the tile coordinates of the four
 * screen corners and use their bounding box — a few more tiles than strictly
 * visible, and far simpler than walking the diamond exactly.
 */
export function visibleTileBounds(camera, cssWidth, cssHeight, pad = 2) {
  const corners = [
    toTile(0, 0, camera, cssWidth, cssHeight),
    toTile(cssWidth, 0, camera, cssWidth, cssHeight),
    toTile(0, cssHeight, camera, cssWidth, cssHeight),
    toTile(cssWidth, cssHeight, camera, cssWidth, cssHeight),
  ];

  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return {
    firstX: Math.floor(Math.min(...xs)) - pad,
    lastX: Math.ceil(Math.max(...xs)) + pad,
    firstY: Math.floor(Math.min(...ys)) - pad,
    lastY: Math.ceil(Math.max(...ys)) + pad,
  };
}

/**
 * Draw order.
 *
 * A painter's algorithm: things further back are drawn first, so things in
 * front cover them. In an isometric grid "further back" is simply a smaller
 * tx + ty, with tx breaking ties so a row draws left to right.
 *
 * This is what stops a house standing in front of a person it should be behind.
 */
export function depthOf(tx, ty) {
  return (tx + ty) * 1024 + tx;
}
