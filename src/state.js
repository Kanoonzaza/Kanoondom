// Game state: shape, creation, persistence.
//
// The state object is the single source of truth and is fully serialisable —
// no functions, no Maps, no class instances, no DOM references.
//
// Terrain deliberately does NOT live here. It is derived from `seed` on demand
// (see sim/world.js), so a 96x96 world costs nothing in the save file.

import { deriveSeed, SEED_SALT } from './sim/rng.js';
import { worldCentre } from './sim/world.js';
import {
  TICKS_PER_SEASON, SEASONS_PER_YEAR, SEASON_NAMES, DAY,
} from './content/config.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'kingdom-sim-v2/save';

export function newGame(seed = Math.floor(Math.random() * 0xffffffff), options = {}) {
  const now = options.now ?? Date.now();
  const centre = worldCentre();

  return {
    schemaVersion: SCHEMA_VERSION,
    seed: seed >>> 0,
    rngState: deriveSeed(seed, SEED_SALT.COMBAT),

    createdAt: now,
    lastSaveTime: now,

    settings: {
      pressure: options.pressure ?? 'normal',
      defaultSpeed: 1,
    },

    time: {
      /** The simulation clock. Drives everything, online and offline. */
      totalTicks: 0,
      /**
       * The calendar clock. Advances ONLY during active play, so time away
       * fills your stores without aging your kingdom.
       */
      calendarTicks: 0,
    },

    /**
     * The only terrain the save carries: what the player changed.
     * Keys are tile indices; values are deliberately small.
     */
    world: {
      cleared: {},
      wasteland: {},
      nests: {},
      facilities: {},
    },

    /** Territory radiates from these (research: world-and-map.md). */
    townHalls: [{ id: 1, x: centre.x, y: centre.y, level: 1 }],

    /** Filled in by V2. Three coins and five materials, separately stored. */
    resources: {
      bronze: 0, copper: 0, silver: 0,
      wood: 0, grass: 0, food: 0, ore: 0, mysticOre: 0,
      energy: 0,
    },

    residents: [],
    parties: [],
    nextId: 2,

    chronicle: [],
    milestonesUnlocked: [],
    lastSnapshotYear: 0,

    stats: {
      nestsCleared: 0,
      tilesCleared: 0,
      raidsSuffered: 0,
      wasted: {},
    },

    pendingReport: null,
  };
}

export function takeId(state) {
  return state.nextId++;
}

// ---------------------------------------------------------------------------
// Derived time
// ---------------------------------------------------------------------------

/** The season on the clock, from the CALENDAR — time away does not age it. */
export function seasonIndex(state) {
  return Math.floor(state.time.calendarTicks / TICKS_PER_SEASON);
}

/** Economic seasons elapsed. Drives upkeep and growth — never the display. */
export function simulationSeason(state) {
  return Math.floor(state.time.totalTicks / TICKS_PER_SEASON);
}

export function yearOf(state) {
  return Math.floor(seasonIndex(state) / SEASONS_PER_YEAR) + 1;
}

export function seasonName(state) {
  return SEASON_NAMES[seasonIndex(state) % SEASONS_PER_YEAR];
}

export function ticksIntoSeason(state) {
  return state.time.calendarTicks % TICKS_PER_SEASON;
}

/** Which part of the day it is — residents and monsters both care. */
export function dayPeriod(state) {
  const fraction = (state.time.totalTicks % DAY.ticksPerDay) / DAY.ticksPerDay;
  let current = DAY.periods[0];
  for (const period of DAY.periods) {
    if (fraction >= period.from) current = period;
  }
  return current;
}

export function dayNumber(state) {
  return Math.floor(state.time.totalTicks / DAY.ticksPerDay);
}

/** Where we are in the moon cycle, 0 to 1. Full moon at 0 (research). */
export function moonPhase(state) {
  return (dayNumber(state) % DAY.daysPerMoon) / DAY.daysPerMoon;
}

export function isFullMoon(state) {
  return dayNumber(state) % DAY.daysPerMoon === 0;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function serialize(state, now = Date.now()) {
  state.lastSaveTime = now;
  return JSON.stringify(state);
}

export function deserialize(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`Save is not valid JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.schemaVersion !== 'number') {
    throw new Error('Save is missing a schema version.');
  }
  return migrate(parsed);
}

/** Each version bump adds a step here; saves walk forward one version at a time. */
export function migrate(save) {
  const state = save;
  if (state.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Save was written by a newer version (schema ${state.schemaVersion}, this build reads ${SCHEMA_VERSION}).`
    );
  }
  return state;
}

function hasStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage !== null;
  } catch {
    return false;
  }
}

export function saveToStorage(state, now = Date.now()) {
  if (!hasStorage()) return false;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, serialize(state, now));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage() {
  if (!hasStorage()) return null;
  const json = globalThis.localStorage.getItem(STORAGE_KEY);
  if (!json) return null;
  return deserialize(json);
}

export function clearStorage() {
  if (!hasStorage()) return;
  globalThis.localStorage.removeItem(STORAGE_KEY);
}
