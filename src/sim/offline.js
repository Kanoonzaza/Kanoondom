// Offline progression — the reason this game exists.
//
//   * The kingdom keeps producing while you are away, at full rate.
//   * Storage capacity is the ONLY limit. No time window, no efficiency
//     penalty, no diminishing returns.
//   * Nothing drains: there is no upkeep, so an absence can never leave you
//     poorer than you left.
//   * The calendar does not advance. Time away fills your stores; it does not
//     age your kingdom.
//
// Catch-up runs through the very same advanceTicks the live loop uses, so there
// is no second implementation to drift out of sync.

import { advanceTicks, createReport, mergeReports } from './tick.js';
import { OFFLINE } from '../content/config.js';
import { RESOURCE_IDS } from '../content/resources.js';
import { grantGrace } from './raids.js';

// ---------------------------------------------------------------------------
// Catch-up, in three parts
// ---------------------------------------------------------------------------
//
// A month of absence is up to 2.6 million ticks. Walked in one call that is a
// second or more of a completely frozen page before anything is drawn — on a
// phone, a white screen the operating system is entitled to kill.
//
// So the work is split: begin, then as many chunks as it takes, then finish.
// The caller decides how big a chunk is and what to do between them (see
// main.js, which yields to the event loop and moves a progress bar). The
// simulation is untouched by this — `advanceTicks` already guarantees that N
// ticks in one call and N ticks in pieces land in the same place, and
// `mergeReports` was written for exactly this. `catchUp` below is still the
// whole thing in one call, and is what every test and the short-absence path
// use.

/**
 * Measure the absence and stop the clock at `now`.
 *
 * `lastSaveTime` is stamped HERE rather than at the end, so a catch-up
 * interrupted half way — a killed tab, a crash — simply resumes from where it
 * got to. Nothing was saved, so nothing was lost; the remaining span is still
 * owed and will be paid on the next load.
 */
export function beginCatchUp(state, now = Date.now()) {
  const elapsedMs = now - state.lastSaveTime;

  // A clock moved backwards (timezone change, manual adjustment) must never
  // rewind the kingdom or hand out negative production.
  const elapsedSeconds = elapsedMs > 0 ? Math.floor(elapsedMs / 1000) : 0;

  state.lastSaveTime = now;

  return {
    elapsedSeconds,
    // Past this point nothing observable is still changing, and simulating a
    // year anyway costs seconds of frozen page on load.
    simulated: Math.min(elapsedSeconds, OFFLINE.maxSimulatedSeconds),
    resourcesBefore: { ...state.resources },
    report: createReport(),
  };
}

/** Walk part of the absence. Returns the ticks actually taken. */
export function runCatchUpChunk(state, run, ticks) {
  const step = Math.min(Math.max(1, Math.floor(ticks)), run.simulated - run.report.ticks);
  if (step <= 0) return 0;
  mergeReports(run.report, advanceTicks(state, step, { offline: true }));
  return step;
}

/** Is there any of the absence left to walk? */
export function catchUpDone(run) {
  return run.report.ticks >= run.simulated;
}

/**
 * Close the books and shape the welcome-back panel.
 * @returns {object|null} null if the player was away too briefly to mention.
 */
export function finishCatchUp(state, run) {
  // Nothing may attack for a little while after somebody comes back. Being
  // ambushed by the act of opening the page is exactly the punishment this
  // whole design exists to avoid.
  grantGrace(state);

  const { elapsedSeconds, simulated, resourcesBefore, report } = run;
  if (elapsedSeconds < OFFLINE.minSecondsForReport) return null;

  const filledSecondsAgo = {};
  for (const id of RESOURCE_IDS) {
    const filledAt = report.filledAtTick[id];
    filledSecondsAgo[id] = filledAt === undefined
      ? null
      : Math.max(0, state.time.totalTicks - filledAt);
  }

  return {
    awaySeconds: elapsedSeconds,
    simulatedSeconds: simulated,
    capped: simulated < elapsedSeconds,
    gained: { ...report.gained },
    wasted: { ...report.wasted },
    filledSecondsAgo,
    resourcesBefore,
    completed: report.completed,
    upgraded: report.upgraded,
    threat: state.threat ?? 0,
    threatGained: report.threatGained ?? 0,
    raidWarnings: report.raidWarnings,
    // A study left running is finished when you get back. That is the whole
    // pillar applied to progression rather than only to stores.
    research: report.research,
    // People grow by living here, and living here does not stop when the page
    // is closed.
    levelUps: report.levelUps,
    births: report.births,
    arrivals: report.arrivals,
    completedCount: report.completed.length,
    fullMoons: report.fullMoons,
    // Guaranteed empty until V5, and guaranteed empty even then. Kept in the
    // summary so the promise is visible in the data, not only in a comment.
    raids: report.raids,
  };
}

/**
 * Bring a loaded save up to the present, in one call.
 *
 * @returns {object|null} a report for the welcome-back panel, or null if the
 *   player was away too briefly to be worth mentioning.
 */
export function catchUp(state, now = Date.now()) {
  const run = beginCatchUp(state, now);
  if (run.elapsedSeconds < 1) return null;

  while (!catchUpDone(run)) runCatchUpChunk(state, run, run.simulated);
  return finishCatchUp(state, run);
}
