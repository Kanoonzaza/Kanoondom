// Game state: shape, creation, persistence.
//
// The state object is the single source of truth and is fully serialisable —
// no functions, no Maps, no class instances, no DOM references.
//
// Terrain deliberately does NOT live here. It is derived from `seed` on demand
// (see sim/world.js), so a 96x96 world costs nothing in the save file.

import { deriveSeed, SEED_SALT } from './sim/rng.js';
import { worldCentre } from './sim/world.js';
import { STARTING_RESOURCES, RESOURCE_IDS } from './content/resources.js';
import { FACILITIES } from './content/facilities.js';
import {
  TICKS_PER_SEASON, SEASONS_PER_YEAR, SEASON_NAMES, DAY, WORLD_TILES_X,
} from './content/config.js';

export const SCHEMA_VERSION = 6;
export const STORAGE_KEY = 'kingdom-sim-v2/save';

/**
 * The second slot.
 *
 * One key held everything, and a kingdom is months of somebody's evenings. Two
 * things can take it: a write that runs out of quota part way through, and a
 * migration that goes wrong on a save this build has never seen. The backup is
 * refreshed at most once a day — old enough to predate a bad migration, recent
 * enough to be worth having — and always immediately before a migration runs.
 *
 * Two copies of a sub-200KB save is a rounding error against a 5MB budget.
 */
export const BACKUP_KEY = 'kingdom-sim-v2/save.backup';
export const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;

export function newGame(seed = Math.floor(Math.random() * 0xffffffff), options = {}) {
  const now = options.now ?? Date.now();
  const centre = worldCentre();

  const state = {
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
      /** Nest sites the player has cleared. Where nests STAND is derived from
       *  the seed (sim/monsters.js), so only the clearing needs storing. */
      nestsCleared: {},
      /**
       * How many tiles `cleared` holds. Maintained rather than counted, so
       * Peace Level is O(1) — it sits under `isZoneUnlocked`, which placement
       * checks ask once per footprint tile.
       */
      clearedCount: 0,
      wasteland: {},
      /** Facility records, keyed by their ORIGIN (top-left) tile. */
      facilities: {},
      /**
       * Every tile a facility covers, mapped back to that facility's origin.
       * Derived from `facilities`, but maintained rather than recomputed so
       * "what is on this tile?" stays O(1) for the renderer and for placement
       * checks. `reindexOccupancy` can rebuild it if it ever drifts.
       */
      occupied: {},
    },

    /** Territory radiates from these (research: world-and-map.md). */
    townHalls: [{ id: 1, x: centre.x, y: centre.y, level: 1 }],

    /** Three coins, five materials, and energy — each stored separately. */
    resources: { ...STARTING_RESOURCES },

    /**
     * Facilities in hand, waiting to be placed.
     *
     * This is what limits building in the real game, in place of any running
     * cost: you own only so many of each, and more come from research, surveys
     * and map rewards. Taking one down returns it to your hand.
     */
    stock: Object.fromEntries(
      Object.values(FACILITIES).map((def) => [def.id, def.stock ?? 0])
    ),

    /**
     * What the kingdom has learned (research: research-system.md).
     *
     * `unlocked` is the list of facilities research has revealed — the build
     * menu is this plus everything not marked `locked`. `progress` remembers
     * studies that were set aside, so returning to one does not start over.
     */
    research: {
      completed: [],
      unlocked: [],
      progress: {},
      /** `{ id, progress, total }`, or null when nobody is studying anything. */
      active: null,
      /** Indices of MAP_REWARDS already paid out. */
      mapRewards: [],
    },

    surveys: { done: 0, lastFindId: null, readyAtTick: 0 },

    /**
     * How badly the monsters want a word with you, 0 upward.
     *
     * Gathers while the player is away — the nests do not wait — but under a
     * lower ceiling, and nothing ever resolves offline. See sim/raids.js.
     */
    threat: 0,
    /** No raid may fire before this tick. Set on returning from an absence. */
    graceUntilTick: 0,

    caves: { visits: 0, enteredMoon: -1 },

    /**
     * Every piece of gear in the kingdom, keyed by item id.
     *
     * Items are instances, not types: two Bronze Swords are two entries with
     * their own levels and their own banked experience. `owner` points at the
     * resident wearing it, and that resident's `gear` points back — one is the
     * index for "who has this?", the other for "what is she wearing?".
     */
    equipment: {},
    /** Equipment patterns research has taught the Master Smithy. */
    equipmentKnown: [],

    /**
     * Eggs waiting, and eggs incubating (research: creature-collection.md).
     * An egg carries what it has been fed, which is what decides what hatches.
     */
    eggs: [],
    /** Hatched monsters. `role` says whether they hold the town or go out. */
    allies: [],

    residents: [],
    /**
     * Married pairs, and what they are expecting. A couple is its own record
     * rather than two cross-references, so a birth is scheduled once.
     */
    couples: [],
    parties: [],
    /** Guards against two arrivals landing on the same day. */
    lastArrivalDay: -1,
    nextId: 2,

    chronicle: [],
    milestonesUnlocked: [],
    lastSnapshotYear: 0,

    stats: {
      nestsCleared: 0,
      /** Difficulty follows the player, so this is what it follows. */
      highestTierCleared: 1,
      tilesCleared: 0,
      raidsSuffered: 0,
      facilitiesBuilt: 0,
      /** Cumulative overflow per resource — the nudge to build more storage. */
      wasted: {},
    },

    pendingReport: null,
  };

  // The founding Town Hall is a real facility standing on real tiles, not just
  // an entry in `townHalls`. Written inline because sim/facilities.js imports
  // this module for `takeId`, so importing it back would be a cycle.
  const hallDef = FACILITIES.town_hall;
  const origin = centre.y * WORLD_TILES_X + centre.x;
  state.world.facilities[origin] = {
    id: 'town_hall',
    level: 1,
    buildTicksRemaining: 0,
    upgradeTicksRemaining: 0,
    upgrading: false,
    built: true,
    damaged: false,
  };
  for (let dy = 0; dy < hallDef.size.h; dy++) {
    for (let dx = 0; dx < hallDef.size.w; dx++) {
      state.world.occupied[(centre.y + dy) * WORLD_TILES_X + (centre.x + dx)] = origin;
    }
  }
  state.townHalls[0].origin = origin;

  return state;
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

/** A one-line description of a save, for asking "replace this with that?". */
export function describeSave(state) {
  return {
    residents: state.residents?.length ?? 0,
    towns: state.townHalls?.length ?? 0,
    tiles: state.world?.clearedCount ?? 0,
    studies: state.research?.completed?.length ?? 0,
    savedAt: state.lastSaveTime ?? null,
    schemaVersion: state.schemaVersion ?? null,
  };
}

/** Each version bump adds a step here; saves walk forward one version at a time. */
export function migrate(save) {
  const state = save;
  if (state.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Save was written by a newer version (schema ${state.schemaVersion}, this build reads ${SCHEMA_VERSION}).`
    );
  }

  // 1 -> 2: research, surveys, and the knowledge resources they spend.
  if (state.schemaVersion < 2) {
    state.research = {
      completed: [], unlocked: [], progress: {}, active: null, mapRewards: [],
    };
    state.surveys = { done: 0, lastFindId: null, readyAtTick: 0 };
    state.schemaVersion = 2;
  }

  // 2 -> 3: monsters, nests and the threat they put on the kingdom.
  if (state.schemaVersion < 3) {
    state.world.nestsCleared = {};
    // Nest POSITIONS are derived from the seed now, so the old table is dead
    // weight in every save that has one.
    delete state.world.nests;
    state.threat = 0;
    state.graceUntilTick = 0;
    state.caves = { visits: 0, enteredMoon: -1 };
    state.stats.highestTierCleared = 1;
    state.schemaVersion = 3;
  }

  // 3 -> 4: equipment and skills.
  if (state.schemaVersion < 4) {
    state.equipment = {};
    state.equipmentKnown = [];
    for (const resident of state.residents) {
      resident.gear = { weapon: null, head: null, armor: null, shield: null, accessory: null };
      resident.skills = [];
    }
    state.schemaVersion = 4;
  }

  // 4 -> 5: eggs and the creatures that come out of them.
  if (state.schemaVersion < 5) {
    state.eggs = [];
    state.allies = [];
    state.schemaVersion = 5;
  }

  // 5 -> 6: marriage and the second generation.
  if (state.schemaVersion < 6) {
    state.couples = [];
    for (const resident of state.residents) {
      resident.partnerId = null;
      resident.heritage = 1;
    }
    state.schemaVersion = 6;
  }

  // Resources and facilities are added between versions more often than the
  // schema changes, so fill any gaps rather than adding a migration each time.
  // A missing store must read 0, not undefined — undefined poisons every sum
  // it touches and the damage shows up far from the cause.
  for (const id of RESOURCE_IDS) {
    if (typeof state.resources[id] !== 'number') state.resources[id] = 0;
  }
  for (const def of Object.values(FACILITIES)) {
    if (typeof state.stock[def.id] !== 'number') state.stock[def.id] = 0;
  }

  // Derived, and cheap to rebuild — so recover it rather than versioning it.
  if (typeof state.world.clearedCount !== 'number') {
    state.world.clearedCount = Object.keys(state.world.cleared).length;
  }

  // Somebody who arrived before their kingdom had a forge still needs the
  // slots to hang gear on, or every read of them is a crash waiting to happen.
  for (const resident of state.residents) {
    // Somebody who arrived before their kingdom had weddings still needs these
    // read as something rather than undefined.
    if (resident.partnerId === undefined) resident.partnerId = null;
    if (typeof resident.heritage !== 'number') resident.heritage = 1;
    if (!resident.gear) {
      resident.gear = { weapon: null, head: null, armor: null, shield: null, accessory: null };
    }
    if (!Array.isArray(resident.skills)) resident.skills = [];
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

/**
 * Copy the current save aside, if the one we have is old enough to be worth
 * replacing. Never throws: a backup that fails must not stop the real save.
 */
function refreshBackup(now) {
  try {
    const current = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!current) return;

    const existing = globalThis.localStorage.getItem(BACKUP_KEY);
    if (existing) {
      const at = JSON.parse(existing)?.lastSaveTime ?? 0;
      if (now - at < BACKUP_EVERY_MS) return;
    }
    globalThis.localStorage.setItem(BACKUP_KEY, current);
  } catch {
    /* no room for a backup, or unreadable: the live save still matters more */
  }
}

export function saveToStorage(state, now = Date.now()) {
  if (!hasStorage()) return false;
  refreshBackup(now);
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, serialize(state, now));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the save, falling back to the backup if the main one cannot be read.
 *
 * @returns {object|null} the state, with `restoredFromBackup` set on it if the
 *   main slot failed. The caller is expected to TELL the player that happened:
 *   silently handing back an older kingdom would be its own kind of loss.
 */
export function loadFromStorage() {
  if (!hasStorage()) return null;

  const json = globalThis.localStorage.getItem(STORAGE_KEY);
  if (json) {
    try {
      // Before a migration touches anything, keep a copy of what we were
      // given. A migration bug is exactly the case the backup exists for, and
      // by the time it shows itself the original is long overwritten.
      const version = JSON.parse(json)?.schemaVersion;
      if (typeof version === 'number' && version < SCHEMA_VERSION) {
        try {
          globalThis.localStorage.setItem(BACKUP_KEY, json);
        } catch { /* nothing we can do, and not a reason to refuse to load */ }
      }
      return deserialize(json);
    } catch (err) {
      console.warn('The save could not be read; trying the backup.', err);
    }
  }

  const backup = globalThis.localStorage.getItem(BACKUP_KEY);
  if (!backup) return null;

  const state = deserialize(backup);
  state.restoredFromBackup = true;
  return state;
}

export function clearStorage() {
  if (!hasStorage()) return;
  globalThis.localStorage.removeItem(STORAGE_KEY);
  globalThis.localStorage.removeItem(BACKUP_KEY);
}

/**
 * Ask the browser not to evict us.
 *
 * Safari clears storage for sites you have not opened in seven days, which for
 * a game whose whole premise is "come back later" is pointed. Installing to the
 * home screen is the real exemption; this helps under storage pressure and
 * costs nothing to ask for.
 */
export async function requestPersistence() {
  try {
    if (await globalThis.navigator?.storage?.persisted?.()) return true;
    return (await globalThis.navigator?.storage?.persist?.()) === true;
  } catch {
    return false;
  }
}
