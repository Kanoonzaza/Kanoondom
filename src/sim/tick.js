// The clock.
//
// advanceTicks is the ONLY way time moves. The live loop calls it with 1;
// offline catch-up calls it with 200,000. Both take the identical path.
//
// How chunk-independence is guaranteed
// ------------------------------------
// Time is walked in SEGMENTS. A segment runs from now until the next moment
// anything can change: a season boundary, a day boundary, a building finishing.
// Within a segment every rate is constant, so it resolves in closed form.
//
// Because segments break exactly where behaviour changes, advanceTicks(state, N)
// visits the same boundaries in the same order as N calls of
// advanceTicks(state, 1). There is no separate "offline path" that could drift
// out of sync with the live one — that is the whole point, and it is what makes
// the offline promise testable rather than hopeful.

import { TICKS_PER_SEASON, DAY } from '../content/config.js';
import {
  productionRates, storageCapacity, applyProduction, settleStorage,
} from './economy.js';
import { resolveArrivals, ticksToNextArrival, residentRates } from './residents.js';
import { advanceResearch, studyPower } from './research.js';
import { stepThreat } from './raids.js';

/** A fresh record of everything that happened during an advance. */
export function createReport() {
  return {
    ticks: 0,
    seasonsElapsed: 0,
    daysElapsed: 0,
    fullMoons: 0,
    gained: {},
    wasted: {},
    filledAtTick: {},
    seasons: [],
    completed: [],
    upgraded: [],
    arrivals: [],
    research: [],
    battles: [],
    raids: [],
    raidWarnings: [],
    threatGained: 0,
    milestones: [],
  };
}

/**
 * Ticks until the next moment something can change. Always at least 1, and
 * never past the next season or day boundary.
 */
export function ticksToNextEvent(state) {
  const toSeason = TICKS_PER_SEASON - (state.time.totalTicks % TICKS_PER_SEASON);
  // Day boundaries themselves change no rate — only an arrival does, so that is
  // what we break on. Stopping every sixty ticks made a month-long catch-up
  // take eight seconds.
  let next = Math.min(toSeason, ticksToNextArrival(state));

  for (const key of Object.keys(state.world.facilities)) {
    const facility = state.world.facilities[key];
    if (facility.buildTicksRemaining > 0) {
      next = Math.min(next, facility.buildTicksRemaining);
    }
    if (facility.upgradeTicksRemaining > 0) {
      next = Math.min(next, facility.upgradeTicksRemaining);
    }
  }

  return Math.max(1, next);
}

/**
 * Resolve one segment. Nothing here changes a rate — anything that would is an
 * event, and events only fire at segment boundaries.
 */
function applySegment(state, ticks, report, offline) {
  // One walk of the residents feeds both production and study. Two walks was
  // the V3 performance bug; this is the shape that fixed it.
  const residents = residentRates(state);

  // Rates are constant for the whole segment by construction, so the entire
  // span resolves in one piece of arithmetic rather than tick by tick.
  applyProduction(
    state, ticks,
    productionRates(state, residents), storageCapacity(state),
    report, state.time.totalTicks
  );

  // Studies accumulate like anything else — including while the player is
  // away. Finishing one changes no rate, so this needs no segment of its own.
  if (state.research?.active) {
    advanceResearch(state, ticks, report, studyPower(state, residents.study));
  }

  for (const key of Object.keys(state.world.facilities)) {
    const facility = state.world.facilities[key];
    if (facility.buildTicksRemaining > 0) facility.buildTicksRemaining -= ticks;
    if (facility.upgradeTicksRemaining > 0) facility.upgradeTicksRemaining -= ticks;
  }

  state.time.totalTicks += ticks;
  // The calendar only moves while the player is at the wheel. Catch-up fills
  // the stores without aging the realm.
  if (!offline) state.time.calendarTicks += ticks;
  report.ticks += ticks;
}

/** Facilities whose timers just ran out come into effect. */
function completeConstruction(state, report) {
  for (const key of Object.keys(state.world.facilities)) {
    const facility = state.world.facilities[key];

    if (facility.buildTicksRemaining <= 0 && !facility.built) {
      facility.buildTicksRemaining = 0;
      facility.built = true;
      report.completed.push({ tile: Number(key), facilityId: facility.id });
    }

    // `upgrading` distinguishes "just finished" from "was never upgrading".
    if (facility.upgrading && facility.upgradeTicksRemaining <= 0) {
      facility.upgradeTicksRemaining = 0;
      facility.upgrading = false;
      facility.level = (facility.level ?? 1) + 1;
      report.upgraded.push({ tile: Number(key), facilityId: facility.id, level: facility.level });
    }
  }
}

/**
 * Advance the simulation by `ticks`.
 *
 * @param {object} state    mutated in place
 * @param {number} ticks    whole ticks; values below 1 are ignored
 * @param {object} options  `offline: true` freezes the calendar and (from V5)
 *                          suppresses raids
 * @returns {object} report of everything that happened
 */
export function advanceTicks(state, ticks, options = {}) {
  const report = createReport();
  let remaining = Math.floor(ticks);
  if (!(remaining > 0)) return report;

  const offline = options.offline === true;

  while (remaining > 0) {
    const step = Math.min(remaining, ticksToNextEvent(state));
    applySegment(state, step, report, offline);
    remaining -= step;

    completeConstruction(state, report);

    // Threat gathers whether or not anybody is watching; raids resolve only
    // when somebody is. That asymmetry IS the offline promise.
    stepThreat(state, step, report, offline);

    if (state.time.totalTicks % DAY.ticksPerDay === 0) {
      // People arrive with the morning, if there is a bed for them.
      resolveArrivals(state, report);
    }

    // Days and moons are counted arithmetically rather than by stopping on
    // each one, since nothing about them changes a rate.
    const dayBefore = Math.floor((state.time.totalTicks - step) / DAY.ticksPerDay);
    const dayAfter = Math.floor(state.time.totalTicks / DAY.ticksPerDay);
    report.daysElapsed += dayAfter - dayBefore;
    report.fullMoons += Math.floor(dayAfter / DAY.daysPerMoon) - Math.floor(dayBefore / DAY.daysPerMoon);

    if (state.time.totalTicks % TICKS_PER_SEASON === 0) {
      // Capacity can fall between seasons; make sure nothing is stranded above
      // a cap it can no longer drain to.
      settleStorage(state, report);
      report.seasonsElapsed += 1;
      report.seasons.push({ tick: state.time.totalTicks });
    }
  }

  return report;
}

/** Merge report `b` into `a`. Used when catch-up is split across calls. */
export function mergeReports(a, b) {
  a.ticks += b.ticks;
  a.seasonsElapsed += b.seasonsElapsed;
  a.daysElapsed += b.daysElapsed;
  a.fullMoons += b.fullMoons;
  a.threatGained = (a.threatGained ?? 0) + (b.threatGained ?? 0);

  for (const key of Object.keys(b.gained)) {
    a.gained[key] = (a.gained[key] ?? 0) + b.gained[key];
  }
  for (const key of Object.keys(b.wasted)) {
    a.wasted[key] = (a.wasted[key] ?? 0) + b.wasted[key];
  }
  for (const key of Object.keys(b.filledAtTick)) {
    if (a.filledAtTick[key] === undefined) a.filledAtTick[key] = b.filledAtTick[key];
  }

  for (const list of ['seasons', 'completed', 'upgraded', 'arrivals', 'research', 'battles', 'raids', 'raidWarnings', 'milestones']) {
    a[list].push(...b[list]);
  }
  return a;
}
