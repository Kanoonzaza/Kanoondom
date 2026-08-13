// Raids, expeditions and caves.
//
// THE PROMISE THIS FILE EXISTS TO KEEP: a raid never fires while the player is
// away. Not a reduced raid, not a raid with a warning — none at all.
//
// The reasoning is the whole reason this game was built. Somebody who plays in
// bursts must be able to close the tab without wondering what it will cost
// them. If absence could destroy what you built, every session would begin
// with damage control, and "come back whenever you like" would be a lie.
//
// So:
//   * Threat still gathers while you are gone — the nests do not wait — but it
//     is held under a lower ceiling than live play allows.
//   * Nothing resolves. Catch-up records a WARNING, never a raid.
//   * On return there is a grace period before anything may attack, so you are
//     never ambushed by the act of opening the page.
//
// Everything random in here happens only during live play or as a direct
// player action, so offline catch-up consumes none of the RNG stream and
// chunk-independence is untouched.

import { THREAT, RAID, NESTS, CAVE, caveTierFor } from '../content/monsters.js';
import { DAY } from '../content/config.js';
import { createRng } from './rng.js';
import { isFullMoon, dayPeriod, dayNumber } from '../state.js';
import {
  activeNests, monsterStrength, threatRate, distanceToKingdom, highestTierCleared,
} from './monsters.js';
import {
  defendersOf, musterStrength, bandStrength, resolveBattle, raidTargets,
} from './combat.js';
import { facilityDef } from '../content/facilities.js';
import { tileX, tileY } from './world.js';

// ---------------------------------------------------------------------------
// Threat over time
// ---------------------------------------------------------------------------

/**
 * Add the threat a span of time gathered.
 *
 * Called once per segment with a constant rate, exactly like production — and
 * capped, so that however long somebody is away the kingdom is never facing an
 * unwinnable pile of it on return.
 */
export function accrueThreat(state, ticks, report, offline) {
  const rate = threatRate(state);
  if (rate <= 0) return;

  const ceiling = offline ? THREAT.offlineCeiling : THREAT.ceiling;
  const before = state.threat ?? 0;
  if (before >= ceiling) return;

  state.threat = Math.min(ceiling, before + rate * ticks);
  report.threatGained = (report.threatGained ?? 0) + (state.threat - before);
}

/** Are the monsters allowed to attack at this moment? */
export function raidsPermitted(state, offline) {
  if (offline) return false;
  if ((state.threat ?? 0) < THREAT.raidThreshold) return false;
  // Never the instant somebody comes back to the page.
  return state.time.totalTicks >= (state.graceUntilTick ?? 0);
}

/** Start the quiet period that follows an absence. */
export function grantGrace(state) {
  state.graceUntilTick = state.time.totalTicks + THREAT.graceTicks;
}

export function graceRemaining(state) {
  return Math.max(0, (state.graceUntilTick ?? 0) - state.time.totalTicks);
}

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

/** How likely a raid is right now, per tick. Zero unless it is permitted. */
export function raidChance(state, offline) {
  if (!raidsPermitted(state, offline)) return 0;

  const period = dayPeriod(state);
  let chance = THREAT.baseRaidChance * ((state.threat ?? 0) / THREAT.raidThreshold);

  // Monsters are bolder in the dark, and worse under a full moon (research).
  if (period.id === 'night') chance *= THREAT.nightMultiplier;
  if (isFullMoon(state)) chance *= THREAT.fullMoonMultiplier;
  else if (period.id !== 'night') chance *= 0.25;

  return Math.min(0.5, chance);
}

/** The band that comes for you, drawn from whatever nests are closest. */
export function raidBand(state, rng) {
  const nests = activeNests(state)
    .filter((nest) => distanceToKingdom(state, nest) <= NESTS.threatReach)
    .sort((a, b) => distanceToKingdom(state, a) - distanceToKingdom(state, b));
  if (nests.length === 0) return [];

  const size = Math.max(
    RAID.minBand,
    Math.min(RAID.maxBand, Math.round(((state.threat ?? 0) / 100) * RAID.bandPer100))
  );

  // DIFFICULTY FOLLOWS THE PLAYER, which the research is explicit about: the
  // level of what you meet tracks your own progress, not the map's. Without
  // this, the nests near home stay tier 1 for ever, and a kingdom with three
  // knights can never lose a raid again — measured, not guessed: 0 losses in
  // 20 across every seed. Raids that cannot be lost are decoration, and they
  // take the point out of every watchtower in the game.
  const reach = highestTierCleared(state);
  const band = [];
  for (let i = 0; i < size; i++) {
    const nest = nests[Math.min(nests.length - 1, Math.floor(rng.next() * nests.length))];
    band.push(monsterStrength(nest.speciesId, Math.max(nest.tier, reach)));
  }
  return band;
}

/**
 * Fight off (or fail to fight off) a raid.
 *
 * Losing costs FACILITIES, never people. A resident who is beaten is hurt and
 * goes home; the real game would spend a lifespan point and eventually delete
 * them, and we deliberately do not (see docs/specs/v2-design.md §2.2). Losing a
 * granary is a setback you can rebuild; losing the knight you spent an hour
 * housing beside a training yard is a reason to stop playing.
 */
export function resolveRaid(state, report) {
  const rng = createRng(state.rngState);
  const band = raidBand(state, rng);
  if (band.length === 0) {
    state.rngState = rng.getState();
    return null;
  }

  const hall = state.townHalls[0];
  const defenders = defendersOf(state, hall.x, hall.y);
  const outcome = resolveBattle(state, {
    ours: musterStrength(defenders),
    theirs: bandStrength(band),
    rng,
    label: 'The raid',
  });

  const wrecked = [];
  if (!outcome.won) {
    // They get through, and they hit what stands nearest the hall.
    const howMany = outcome.margin < 0.5 ? 2 : 1;
    for (const target of raidTargets(state, RAID.targets).slice(0, howMany)) {
      state.world.facilities[target.origin].damaged = true;
      wrecked.push({
        origin: target.origin,
        facilityId: target.facility.id,
        name: facilityDef(target.facility.id).name,
        x: target.x,
        y: target.y,
      });
    }
  }

  state.threat = Math.max(0, (state.threat ?? 0) * (1 - THREAT.spendOnRaid));
  state.stats.raidsSuffered += 1;
  state.rngState = rng.getState();

  const raid = {
    tick: state.time.totalTicks,
    won: outcome.won,
    margin: outcome.margin,
    lines: outcome.lines,
    band: band.map((monster) => ({ name: monster.name, icon: monster.icon })),
    defenders: defenders.length,
    wrecked,
    fullMoon: isFullMoon(state),
  };
  report.raids.push(raid);
  return raid;
}

/**
 * The clock's hook. Called once per segment.
 *
 * Note the shape: threat accrues ALWAYS, raids resolve only when live. That
 * single asymmetry is the entire offline promise, and it is one branch.
 */
export function stepThreat(state, ticks, report, offline) {
  accrueThreat(state, ticks, report, offline);

  if (offline) {
    if ((state.threat ?? 0) >= THREAT.raidThreshold && report.raidWarnings.length === 0) {
      report.raidWarnings.push({
        threat: state.threat,
        note: 'They gathered while you were away. Nothing attacked.',
      });
    }
    return;
  }

  const chance = raidChance(state, offline);
  if (chance <= 0) return;

  // One roll per segment, scaled by its length, so a long live segment is no
  // safer than the same span in short ones.
  const rng = createRng(state.rngState);
  const roll = rng.next();
  state.rngState = rng.getState();
  if (roll < 1 - Math.pow(1 - chance, ticks)) resolveRaid(state, report);
}

// ---------------------------------------------------------------------------
// Expeditions — going out and dealing with a nest
// ---------------------------------------------------------------------------

/** Who would go, and what the odds look like, without committing to anything. */
export function expeditionForecast(state, nest) {
  const defenders = defendersOf(state, nest.x, nest.y, 999);
  const ours = musterStrength(defenders);

  const band = [];
  const size = Math.max(2, Math.round(2 + nest.tier * 1.5));
  for (let i = 0; i < size; i++) band.push(monsterStrength(nest.speciesId, nest.tier));

  const theirs = bandStrength(band);
  return { defenders, ours, theirs, band };
}

export function canRaidNest(state, nest) {
  if (!nest) return { ok: false, reason: 'No such nest' };
  const fighters = state.residents.filter((r) => r.home !== null);
  if (fighters.length === 0) {
    return { ok: false, reason: 'You have nobody to send' };
  }
  return { ok: true, reason: null };
}

/**
 * Send everyone at a nest.
 *
 * A player action, so it may use the shared RNG stream freely — offline
 * catch-up never runs one and therefore never consumes it.
 */
export function clearNest(state, nest) {
  const check = canRaidNest(state, nest);
  if (!check.ok) return check;

  const rng = createRng(state.rngState);
  const forecast = expeditionForecast(state, nest);
  const outcome = resolveBattle(state, {
    ours: forecast.ours,
    theirs: forecast.theirs,
    rng,
    label: 'The nest',
  });

  const result = {
    ok: true,
    reason: null,
    won: outcome.won,
    margin: outcome.margin,
    lines: outcome.lines,
    nest,
    reward: {},
  };

  if (outcome.won) {
    state.world.nestsCleared[nest.index] = 1;
    state.stats.nestsCleared += 1;
    state.stats.highestTierCleared = Math.max(highestTierCleared(state), nest.tier);

    // Clearing a nest is worth doing for its own sake, not only for the quiet.
    const reward = {
      copper: Math.round(120 * nest.tier * rng.float(0.8, 1.3)),
      ore: Math.round(40 * nest.tier * rng.float(0.7, 1.4)),
    };
    if (rng.next() < 0.35) reward.sample = 1;
    if (rng.next() < 0.5) reward.tome = 1 + Math.floor(nest.tier / 2);

    for (const [id, amount] of Object.entries(reward)) {
      state.resources[id] = (state.resources[id] ?? 0) + amount;
    }
    result.reward = reward;

    // The pressure it was putting on the town goes with it.
    state.threat = Math.max(0, (state.threat ?? 0) - THREAT.raidThreshold * 0.3);
  }

  state.rngState = rng.getState();
  return result;
}

// ---------------------------------------------------------------------------
// Caves
// ---------------------------------------------------------------------------
//
// "Caves appear on the night of a full moon" and cost Energy to enter. Energy
// is the one resource that regrows on its own and is spent nowhere else, which
// gives caves a rhythm the player cannot hurry — and a reason to come back on
// a particular night rather than merely often.

/** The moon that opened the cave currently standing, or null. */
export function openCave(state) {
  const day = dayNumber(state);
  const moonDay = Math.floor(day / DAY.daysPerMoon) * DAY.daysPerMoon;
  if (day - moonDay >= CAVE.openDays) return null;
  if (state.caves?.enteredMoon === moonDay) return null;

  return {
    moonDay,
    tier: caveTierFor(highestTierCleared(state)),
    closesInDays: CAVE.openDays - (day - moonDay),
  };
}

export function canEnterCave(state) {
  const cave = openCave(state);
  if (!cave) return { ok: false, reason: 'No cave stands open. Wait for the full moon.' };
  if (state.resources.energy < CAVE.energyCost) {
    return { ok: false, reason: `Needs ${CAVE.energyCost} energy`, cave };
  }
  if (state.residents.length === 0) return { ok: false, reason: 'You have nobody to send', cave };
  return { ok: true, reason: null, cave };
}

export function enterCave(state) {
  const check = canEnterCave(state);
  if (!check.ok) return check;

  const cave = check.cave;
  state.resources.energy -= CAVE.energyCost;

  const rng = createRng(state.rngState);
  const hall = state.townHalls[0];
  const defenders = defendersOf(state, hall.x, hall.y, 999);

  const band = [];
  const size = 3 + cave.tier;
  const speciesPool = activeNests(state).map((nest) => nest.speciesId);
  for (let i = 0; i < size; i++) {
    const speciesId = speciesPool.length > 0
      ? speciesPool[Math.floor(rng.next() * speciesPool.length)]
      : 'slime';
    band.push(monsterStrength(speciesId, cave.tier));
  }

  const outcome = resolveBattle(state, {
    ours: musterStrength(defenders),
    theirs: bandStrength(band),
    rng,
    label: 'The cave',
  });

  const reward = { ...CAVE.consolation };
  if (outcome.won) {
    for (const [id, per] of Object.entries(CAVE.rewardPerTier)) {
      reward[id] = (reward[id] ?? 0) + Math.round(per * cave.tier * rng.float(0.8, 1.25));
    }
  }
  for (const [id, amount] of Object.entries(reward)) {
    state.resources[id] = (state.resources[id] ?? 0) + amount;
  }

  state.caves.enteredMoon = cave.moonDay;
  state.caves.visits += 1;
  state.rngState = rng.getState();

  return {
    ok: true, reason: null,
    won: outcome.won,
    lines: outcome.lines,
    reward,
    tier: cave.tier,
    band: band.map((monster) => ({ name: monster.name, icon: monster.icon })),
  };
}

export { THREAT, CAVE, RAID };
