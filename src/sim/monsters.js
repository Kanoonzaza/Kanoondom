// Nests, the monsters in them, and the threat they put on the kingdom.
//
// Nest positions are DERIVED FROM THE SEED, exactly like terrain: a 96x96 world
// would otherwise want a nest table in every save for no reason, since where a
// nest stands never changes. The save records only which ones the player has
// cleared.
//
// A nest is a visible source of trouble you can go and remove. That is the
// whole point of modelling them rather than counting up a hidden timer: when
// the kingdom is under pressure, there is somewhere to go and something to do
// about it.

import { MONSTERS, monstersOfBiome, NESTS, THREAT } from '../content/monsters.js';
import { WORLD_TILES_X, WORLD_TILES_Y, TILE_COUNT } from '../content/config.js';
import { facilityDef } from '../content/facilities.js';
import { createRng, deriveSeed, SEED_SALT } from './rng.js';
import {
  tileIndex, tileX, tileY, biomeAt, zoneOf, zoneRing, worldCentre,
  isCleared, isZoneUnlocked,
} from './world.js';
import { isActive, allFacilities } from './facilities.js';

/** Memoised per seed — the same reason worldGen is. */
const nestCache = new Map();

/**
 * Every nest in the world, by tile index.
 *
 * Pure in the seed, so it costs the save nothing and can never drift out of
 * step with the terrain it sits on.
 */
export function nestSites(state) {
  const seed = state.seed >>> 0;
  let sites = nestCache.get(seed);
  if (sites) return sites;

  const rng = createRng(deriveSeed(seed, SEED_SALT.EVENTS));
  const centre = worldCentre();
  const wanted = Math.floor(TILE_COUNT / NESTS.tilesPerNest);
  sites = new Map();

  // Rejection sampling rather than a scan: a handful of nests in nine thousand
  // tiles is far cheaper to place by trying spots than by walking the world.
  let attempts = 0;
  while (sites.size < wanted && attempts < wanted * 200) {
    attempts++;
    const x = rng.int(0, WORLD_TILES_X - 1);
    const y = rng.int(0, WORLD_TILES_Y - 1);
    const index = tileIndex(x, y);
    if (sites.has(index)) continue;

    // Never on the doorstep: a brand-new kingdom should not open under siege.
    if (Math.hypot(x - centre.x, y - centre.y) < NESTS.safeRadius) continue;

    const biome = biomeAt(state, x, y);
    if (biome === 'sea') continue;
    const species = monstersOfBiome(biome);
    if (species.length === 0) continue;

    const zone = zoneOf(x, y);
    sites.set(index, {
      index,
      x,
      y,
      biome,
      speciesId: species[rng.int(0, species.length - 1)],
      // The far country is the harsh country, here as everywhere else.
      tier: 1 + zoneRing(zone.zx, zone.zy) * NESTS.tierPerRing,
    });
  }

  nestCache.set(seed, sites);
  if (nestCache.size > 8) nestCache.delete(nestCache.keys().next().value);
  return sites;
}

export function isNestCleared(state, index) {
  return state.world.nestsCleared?.[index] === 1;
}

/** Nests still standing, in country that is open to the player. */
export function activeNests(state) {
  const list = [];
  for (const nest of nestSites(state).values()) {
    if (isNestCleared(state, nest.index)) continue;
    const zone = zoneOf(nest.x, nest.y);
    if (!isZoneUnlocked(state, zone.zx, zone.zy)) continue;
    list.push(nest);
  }
  return list;
}

/** Nests the player has actually laid eyes on. */
export function knownNests(state) {
  return activeNests(state).filter((nest) => isCleared(state, nest.x, nest.y));
}

/** How far this nest is from the nearest town hall. */
export function distanceToKingdom(state, nest) {
  let nearest = Infinity;
  for (const hall of state.townHalls) {
    const distance = Math.hypot(nest.x - hall.x, nest.y - hall.y);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

// ---------------------------------------------------------------------------
// Wards
// ---------------------------------------------------------------------------

/**
 * How much of the threat your torches and towers hold off, 0 to 1.
 *
 * Diminishing: each ward covers what the last one missed, so the tenth
 * watchtower is worth far less than the first and there is no point ringing
 * the town in them. Building wide beats building deep.
 */
export function wardStrength(state) {
  let leaking = 1;
  for (const facility of Object.values(state.world.facilities)) {
    if (!isActive(facility)) continue;
    const def = facilityDef(facility.id);
    if (!def.wardsMonsters) continue;
    leaking *= 1 - def.wardsMonsters;
  }
  // Hard ceiling: something always gets through. See NESTS.maxWard.
  return Math.min(NESTS.maxWard, 1 - leaking);
}

// ---------------------------------------------------------------------------
// Threat
// ---------------------------------------------------------------------------

/**
 * Threat gathered per tick.
 *
 * Depends only on which nests stand and what is built — neither of which can
 * change mid-segment — so the clock can resolve a whole span of it in one
 * piece of arithmetic, exactly like production.
 */
export function threatRate(state) {
  const reach = NESTS.threatReach;
  let rate = 0;

  for (const nest of activeNests(state)) {
    const distance = distanceToKingdom(state, nest);
    if (distance > reach) continue;

    // Nearer nests weigh more, up to `proximityBonus` times at the doorstep.
    const closeness = 1 - distance / reach;
    rate += NESTS.threatPerNest
      * nest.tier
      * (1 + closeness * (NESTS.proximityBonus - 1));
  }

  return rate * (1 - wardStrength(state));
}

/** The nests actually pressing on the kingdom right now. */
export function pressingNests(state) {
  return activeNests(state)
    .filter((nest) => distanceToKingdom(state, nest) <= NESTS.threatReach)
    .sort((a, b) => distanceToKingdom(state, a) - distanceToKingdom(state, b));
}

/** 0..1, for a bar the player can read at a glance. */
export function threatFraction(state) {
  return Math.min(1, (state.threat ?? 0) / THREAT.raidThreshold);
}

export function threatLabel(state) {
  const fraction = threatFraction(state);
  if (fraction <= 0.001) return 'Quiet';
  if (fraction < 0.4) return 'Restless';
  if (fraction < 0.8) return 'Gathering';
  if (fraction < 1) return 'Close';
  return 'They are coming';
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

/** What one monster of this species, at this tier, is worth in a fight. */
export function monsterStrength(speciesId, tier) {
  const def = MONSTERS[speciesId];
  return {
    id: speciesId,
    name: def.name,
    icon: def.icon,
    magic: !!def.magic,
    power: def.power * tier,
    guard: def.guard * tier,
    speed: def.speed,
  };
}

/** The strongest tier the kingdom has faced down — what difficulty tracks. */
export function highestTierCleared(state) {
  return state.stats.highestTierCleared ?? 1;
}

export { NESTS, THREAT };
