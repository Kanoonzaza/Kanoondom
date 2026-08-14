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
import {
  FACILITIES, facilityDef, FACILITY_CATEGORIES, CATEGORY_LABELS,
} from '../content/facilities.js';
import {
  facilityAt, canPlace, footprintTiles, repairCostFor, canUpgrade,
} from '../sim/facilities.js';
import { knownNests } from '../sim/monsters.js';
import { RESOURCES } from '../content/resources.js';
import { monsterDef } from '../content/monsters.js';
import { auraSources } from '../sim/aura.js';
import { WORLD, WORLD_TILES_X, WORLD_TILES_Y } from '../content/config.js';

/** What the player is currently doing on the map. */
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

let terrainCanvas = null;
let terrainKey = '';

const FOG_RGB = [0x14, 0x19, 0x26];
const rgbCache = new Map();

function rgbOf(hex) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const packed = Number.parseInt(hex.slice(1), 16);
    rgb = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
    rgbCache.set(hex, rgb);
  }
  return rgb;
}

/**
 * Throw the cached layer away.
 *
 * Needed when the world itself is replaced — a reset, or an imported save —
 * because the key below cannot tell two different worlds apart if they happen
 * to share a seed and an amount of explored land.
 */
export function invalidateTerrain() {
  terrainKey = '';
}

/**
 * The terrain layer, rebuilt only when the world it draws has changed.
 *
 * The key is the seed plus the number of tiles brought to light. Fog is the
 * only part of this picture that ever moves, `clearedCount` is maintained
 * rather than counted (see sim/world.js), and it changes only on a player
 * action — so this rebuild happens when somebody explores, and never on a tick.
 */
function terrainLayer(state) {
  const key = `${state.seed}/${clearedTileCount(state)}`;
  if (terrainCanvas && terrainKey === key) return terrainCanvas;

  if (!terrainCanvas) {
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = WORLD_TILES_X;
    terrainCanvas.height = WORLD_TILES_Y;
  }

  const ctx = terrainCanvas.getContext('2d');
  const image = ctx.createImageData(WORLD_TILES_X, WORLD_TILES_Y);
  const data = image.data;

  for (let y = 0; y < WORLD_TILES_Y; y++) {
    for (let x = 0; x < WORLD_TILES_X; x++) {
      // Unexplored is a flat dark field, so the shape of what you know reads
      // clearly against what you do not.
      const rgb = isCleared(state, x, y)
        ? rgbOf(BIOMES[biomeAt(state, x, y)]?.colour ?? '#333333')
        : FOG_RGB;
      const at = (y * WORLD_TILES_X + x) * 4;
      data[at] = rgb[0];
      data[at + 1] = rgb[1];
      data[at + 2] = rgb[2];
      data[at + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  terrainKey = key;
  return terrainCanvas;
}

export function zoomBy(factor) {
  camera.zoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.zoom * factor));
}

export function centreOn(x, y) {
  camera.x = x;
  camera.y = y;
}

function clampCamera() {
  camera.x = Math.max(0, Math.min(WORLD_TILES_X, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_TILES_Y, camera.y));
}

/**
 * Draw the visible window of the world.
 *
 * Deliberately simple: one fill per tile. At the default zoom that is roughly
 * 50x40 tiles — two thousand rectangles, which canvas handles comfortably at
 * the few frames a second this map actually needs.
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
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const size = camera.zoom;
  const halfW = cssWidth / 2;
  const halfH = cssHeight / 2;

  const firstX = Math.max(0, Math.floor(camera.x - halfW / size) - 1);
  const lastX = Math.min(WORLD_TILES_X - 1, Math.ceil(camera.x + halfW / size) + 1);
  const firstY = Math.max(0, Math.floor(camera.y - halfH / size) - 1);
  const lastY = Math.min(WORLD_TILES_Y - 1, Math.ceil(camera.y + halfH / size) + 1);

  const screenX = (tx) => halfW + (tx - camera.x) * size;
  const screenY = (ty) => halfH + (ty - camera.y) * size;

  // --- terrain: biome and fog, in one blit ---
  const spanX = lastX - firstX + 1;
  const spanY = lastY - firstY + 1;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    terrainLayer(state),
    firstX, firstY, spanX, spanY,
    screenX(firstX), screenY(firstY), spanX * size, spanY * size
  );

  // --- worn ground: sparse, so walk what is worn rather than every tile ---
  for (const [index, worn] of Object.entries(state.world.wasteland)) {
    if (!(worn > 0)) continue;
    const wx = Number(index) % WORLD_TILES_X;
    const wy = Math.floor(Number(index) / WORLD_TILES_X);
    if (wx < firstX || wx > lastX || wy < firstY || wy > lastY) continue;
    if (!isCleared(state, wx, wy)) continue;
    ctx.fillStyle = `rgba(90,70,45,${0.65 * worn})`;
    ctx.fillRect(screenX(wx), screenY(wy), size + 1, size + 1);
  }

  // --- locked country, dimmed as a whole ---
  for (let zy = 0; zy < WORLD.zonesY; zy++) {
    for (let zx = 0; zx < WORLD.zonesX; zx++) {
      if (isZoneUnlocked(state, zx, zy)) continue;
      ctx.fillStyle = UNLOCKED_TINT;
      ctx.fillRect(
        screenX(zx * WORLD.zoneTiles),
        screenY(zy * WORLD.zoneTiles),
        WORLD.zoneTiles * size,
        WORLD.zoneTiles * size
      );
    }
  }

  // --- facilities ---
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const def = facilityDef(facility.id);
    const ox = Number(origin) % WORLD_TILES_X;
    const oy = Math.floor(Number(origin) / WORLD_TILES_X);
    const w = def.size.w * size;
    const h = def.size.h * size;
    const sx = screenX(ox);
    const sy = screenY(oy);

    const finished = facility.built;
    ctx.fillStyle = finished ? 'rgba(28,34,50,0.92)' : 'rgba(28,34,50,0.55)';
    ctx.fillRect(sx, sy, w, h);
    ctx.strokeStyle = finished ? '#d9a441' : 'rgba(217,164,65,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx + 0.5, sy + 0.5, w - 1, h - 1);

    if (size >= 5) {
      ctx.font = `${Math.min(w, h) * 0.62}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, sx + w / 2, sy + h / 2);
      ctx.textAlign = 'left';
    }
    if (!finished) {
      const progress = 1 - facility.buildTicksRemaining / def.buildTicks;
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(sx, sy + h - 2, w * progress, 2);
    }
    if (facility.level > 1 && size >= 7) {
      ctx.fillStyle = '#d9a441';
      ctx.font = '600 9px system-ui';
      ctx.fillText(`L${facility.level}`, sx + 2, sy + 9);
    }
  }

  // --- build ghost: show whether it fits BEFORE committing ---
  if (mapMode.building && mapMode.hover) {
    const def = facilityDef(mapMode.building);
    const { x: hx, y: hy } = mapMode.hover;
    const allowed = canPlace(state, hx, hy, mapMode.building).ok;
    ctx.fillStyle = allowed ? 'rgba(124,196,127,0.45)' : 'rgba(224,104,95,0.45)';
    ctx.fillRect(screenX(hx), screenY(hy), def.size.w * size, def.size.h * size);
    ctx.strokeStyle = allowed ? '#7cc47f' : '#e0685f';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX(hx), screenY(hy), def.size.w * size, def.size.h * size);

    // Its reach, so the player can see what the aura would cover.
    if (def.aura) {
      ctx.strokeStyle = 'rgba(217,164,65,0.4)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        screenX(hx - def.aura.radius), screenY(hy - def.aura.radius),
        (def.size.w + def.aura.radius * 2) * size,
        (def.size.h + def.aura.radius * 2) * size
      );
      ctx.setLineDash([]);
    }
  }

  // --- zone grid ---
  if (size >= 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let zx = 0; zx <= WORLD.zonesX; zx++) {
      const sx = Math.round(screenX(zx * WORLD.zoneTiles)) + 0.5;
      ctx.moveTo(sx, screenY(0));
      ctx.lineTo(sx, screenY(WORLD_TILES_Y));
    }
    for (let zy = 0; zy <= WORLD.zonesY; zy++) {
      const sy = Math.round(screenY(zy * WORLD.zoneTiles)) + 0.5;
      ctx.moveTo(screenX(0), sy);
      ctx.lineTo(screenX(WORLD_TILES_X), sy);
    }
    ctx.stroke();
  }

  // --- territory: a ring per Town Hall, since that is literally what it is ---
  for (const hall of state.townHalls) {
    const radius = hallRadius(hall) * size;
    ctx.beginPath();
    ctx.arc(screenX(hall.x + 0.5), screenY(hall.y + 0.5), radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(217,164,65,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(217,164,65,0.07)';
    ctx.fill();
    // The hall itself is drawn by the facility pass above — it is a real
    // facility standing on real tiles, not a marker.
  }

  // --- nests: only the ones the player has actually laid eyes on ---
  // Drawn after territory so a nest inside your borders is unmissable, which
  // is exactly the one you most need to do something about.
  for (const nest of knownNests(state)) {
    const cx = screenX(nest.x + 0.5);
    const cy = screenY(nest.y + 0.5);
    if (cx < -20 || cy < -20 || cx > cssWidth + 20 || cy > cssHeight + 20) continue;

    const radius = Math.max(3, size * 0.42);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(24,10,10,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#c65f3f';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (size >= 9) {
      ctx.font = `${Math.round(size * 0.6)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(monsterDef(nest.speciesId).icon, cx, cy + 1);
      ctx.textAlign = 'start';
    }
  }

  // --- zone labels, once tiles are big enough to read them ---
  if (size >= 6) {
    ctx.fillStyle = 'rgba(233,227,213,0.35)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (let zy = 0; zy < WORLD.zonesY; zy++) {
      for (let zx = 0; zx < WORLD.zonesX; zx++) {
        ctx.fillText(zoneLabel(zx, zy), screenX(zx * WORLD.zoneTiles) + 4, screenY(zy * WORLD.zoneTiles) + 3);
      }
    }
  }

  return { screenX, screenY, size, cssWidth, cssHeight };
}

/** Turn a click position into a tile, or null if it missed the world. */
export function tileAtPointer(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  const x = Math.floor(camera.x + (px - rect.width / 2) / camera.zoom);
  const y = Math.floor(camera.y + (py - rect.height / 2) / camera.zoom);
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

  // --- pointer handling: drag to pan, pinch to zoom, tap to inspect ---
  const pointers = new Map();
  let dragged = 0;
  let pinchStart = null;

  canvas.addEventListener('pointermove', (event) => {
    // Desktop hover: show the ghost without needing a press.
    if (!mapMode.building || pointers.size > 0) return;
    const tile = tileAtPointer(canvas, event.clientX, event.clientY);
    if (tile && (mapMode.hover?.x !== tile.x || mapMode.hover?.y !== tile.y)) {
      mapMode.hover = tile;
      redraw();
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    if (mapMode.building) {
      const tile = tileAtPointer(canvas, event.clientX, event.clientY);
      if (tile) mapMode.hover = tile;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged = 0;
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };

    if (pointers.size === 1) {
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      dragged += Math.abs(dx) + Math.abs(dy);
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
      redraw();
    }

    pointers.set(event.pointerId, next);

    if (mapMode.building && pointers.size === 1) {
      const tile = tileAtPointer(canvas, next.x, next.y);
      if (tile && (mapMode.hover?.x !== tile.x || mapMode.hover?.y !== tile.y)) {
        mapMode.hover = tile;
        redraw();
      }
    }

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart === null) {
        pinchStart = { spread, zoom: camera.zoom };
      } else if (pinchStart.spread > 0) {
        camera.zoom = Math.max(
          camera.minZoom,
          Math.min(camera.maxZoom, pinchStart.zoom * (spread / pinchStart.spread))
        );
        dragged += 10;
        redraw();
      }
    }
  });

  function endPointer(event) {
    const wasSingle = pointers.size === 1;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) canvas.classList.remove('dragging');

    // A tap, not a drag.
    if (wasSingle && dragged < 6) {
      const tile = tileAtPointer(canvas, event.clientX, event.clientY);
      if (!tile) return;
      if (mapMode.building) handlers.onPlaceAt?.(tile.x, tile.y);
      else handlers.onTapTile?.(tile.x, tile.y);
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
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
    title: check.ok ? '' : check.reason ?? '',
    on: { click: () => onAction?.('upgrade', x, y) },
  });
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
    el('p.sheet-sub', { text: 'Pick something, then tap the map to place it.' }),
    body,
    el('div.btn-row', {}, [
      el('button.btn', { text: 'Cancel', on: { click: handlers.onClose } }),
    ]),
  ]);
}
