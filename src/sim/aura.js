// The aura engine (research: facilities.md).
//
// In the real game a facility's value is not only what it produces — it is what
// standing near it does to your residents. Every facility carries bonuses
// across the twelve stats, applied to anyone within its radius. That is why
// layout matters at all: a resident's strength is largely a function of where
// they live and work.
//
// Residents arrive in V3. This engine exists first so their stats are simply a
// lookup, and so it can be tested on its own.

import { emptyStats, addStats, STAT_IDS } from '../content/stats.js';
import { facilityDef, effectScale } from '../content/facilities.js';
import { tileX, tileY } from './world.js';
import { isActive, footprintTiles } from './facilities.js';

/**
 * The combined aura at one tile: every active facility whose radius reaches it,
 * scaled by its level.
 *
 * Distance is measured from the NEAREST tile of the facility's footprint, so a
 * large building radiates from its whole body rather than one corner.
 */
export function auraAt(state, x, y) {
  const total = emptyStats();

  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    if (!isActive(facility)) continue;

    const def = facilityDef(facility.id);
    if (!def.aura) continue;

    const index = Number(origin);
    if (distanceToFootprint(x, y, tileX(index), tileY(index), def.size) > def.aura.radius) {
      continue;
    }

    const scale = effectScale(facility.level);
    for (const stat of STAT_IDS) {
      if (def.aura.stats[stat]) total[stat] += def.aura.stats[stat] * scale;
    }
  }

  return total;
}

/** Chebyshev distance from a point to the nearest tile of a footprint. */
export function distanceToFootprint(x, y, originX, originY, size) {
  const dx = Math.max(originX - x, 0, x - (originX + size.w - 1));
  const dy = Math.max(originY - y, 0, y - (originY + size.h - 1));
  return Math.max(dx, dy);
}

/**
 * Which facilities are reaching a tile, and with what — for the UI, so a player
 * can see WHY a spot is good rather than only that it is.
 */
export function auraSources(state, x, y) {
  const sources = [];

  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    if (!isActive(facility)) continue;
    const def = facilityDef(facility.id);
    if (!def.aura) continue;

    const index = Number(origin);
    const distance = distanceToFootprint(x, y, tileX(index), tileY(index), def.size);
    if (distance > def.aura.radius) continue;

    const scale = effectScale(facility.level);
    const stats = {};
    for (const stat of STAT_IDS) {
      if (def.aura.stats[stat]) stats[stat] = def.aura.stats[stat] * scale;
    }
    sources.push({ facilityId: facility.id, name: def.name, icon: def.icon, level: facility.level, distance, stats });
  }

  return sources.sort((a, b) => a.distance - b.distance);
}

/** Sum of every stat at a tile — a single number for "how good is this spot". */
export function auraScore(state, x, y) {
  const aura = auraAt(state, x, y);
  return STAT_IDS.reduce((sum, stat) => sum + (aura[stat] ?? 0), 0);
}

/**
 * How well a facility's own aura is being spent: the share of tiles in its
 * reach that are buildable ground rather than sea, rock face or edge of world.
 * Used by the UI to warn about a watchtower half-wasted on the coast.
 */
export function auraCoverage(state, originIndex) {
  const facility = state.world.facilities[originIndex];
  if (!facility) return 0;
  const def = facilityDef(facility.id);
  if (!def.aura) return 0;

  const originX = tileX(originIndex);
  const originY = tileY(originIndex);
  const radius = def.aura.radius;

  let reached = 0;
  let total = 0;
  for (let y = originY - radius; y <= originY + radius + def.size.h - 1; y++) {
    for (let x = originX - radius; x <= originX + radius + def.size.w - 1; x++) {
      if (distanceToFootprint(x, y, originX, originY, def.size) > radius) continue;
      total++;
      if (x >= 0 && y >= 0) reached++;
    }
  }
  return total === 0 ? 0 : reached / total;
}

export { footprintTiles };
