// The world: terrain, zones, territory, Peace Level (research: world-and-map.md).
//
// The central decision here: TERRAIN IS NEVER STORED.
//
// A 96x96 world is 9,216 tiles. Writing a biome per tile into the save would
// bloat it for no reason, because terrain never changes. Instead `biomeAt` is a
// pure function of (seed, x, y) — the same seed always grows the same world.
// The save holds only what the player has CHANGED: fog they cleared, land they
// wore out, things they built.

import { createRng, deriveSeed, SEED_SALT } from './rng.js';
import { DOMINANT_BIOMES, BIOME_TIER } from '../content/biomes.js';
import {
  WORLD, WORLD_TILES_X, WORLD_TILES_Y, TILE_COUNT,
  TOWN_HALL, ZONE_UNLOCKS, PEACE, TERRAIN,
} from '../content/config.js';

// ---------------------------------------------------------------------------
// Tile and zone coordinates
// ---------------------------------------------------------------------------

export const tileIndex = (x, y) => y * WORLD_TILES_X + x;
export const tileX = (index) => index % WORLD_TILES_X;
export const tileY = (index) => Math.floor(index / WORLD_TILES_X);

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_TILES_X && y < WORLD_TILES_Y;
}

export const zoneOf = (x, y) => ({
  zx: Math.floor(x / WORLD.zoneTiles),
  zy: Math.floor(y / WORLD.zoneTiles),
});

export const zoneIndex = (zx, zy) => zy * WORLD.zonesX + zx;

/** "C4"-style label, as the real game names its zones. */
export function zoneLabel(zx, zy) {
  return `${WORLD.columnLetters[zx] ?? '?'}${zy + 1}`;
}

/**
 * Zones form rings around the centre; unlock gates work on ring number.
 *
 * Note the even-grid handling. With 6 columns the centre falls between 2 and 3,
 * and rounding the distance would put every central zone in ring 1 — leaving
 * ring 0 empty and locking the player out of their own homeland. So the centre
 * is treated as a BAND (columns 2–3), and distance is measured from its edge.
 */
export function zoneRing(zx, zy) {
  const spanFrom = (value, size) => {
    const low = Math.floor((size - 1) / 2);
    const high = Math.ceil((size - 1) / 2);
    if (value < low) return low - value;
    if (value > high) return value - high;
    return 0;
  };
  return Math.max(spanFrom(zx, WORLD.zonesX), spanFrom(zy, WORLD.zonesY));
}

/** The tile at the very middle of the world, where the first Town Hall stands. */
export function worldCentre() {
  return { x: Math.floor(WORLD_TILES_X / 2), y: Math.floor(WORLD_TILES_Y / 2) };
}

// ---------------------------------------------------------------------------
// Terrain generation — pure, seeded, never stored
// ---------------------------------------------------------------------------

/** Deterministic value in [0,1) for a lattice point. */
function lattice(seed, x, y) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Smooth value noise. Gives coherent patches rather than per-tile static, so
 * biomes blend into each other the way the real game's zones do.
 */
export function noise(seed, x, y, scale) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = smoothstep(fx - x0);
  const sy = smoothstep(fy - y0);

  const top = lerp(lattice(seed, x0, y0), lattice(seed, x0 + 1, y0), sx);
  const bottom = lerp(lattice(seed, x0, y0 + 1), lattice(seed, x0 + 1, y0 + 1), sx);
  return lerp(top, bottom, sy);
}

/**
 * The dominant biome of each zone, by seeded shuffle.
 *
 * Two rules make the world playable rather than merely random: the starting
 * zone is always grass, and harder terrain is pushed outward so difficulty
 * grows with distance from home.
 */
export function zoneBiomes(seed) {
  const rng = createRng(deriveSeed(seed, SEED_SALT.MAP));
  const centre = worldCentre();
  const home = zoneOf(centre.x, centre.y);

  const zones = [];
  for (let zy = 0; zy < WORLD.zonesY; zy++) {
    for (let zx = 0; zx < WORLD.zonesX; zx++) {
      zones.push({ zx, zy, ring: zoneRing(zx, zy) });
    }
  }

  // Softly sort candidates by tier so the far country is the harsh country,
  // with enough jitter that no two seeds feel identical.
  const assigned = new Map();
  for (const zone of zones) {
    if (zone.zx === home.zx && zone.zy === home.zy) {
      assigned.set(zoneIndex(zone.zx, zone.zy), 'grass');
      continue;
    }
    const wanted = zone.ring + rng.float(-0.8, 1.2);
    const best = [...DOMINANT_BIOMES].sort(
      (a, b) => Math.abs(BIOME_TIER[a] - wanted) - Math.abs(BIOME_TIER[b] - wanted)
    );
    // Pick among the two closest, so neighbours vary.
    assigned.set(zoneIndex(zone.zx, zone.zy), rng.next() < 0.7 ? best[0] : best[1]);
  }
  return assigned;
}

/**
 * Derived world data, memoised by seed.
 *
 * The zone table is a Map, which JSON cannot carry, so it must never live in
 * the save. Deriving it on demand keeps the save to a seed and the player's
 * own changes.
 */
const genCache = new Map();

export function worldGen(state) {
  const seed = state.seed >>> 0;
  let gen = genCache.get(seed);
  if (!gen) {
    gen = { seed, zoneBiomes: zoneBiomes(seed) };
    genCache.set(seed, gen);
    // Bound the cache; only a handful of seeds are ever live at once.
    if (genCache.size > 8) genCache.delete(genCache.keys().next().value);
  }
  return gen;
}

/**
 * The biome of a single tile. Pure: same seed and coordinates, same answer,
 * forever. This is what lets us store no terrain at all.
 */
export function biomeAt(state, x, y) {
  if (!inBounds(x, y)) return 'sea';
  const world = worldGen(state);

  // A band of sea around the rim — the sea the immigrants arrive across.
  const edge = Math.min(x, y, WORLD_TILES_X - 1 - x, WORLD_TILES_Y - 1 - y);
  if (edge < TERRAIN.seaBandTiles) {
    // Ragged coastline rather than a perfect rectangle.
    if (noise(world.seed ^ 0x5eaa, x, y, 4) > 0.35 - (TERRAIN.seaBandTiles - edge) * 0.25) {
      return 'sea';
    }
  }

  // The homeland is always open grass. A player who spawns on rock or lava has
  // nowhere to put their first farm, and "unlucky seed" is not a fair reason to
  // restart.
  const centre = worldCentre();
  const hx = x - centre.x;
  const hy = y - centre.y;
  if (hx * hx + hy * hy <= TERRAIN.homeRadius * TERRAIN.homeRadius) return 'grass';

  const { zx, zy } = zoneOf(x, y);
  const dominant = world.zoneBiomes.get(zoneIndex(zx, zy)) ?? 'grass';

  const patch = noise(world.seed, x, y, TERRAIN.patchScale);
  if (patch < TERRAIN.dominantThreshold) {
    // Pockets of turned earth anywhere — the real game's diggable soil.
    if (noise(world.seed ^ 0x501, x, y, TERRAIN.detailScale) > 1 - TERRAIN.soilChance) {
      return 'soil';
    }
    return dominant;
  }

  // Otherwise a neighbouring zone's biome bleeds through, so borders blur.
  const detail = noise(world.seed ^ 0xbeef, x, y, TERRAIN.detailScale);
  const pool = DOMINANT_BIOMES.filter((b) => b !== dominant);
  return pool[Math.floor(detail * pool.length) % pool.length];
}

// ---------------------------------------------------------------------------
// Territory — a radius around each Town Hall, not a set of owned regions
// ---------------------------------------------------------------------------

/** Base 14 tiles, +2 every 10 levels (research). */
export function hallRadius(hall) {
  const steps = Math.floor((hall.level - 1) / TOWN_HALL.radiusPerLevels);
  return TOWN_HALL.baseRadius + steps * TOWN_HALL.radiusStep;
}

export function inTerritory(state, x, y) {
  for (const hall of state.townHalls) {
    const dx = x - hall.x;
    const dy = y - hall.y;
    const r = hallRadius(hall);
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/** Every tile index inside any Town Hall's reach. */
export function territoryTiles(state) {
  const tiles = new Set();
  for (const hall of state.townHalls) {
    const r = hallRadius(hall);
    for (let y = Math.max(0, hall.y - r); y <= Math.min(WORLD_TILES_Y - 1, hall.y + r); y++) {
      for (let x = Math.max(0, hall.x - r); x <= Math.min(WORLD_TILES_X - 1, hall.x + r); x++) {
        const dx = x - hall.x;
        const dy = y - hall.y;
        if (dx * dx + dy * dy <= r * r) tiles.add(tileIndex(x, y));
      }
    }
  }
  return tiles;
}

export function monarchRank(state) {
  const best = Math.max(0, ...state.townHalls.map((h) => h.level));
  const step = Math.floor(best / TOWN_HALL.monarchRankPerLevels);
  return TOWN_HALL.monarchRanks[Math.min(step, TOWN_HALL.monarchRanks.length - 1)];
}

// ---------------------------------------------------------------------------
// Zone unlocking and Peace Level
// ---------------------------------------------------------------------------

/** The highest ring the kingdom has earned access to. */
export function unlockedRing(state) {
  const peace = peaceLevel(state);
  const halls = state.townHalls.length;
  let ring = 0;
  for (const gate of ZONE_UNLOCKS) {
    if (peace >= gate.peace && halls >= gate.townHalls) ring = Math.max(ring, gate.ring);
  }
  return ring;
}

export function isZoneUnlocked(state, zx, zy) {
  return zoneRing(zx, zy) <= unlockedRing(state);
}

/** The next gate the kingdom has not yet passed, or null when fully open. */
export function nextGate(state) {
  const ring = unlockedRing(state);
  return ZONE_UNLOCKS.find((gate) => gate.ring === ring + 1) ?? null;
}

/** Tiles in every unlocked zone — the denominator for Peace Level. */
export function unlockedTileCount(state) {
  const ring = unlockedRing(state);
  let zones = 0;
  for (let zy = 0; zy < WORLD.zonesY; zy++) {
    for (let zx = 0; zx < WORLD.zonesX; zx++) {
      if (zoneRing(zx, zy) <= ring) zones++;
    }
  }
  return zones * WORLD.zoneTiles * WORLD.zoneTiles;
}

/**
 * Peace Level, 0–100.
 *
 * Ours, not the real game's — it gates expansion there but never says what
 * feeds it. This version is the share of the WHOLE world you have brought to
 * light, less a penalty for every nest still standing.
 *
 * Measuring against the whole world matters. An earlier version measured
 * against "land you can currently reach", which made a brand-new kingdom read
 * 60% simply for seeing its own back garden — and worse, earning a second town
 * hall would have ENLARGED the denominator and pushed the number down, so
 * progress would have looked like decline. Against a fixed world it only ever
 * climbs as you explore, and only nests hold it back.
 */
export function peaceLevel(state) {
  const cleared = Object.keys(state.world.cleared).length;
  const raw = (cleared / TILE_COUNT) * 100;

  const nests = Object.keys(state.world.nests).length;
  return Math.max(PEACE.floor, Math.min(100, raw - nests * PEACE.penaltyPerNest));
}

// ---------------------------------------------------------------------------
// Fog and wasteland — the only terrain state we actually store
// ---------------------------------------------------------------------------

export function isCleared(state, x, y) {
  return state.world.cleared[tileIndex(x, y)] === 1;
}

/** Reveal a tile. Returns true if it was newly cleared. */
export function clearFog(state, x, y) {
  if (!inBounds(x, y)) return false;
  const { zx, zy } = zoneOf(x, y);
  if (!isZoneUnlocked(state, zx, zy)) return false;

  const index = tileIndex(x, y);
  if (state.world.cleared[index] === 1) return false;
  state.world.cleared[index] = 1;
  return true;
}

/** Clear every tile inside the kingdom's borders — what settling does. */
export function clearTerritoryFog(state) {
  let count = 0;
  for (const index of territoryTiles(state)) {
    const { zx, zy } = zoneOf(tileX(index), tileY(index));
    if (!isZoneUnlocked(state, zx, zy)) continue;
    if (state.world.cleared[index] !== 1) {
      state.world.cleared[index] = 1;
      count++;
    }
  }
  return count;
}

/** 0 = healthy, 1 = spent. Gathering wears land down (research). */
export function wastelandAt(state, x, y) {
  return state.world.wasteland[tileIndex(x, y)] ?? 0;
}

export function isWasteland(state, x, y) {
  return wastelandAt(state, x, y) >= 1;
}

export function degrade(state, x, y, amount) {
  const index = tileIndex(x, y);
  const next = Math.min(1, (state.world.wasteland[index] ?? 0) + amount);
  state.world.wasteland[index] = next;
  return next;
}

export function restore(state, x, y, amount = 1) {
  const index = tileIndex(x, y);
  const next = Math.max(0, (state.world.wasteland[index] ?? 0) - amount);
  if (next <= 0) delete state.world.wasteland[index];
  else state.world.wasteland[index] = next;
  return next;
}

/** Everything worth knowing about one tile, for the UI and for gathering. */
export function tileInfo(state, x, y) {
  return {
    x,
    y,
    index: tileIndex(x, y),
    biome: biomeAt(state, x, y),
    zone: zoneOf(x, y),
    cleared: isCleared(state, x, y),
    inTerritory: inTerritory(state, x, y),
    wasteland: wastelandAt(state, x, y),
    nest: state.world.nests[tileIndex(x, y)] ?? null,
    facility: state.world.facilities[tileIndex(x, y)] ?? null,
  };
}

export { TILE_COUNT, WORLD_TILES_X, WORLD_TILES_Y };
