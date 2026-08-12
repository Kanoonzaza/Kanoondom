// Residents (research: residents-jobs.md, houses.md, ui-structure.md).
//
// People arrive across the sea once you have cleared land worth arriving at.
// Give them a plot and they open a shop of their own trade; a Blacksmith raises
// a Weapon Shop, a Cook a Restaurant. Fighters open nothing — they are who you
// send out into the world.
//
// A resident's real strength is mostly a function of WHERE THEY LIVE: their own
// growth plus every facility aura reaching their home. That is what makes town
// layout matter rather than merely look tidy.

import { PROFESSIONS, professionDef, ARRIVAL_WEIGHTS } from '../content/professions.js';
import { STAT_IDS, emptyStats } from '../content/stats.js';
import { facilityDef } from '../content/facilities.js';
import { RESIDENTS, DAY } from '../content/config.js';
import { createRng, deriveSeed, SEED_SALT } from './rng.js';
import { takeId, dayNumber } from '../state.js';
import { tileX, tileY, isCleared } from './world.js';
import { isActive } from './facilities.js';
import { auraAt } from './aura.js';

const FIRST_NAMES = [
  'Alden', 'Bryn', 'Cass', 'Dara', 'Edric', 'Fen', 'Greta', 'Hale',
  'Ilsa', 'Joric', 'Kesh', 'Lira', 'Mabon', 'Nera', 'Orin', 'Perrin',
  'Quill', 'Rhen', 'Sable', 'Torvald', 'Ulla', 'Vessa', 'Wystan', 'Yorick',
  'Astrid', 'Berec', 'Corin', 'Dagna', 'Eirik', 'Freya', 'Gethin', 'Hedda',
];

// ---------------------------------------------------------------------------
// Housing
// ---------------------------------------------------------------------------

/** Every built plot, with how many beds it has and who is in them. */
export function homes(state) {
  const list = [];
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const def = facilityDef(facility.id);
    if (!def.housing || !isActive(facility)) continue;

    const index = Number(origin);
    const occupants = state.residents.filter((resident) => resident.home === index);
    list.push({
      origin: index,
      x: tileX(index),
      y: tileY(index),
      facility,
      def,
      beds: def.housing.beds,
      shelves: def.housing.shelves,
      occupants,
      free: def.housing.beds - occupants.length,
    });
  }
  return list;
}

export function totalBeds(state) {
  let beds = 0;
  for (const facility of Object.values(state.world.facilities)) {
    const def = facilityDef(facility.id);
    if (def.housing && isActive(facility)) beds += def.housing.beds;
  }
  return beds;
}

/**
 * Spare beds, counted without building anything.
 *
 * The obvious version — `homes()` then sum — allocates an object per home and
 * filters the whole resident list for each one. That is O(homes x residents)
 * and the clock asks for it constantly, so it gets a cheap path of its own.
 */
export function freeBeds(state) {
  let housed = 0;
  for (const resident of state.residents) if (resident.home !== null) housed++;
  return totalBeds(state) - housed;
}

/** The first home with a spare bed, nearest the capital. */
export function firstFreeHome(state) {
  const hall = state.townHalls[0];
  return homes(state)
    .filter((home) => home.free > 0)
    .sort((a, b) => Math.hypot(a.x - hall.x, a.y - hall.y) - Math.hypot(b.x - hall.x, b.y - hall.y))[0]
    ?? null;
}

// ---------------------------------------------------------------------------
// Arrival
// ---------------------------------------------------------------------------

/**
 * Newcomers are a pure function of the DAY, not of the RNG stream.
 *
 * This is the pattern that keeps offline catch-up honest: if arrivals drew from
 * the shared stream, a chunked run and a single long run would consume it a
 * different number of times and drift apart. Keyed to the day, day 400 brings
 * the same person whether you watched it or not.
 */
export function arrivalForDay(state, day) {
  const rng = createRng(deriveSeed(state.seed ^ (day * 0x9e3779b1), SEED_SALT.RECRUITS));

  // A kingdom nobody has heard of attracts nobody.
  const explored = Object.keys(state.world.cleared).length;
  const chance = Math.min(
    RESIDENTS.maxArrivalChance,
    explored / RESIDENTS.tilesPerArrivalChance
  );
  if (rng.next() > chance) return null;

  const entries = Object.entries(ARRIVAL_WEIGHTS);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  let professionId = entries[0][0];
  for (const [id, weight] of entries) {
    roll -= weight;
    if (roll <= 0) { professionId = id; break; }
  }

  return {
    name: rng.pick(FIRST_NAMES),
    professionId,
    level: rng.int(1, RESIDENTS.maxArrivalLevel),
  };
}

/**
 * Ticks until somebody actually arrives, or Infinity if nobody will.
 *
 * An arrival changes production rates, so it has to fall on a segment boundary
 * for offline catch-up to match live play exactly. But breaking on EVERY day
 * boundary was ruinous: a day is sixty ticks, so a month away is forty-three
 * thousand segments, and a catch-up took eight seconds. Most days nobody comes,
 * so we look ahead for the next day that actually brings someone.
 */
export function ticksToNextArrival(state) {
  if (freeBeds(state) <= 0) return Infinity;

  const currentDay = Math.floor(state.time.totalTicks / DAY.ticksPerDay);
  const limit = currentDay + ARRIVAL_LOOKAHEAD_DAYS;

  for (let day = currentDay + 1; day <= limit; day++) {
    if (arrivalForDay(state, day)) {
      return day * DAY.ticksPerDay - state.time.totalTicks;
    }
  }
  // Nobody in the near future; look again after the window.
  return limit * DAY.ticksPerDay - state.time.totalTicks;
}

/** How far ahead to look for the next newcomer before re-checking. */
const ARRIVAL_LOOKAHEAD_DAYS = 40;

/** Base stats for a newcomer: their trade's leanings, grown by level. */
export function baseStatsFor(professionId, level) {
  const stats = emptyStats();
  const bias = professionDef(professionId).statBias ?? {};
  for (const stat of STAT_IDS) {
    stats[stat] = (RESIDENTS.baseStat + (bias[stat] ?? 0)) * (1 + (level - 1) * RESIDENTS.statGrowthPerLevel);
  }
  return stats;
}

export function makeResident(state, { name, professionId, level }) {
  return {
    id: takeId(state),
    name,
    professionId,
    level,
    xp: 0,
    /** Tile index of their home plot, or null while they are waiting. */
    home: null,
    baseStats: baseStatsFor(professionId, level),
    arrivedOnDay: dayNumber(state),
  };
}

/**
 * Bring in whoever is due today, if there is a bed. People do not queue on the
 * docks forever — an unhoused kingdom simply stops attracting anyone.
 */
export function resolveArrivals(state, report) {
  const day = dayNumber(state);
  if (state.lastArrivalDay === day) return;
  state.lastArrivalDay = day;

  if (freeBeds(state) <= 0) return;

  const newcomer = arrivalForDay(state, day);
  if (!newcomer) return;

  const resident = makeResident(state, newcomer);
  const home = firstFreeHome(state);
  if (!home) return;

  resident.home = home.origin;
  state.residents.push(resident);
  report.arrivals.push({
    id: resident.id,
    name: resident.name,
    professionId: resident.professionId,
    level: resident.level,
  });
}

// ---------------------------------------------------------------------------
// What a resident is worth
// ---------------------------------------------------------------------------

/**
 * A resident's true stats: what they brought, plus everything their home
 * stands near. Live rather than stored, so moving a well next door improves
 * them immediately and nothing can fall out of sync.
 */
export function statsOf(state, resident) {
  const stats = { ...resident.baseStats };
  if (resident.home === null) return stats;

  const aura = auraAt(state, tileX(resident.home), tileY(resident.home));
  for (const stat of STAT_IDS) stats[stat] += aura[stat] ?? 0;
  return stats;
}

/** Where a resident should be right now (research: mornings in, days out). */
export function activityOf(state, resident, period) {
  const profession = professionDef(resident.professionId);
  if (period.id === 'night') return 'asleep';
  if (period.id === 'morning') return profession.shop ? 'minding the shop' : 'at home';
  return profession.shop ? 'minding the shop' : profession.gathers ? 'out gathering' : 'training';
}

/**
 * Copper per tick from one resident's shop.
 *
 * Scales with their level and with the shelves their home affords — which is
 * the whole reason a bigger plot is worth building. Their Heart stat stands in
 * for how well they treat customers.
 */
export function shopIncomeOf(state, resident) {
  const profession = professionDef(resident.professionId);
  if (!profession.shop || resident.home === null) return 0;

  const home = state.world.facilities[resident.home];
  if (!isActive(home)) return 0;

  const shelves = facilityDef(home.id).housing.shelves;
  const heart = statsOf(state, resident).heart;

  return profession.shop.incomePerShelf
    * shelves
    * (1 + (resident.level - 1) * RESIDENTS.incomePerLevel)
    * (1 + heart * RESIDENTS.incomePerHeart);
}

/**
 * Everything the residents contribute per tick, shops and gathering together.
 *
 * Computed in ONE pass with the aura memoised per home, because this sits on
 * the hot path: the clock asks for production rates once per segment, and a
 * long offline catch-up runs thousands of segments. Working it out per
 * resident meant re-walking every facility for every person — O(residents x
 * facilities) — and a 400-day catch-up crossed a second and a half.
 * Housemates share an aura, so the cache does most of the work.
 */
export function residentRates(state) {
  const auraCache = new Map();
  const auraFor = (home) => {
    let aura = auraCache.get(home);
    if (!aura) {
      aura = auraAt(state, tileX(home), tileY(home));
      auraCache.set(home, aura);
    }
    return aura;
  };

  let copper = 0;
  const gathers = {};

  for (const resident of state.residents) {
    if (resident.home === null) continue;
    const home = state.world.facilities[resident.home];
    if (!isActive(home)) continue;

    const profession = professionDef(resident.professionId);
    const aura = auraFor(resident.home);

    if (profession.shop) {
      const heart = resident.baseStats.heart + (aura.heart ?? 0);
      copper += profession.shop.incomePerShelf
        * facilityDef(home.id).housing.shelves
        * (1 + (resident.level - 1) * RESIDENTS.incomePerLevel)
        * (1 + heart * RESIDENTS.incomePerHeart);
    }

    if (profession.gathers) {
      const gather = resident.baseStats.gather + (aura.gather ?? 0);
      const multiplier = 1 + gather * RESIDENTS.gatherPerPoint;
      for (const [resource, amount] of Object.entries(profession.gathers)) {
        gathers[resource] = (gathers[resource] ?? 0) + amount * multiplier * RESIDENTS.gatherScale;
      }
    }
  }

  return { copper, gathers };
}

/** Everything the kingdom's shops bring in, per tick. */
export function shopIncome(state) {
  return residentRates(state).copper;
}

/** What residents gather for themselves, per tick, by resource. */
export function gatherRates(state) {
  return residentRates(state).gathers;
}

export function residentsOf(state, homeOrigin) {
  return state.residents.filter((resident) => resident.home === homeOrigin);
}

/** Turn someone loose from their home — used when a plot is removed. */
export function evictFrom(state, homeOrigin) {
  const evicted = [];
  for (const resident of state.residents) {
    if (resident.home !== homeOrigin) continue;
    resident.home = null;
    evicted.push(resident);
  }
  // Nobody is deleted; they wait for a roof.
  return evicted;
}

/** Put anyone without a roof into a spare bed, if one exists. */
export function rehouse(state) {
  let moved = 0;
  for (const resident of state.residents) {
    if (resident.home !== null) continue;
    const home = firstFreeHome(state);
    if (!home) break;
    resident.home = home.origin;
    moved++;
  }
  return moved;
}

export { PROFESSIONS };
