// Marriage and the second generation (research: residents-jobs.md).
//
// The real game's three requirements, kept as they are:
//
//   a DOUBLE BED placed next to the house the two of them share
//   a CHURCH for the ceremony, which means a Monk with a roof
//   THREE TOWNS before there are any children
//
// Two things about the shape of this, both deliberate:
//
// MARRIAGE IS A PLAYER ACTION. Nobody pairs off on their own while the player
// is away. Two of your people quietly becoming a couple overnight is a thing
// that happened TO you; choosing it is a thing you did. It also keeps the
// decision out of the clock entirely.
//
// A BIRTH IS SCHEDULED, NOT ROLLED. The wedding sets a day, and that day is
// when the child comes — no dice, so a chunked catch-up and a live run agree by
// construction rather than by care. A birth adds a resident and so changes the
// kingdom's rates, which is why the clock breaks a segment on it, exactly as it
// does for arrivals and level-ups.
//
// Nothing here can take anything away: no deaths, no forced matches, no
// childless penalty. A child is a pure addition.

import { MARRIAGE, DAY } from '../content/config.js';
import { professionDef } from '../content/professions.js';
import { STAT_IDS } from '../content/stats.js';
import { facilityDef } from '../content/facilities.js';
import { deriveSeed, createRng, SEED_SALT } from './rng.js';
import { takeId, dayNumber } from '../state.js';
import { tileX, tileY } from './world.js';
import { isStanding } from './facilities.js';
import { distanceToFootprint } from './aura.js';
import {
  statsOf, makeResident, baseStatsFor, freeName, firstFreeHome, freeBeds,
} from './residents.js';

// ---------------------------------------------------------------------------
// The requirements
// ---------------------------------------------------------------------------

/**
 * Is there a wedding bed beside this house?
 *
 * "Beside" is measured to the nearest tile of the house's footprint, so a bed
 * tucked against a Manor counts the same as one against a Small Plot — which is
 * what a player would expect from looking at it.
 */
export function bedBeside(state, homeOrigin) {
  const def = facilityDef(state.world.facilities[homeOrigin]?.id ?? 'plot_s');
  const hx = tileX(homeOrigin);
  const hy = tileY(homeOrigin);

  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    if (!facilityDef(facility.id).weddingBed || !isStanding(facility)) continue;

    const index = Number(origin);
    const distance = distanceToFootprint(tileX(index), tileY(index), hx, hy, def.size);
    if (distance <= 1) return { origin: index, facility };
  }
  return null;
}

/** Somebody has to perform the ceremony. A Monk with a roof is a church. */
export function hasChurch(state) {
  return state.residents.some(
    (resident) => resident.home !== null && professionDef(resident.professionId).weds
  );
}

export function partnerOf(state, resident) {
  if (resident.partnerId === null || resident.partnerId === undefined) return null;
  return state.residents.find((person) => person.id === resident.partnerId) ?? null;
}

export function coupleOf(state, resident) {
  return state.couples.find(
    (couple) => couple.a === resident.id || couple.b === resident.id
  ) ?? null;
}

/**
 * Why these two can or cannot marry.
 *
 * Every failure names the thing to go and do about it — "they need a Double Bed
 * beside their house" is actionable in a way that "not eligible" is not.
 */
export function canMarry(state, aId, bId) {
  const a = state.residents.find((person) => person.id === aId);
  const b = state.residents.find((person) => person.id === bId);
  const fail = (reason) => ({ ok: false, reason });

  if (!a || !b) return fail('No such person');
  if (a.id === b.id) return fail('That is one person');
  if (a.partnerId !== null || b.partnerId !== null) return fail('One of them is already married');
  if (a.home === null || b.home === null) return fail('Both of them need a home');
  if (a.home !== b.home) return fail('They must share a house');

  if (!bedBeside(state, a.home)) {
    return fail('Their house needs a Double Bed beside it');
  }
  if (!hasChurch(state)) return fail('Nobody here can marry them — house a Monk');

  const heartA = statsOf(state, a).heart;
  const heartB = statsOf(state, b).heart;
  if (Math.min(heartA, heartB) < MARRIAGE.heartNeeded) {
    return fail(
      `They are not close enough yet (${Math.round(Math.min(heartA, heartB))} `
      + `of ${MARRIAGE.heartNeeded} Heart — build something warm nearby)`
    );
  }

  for (const [resource, amount] of Object.entries(MARRIAGE.cost)) {
    if (state.resources[resource] < amount) return fail('Not enough for the ceremony');
  }
  return { ok: true, reason: null };
}

/** Everyone who could marry somebody, as pairs. */
export function possibleMatches(state) {
  const matches = [];
  for (let i = 0; i < state.residents.length; i++) {
    for (let j = i + 1; j < state.residents.length; j++) {
      const a = state.residents[i];
      const b = state.residents[j];
      if (a.partnerId !== null || b.partnerId !== null) continue;
      if (a.home === null || a.home !== b.home) continue;
      matches.push({ a, b, check: canMarry(state, a.id, b.id) });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// The wedding
// ---------------------------------------------------------------------------

export function marry(state, aId, bId) {
  const check = canMarry(state, aId, bId);
  if (!check.ok) return check;

  const a = state.residents.find((person) => person.id === aId);
  const b = state.residents.find((person) => person.id === bId);

  for (const [resource, amount] of Object.entries(MARRIAGE.cost)) {
    state.resources[resource] -= amount;
  }

  a.partnerId = b.id;
  b.partnerId = a.id;

  const couple = {
    id: takeId(state),
    a: a.id,
    b: b.id,
    weddedOnDay: dayNumber(state),
    children: 0,
    // Scheduled, not rolled. See the note at the top of the file.
    expectingOnDay: dayNumber(state) + MARRIAGE.gestationDays,
  };
  state.couples.push(couple);

  return { ok: true, reason: null, couple, a, b };
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

/** The real game's rule: no children until the kingdom is three towns wide. */
export function childrenAllowed(state) {
  return state.townHalls.length >= MARRIAGE.townsForChildren;
}

/**
 * Is there room under their roof for one more?
 *
 * A house holds its beds plus a couple of cots. Bounded, so the population
 * still grows only as fast as the player houses it.
 */
export function roomForChild(state, homeOrigin) {
  if (homeOrigin === null || homeOrigin === undefined) return false;
  const facility = state.world.facilities[homeOrigin];
  if (!facility || !isStanding(facility)) return false;

  const def = facilityDef(facility.id);
  if (!def.housing) return false;

  const living = state.residents.filter((person) => person.home === homeOrigin).length;
  return living < def.housing.beds + MARRIAGE.cotsPerHome;
}

/** Is this couple actually waiting on a child? */
export function expecting(state, couple) {
  if (couple.children >= MARRIAGE.maxChildren) return false;
  if (!childrenAllowed(state)) return false;
  return couple.expectingOnDay !== null;
}

/**
 * Ticks until the next child is due, or Infinity.
 *
 * A birth adds a resident, which changes what the kingdom produces, so the
 * clock has to stop exactly on it — the same reasoning as arrivals and
 * level-ups. Cheap: one pass over couples, and there are never many.
 */
export function ticksToNextBirth(state) {
  if (!childrenAllowed(state)) return Infinity;

  // A birth with no room under the parents' roof WAITS, and a waiting birth
  // must schedule NOTHING. When an earlier version answered "1 tick" here
  // instead, the clock collapsed into single-tick segments and a seven-day
  // catch-up took 34 seconds with entirely correct output. Infinity, never a
  // small number.
  const anyRoom = state.couples.some((couple) => {
    const mother = state.residents.find((person) => person.id === couple.a);
    return expecting(state, couple) && roomForChild(state, mother?.home ?? null);
  });
  if (!anyRoom) return Infinity;

  const today = dayNumber(state);
  let soonest = Infinity;
  for (const couple of state.couples) {
    if (!expecting(state, couple)) continue;
    const daysAway = couple.expectingOnDay - today;
    const ticks = daysAway * DAY.ticksPerDay
      - (state.time.totalTicks % DAY.ticksPerDay);
    soonest = Math.min(soonest, Math.max(1, ticks));
  }
  return soonest;
}

/**
 * What a child of these two is like.
 *
 * Their trade comes from one of the parents — deterministically, seeded by the
 * couple and the birth, so it never touches the shared RNG stream and a chunked
 * catch-up produces the same child as a live run.
 *
 * Their heritage is the better parent's, raised again. That is the "stronger
 * second generation" the research describes, and it compounds down the line
 * until it hits the ceiling.
 */
export function childOf(state, couple, mother, father) {
  const rng = createRng(deriveSeed(
    (couple.id * 0x9e3779b1) ^ (couple.children + 1), SEED_SALT.RECRUITS
  ));

  const professionId = rng.next() < 0.5 ? mother.professionId : father.professionId;
  const heritage = Math.min(
    MARRIAGE.maxHeritage,
    Math.max(mother.heritage ?? 1, father.heritage ?? 1) * MARRIAGE.generationBonus
  );

  const child = makeResident(state, {
    name: freeName(state, rng.pick(CHILD_NAMES)),
    professionId,
    level: 1,
  });
  child.heritage = heritage;
  child.baseStats = baseStatsFor(professionId, 1, heritage);
  child.parents = [mother.id, father.id];
  return child;
}

const CHILD_NAMES = [
  'Ari', 'Bede', 'Cael', 'Delle', 'Enna', 'Fyn', 'Gale', 'Hesper',
  'Ivo', 'Juno', 'Kit', 'Linnet', 'Merrow', 'Nix', 'Ove', 'Pell',
  'Rune', 'Sorrel', 'Tam', 'Vesper', 'Wren', 'Yarrow',
];

/**
 * Bring in any child that is due.
 *
 * A CHILD IS BORN INTO ITS PARENTS' HOME, and does not need a bed of its own.
 *
 * The first version made a newborn queue for a spare bed like an immigrant off
 * the boat, and the balance run showed what that costs: a kingdom's housing is
 * exactly consumed by arrivals, so free beds sat at zero forever and two
 * couples went thousands of days overdue with nowhere to put a baby. Reserving
 * a bed did not help either — you cannot reserve one that does not exist.
 *
 * Babies live with their families. It is obvious, it is what the real game
 * means by a family home, and it removes the deadlock completely. A couple has
 * at most three children, so a house can never fill up without bound.
 */
export function resolveBirths(state, report) {
  if (!childrenAllowed(state)) return;
  const today = dayNumber(state);

  for (const couple of state.couples) {
    if (!expecting(state, couple)) continue;
    if (today < couple.expectingOnDay) continue;

    const mother = state.residents.find((person) => person.id === couple.a);
    const father = state.residents.find((person) => person.id === couple.b);
    if (!mother || !father) continue;

    // Their parents' roof, if it stretches to one more. Never a bed elsewhere:
    // a newborn does not queue at the docks behind immigrants.
    const roof = mother.home ?? father.home ?? null;
    if (!roomForChild(state, roof)) continue;

    const child = childOf(state, couple, mother, father);
    child.home = roof;
    state.residents.push(child);

    couple.children += 1;
    couple.expectingOnDay = couple.children >= MARRIAGE.maxChildren
      ? null
      : today + MARRIAGE.gestationDays;

    report.births.push({
      id: child.id,
      name: child.name,
      professionId: child.professionId,
      heritage: child.heritage,
      parents: [mother.name, father.name],
    });
  }
}

/** Every couple, with who they are and what they are waiting for. */
export function couples(state) {
  return state.couples.map((couple) => ({
    couple,
    a: state.residents.find((person) => person.id === couple.a) ?? null,
    b: state.residents.find((person) => person.id === couple.b) ?? null,
    expecting: expecting(state, couple),
    daysAway: couple.expectingOnDay === null
      ? null
      : Math.max(0, couple.expectingOnDay - dayNumber(state)),
  }));
}

export { MARRIAGE };
