// Research, Town Hall rank and map rewards (research: research-system.md).
//
// Two independent axes, exactly as the real game runs them:
//
//   Town Hall rank    decides what is OFFERED to you
//   materials on hand decide whether you can AFFORD it
//
// Neither is a clock. A study finishes when the kingdom has done enough
// studying, and study points accumulate the same way copper does — including
// while the player is away, which is the whole point of this project. A study
// left running overnight is finished in the morning.

import {
  RESEARCH, RESEARCH_IDS, researchDef, STUDY, PROMOTION, MAP_REWARDS,
} from '../content/research.js';
import { FACILITIES, facilityDef } from '../content/facilities.js';
import { TOWN_HALL } from '../content/config.js';
import { isActive } from './facilities.js';
import { residentRates } from './residents.js';
import { clearTerritoryFog, clearedTileCount } from './world.js';

// ---------------------------------------------------------------------------
// Town Hall rank
// ---------------------------------------------------------------------------

/** The kingdom's rank: the best Town Hall it has. This is what gates research. */
export function townRank(state) {
  return Math.max(1, ...state.townHalls.map((hall) => hall.level ?? 1));
}

/**
 * How developed the town is.
 *
 * Deliberately made of the things we want the player doing anyway — housing
 * people, building, and pushing back the fog — so that "get promoted" never
 * becomes a separate errand from playing.
 */
export function developmentPoints(state) {
  let facilities = 0;
  for (const facility of Object.values(state.world.facilities)) {
    if (isActive(facility)) facilities++;
  }
  return Math.floor(
    state.residents.length * PROMOTION.perResident
    + facilities * PROMOTION.perFacility
    + clearedTileCount(state) / PROMOTION.tilesPerPoint
    + (state.stats.nestsCleared ?? 0) * PROMOTION.perNestCleared
  );
}

/** What it takes to raise a hall from `level` to the next. */
export function promotionRequirement(level) {
  const cost = {};
  for (const [resource, amount] of Object.entries(PROMOTION.costPerLevel)) {
    cost[resource] = amount * level;
  }
  return {
    development: Math.round(PROMOTION.base * Math.pow(level, PROMOTION.exponent)),
    cost,
  };
}

export function canPromote(state, hallIndex = 0) {
  const hall = state.townHalls[hallIndex];
  const fail = (reason) => ({ ok: false, reason, requirement: null });
  if (!hall) return fail('No such town hall');
  if (hall.level >= TOWN_HALL.maxLevel) return fail('Already at the highest rank');

  const requirement = promotionRequirement(hall.level);
  const development = developmentPoints(state);
  if (development < requirement.development) {
    return {
      ok: false,
      reason: `The town is not developed enough (${development} of ${requirement.development})`,
      requirement,
    };
  }
  for (const [resource, amount] of Object.entries(requirement.cost)) {
    if (state.resources[resource] < amount) {
      return { ok: false, reason: 'Not enough to pay the fee', requirement };
    }
  }
  return { ok: true, reason: null, requirement };
}

/**
 * Raise a Town Hall's rank.
 *
 * Every tenth level widens its reach, so the new land is revealed here too —
 * otherwise the player would own ground they could not see or build on.
 */
export function promote(state, hallIndex = 0) {
  const check = canPromote(state, hallIndex);
  if (!check.ok) return check;

  for (const [resource, amount] of Object.entries(check.requirement.cost)) {
    state.resources[resource] -= amount;
  }
  const hall = state.townHalls[hallIndex];
  hall.level += 1;

  const revealed = clearTerritoryFog(state);
  state.stats.tilesCleared += revealed;
  const rewards = checkMapRewards(state);

  return { ok: true, reason: null, level: hall.level, revealed, rewards };
}

// ---------------------------------------------------------------------------
// Study power
// ---------------------------------------------------------------------------

/** Study points per tick contributed by buildings alone. */
export function facilityStudyPower(state) {
  let power = 0;
  for (const facility of Object.values(state.world.facilities)) {
    if (!isActive(facility)) continue;
    const def = facilityDef(facility.id);
    if (def.studyPower) power += def.studyPower;
  }
  return power;
}

/**
 * Study points per tick.
 *
 * `residentStudy` may be passed in when the caller has already walked the
 * residents — the clock has, and walking them twice per segment was the exact
 * mistake that made a month-long catch-up take eight seconds in V3.
 */
export function studyPower(state, residentStudy = null) {
  const fromPeople = residentStudy ?? residentRates(state).study;
  return STUDY.basePower + fromPeople + facilityStudyPower(state);
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export function isResearched(state, id) {
  return state.research.completed.includes(id);
}

/** Is this facility in the build menu yet? Unlocked things and open things are. */
export function isFacilityUnlocked(state, facilityId) {
  const def = FACILITIES[facilityId];
  if (!def) return false;
  if (!def.locked) return true;
  return state.research.unlocked.includes(facilityId);
}

export function canAfford(state, cost) {
  return Object.entries(cost).every(([resource, amount]) => state.resources[resource] >= amount);
}

/**
 * Why this study is or is not available right now.
 * @returns {'done'|'active'|'ready'|'poor'|'rank'|'requires'}
 */
export function researchStatus(state, id) {
  const def = researchDef(id);
  if (isResearched(state, id)) return 'done';
  if (state.research.active?.id === id) return 'active';

  const missing = (def.requires ?? []).filter((need) => !isResearched(state, need));
  if (missing.length > 0) return 'requires';
  if (townRank(state) < def.rank) return 'rank';
  if (!canAfford(state, def.cost)) return 'poor';
  return 'ready';
}

/** Every study, with its status and what is standing in the way. */
export function researchList(state) {
  return RESEARCH_IDS.map((id) => {
    const def = RESEARCH[id];
    const status = researchStatus(state, id);
    return {
      def,
      status,
      missing: (def.requires ?? []).filter((need) => !isResearched(state, need)),
    };
  });
}

// ---------------------------------------------------------------------------
// Running a study
// ---------------------------------------------------------------------------

/**
 * Begin a study. The cost is paid up front, exactly as the real game does it —
 * so an abandoned study is a real loss and picking one is a real decision.
 */
export function startResearch(state, id) {
  if (state.research.active) {
    return { ok: false, reason: 'Something is already being studied' };
  }
  const status = researchStatus(state, id);
  if (status === 'done') return { ok: false, reason: 'Already known' };
  if (status === 'rank') {
    return { ok: false, reason: `Needs a rank ${researchDef(id).rank} town hall` };
  }
  if (status === 'requires') {
    const first = (researchDef(id).requires ?? []).find((need) => !isResearched(state, need));
    return { ok: false, reason: `Study ${researchDef(first).name} first` };
  }
  if (status === 'poor') return { ok: false, reason: 'Not enough to begin' };

  const def = researchDef(id);
  for (const [resource, amount] of Object.entries(def.cost)) {
    state.resources[resource] -= amount;
  }
  // Anything studied before it was set aside still counts.
  state.research.active = {
    id,
    progress: state.research.progress[id] ?? 0,
    total: def.study,
  };
  return { ok: true, reason: null };
}

/**
 * Set a study aside. Half the fee comes back and every point already studied
 * is kept, so returning to it later does not start from nothing.
 *
 * Losing hours of study to a change of mind is exactly the kind of punishment
 * this game does not do — but the other half of the fee is gone, so switching
 * projects is still a decision rather than a free action.
 */
export function cancelResearch(state, { refundFraction = 0.5 } = {}) {
  const active = state.research.active;
  if (!active) return { ok: false, reason: 'Nothing is being studied' };

  const def = researchDef(active.id);
  const refunded = {};
  for (const [resource, amount] of Object.entries(def.cost)) {
    const back = Math.floor(amount * refundFraction);
    state.resources[resource] += back;
    refunded[resource] = back;
  }

  state.research.progress[active.id] = active.progress;
  state.research.active = null;
  return { ok: true, reason: null, id: active.id, kept: active.progress, refunded };
}

/**
 * Add study for a span of ticks.
 *
 * Note what this does NOT do: break the segment. Finishing a study changes no
 * production rate — it grants stock and opens menu entries — so the clock has
 * no reason to stop here, and the arithmetic is identical whether a month is
 * walked in one step or in a million. Progress is clamped at the total, so
 * leftover ticks are never spent on a study the player has not chosen yet.
 */
export function advanceResearch(state, ticks, report, power) {
  const active = state.research.active;
  if (!active) return;

  active.progress = Math.min(active.total, active.progress + power * ticks);
  if (active.progress < active.total) return;

  const def = researchDef(active.id);
  state.research.completed.push(active.id);
  delete state.research.progress[active.id];
  state.research.active = null;

  const granted = applyGrants(state, def.grants);
  report.research.push({ id: def.id, name: def.name, granted });
}

// ---------------------------------------------------------------------------
// Rewards — shared by research, surveys and map rewards
// ---------------------------------------------------------------------------

/**
 * Hand over whatever a study, survey or map reward gives.
 *
 * Granting stock of a locked facility unlocks it too. Owning three of a thing
 * you cannot see in the menu would be a bug the player experiences as one.
 */
export function applyGrants(state, grants = {}) {
  const granted = { unlocked: [], stock: {}, resources: {} };

  for (const facilityId of grants.unlock ?? []) {
    if (!state.research.unlocked.includes(facilityId)) {
      state.research.unlocked.push(facilityId);
      granted.unlocked.push(facilityId);
    }
  }

  for (const [facilityId, amount] of Object.entries(grants.stock ?? {})) {
    state.stock[facilityId] = (state.stock[facilityId] ?? 0) + amount;
    granted.stock[facilityId] = (granted.stock[facilityId] ?? 0) + amount;
    if (FACILITIES[facilityId]?.locked && !state.research.unlocked.includes(facilityId)) {
      state.research.unlocked.push(facilityId);
      granted.unlocked.push(facilityId);
    }
  }

  for (const [resource, amount] of Object.entries(grants.resources ?? {})) {
    state.resources[resource] = (state.resources[resource] ?? 0) + amount;
    granted.resources[resource] = (granted.resources[resource] ?? 0) + amount;
  }

  return granted;
}

// ---------------------------------------------------------------------------
// Map rewards
// ---------------------------------------------------------------------------

/**
 * Pay out for exploring. Called after anything reveals land — never from the
 * clock, because fog only moves when the player makes it move.
 */
export function checkMapRewards(state) {
  const claimed = [];
  for (let index = 0; index < MAP_REWARDS.length; index++) {
    const reward = MAP_REWARDS[index];
    if (state.research.mapRewards.includes(index)) continue;
    if (clearedTileCount(state) < reward.tiles) continue;

    state.research.mapRewards.push(index);
    claimed.push({
      index,
      name: reward.name,
      granted: applyGrants(state, { stock: reward.stock, resources: reward.resources }),
    });
  }
  return claimed;
}

