// Placing, moving and upgrading facilities (research: facilities.md).
//
// Facilities occupy a FOOTPRINT of tiles, not a single square. The facility
// record lives at its origin (top-left) tile, and `world.occupied` maps every
// covered tile back to that origin — so "what is on this tile?" stays O(1) for
// the renderer and for placement checks, which run constantly.
//
// What limits building is STOCK, space and materials. There is no upkeep; see
// the note at the top of content/facilities.js.

import {
  FACILITIES, facilityDef, effectScale, MAX_FACILITY_LEVEL,
  upgradeCostFor, upgradeTicksFor,
} from '../content/facilities.js';
import { BIOMES } from '../content/biomes.js';
import { RESOURCE_IDS } from '../content/resources.js';
import { TOWN_HALL } from '../content/config.js';
import { takeId } from '../state.js';
import {
  tileIndex, tileX, tileY, inBounds, biomeAt, inTerritory, isCleared, isZoneUnlocked, zoneOf,
  clearTerritoryFog,
} from './world.js';

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The facility covering this tile, with its origin, or null. */
export function facilityAt(state, x, y) {
  if (!inBounds(x, y)) return null;
  const origin = state.world.occupied[tileIndex(x, y)];
  if (origin === undefined) return null;
  const facility = state.world.facilities[origin];
  return facility ? { ...facility, origin } : null;
}

/** Every tile a facility of this size at (x, y) would cover. */
export function footprintTiles(x, y, size) {
  const tiles = [];
  for (let dy = 0; dy < size.h; dy++) {
    for (let dx = 0; dx < size.w; dx++) tiles.push(tileIndex(x + dx, y + dy));
  }
  return tiles;
}

export function allFacilities(state) {
  return Object.entries(state.world.facilities).map(([origin, facility]) => ({
    ...facility,
    origin: Number(origin),
    x: tileX(Number(origin)),
    y: tileY(Number(origin)),
  }));
}

/** How many of this facility are placed (built or building). */
export function countPlaced(state, facilityId) {
  let count = 0;
  for (const facility of Object.values(state.world.facilities)) {
    if (facility.id === facilityId) count++;
  }
  return count;
}

/** How many you still have in hand to place. */
export function stockOf(state, facilityId) {
  return state.stock[facilityId] ?? 0;
}

/**
 * Is this facility in the build menu yet?
 *
 * Read straight off the save rather than through sim/research.js: research
 * needs `isActive` from this module, and an import cycle between the two would
 * be a nasty thing to debug for no gain.
 */
export function isUnlocked(state, facilityId) {
  const def = FACILITIES[facilityId];
  if (!def) return false;
  if (!def.locked) return true;
  return (state.research?.unlocked ?? []).includes(facilityId);
}

export function canAfford(state, cost) {
  return Object.entries(cost).every(([resource, amount]) => state.resources[resource] >= amount);
}

function spend(state, cost) {
  for (const [resource, amount] of Object.entries(cost)) {
    state.resources[resource] -= amount;
  }
}

function refund(state, cost, fraction) {
  for (const [resource, amount] of Object.entries(cost)) {
    state.resources[resource] += Math.floor(amount * fraction);
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Can this facility go here?
 * @returns {{ok: boolean, reason: string|null}}
 */
export function canPlace(state, x, y, facilityId) {
  const def = FACILITIES[facilityId];
  if (!def) return { ok: false, reason: 'Unknown facility' };
  if (!isUnlocked(state, facilityId)) return { ok: false, reason: 'Nobody here knows how' };
  if (stockOf(state, facilityId) <= 0) return { ok: false, reason: 'None left in hand' };

  if (def.isTownHall && state.townHalls.length >= TOWN_HALL.maxHalls) {
    return { ok: false, reason: `Only ${TOWN_HALL.maxHalls} town halls allowed` };
  }

  for (const tile of footprintTiles(x, y, def.size)) {
    const tx = tileX(tile);
    const ty = tileY(tile);

    if (!inBounds(tx, ty)) return { ok: false, reason: 'Off the edge of the world' };

    const zone = zoneOf(tx, ty);
    if (!isZoneUnlocked(state, zone.zx, zone.zy)) {
      return { ok: false, reason: 'That country is not open to you yet' };
    }
    if (!isCleared(state, tx, ty)) return { ok: false, reason: 'Explore this land first' };

    // A town hall claims new ground, so it alone may be founded outside the
    // borders — otherwise the kingdom could never expand.
    if (!def.isTownHall && !inTerritory(state, tx, ty)) {
      return { ok: false, reason: 'Outside your borders' };
    }

    const biome = biomeAt(state, tx, ty);
    if (!BIOMES[biome]?.buildable) {
      return { ok: false, reason: `Nothing stands on ${BIOMES[biome]?.name ?? biome}` };
    }
    if (def.requiresBiome && !def.requiresBiome.includes(biome)) {
      return { ok: false, reason: `Only on ${def.requiresBiome.join(' or ')}` };
    }
    if (state.world.occupied[tile] !== undefined) {
      return { ok: false, reason: 'Something already stands there' };
    }
  }

  if (!canAfford(state, def.cost)) return { ok: false, reason: 'Not enough materials' };
  return { ok: true, reason: null };
}

/** Pay for a facility and begin raising it. */
export function place(state, x, y, facilityId) {
  const check = canPlace(state, x, y, facilityId);
  if (!check.ok) return check;

  const def = facilityDef(facilityId);
  spend(state, def.cost);
  state.stock[facilityId] -= 1;

  const origin = tileIndex(x, y);
  state.world.facilities[origin] = {
    id: facilityId,
    level: 1,
    buildTicksRemaining: def.buildTicks,
    upgradeTicksRemaining: 0,
    upgrading: false,
    built: def.buildTicks <= 0,
    damaged: false,
  };

  for (const tile of footprintTiles(x, y, def.size)) {
    state.world.occupied[tile] = origin;
  }

  let revealed = 0;
  if (def.isTownHall) {
    state.townHalls.push({ id: takeId(state), x, y, level: 1, origin });
    // A hall claims ground the moment it is founded, and claimed ground the
    // player cannot see is ground they cannot build on.
    revealed = clearTerritoryFog(state);
    state.stats.tilesCleared += revealed;
  }

  return { ok: true, reason: null, origin, revealed };
}

/**
 * Take a facility down. The stock returns to your hand and some materials come
 * back, so rearranging your town is a decision rather than a punishment — the
 * real game lets you remove and rebuild freely.
 */
export function remove(state, x, y, { refundFraction = 0.5 } = {}) {
  const found = facilityAt(state, x, y);
  if (!found) return { ok: false, reason: 'Nothing there' };

  const def = facilityDef(found.id);
  const originX = tileX(found.origin);
  const originY = tileY(found.origin);

  if (def.isTownHall && state.townHalls.length <= 1) {
    return { ok: false, reason: 'Your last town hall must stand' };
  }

  for (const tile of footprintTiles(originX, originY, def.size)) {
    delete state.world.occupied[tile];
  }
  delete state.world.facilities[found.origin];

  state.stock[found.id] = (state.stock[found.id] ?? 0) + 1;
  refund(state, def.cost, refundFraction);

  // Taking a roof away must never delete the people under it. They wait,
  // unhoused, until another bed exists.
  if (def.housing) {
    for (const resident of state.residents) {
      if (resident.home === found.origin) resident.home = null;
    }
  }

  if (def.isTownHall) {
    state.townHalls = state.townHalls.filter((hall) => hall.origin !== found.origin);
  }

  return { ok: true, reason: null };
}

/**
 * Move a facility, paying its cost again — the real game's rule.
 *
 * It keeps its level: relocating is a change of mind about layout, not a reason
 * to lose the investment.
 */
export function relocate(state, fromX, fromY, toX, toY) {
  const found = facilityAt(state, fromX, fromY);
  if (!found) return { ok: false, reason: 'Nothing there' };

  const def = facilityDef(found.id);
  if (!canAfford(state, def.cost)) return { ok: false, reason: 'Not enough to move it' };

  const level = found.level;
  const built = found.built;

  // Lift it first, so the destination check sees the freed tiles — otherwise a
  // one-tile nudge would collide with itself.
  const lifted = remove(state, fromX, fromY, { refundFraction: 0 });
  if (!lifted.ok) return lifted;

  const check = canPlace(state, toX, toY, found.id);
  if (!check.ok) {
    // Put it back exactly as it was.
    state.stock[found.id] -= 1;
    const origin = tileIndex(fromX, fromY);
    state.world.facilities[origin] = {
      id: found.id, level, buildTicksRemaining: 0, upgradeTicksRemaining: 0,
      upgrading: false, built, damaged: false,
    };
    for (const tile of footprintTiles(fromX, fromY, def.size)) {
      state.world.occupied[tile] = origin;
    }
    if (def.isTownHall) state.townHalls.push({ id: takeId(state), x: fromX, y: fromY, level, origin });
    return check;
  }

  const placed = place(state, toX, toY, found.id);
  if (placed.ok) {
    const facility = state.world.facilities[placed.origin];
    facility.level = level;
    facility.built = built;
    facility.buildTicksRemaining = built ? 0 : facility.buildTicksRemaining;
  }
  return placed;
}

// ---------------------------------------------------------------------------
// Upgrading
// ---------------------------------------------------------------------------

export function canUpgrade(state, x, y) {
  const found = facilityAt(state, x, y);
  const fail = (reason) => ({ ok: false, reason, cost: null, ticks: null });

  if (!found) return fail('Nothing there');
  if (found.buildTicksRemaining > 0) return fail('Still being built');
  if (found.upgrading) return fail('Already being upgraded');
  if (found.damaged) return fail('Repair it first');
  if ((found.level ?? 1) >= MAX_FACILITY_LEVEL) return fail('Already at its best');

  const cost = upgradeCostFor(found.id, found.level);
  if (!canAfford(state, cost)) return { ok: false, reason: 'Not enough materials', cost, ticks: null };

  return { ok: true, reason: null, cost, ticks: upgradeTicksFor(found.id, found.level) };
}

/**
 * Begin an upgrade. The facility keeps working at its current level throughout
 * — taking a field offline for the duration would make improving it a
 * short-term loss and punish the player for investing.
 */
export function upgrade(state, x, y) {
  const check = canUpgrade(state, x, y);
  if (!check.ok) return check;

  spend(state, check.cost);
  const found = facilityAt(state, x, y);
  const facility = state.world.facilities[found.origin];
  facility.upgrading = true;
  facility.upgradeTicksRemaining = check.ticks;
  return check;
}

// ---------------------------------------------------------------------------
// What a placed facility is worth
// ---------------------------------------------------------------------------

/** A facility only does its job when finished, undamaged, and switched on. */
export function isActive(facility) {
  return !!facility && facility.built && !facility.damaged && !facility.disabled;
}

/** Output multiplier from the ground beneath it, plus its level. */
export function outputMultiplier(state, facility, originIndex) {
  const def = facilityDef(facility.id);
  let multiplier = effectScale(facility.level);

  if (def.likesBiome) {
    // Averaged across the footprint: half a mine on rock is half a bonus.
    const tiles = footprintTiles(tileX(originIndex), tileY(originIndex), def.size);
    let bonus = 0;
    for (const tile of tiles) {
      bonus += def.likesBiome[biomeAt(state, tileX(tile), tileY(tile))] ?? 0;
    }
    multiplier *= 1 + bonus / tiles.length;
  }

  return multiplier;
}

/** Everything the player can currently choose to build. */
export function palette(state) {
  return Object.values(FACILITIES)
    .filter((def) => isUnlocked(state, def.id))
    .filter((def) => !def.isTownHall || stockOf(state, def.id) > 0)
    .map((def) => ({
      def,
      stock: stockOf(state, def.id),
      placed: countPlaced(state, def.id),
      affordable: canAfford(state, def.cost),
    }));
}

/** Rebuild the occupancy index from the facilities themselves. */
export function reindexOccupancy(state) {
  const occupied = {};
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const def = facilityDef(facility.id);
    const index = Number(origin);
    for (const tile of footprintTiles(tileX(index), tileY(index), def.size)) {
      occupied[tile] = index;
    }
  }
  state.world.occupied = occupied;
  return occupied;
}

export { RESOURCE_IDS };
