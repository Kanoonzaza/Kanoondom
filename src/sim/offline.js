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

import { advanceTicks } from './tick.js';
import { OFFLINE } from '../content/config.js';
import { RESOURCE_IDS } from '../content/resources.js';

/**
 * Bring a loaded save up to the present.
 * @returns {object|null} a report for the welcome-back panel, or null if the
 *   player was away too briefly to be worth mentioning.
 */
export function catchUp(state, now = Date.now()) {
  const elapsedMs = now - state.lastSaveTime;

  // A clock moved backwards (timezone change, manual adjustment) must never
  // rewind the kingdom or hand out negative production.
  const elapsedSeconds = elapsedMs > 0 ? Math.floor(elapsedMs / 1000) : 0;

  state.lastSaveTime = now;
  if (elapsedSeconds < 1) return null;

  const resourcesBefore = { ...state.resources };

  // Past this point nothing observable is still changing, and simulating a year
  // anyway costs seconds of frozen page on load.
  const simulated = Math.min(elapsedSeconds, OFFLINE.maxSimulatedSeconds);
  const report = advanceTicks(state, simulated, { offline: true });

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
    fullMoons: report.fullMoons,
    // Guaranteed empty until V5, and guaranteed empty even then. Kept in the
    // summary so the promise is visible in the data, not only in a comment.
    raids: report.raids,
  };
}
