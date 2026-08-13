// Combat.
//
// The real game resolves fights automatically — everyone nearby simply joins
// in — and never publishes its damage formula. So we design our own, and the
// design goal is not realism but LEGIBILITY: every term that decided the fight
// is written down and shown to the player afterwards.
//
// That is v1's best idea and it survives intact here. A player who loses a
// battle should close the panel knowing exactly which number was too small,
// and therefore what to build or who to house differently.
//
// Nothing in here reads the clock or touches the DOM. It takes a seeded RNG so
// the same fight always resolves the same way.

import { professionDef } from '../content/professions.js';
import { statsOf } from './residents.js';
import { tileX, tileY } from './world.js';
import { RAID } from '../content/monsters.js';
import { facilityDef } from '../content/facilities.js';

/** How much of an attack a point of guard turns aside. */
const GUARD_SOFTENING = 0.55;
/** Being faster is worth this much, at most. */
const FIRST_STRIKE = 0.25;
/** A critical blow is worth this much on top. */
const CRIT_BONUS = 0.45;
/** Luck to crit chance. */
const LUCK_TO_CRIT = 0.012;

/**
 * Everyone who turns out to defend a place.
 *
 * Fighters do the fighting, but anyone living close enough lends a hand — the
 * research is explicit that whoever is present joins in. Distance is measured
 * from the resident's HOME, which is what makes where you house your knights a
 * real decision rather than a cosmetic one.
 */
export function defendersOf(state, x, y, radius = 18) {
  const found = [];
  for (const resident of state.residents) {
    if (resident.home === null) continue;
    const distance = Math.hypot(tileX(resident.home) - x, tileY(resident.home) - y);
    if (distance > radius) continue;

    const profession = professionDef(resident.professionId);
    const stats = statsOf(state, resident);
    found.push({
      resident,
      profession,
      stats,
      distance,
      // A blacksmith will pick up a hammer, but she is not a knight.
      commitment: profession.fighter ? 1 : 0.35,
    });
  }
  return found.sort((a, b) => b.commitment - a.commitment || a.distance - b.distance);
}

/** What one side brings, with every contribution itemised. */
export function musterStrength(defenders) {
  let attack = 0;
  let magic = 0;
  let guard = 0;
  let speed = 0;
  let luck = 0;
  let count = 0;

  for (const entry of defenders) {
    const { stats, commitment } = entry;
    attack += stats.atk * commitment;
    // Magic ignores armour and scales with INT (research).
    magic += stats.int * commitment * (entry.profession.id === 'mage' ? 1 : 0.15);
    guard += stats.def * commitment;
    speed += stats.spd * commitment;
    luck += stats.luck * commitment;
    count += commitment;
  }

  return {
    attack, magic, guard, luck, count,
    speed: count > 0 ? speed / count : 0,
  };
}

/** What a band of monsters brings. */
export function bandStrength(band) {
  let attack = 0;
  let magic = 0;
  let guard = 0;
  let speed = 0;

  for (const monster of band) {
    if (monster.magic) magic += monster.power;
    else attack += monster.power;
    guard += monster.guard;
    speed += monster.speed;
  }

  return {
    attack, magic, guard, luck: 0, count: band.length,
    speed: band.length > 0 ? speed / band.length : 0,
  };
}

/**
 * Resolve one fight, showing the work.
 *
 * @returns {{won: boolean, margin: number, lines: Array, ours: object, theirs: object}}
 *   `lines` is the arithmetic in order, ready to be printed straight into a
 *   panel: { label, value, kind }.
 */
export function resolveBattle(state, { ours, theirs, rng, label = 'Battle' }) {
  const lines = [];
  const add = (label, value, kind = '') => lines.push({ label, value, kind });

  // --- our side ---
  add(`${label}: our people`, `${Math.round(ours.count)} turned out`);
  add('Attack', `+${Math.round(ours.attack)}`, 'pos');

  const softened = ours.attack * (1 - Math.min(0.8, theirs.guard * GUARD_SOFTENING / Math.max(1, ours.attack)));
  const turnedAside = ours.attack - softened;
  if (turnedAside > 0.5) add('Turned aside by their hides', `-${Math.round(turnedAside)}`, 'neg');

  if (ours.magic > 0.5) add('Magic, which ignores armour', `+${Math.round(ours.magic)}`, 'pos');
  let ourPower = softened + ours.magic;

  // Speed decides who lands the first blow (research: SPD sets turn order).
  const faster = ours.speed >= theirs.speed;
  const speedEdge = 1 + FIRST_STRIKE * Math.min(1, Math.abs(ours.speed - theirs.speed) / Math.max(1, theirs.speed));
  if (faster && speedEdge > 1.01) {
    add('We struck first', `x${speedEdge.toFixed(2)}`, 'pos');
    ourPower *= speedEdge;
  }

  // Luck drives criticals, and criticals ignore armour (research).
  const critChance = Math.min(0.6, ours.luck * LUCK_TO_CRIT);
  if (critChance > 0.01 && rng.next() < critChance) {
    add('A lucky blow found the gap', `x${(1 + CRIT_BONUS).toFixed(2)}`, 'pos');
    ourPower *= 1 + CRIT_BONUS;
  }

  // --- their side ---
  add(`${label}: against`, `${theirs.count} of them`);
  add('Their attack', `+${Math.round(theirs.attack + theirs.magic)}`, 'neg');

  const theirSoftened = theirs.attack * (1 - Math.min(0.8, ours.guard * GUARD_SOFTENING / Math.max(1, theirs.attack)));
  const weTurnedAside = theirs.attack - theirSoftened;
  if (weTurnedAside > 0.5) add('Turned aside by our armour and walls', `-${Math.round(weTurnedAside)}`, 'pos');

  let theirPower = theirSoftened + theirs.magic;
  if (!faster && speedEdge > 1.01) {
    add('They struck first', `x${speedEdge.toFixed(2)}`, 'neg');
    theirPower *= speedEdge;
  }

  // A shred of chance, so a fight is never a foregone conclusion.
  const swing = rng.float(0.92, 1.08);
  ourPower *= swing;

  const won = ourPower >= theirPower;
  const margin = theirPower > 0 ? ourPower / theirPower : Infinity;

  add('Our strength', Math.round(ourPower), won ? 'pos' : '');
  add('Their strength', Math.round(theirPower), won ? '' : 'neg');
  add(won ? 'We held' : 'We were driven back', margin >= 1 ? `x${margin.toFixed(2)}` : `x${margin.toFixed(2)}`, won ? 'pos' : 'neg');

  return { won, margin, lines, ourPower, theirPower };
}

/**
 * What a raid wrecks: whatever stands nearest a town hall.
 *
 * Straight from the research — attacks target the facilities closest to the
 * town centres — which quietly turns "where do I put things?" into a defensive
 * decision instead of a tidiness one.
 */
export function raidTargets(state, count = RAID.targets) {
  const hall = state.townHalls[0];
  return allFacilitiesByDistance(state, hall)
    .filter((entry) => !entry.def.isTownHall && !entry.facility.damaged)
    .slice(0, count);
}

function allFacilitiesByDistance(state, hall) {
  const entries = [];
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const index = Number(origin);
    const x = tileX(index);
    const y = tileY(index);
    entries.push({
      origin: index, facility, x, y,
      def: facilityDef(facility.id),
      distance: Math.hypot(x - hall.x, y - hall.y),
    });
  }
  return entries.sort((a, b) => a.distance - b.distance);
}
