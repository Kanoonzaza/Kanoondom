// The world map: a canvas renderer with pan and zoom.
//
// 96x96 tiles is far too much for one phone screen, and DOM elements per tile
// would be 9,216 nodes. So the map is a canvas that draws only what is visible,
// and the player pans and pinches around it.

import { el, short } from './dom.js';
import {
  biomeAt, tileInfo, inBounds, isCleared, clearedTileCount,
  hallRadius, zoneOf, zoneLabel, isZoneUnlocked, worldCentre,
} from '../sim/world.js';
import { BIOMES } from '../content/biomes.js';
import { TILE, register, drawSprite, hasSprite } from './sprites.js';
import {
  terrainTemplates, variantCount, ANIMATED_BIOMES, ISO_W, ISO_H,
} from '../content/art/terrain-art.js';
import { facilityTemplates, facilityColours } from '../content/art/facilities-art.js';
import {
  toScreen, toTile, visibleTileBounds, depthOf, tileWidth, tileHeight,
} from './iso.js';
import { peopleTemplates } from '../content/art/people-art.js';
import { monsterTemplates } from '../content/art/monsters-art.js';
import { townsfolkAt, sleepingHouses } from './townsfolk.js';
import { drawRoom, box } from './rooms.js';
import { decorAt, decorOffset } from './decor.js';
import { isSheetOpen } from './panels.js';
import { dayPeriod, isFullMoon } from '../state.js';
import {
  FACILITIES, facilityDef, FACILITY_CATEGORIES, CATEGORY_LABELS,
} from '../content/facilities.js';
import {
  facilityAt, canPlace, footprintTiles, repairCostFor, canUpgrade,
} from '../sim/facilities.js';
import { knownNests } from '../sim/monsters.js';
import { RESOURCES } from '../content/resources.js';
import { auraSources } from '../sim/aura.js';
import { WORLD, WORLD_TILES_X, WORLD_TILES_Y } from '../content/config.js';

// ---------------------------------------------------------------------------
// The ambient clock
// ---------------------------------------------------------------------------
//
// Eight frames a second, which is roughly what the games this one is modelled
// on ran at, and slow enough that it reads as deliberate rather than as a
// screensaver. Everything that moves on its own — water, lava, torchlight,
// people — reads this one counter, so the whole town breathes in step.
//
// This is a considered amendment to the rule set in M1 that a paused game in
// the foreground costs nothing. It still costs nothing when the page is
// hidden, when a sheet covers the map, when the player is on another screen,
// or when they have asked for reduced motion. But a town you are looking at
// should be alive, and eight repaints a second of a single blit is a price
// worth paying for that.

const AMBIENT_FPS = 8;

let ambientFrame = 0;

const prefersReducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Is the map somewhere a person can actually see it move? */
function ambientWanted() {
  if (prefersReducedMotion()) return false;
  if (document.visibilityState === 'hidden') return false;
  return !isSheetOpen();
}

/** What the ambient counter should be right now. */
function ambientNow() {
  return Math.floor(performance.now() / (1000 / AMBIENT_FPS));
}

/** What the ambient counter is, for anything that draws a moving thing. */
export function currentFrame() {
  return ambientFrame;
}

/**
 * What the player is currently doing on the map.
 *
 * `hover` is where the ghost is being shown. On a desktop that follows the
 * mouse; on a phone it is wherever the player last TAPPED, and it stays there
 * until they tap somewhere else or confirm. A phone has no hover, and while a
 * finger is down it covers the very footprint the ghost is meant to be showing
 * — so tapping stages the building and a bar asks before anything is built.
 */
export const mapMode = { building: null, hover: null };

/** Camera, kept across re-renders so the view does not jump. */
export const camera = {
  /** Tile at the centre of the view. */
  x: worldCentre().x,
  y: worldCentre().y,
  /** Screen pixels per tile. */
  zoom: 7,
  minZoom: 3,
  maxZoom: 22,
};

const UNLOCKED_TINT = 'rgba(0,0,0,0.45)';

// ---------------------------------------------------------------------------
// The terrain layer
// ---------------------------------------------------------------------------
//
// Biome and fog are the only things on this map that cover EVERY tile, and
// neither changes often: biome never changes at all (it is a pure function of
// the seed) and fog lifts only when the player explores. Drawing them tile by
// tile cost up to 9,216 fillRects per repaint at the widest zoom, several times
// a second, for a picture that was usually identical to the last one.
//
// So they are painted once into an offscreen canvas at ONE PIXEL PER TILE and
// blitted with a single drawImage. Every tile is a flat colour and the canvas
// is already `image-rendering: pixelated`, so the scaled-up blit is the same
// picture the loop drew, for a fraction of the work.
//
// Everything that is sparse or moves — facilities, the ghost, territory rings,
// nests, worn ground — stays a live pass below, where it costs what it is worth.

register(terrainTemplates());
register(facilityTemplates());
register(peopleTemplates());
register(monsterTemplates());

/**
 * Below this many pixels to a tile, a person is a smudge.
 *
 * Drawing them anyway would cost a draw call each for something nobody can
 * make out, and at the widest zoom that is every resident in the kingdom.
 */
const FOLK_MIN_ZOOM = 7;

/** The whole world, painted once into one isometric sheet. */
let terrainCanvas = null;
let terrainKey = '';

/** Tiles whose art moves, and so are drawn live rather than baked in. */
const ANIMATES = new Set(ANIMATED_BIOMES);

/**
 * Where tile (0,0) sits in the sheet.
 *
 * A diamond world runs from x - y = -95 on the far left to +95 on the far
 * right, so the sheet needs half a world of padding before the origin or the
 * western half would fall off the left edge.
 */
export const SHEET_ORIGIN = WORLD_TILES_X * (ISO_W / 2);

const SHEET_WIDTH = (WORLD_TILES_X + WORLD_TILES_Y) * (ISO_W / 2) + ISO_W;
const SHEET_HEIGHT = (WORLD_TILES_X + WORLD_TILES_Y) * (ISO_H / 2) + ISO_H;

/**
 * Which stamp a tile uses.
 *
 * A hash of the position, so a meadow is not one tile repeated ninety-six
 * times across, and — because it is a pure function of where the tile IS — the
 * same tile always picks the same stamp and the sheet stays cacheable.
 */
function variantAt(x, y, count) {
  if (count <= 1) return 0;
  let hash = (x * 374761393 + y * 668265263) | 0;
  hash = (hash ^ (hash >>> 13)) * 1274126177;
  return Math.abs(hash ^ (hash >>> 16)) % count;
}

/**
 * Throw the cached sheets away.
 *
 * Needed when the world itself is replaced — a reset, or an imported save —
 * because the key below cannot tell two different worlds apart if they happen
 * to share a seed and an amount of explored land.
 */
export function invalidateTerrain() {
  terrainKey = '';
}

/**
 * The ground, drawn once and then only ever blitted.
 *
 * Each of the 9,216 tiles is a sixteen-pixel painted stamp rather than a flat
 * colour, which is the single biggest difference between this looking like a
 * place and looking like a spreadsheet. Painting that per frame would be
 * thousands of draws; painting it into two whole-world sheets means the map
 * still costs ONE drawImage per frame, exactly as it did when every tile was a
 * single pixel.
 *
 * Rebuilt only when the world changes: the key is the seed plus the number of
 * tiles brought to light, `clearedCount` is maintained rather than counted, and
 * it moves only on a player action — never on a tick.
 */
function terrainSheet(state) {
  const key = `${state.seed}/${clearedTileCount(state)}`;
  if (terrainCanvas && terrainKey === key) return terrainCanvas;

  if (!terrainCanvas) {
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = SHEET_WIDTH;
    terrainCanvas.height = SHEET_HEIGHT;
  }

  const ctx = terrainCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

  // Back to front, so the bevel on a nearer tile overlaps the one behind it and
  // the ground reads as a continuous surface rather than as loose lozenges.
  for (let sum = 0; sum <= (WORLD_TILES_X + WORLD_TILES_Y); sum++) {
    for (let x = 0; x < WORLD_TILES_X; x++) {
      const y = sum - x;
      if (y < 0 || y >= WORLD_TILES_Y) continue;

      // Unexplored is cloud, so the shape of what you know reads clearly
      // against what you do not.
      const biome = isCleared(state, x, y) ? biomeAt(state, x, y) : 'fog';
      const variant = variantAt(x, y, variantCount(biome));
      drawSprite(
        ctx, `terrain:${biome}:${variant}`,
        (x - y) * (ISO_W / 2) + SHEET_ORIGIN - ISO_W / 2,
        (x + y) * (ISO_H / 2),
        ISO_W, ISO_H, 0
      );
    }
  }

  terrainKey = key;
  return terrainCanvas;
}

// ---------------------------------------------------------------------------
// Time of day
// ---------------------------------------------------------------------------

/**
 * A wash of colour over the finished map.
 *
 * The clock has driven the simulation since V1 — monsters are bolder at night,
 * caves open on a full moon — and the map has never once shown it. A single
 * translucent rectangle is the cheapest atmosphere in the game: the same town
 * reads as morning, noon and midnight without redrawing a thing.
 */
const DAY_TINT = {
  morning: 'rgba(255, 186, 110, 0.13)',
  day: null,
  night: 'rgba(18, 26, 66, 0.42)',
};

const FULL_MOON_TINT = 'rgba(60, 84, 150, 0.34)';

function timeTint(state) {
  const period = dayPeriod(state).id;
  if (period === 'night' && isFullMoon(state)) return FULL_MOON_TINT;
  return DAY_TINT[period] ?? null;
}

export function zoomBy(factor) {
  camera.zoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.zoom * factor));
}

/**
 * Zoom while keeping one screen point over the same piece of world.
 *
 * Pinching and wheeling both used to scale about the middle of the canvas, so
 * the ground under the fingers slid away as it grew and the player had to pan
 * back to whatever they were looking at. Anchoring is what makes a pinch feel
 * like handling a map rather than operating a zoom control.
 */
export function zoomAbout(canvas, clientX, clientY, factor) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  const before = toTile(px, py, camera, rect.width, rect.height);
  zoomBy(factor);
  const after = toTile(px, py, camera, rect.width, rect.height);

  // Put back whatever the zoom shifted, so the ground under the fingers stays
  // under the fingers.
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

export function centreOn(x, y) {
  camera.x = x;
  camera.y = y;
}

/**
 * Move the camera by a drag measured in SCREEN pixels.
 *
 * On a square grid this was a division. On a diamond one, dragging right moves
 * the camera along both axes at once — which is the whole point of the
 * projection, and getting it wrong makes the map slide off at an angle to the
 * finger.
 */
function panBy(dx, dy) {
  const halfW = tileWidth(camera.zoom) / 2;
  const halfH = tileHeight(camera.zoom) / 2;
  const ax = dx / halfW;
  const ay = dy / halfH;

  camera.x -= (ax + ay) / 2;
  camera.y -= (ay - ax) / 2;
}

function clampCamera() {
  camera.x = Math.max(0, Math.min(WORLD_TILES_X, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_TILES_Y, camera.y));
}

/**
 * Draw the visible world.
 *
 * Isometric, and drawn back to front. The order matters more here than it did
 * on a square grid: in isometric a thing further down the screen is nearer the
 * viewer, so everything that stands up off the ground — buildings, people,
 * monsters — is collected first, sorted by depth, and drawn last. That is what
 * stops a farmhouse being painted over the farmer standing in front of it.
 */
export function drawMap(canvas, state) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

  const cssWidth = canvas.clientWidth || 360;
  const cssHeight = canvas.clientHeight || 360;
  // Both dimensions, not just the width: a rotation can change the height alone
  // and would otherwise leave the backing store stretched over the new shape.
  if (canvas.width !== Math.round(cssWidth * dpr)
      || canvas.height !== Math.round(cssHeight * dpr)) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  // Nothing lies beyond the world, so what shows past its edges is simply sky.
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const tw = tileWidth(camera.zoom);
  const th = tileHeight(camera.zoom);
  const scale = tw / ISO_W;
  const project = (tx, ty) => toScreen(tx, ty, camera, cssWidth, cssHeight);

  // --- the ground, in one blit ---
  //
  // The whole world is painted into a single isometric sheet, so the ground
  // still costs ONE drawImage however far out the camera is pulled. The sheet
  // is laid out with exactly the projection the screen uses, which makes
  // placing it a uniform scale and offset rather than a per-tile calculation.
  const sheet = terrainSheet(state);
  const sheetX = cssWidth / 2 - (camera.x - camera.y) * (tw / 2) - SHEET_ORIGIN * scale;
  const sheetY = cssHeight / 2 - (camera.x + camera.y) * (th / 2);
  ctx.drawImage(
    sheet, 0, 0, sheet.width, sheet.height,
    sheetX, sheetY, sheet.width * scale, sheet.height * scale
  );

  const view = visibleTileBounds(camera, cssWidth, cssHeight);
  const firstX = Math.max(0, view.firstX);
  const lastX = Math.min(WORLD_TILES_X - 1, view.lastX);
  const firstY = Math.max(0, view.firstY);
  const lastY = Math.min(WORLD_TILES_Y - 1, view.lastY);

  // --- water and lava, drawn live over the sheet ---
  //
  // A second whole-world sheet for the animation frame would be nineteen more
  // megabytes spent almost entirely on tiles that never change. These two are a
  // small minority, so they are redrawn on top instead.
  for (let ty = firstY; ty <= lastY; ty++) {
    for (let tx = firstX; tx <= lastX; tx++) {
      if (!isCleared(state, tx, ty)) continue;
      const biome = biomeAt(state, tx, ty);
      if (!ANIMATES.has(biome)) continue;
      const at = project(tx, ty);
      drawSprite(ctx, `terrain:${biome}:0`, at.x - tw / 2, at.y, tw, th, ambientFrame);
    }
  }

  // --- worn ground ---
  for (const [index, worn] of Object.entries(state.world.wasteland)) {
    if (!(worn > 0)) continue;
    const wx = Number(index) % WORLD_TILES_X;
    const wy = Math.floor(Number(index) / WORLD_TILES_X);
    if (wx < firstX || wx > lastX || wy < firstY || wy > lastY) continue;
    if (!isCleared(state, wx, wy)) continue;
    const at = project(wx, wy);
    diamondPath(ctx, at.x, at.y, tw, th);
    ctx.fillStyle = `rgba(90,70,45,${0.65 * worn})`;
    ctx.fill();
  }

  // --- locked country ---
  for (let zy = 0; zy < WORLD.zonesY; zy++) {
    for (let zx = 0; zx < WORLD.zonesX; zx++) {
      if (isZoneUnlocked(state, zx, zy)) continue;
      const x0 = zx * WORLD.zoneTiles;
      const y0 = zy * WORLD.zoneTiles;
      const size = WORLD.zoneTiles;
      const top = project(x0, y0);
      const right = project(x0 + size, y0);
      const bottom = project(x0 + size, y0 + size);
      const left = project(x0, y0 + size);

      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.lineTo(left.x, left.y);
      ctx.closePath();
      ctx.fillStyle = UNLOCKED_TINT;
      ctx.fill();
    }
  }

  // --- territory: a ring on the ground, so it reads as painted on the land ---
  for (const hall of state.townHalls) {
    const radius = hallRadius(hall);
    ctx.beginPath();
    for (let step = 0; step <= 48; step++) {
      const angle = (step / 48) * Math.PI * 2;
      const at = project(
        hall.x + 0.5 + Math.cos(angle) * radius,
        hall.y + 0.5 + Math.sin(angle) * radius
      );
      if (step === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(217,164,65,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(217,164,65,0.06)';
    ctx.fill();
  }

  // --- the build ghost, on the ground under everything that stands on it ---
  if (mapMode.building && mapMode.hover) {
    const def = facilityDef(mapMode.building);
    const { x: hx, y: hy } = mapMode.hover;
    const allowed = canPlace(state, hx, hy, mapMode.building).ok;
    footprintPath(ctx, project, hx, hy, def.size.w, def.size.h);
    ctx.fillStyle = allowed ? 'rgba(124,196,127,0.45)' : 'rgba(224,104,95,0.5)';
    ctx.fill();
    ctx.strokeStyle = allowed ? '#7cc47f' : '#e0685f';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // -------------------------------------------------------------------------
  // Everything that stands up, back to front
  // -------------------------------------------------------------------------

  const standing = [];

  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const def = facilityDef(facility.id);
    const ox = Number(origin) % WORLD_TILES_X;
    const oy = Math.floor(Number(origin) / WORLD_TILES_X);
    if (ox + def.size.w < firstX || ox > lastX + 1) continue;
    if (oy + def.size.h < firstY || oy > lastY + 1) continue;

    standing.push({
      depth: depthOf(ox + def.size.w - 1, oy + def.size.h - 1),
      draw: () => drawRoom(ctx, project, facility, def, ox, oy, camera.zoom),
    });
  }

  // Bushes, trees, crates: whatever the land has grown or somebody left out.
  //
  // Gated at the same zoom as the people. Pulled further out than this the
  // props are a pixel each, and the loop would be walking every tile on screen
  // — thousands of them — to queue something nobody can see.
  if (camera.zoom >= FOLK_MIN_ZOOM) {
    for (let ty = firstY; ty <= lastY; ty++) {
      for (let tx = firstX; tx <= lastX; tx++) {
        const prop = decorAt(state, tx, ty);
        if (!prop) continue;
        const jitter = decorOffset(state, tx, ty);
        const px = tx + jitter.dx;
        const py = ty + jitter.dy;
        standing.push({
          depth: depthOf(tx, ty),
          draw: () => box(
            ctx, project, px, py, prop.size, prop.size,
            camera.zoom * prop.tall, prop.colour, prop.top
          ),
        });
      }
    }
  }

  if (camera.zoom >= FOLK_MIN_ZOOM) {
    const bounds = { firstX, lastX, firstY, lastY };
    const folkHeight = th * 2.4;

    for (const person of townsfolkAt(state, Date.now(), bounds)) {
      standing.push({
        depth: depthOf(Math.floor(person.x), Math.floor(person.y)) + 1,
        draw: () => {
          const at = project(person.x, person.y);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath();
          ctx.ellipse(at.x, at.y, folkHeight * 0.16, folkHeight * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();
          drawSprite(
            ctx, `person:${person.professionId}${person.facing ? ':flip' : ''}`,
            at.x - folkHeight / 2, at.y - folkHeight * 0.92,
            folkHeight, folkHeight, ambientFrame
          );
        },
      });
    }

    for (const house of sleepingHouses(state, bounds)) {
      standing.push({
        depth: depthOf(house.x, house.y) + 2,
        draw: () => {
          const at = project(house.x + 0.5, house.y + 0.5);
          drawSprite(
            ctx, 'person:asleep',
            at.x - folkHeight / 2, at.y - folkHeight * 1.4,
            folkHeight, folkHeight, Math.floor(ambientFrame / 3)
          );
        },
      });
    }
  }

  for (const nest of knownNests(state)) {
    if (nest.x < firstX - 2 || nest.x > lastX + 2) continue;
    if (nest.y < firstY - 2 || nest.y > lastY + 2) continue;

    standing.push({
      depth: depthOf(nest.x, nest.y),
      draw: () => {
        const at = project(nest.x + 0.5, nest.y + 0.5);
        ctx.beginPath();
        ctx.ellipse(at.x, at.y, tw * 0.42, th * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20,8,8,0.55)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(198,95,63,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (camera.zoom >= FOLK_MIN_ZOOM) {
          const beast = th * 2.6;
          drawSprite(
            ctx, `monster:${nest.speciesId}`,
            at.x - beast / 2, at.y - beast * 0.86, beast, beast, ambientFrame
          );
        } else {
          ctx.beginPath();
          ctx.arc(at.x, at.y, Math.max(2, tw * 0.14), 0, Math.PI * 2);
          ctx.fillStyle = '#c65f3f';
          ctx.fill();
        }
      },
    });
  }

  standing.sort((a, b) => a.depth - b.depth);
  for (const thing of standing) thing.draw();

  // --- zone labels, once tiles are big enough to read them ---
  if (camera.zoom >= 6) {
    ctx.fillStyle = 'rgba(233,227,213,0.4)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (let zy = 0; zy < WORLD.zonesY; zy++) {
      for (let zx = 0; zx < WORLD.zonesX; zx++) {
        const at = project(
          zx * WORLD.zoneTiles + WORLD.zoneTiles / 2,
          zy * WORLD.zoneTiles + WORLD.zoneTiles / 2
        );
        if (at.x < 0 || at.y < 0 || at.x > cssWidth || at.y > cssHeight) continue;
        ctx.fillText(zoneLabel(zx, zy), at.x, at.y);
      }
    }
    ctx.textAlign = 'start';
  }

  // --- the hour of the day, over the whole scene ---
  const tint = timeTint(state);
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }

  return { project, tw, th, cssWidth, cssHeight };
}

/** The diamond of a single tile, as a path ready to fill or stroke. */
function diamondPath(ctx, topX, topY, tw, th) {
  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(topX + tw / 2, topY + th / 2);
  ctx.lineTo(topX, topY + th);
  ctx.lineTo(topX - tw / 2, topY + th / 2);
  ctx.closePath();
}

/** The diamond covering a whole building footprint. */
function footprintPath(ctx, project, ox, oy, w, h) {
  const top = project(ox, oy);
  const right = project(ox + w, oy);
  const bottom = project(ox + w, oy + h);
  const left = project(ox, oy + h);

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
}

/**
 * One building, as a solid standing on its footprint.
 *
 * Drawn rather than stamped from a sprite: a building can be any of five
 * footprints and needs to sit exactly on its diamond, and a box with a lit
 * left face, a shaded right face and a flat top is what reads as "a solid
 * thing on the ground" in isometric. The interiors come next.
 */
function drawFacility(ctx, project, state, facility, def, ox, oy, tw, th) {
  const colours = facilityColours(facility.id);
  const w = def.size.w;
  const h = def.size.h;
  const lift = th * (def.housing || def.isTownHall ? 1.5 : 1.05);

  const top = project(ox, oy);
  const right = project(ox + w, oy);
  const bottom = project(ox + w, oy + h);
  const left = project(ox, oy + h);

  // A shadow on the ground first, so the building sits on the land.
  footprintPath(ctx, project, ox, oy, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  const raise = (point) => ({ x: point.x, y: point.y - lift });

  // Left face, catching the light.
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(raise(bottom).x, raise(bottom).y);
  ctx.lineTo(raise(left).x, raise(left).y);
  ctx.closePath();
  ctx.fillStyle = colours.wall;
  ctx.fill();

  // Right face, in shade.
  ctx.beginPath();
  ctx.moveTo(bottom.x, bottom.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(raise(right).x, raise(right).y);
  ctx.lineTo(raise(bottom).x, raise(bottom).y);
  ctx.closePath();
  ctx.fillStyle = colours.wallShade;
  ctx.fill();

  // The top.
  ctx.beginPath();
  ctx.moveTo(raise(top).x, raise(top).y);
  ctx.lineTo(raise(right).x, raise(right).y);
  ctx.lineTo(raise(bottom).x, raise(bottom).y);
  ctx.lineTo(raise(left).x, raise(left).y);
  ctx.closePath();
  ctx.fillStyle = facility.built ? colours.roof : 'rgba(120,120,120,0.55)';
  ctx.fill();
  ctx.strokeStyle = colours.roofShade;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (!facility.built) {
    const progress = 1 - facility.buildTicksRemaining / def.buildTicks;
    const barWidth = tw * w * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bottom.x - barWidth / 2, bottom.y - lift - 4, barWidth, 4);
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(bottom.x - barWidth / 2, bottom.y - lift - 4, barWidth * progress, 4);
  }

  if (facility.damaged) {
    footprintPath(ctx, project, ox, oy, w, h);
    ctx.fillStyle = 'rgba(193,75,58,0.35)';
    ctx.fill();
  }

  if (facility.level > 1 && camera.zoom >= 6) {
    const pip = Math.max(2, th * 0.18);
    for (let i = 0; i < facility.level - 1; i++) {
      ctx.fillStyle = '#f2cd72';
      ctx.fillRect(
        raise(left).x + 3 + i * (pip + 2), raise(left).y - pip - 2, pip, pip
      );
    }
  }
}

/** Turn a click position into a tile, or null if it missed the world. */
export function tileAtPointer(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const at = toTile(
    clientX - rect.left, clientY - rect.top, camera, rect.width, rect.height
  );

  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  return inBounds(x, y) ? { x, y } : null;
}

/**
 * Build the map element and wire pan, pinch and tap.
 * Returns the wrapper; call `redraw()` on it to repaint.
 */
export function createMapView(state, handlers) {
  const canvas = el('canvas', { id: 'world-canvas' });
  const wrap = el('div.map-wrap', {}, [
    canvas,
    el('div.map-controls', {}, [
      el('button.map-btn', { text: '+', 'aria-label': 'Zoom in', on: { click: () => { zoomBy(1.35); redraw(); } } }),
      el('button.map-btn', { text: '−', 'aria-label': 'Zoom out', on: { click: () => { zoomBy(1 / 1.35); redraw(); } } }),
      el('button.map-btn', {
        text: '⌂',
        'aria-label': 'Centre on your capital',
        on: {
          click: () => {
            const hall = state.townHalls[0];
            centreOn(hall.x, hall.y);
            redraw();
          },
        },
      }),
    ]),
  ]);

  function redraw() {
    clampCamera();
    drawMap(canvas, state);
  }
  wrap.redraw = redraw;

  // Redraw whenever the canvas's box changes: a rotation, a split-screen drag,
  // an on-screen keyboard — and, most importantly, the very first time the
  // element is laid out at all. A page that loads while hidden has no layout
  // yet, so the first draw would otherwise be stuck at a fallback size forever
  // now that repaints only happen when something has actually changed.
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    wrap.stopObserving = () => observer.disconnect();
  }

  // --- pointer handling: drag to pan, pinch to zoom, tap to choose ---
  const pointers = new Map();
  let dragged = 0;
  let pinch = null;
  let velocityX = 0;
  let velocityY = 0;
  let lastMoveAt = 0;
  let glide = 0;

  const reducedMotion =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  /** Where two fingers are, on average, and how far apart. */
  function pinchOf() {
    const [a, b] = [...pointers.values()];
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      spread: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  /**
   * Coast to a stop after a flick.
   *
   * The main loop asks `animating()` whether to keep giving out frames, which
   * is how a paused game can still be panned smoothly and still fall back to
   * zero work the moment the map settles.
   */
  wrap.animating = () => glide > 0 || ambientWanted();

  wrap.step = () => {
    if (glide > 0) {
      panBy(velocityX, velocityY);
      velocityX *= 0.92;
      velocityY *= 0.92;
      if (Math.hypot(velocityX, velocityY) < 0.05) glide = 0;
      redraw();
      return;
    }

    // Otherwise repaint only when the ambient counter actually turns over.
    // `step` is called every animation frame; this is what keeps the canvas
    // work at eight a second rather than sixty.
    if (!ambientWanted()) return;
    const now = ambientNow();
    if (now === ambientFrame) return;
    ambientFrame = now;
    redraw();
  };

  canvas.addEventListener('pointermove', (event) => {
    // Desktop hover: show the ghost without needing a press. A touch device
    // never sends this without a button held, so it costs phones nothing.
    if (!mapMode.building || pointers.size > 0 || event.pointerType === 'touch') return;
    const tile = tileAtPointer(canvas, event.clientX, event.clientY);
    if (tile && (mapMode.hover?.x !== tile.x || mapMode.hover?.y !== tile.y)) {
      mapMode.hover = tile;
      handlers.onStage?.(tile.x, tile.y);
      redraw();
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    // Capture keeps a drag alive if the finger leaves the canvas, but it is
    // allowed to throw — and if it does before the pointer is registered below,
    // every tap and drag on the map stops working. It is an optimisation, not a
    // requirement, so it never gets to take the input with it.
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer went away before we could claim it */
    }
    glide = 0;                      // a finger down stops any coasting
    velocityX = 0;
    velocityY = 0;

    // A primary pointer going down is the FIRST finger of a new gesture, so
    // anything still in here is stale — a pointerup the page never received
    // because something took the gesture away mid-stroke (a call arriving, the
    // system back gesture). Left behind, those ghosts make every later tap look
    // like the tail of a two-finger pinch, and the map stops answering taps
    // entirely until the page is reloaded.
    if (event.isPrimary) pointers.clear();

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) pinch = pinchOf();
    dragged = 0;
    lastMoveAt = event.timeStamp;
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);

    if (pointers.size === 1) {
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      dragged += Math.abs(dx) + Math.abs(dy);

      const dt = event.timeStamp - lastMoveAt;
      if (dt > 0) {
        // Blended, so one jittery sample cannot throw a flick off course.
        velocityX = velocityX * 0.4 + (dx / dt) * 16 * 0.6;
        velocityY = velocityY * 0.4 + (dy / dt) * 16 * 0.6;
      }
      lastMoveAt = event.timeStamp;

      panBy(dx, dy);
      redraw();
      return;
    }

    if (pointers.size === 2 && pinch) {
      const now = pinchOf();
      // Both at once, about the point between the fingers: the spread zooms and
      // the centroid pans, which together are simply "move the paper".
      if (pinch.spread > 0 && now.spread > 0) {
        zoomAbout(canvas, now.x, now.y, now.spread / pinch.spread);
      }
      panBy(now.x - pinch.x, now.y - pinch.y);
      pinch = now;
      dragged += 10;
      redraw();
    }
  });

  function endPointer(event) {
    const wasSingle = pointers.size === 1;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) pinch = null;
    if (pointers.size === 0) canvas.classList.remove('dragging');

    if (wasSingle && dragged >= 6 && !reducedMotion) {
      // Let a flick carry, but only a real one.
      if (Math.hypot(velocityX, velocityY) > 1.5) glide = 1;
    }

    // A tap, not a drag.
    if (wasSingle && dragged < 6) {
      const tile = tileAtPointer(canvas, event.clientX, event.clientY);
      if (!tile) return;
      if (mapMode.building) {
        // Position it; do not build it. The confirm bar does that.
        mapMode.hover = tile;
        handlers.onStage?.(tile.x, tile.y);
        redraw();
      } else {
        handlers.onTapTile?.(tile.x, tile.y);
      }
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAbout(canvas, event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    redraw();
  }, { passive: false });

  return wrap;
}

/** Sheet describing one tile. */
export function tileSheet(state, x, y, onClose, onAction) {
  const info = tileInfo(state, x, y);
  const biome = BIOMES[info.biome];
  const zone = zoneLabel(info.zone.zx, info.zone.zy);
  const unlocked = isZoneUnlocked(state, info.zone.zx, info.zone.zy);

  const rows = [
    ['Zone', zone],
    ['Ground', info.cleared ? `${biome.icon} ${biome.name}` : 'Not yet explored'],
    ['Territory', info.inTerritory ? 'Within your borders' : 'Outside your borders'],
  ];
  if (!unlocked) rows.push(['Beyond reach', 'This country is not open to you yet']);
  if (info.wasteland > 0) rows.push(['Worn', `${Math.round(info.wasteland * 100)}% spent`]);

  const yields = info.cleared ? Object.entries(biome.yields ?? {}) : [];

  const standing = facilityAt(state, x, y);
  const reaching = auraSources(state, x, y);

  return el('div', {}, [
    el('h3.sheet-title', {
      text: standing
        ? `${facilityDef(standing.id).icon} ${facilityDef(standing.id).name}`
        : info.cleared ? `${biome.icon} ${biome.name}` : 'Unexplored land',
    }),
    el('p.sheet-sub', { text: `${zone} · tile ${x}, ${y}` }),

    standing
      ? el('div.card', {}, [
          el('div.card-title', { text: 'Standing here' }),
          el('div.kv', {}, [
            el('span', { text: 'Level' }),
            el('b', { class: standing.level > 1 ? 'pos' : '', text: String(standing.level) }),
          ]),
          !standing.built
            ? el('div.kv', {}, [
                el('span', { text: 'Finishes in' }),
                el('b', { text: `${Math.ceil(standing.buildTicksRemaining)}s` }),
              ])
            : null,
          standing.damaged
            ? el('div.kv', {}, [
                el('span', { class: 'neg', text: 'Damaged' }),
                el('b', { class: 'neg', text: 'not working until repaired' }),
              ])
            : null,
          el('div.pi-note', { text: facilityDef(standing.id).blurb }),
          el('div.btn-row', {}, [
            standing.damaged
              ? el('button.btn.btn-primary', {
                  text: `Repair (${Object.entries(repairCostFor(standing.id))
                    .map(([id, amount]) => `${RESOURCES[id].icon} ${amount}`).join(' ')})`,
                  on: { click: () => onAction?.('repair', x, y) },
                })
              : upgradeButton(state, x, y, onAction),
            el('button.btn.btn-danger', { text: 'Remove', on: { click: () => onAction?.('remove', x, y) } }),
          ]),
          standing.damaged ? null : upgradeRefusal(state, x, y),
        ])
      : null,

    el('div.card', {}, rows.map(([label, value]) =>
      el('div.kv', {}, [el('span', { text: label }), el('b', { text: value })])
    )),

    info.cleared && yields.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'Gathers' }),
          ...yields.map(([resource, rate]) =>
            el('div.kv', {}, [
              el('span', { text: resource }),
              el('b', { class: 'pos', text: `×${rate}` }),
            ])
          ),
          el('div.pi-note', { text: biome.blurb }),
        ])
      : null,

    reaching.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'What reaches this spot' }),
          ...reaching.map((source) =>
            el('div.kv', {}, [
              el('span', { text: `${source.icon} ${source.name}` }),
              el('b', {
                class: 'pos',
                text: Object.entries(source.stats)
                  .map(([stat, value]) => `${stat} +${Math.round(value)}`)
                  .join(', '),
              }),
            ])
          ),
        ])
      : null,

    el('div.btn-row', {}, [
      el('button.btn.btn-primary', { text: 'Close', on: { click: onClose } }),
    ]),
  ]);
}

/** The build palette: what you own, what it costs, what it needs underfoot. */
/**
 * The upgrade button, with its price on it.
 *
 * It said only "Upgrade" until V10, which was harmless while an upgrade cost a
 * few planks. Now that upgrades carry the game's main copper sink — up to 9,000
 * for a top-tier step — a button that hides its price is a button you press by
 * accident.
 */
function upgradeButton(state, x, y, onAction) {
  const check = canUpgrade(state, x, y);
  const price = check.cost
    ? Object.entries(check.cost)
        .map(([id, amount]) => `${RESOURCES[id].icon} ${short(amount)}`)
        .join(' ')
    : '';

  return el('button.btn', {
    text: check.cost ? `Upgrade  ${price}` : 'Upgrade',
    disabled: check.ok ? undefined : 'disabled',
    on: { click: () => onAction?.('upgrade', x, y) },
  });
}

/**
 * Why the upgrade is refused, as text on the page.
 *
 * It lived in a `title` attribute, which is a tooltip, which a touch screen
 * never shows: on a phone the button was simply dead with no explanation. Every
 * other refusal in this game is a visible line, and now so is this one.
 */
function upgradeRefusal(state, x, y) {
  const check = canUpgrade(state, x, y);
  if (check.ok || !check.reason) return null;
  return el('div.pi-note', { class: 'neg', text: check.reason });
}

export function buildSheet(state, entries, handlers) {
  const body = el('div.palette');

  // Driven by the content list, never a hard-coded array here — a category
  // added to the game must not be able to go missing from the menu.
  for (const category of FACILITY_CATEGORIES) {
    const inCategory = entries.filter((entry) => entry.def.category === category);
    if (inCategory.length === 0) continue;

    body.append(el('div.cat-head', { text: CATEGORY_LABELS[category] ?? category }));

    for (const entry of inCategory) {
      const { def, stock, affordable } = entry;
      const notes = [];
      if (def.produces) {
        notes.push(Object.entries(def.produces)
          .map(([id, rate]) => `${(rate * 300).toFixed(1)} ${id}/season`).join(', '));
      }
      if (def.storage) {
        notes.push(Object.entries(def.storage)
          .map(([id, amount]) => `+${amount.toLocaleString()} ${id}`).join(', '));
      }
      if (def.housing) {
        notes.push(`${def.housing.beds} bed${def.housing.beds === 1 ? '' : 's'}, ${def.housing.shelves} shelves`);
      }
      if (def.aura) {
        notes.push(`${Object.entries(def.aura.stats)
          .map(([stat, value]) => `${stat} +${value}`).join(' ')} within ${def.aura.radius}`);
      }

      body.append(el('button.palette-item', {
        disabled: stock <= 0 || !affordable,
        on: { click: () => handlers.onPick(def.id) },
      }, [
        el('div.pi-icon', { text: def.icon }),
        el('div.pi-body', {}, [
          el('div.pi-name', { text: `${def.name}  ·  ${def.size.w}×${def.size.h}` }),
          el('div.pi-note', { text: notes.join(' · ') || def.blurb }),
          el('div.pi-note', {
            class: stock > 0 ? 'pi-gain' : 'pi-lock',
            text: stock > 0 ? `${stock} in hand` : 'none left — research more',
          }),
        ]),
        el('div.pi-cost', {},
          Object.entries(def.cost).map(([id, amount]) =>
            el('div', { class: affordable ? '' : 'pi-lock', text: `${amount} ${id}` })
          )
        ),
      ]));
    }
  }

  return el('div', {}, [
    el('h3.sheet-title', { text: 'Build' }),
    el('p.sheet-sub', { text: 'Pick something, then tap the map to position it.' }),
    body,
    el('div.btn-row', {}, [
      el('button.btn', { text: 'Cancel', on: { click: handlers.onClose } }),
    ]),
  ]);
}
