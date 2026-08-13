// Production and storage.
//
// Pure functions of state: nothing here touches the DOM or reads the clock —
// the caller supplies elapsed ticks.
//
// Storage is the only limit on what accumulates while the player is away, which
// makes storage buildings the most valuable thing they can invest in. Nothing
// drains: there is no upkeep, so an absence can never leave a kingdom poorer.

import { RESOURCES, RESOURCE_IDS, CAPITAL_INCOME } from '../content/resources.js';
import { facilityDef, effectScale } from '../content/facilities.js';
import { isActive, outputMultiplier } from './facilities.js';
import { residentRates } from './residents.js';

/** Visit every finished, working facility. Callback gets (facility, def, origin). */
export function forEachActiveFacility(state, fn) {
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    if (!isActive(facility)) continue;
    fn(facility, facilityDef(facility.id), Number(origin));
  }
}

/**
 * Gross production per tick, before storage clamping.
 *
 * Rates depend only on what is built and the ground beneath it — nothing that
 * changes mid-segment — which is what lets the clock resolve whole spans in
 * closed form and keeps offline catch-up identical to live play.
 */
export function productionRates(state, precomputedResidents = null) {
  const rates = {};
  for (const id of RESOURCE_IDS) rates[id] = 0;

  // The Town Hall's own income. A floor that can never be zero (see
  // content/resources.js) — v1 proved what happens without one.
  for (const [resource, amount] of Object.entries(CAPITAL_INCOME)) {
    rates[resource] += amount;
  }

  // Energy returns on its own; caves spend it.
  rates.energy += RESOURCES.energy.regenPerTick;

  // Residents: their shops, and what they bring home themselves. One pass,
  // because this is the hot path for offline catch-up — and the clock passes
  // its own copy in, since it needs the study power out of the same walk.
  const residents = precomputedResidents ?? residentRates(state);
  rates.copper += residents.copper;
  for (const [resource, amount] of Object.entries(residents.gathers)) {
    rates[resource] += amount;
  }

  forEachActiveFacility(state, (facility, def, origin) => {
    if (!def.produces) return;
    const multiplier = outputMultiplier(state, facility, origin);
    for (const [resource, amount] of Object.entries(def.produces)) {
      rates[resource] += amount * multiplier;
    }
  });

  return rates;
}

/** Capacity per resource: the Town Hall's own, plus every storage building. */
export function storageCapacity(state) {
  const caps = {};
  for (const id of RESOURCE_IDS) caps[id] = RESOURCES[id].baseStorage;

  forEachActiveFacility(state, (facility, def) => {
    if (!def.storage) return;
    const scale = effectScale(facility.level);
    for (const [resource, amount] of Object.entries(def.storage)) {
      caps[resource] += amount * scale;
    }
  });

  return caps;
}

/**
 * Add production for `ticks` at constant `rates`, clamping at capacity and
 * recording anything that would not fit.
 *
 * `absoluteTick` is the tick at the START of the span, so the report can say
 * exactly when a store filled — "your granaries filled four hours ago" is the
 * only thing that teaches a player to build more of them.
 */
export function applyProduction(state, ticks, rates, caps, report, absoluteTick) {
  for (const id of RESOURCE_IDS) {
    const rate = rates[id];
    if (!(rate > 0)) continue;

    const before = state.resources[id];
    const cap = caps[id];
    const raw = before + rate * ticks;
    const after = Math.min(raw, cap);
    const spilled = raw - after;

    state.resources[id] = after;
    // Never negative. A store sitting above its cap (capacity fell, or a save
    // was edited) is clamped DOWN here, and reporting that as a "gain" would
    // put a minus sign in the welcome-back panel.
    report.gained[id] = (report.gained[id] ?? 0) + Math.max(0, after - before);

    if (spilled > 0) {
      state.stats.wasted[id] = (state.stats.wasted[id] ?? 0) + spilled;
      report.wasted[id] = (report.wasted[id] ?? 0) + spilled;
      if (report.filledAtTick[id] === undefined) {
        report.filledAtTick[id] = absoluteTick + Math.max(0, (cap - before) / rate);
      }
    }
  }
}

/**
 * Settle stores against capacity.
 *
 * Production already clamps as it goes, but capacity can also FALL — a granary
 * demolished, or wrecked by raiders — and a store left stranded above its cap
 * would never drain.
 */
export function settleStorage(state, report) {
  const caps = storageCapacity(state);
  for (const id of RESOURCE_IDS) {
    if (state.resources[id] > caps[id]) {
      const spilled = state.resources[id] - caps[id];
      state.resources[id] = caps[id];
      state.stats.wasted[id] = (state.stats.wasted[id] ?? 0) + spilled;
      if (report) report.wasted[id] = (report.wasted[id] ?? 0) + spilled;
    }
  }
}

export function canAfford(state, cost) {
  return Object.entries(cost).every(([resource, amount]) => state.resources[resource] >= amount);
}

/** Spend if affordable. Returns whether the cost was paid. */
export function trySpend(state, cost) {
  if (!canAfford(state, cost)) return false;
  for (const [resource, amount] of Object.entries(cost)) state.resources[resource] -= amount;
  return true;
}

/** Per-season figures, for the HUD. */
export function perSeason(state, ticksPerSeason) {
  const rates = productionRates(state);
  const out = {};
  for (const id of RESOURCE_IDS) out[id] = rates[id] * ticksPerSeason;
  return out;
}

/** Which stores are full right now — the nudge to build more storage. */
export function fullStores(state) {
  const caps = storageCapacity(state);
  return RESOURCE_IDS.filter((id) => state.resources[id] >= caps[id] - 0.5);
}
