// Headless balance run.
//
//   node tools/balance.js [--quiet] [--seeds 5]
//
// Unit tests prove the RULES behave. They cannot tell you whether the game is
// still worth playing after a week, because that only shows up when hours of
// play are simulated end to end. In v1 this script caught two bugs nothing
// else would have: an economy that bankrupted a two-day absence, and raids
// arriving every eight minutes against a kingdom with no way to defend itself.
//
// It checks two things:
//
//   1. THE PROMISE. No absence — eight hours, a day, a week — ever leaves the
//      player with less than they had. Nothing drains, ever.
//
//   2. THE PACE. A kingdom played sensibly actually gets somewhere: rank 3, a
//      second town hall, and the near country open, in a sane span of play.
//      This is the check that would have caught the locked map by itself.
//
// The bot below is deliberately an ORDINARY player, not an optimal one. If the
// game only works for someone playing perfectly, it does not work.

import { newGame, dayNumber } from '../src/state.js';
import { advanceTicks } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import {
  clearTerritoryFog, peaceLevel, unlockedRing, clearedTileCount,
} from '../src/sim/world.js';
import { place, canPlace, palette, stockOf, countPlaced } from '../src/sim/facilities.js';
import { FACILITIES } from '../src/content/facilities.js';
import { storageCapacity } from '../src/sim/economy.js';
import { freeBeds } from '../src/sim/residents.js';
import {
  townRank, canPromote, promote, researchList, startResearch, checkMapRewards,
  developmentPoints, promotionRequirement,
} from '../src/sim/research.js';
import { canSurvey, runSurvey, surveyOffice } from '../src/sim/survey.js';
import {
  smithy, forgeable, canForge, forge, autoEquip, allItems, itemsAwaitingForge,
  raiseAll, equippedItems,
} from '../src/sim/equipment.js';
import { skillList, learn } from '../src/sim/skills.js';
import {
  waitingEggs, incubating, incubatorFor, canIncubate, incubate, canFeed, feed,
  bandOf, nextBandAt, dominantCategory, alliesOf,
} from '../src/sim/creatures.js';
import { clearNest, graceRemaining, expeditionForecast } from '../src/sim/raids.js';
import { knownNests, activeNests, threatRate, wardStrength } from '../src/sim/monsters.js';
import { THREAT } from '../src/content/monsters.js';
import { RESOURCE_IDS, RESOURCES } from '../src/content/resources.js';
import { TICKS_PER_SEASON, DAY } from '../src/content/config.js';

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const TRACE = args.includes('--trace');
const SEEDS = Number(args[args.indexOf('--seeds') + 1]) || 3;

const failures = [];
const log = (...parts) => { if (!QUIET) console.log(...parts); };

function check(ok, label, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
}

/**
 * An observation that is worth printing but must not fail the run.
 *
 * A build that is expected to be red teaches you to ignore it, so anything
 * known and accepted goes here with the reason why, and graduates to `check`
 * when the milestone that fixes it lands.
 */
function note(ok, label, detail = '') {
  log(`  ${ok ? 'ok  ' : 'NOTE'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
}

const hours = (n) => n * 60 * 60;

// ---------------------------------------------------------------------------
// The bot: what an ordinary player does with a spare minute
// ---------------------------------------------------------------------------

/** Somewhere this facility will fit, searching outward from the capital. */
function findSpot(state, facilityId) {
  for (const hall of state.townHalls) {
    for (let radius = 2; radius <= 16; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = hall.x + dx;
          const y = hall.y + dy;
          if (canPlace(state, x, y, facilityId).ok) return { x, y };
        }
      }
    }
  }
  return null;
}

function tryBuild(state, facilityId) {
  if (stockOf(state, facilityId) <= 0) return false;
  const spot = findSpot(state, facilityId);
  if (!spot) return false;
  const result = place(state, spot.x, spot.y, facilityId);
  if (result.ok && result.revealed > 0) checkMapRewards(state);
  return result.ok;
}

/** A store that is close to full is a store that wastes an absence. */
function fullestStore(state) {
  const caps = storageCapacity(state);
  let worst = null;
  for (const id of RESOURCE_IDS) {
    const share = state.resources[id] / caps[id];
    if (!worst || share > worst.share) worst = { id, share };
  }
  return worst;
}

/**
 * Which study to take next.
 *
 * Ordinary priorities, not optimal ones: learn to survey, earn the charter
 * that opens the map, then take whatever is cheapest and available.
 */
const STUDY_PREFERENCE = [
  'surveying', 'carpentry', 'civic_planning', 'royal_charter',
  'warehousing', 'husbandry', 'masonry',
];

function pickStudy(state) {
  const ready = researchList(state).filter((entry) => entry.status === 'ready');
  if (ready.length === 0) return null;
  for (const wanted of STUDY_PREFERENCE) {
    const match = ready.find((entry) => entry.def.id === wanted);
    if (match) return match.def.id;
  }
  return ready.sort((a, b) => a.def.study - b.def.study)[0].def.id;
}

/** One round of player attention. */
function takeTurn(state) {
  // Keep something being studied at all times — it costs nothing to have one
  // running, and it carries on while away.
  if (!state.research.active) {
    const study = pickStudy(state);
    if (study) startResearch(state, study);
  }

  // Rank is what opens new studies, so take it whenever it is offered.
  for (let index = 0; index < state.townHalls.length; index++) {
    if (canPromote(state, index).ok) promote(state, index);
  }

  // Build anything a study has just handed over. A real player builds the thing
  // they waited for.
  //
  // This was a NAMED LIST three times, and was forgotten three times — the
  // Surveyor's Office, then the Master Smithy, then both incubators, each
  // sitting unbuilt in the bot's pocket while the run reported the feature as
  // dead. A list that has to be appended to for every new facility will be,
  // eventually, not appended to. So: build one of anything research handed over
  // that is not standing yet, whatever it turns out to be.
  for (const def of Object.values(FACILITIES)) {
    if (!def.locked) continue;
    if (stockOf(state, def.id) <= 0) continue;
    if (countPlaced(state, def.id) > 0) continue;
    tryBuild(state, def.id);
  }

  // Surveys, whenever they are affordable. Land is the bottleneck.
  if (canSurvey(state).ok) runSurvey(state);

  // Deal with the nests you can see, nearest first, but only when the odds
  // look survivable — an ordinary player does not march on a Drago with two
  // farmers.
  for (const nest of knownNests(state)) {
    const forecast = expeditionForecast(state, nest);
    const ours = forecast.ours.attack + forecast.ours.magic;
    const theirs = forecast.theirs.attack + forecast.theirs.magic;
    if (ours > theirs * 1.2) { clearNest(state, nest); break; }
  }

  // Something to hold the dark back, if threat is building.
  if ((state.threat ?? 0) > THREAT.raidThreshold * 0.4) {
    for (const id of ['watchtower', 'torch']) {
      if (stockOf(state, id) > 0 && tryBuild(state, id)) break;
    }
  }

  // Found a second town hall the moment a charter allows it. Far enough out
  // that the two do not waste each other's reach.
  if (stockOf(state, 'town_hall') > 0) tryBuild(state, 'town_hall');

  // Housing, so people keep arriving.
  if (freeBeds(state) <= 0) {
    for (const id of ['plot_m', 'plot_s', 'plot_l']) {
      if (tryBuild(state, id)) break;
    }
  }

  // Storage, when something is close to spilling.
  const fullest = fullestStore(state);
  if (fullest && fullest.share > 0.8) {
    for (const id of ['granary', 'lumber_yard', 'ore_store', 'treasury']) {
      if (tryBuild(state, id)) break;
    }
  }

  // Otherwise, more production and the odd cheap building.
  for (const id of ['field', 'plantation', 'ranch', 'ore_mine', 'market_stall', 'well', 'path']) {
    const entry = palette(state).find((p) => p.def.id === id);
    if (entry?.affordable && entry.stock > 0) {
      if (tryBuild(state, id)) break;
    }
  }

  tendTheForge(state);
  spendCopperOnSkills(state);
  raiseTheEggs(state);
}

/**
 * Put eggs somewhere warm and feed them to High WITHOUT tipping into Over.
 *
 * An ordinary player aims at the window rather than pushing the slider to the
 * end, and the screen tells them where the edge is — so the bot stops one band
 * short of the trap, which is the behaviour the design is asking for.
 */
function raiseTheEggs(state) {
  for (const egg of waitingEggs(state)) {
    for (const role of ['stable', 'room']) {
      if (canIncubate(state, egg.id, role).ok) { incubate(state, egg.id, role); break; }
    }
  }

  for (const egg of incubating(state)) {
    const band = bandOf(egg);
    if (band.id === 'high' || band.id === 'over') continue;

    // Feed the category it already leans towards, and stop before Over.
    const category = dominantCategory(egg);
    const next = nextBandAt(egg);
    if (next && next.band.id === 'over') continue;
    if (canFeed(state, egg.id, category).ok) feed(state, egg.id, category);
  }
}

/**
 * Forge what can be forged, hand it out, and claim the levels that experience
 * has already paid for. An ordinary player visits the forge; they do not
 * optimise it.
 */
function tendTheForge(state) {
  if (!smithy(state)) return;

  // One of each pattern is enough to dress the town before hoarding duplicates.
  for (const def of forgeable(state)) {
    const owned = allItems(state).filter((item) => item.defId === def.id).length;
    if (owned >= state.residents.length + 1) continue;
    if (canForge(state, def.id).ok) { forge(state, def.id); break; }
  }

  for (const resident of state.residents) autoEquip(state, resident);

  // Claim what is waiting, cheapest first — which is also the best value, since
  // an F-rank costs three bronze a level and grows for ever.
  for (const entry of itemsAwaitingForge(state).slice(0, 4)) {
    raiseAll(state, entry.item.id);
  }
}

/** Skills are what copper is FOR, so an ordinary player buys them. */
function spendCopperOnSkills(state) {
  for (const resident of state.residents) {
    const affordable = skillList(state, resident)
      .filter((entry) => entry.status === 'ready')
      .sort((a, b) => a.def.cost - b.def.cost);
    if (affordable.length === 0) continue;
    // Leave a working float rather than spending the treasury to zero.
    if (state.resources.copper < affordable[0].def.cost * 3) continue;
    learn(state, resident, affordable[0].def.id);
  }
}

// ---------------------------------------------------------------------------
// Run 1 — the promise: no absence ever leaves you poorer
// ---------------------------------------------------------------------------

function runPromise(seed) {
  log(`\nTHE PROMISE — seed ${seed}`);
  const state = newGame(seed, { now: 0 });
  state.stats.tilesCleared += clearTerritoryFog(state);

  // Play a little first, so there is something to lose.
  for (let i = 0; i < 20; i++) {
    takeTurn(state);
    advanceTicks(state, 120);
  }

  let now = 1_000_000;
  for (const [label, away] of [['8 hours', hours(8)], ['24 hours', hours(24)], ['7 days', hours(24 * 7)]]) {
    const before = { ...state.resources };
    const calendarBefore = state.time.calendarTicks;
    const peopleBefore = state.residents.length;
    const knownBefore = state.research.completed.length;

    state.lastSaveTime = now;
    now += away * 1000;
    const welcome = catchUp(state, now);

    const damagedBefore = Object.values(state.world.facilities).filter((f) => f.damaged).length;
    const poorer = RESOURCE_IDS.filter((id) => state.resources[id] < before[id] - 1e-9);
    check(
      poorer.length === 0,
      `${label} away leaves nothing poorer`,
      poorer.map((id) => `${RESOURCES[id].name} ${before[id].toFixed(1)} -> ${state.resources[id].toFixed(1)}`).join(', ')
    );
    check(
      state.time.calendarTicks === calendarBefore,
      `${label} away does not age the calendar`,
      `${calendarBefore} -> ${state.time.calendarTicks}`
    );
    check(state.residents.length >= peopleBefore, `${label} away loses nobody`);
    check(
      state.research.completed.length >= knownBefore,
      `${label} away un-learns nothing`
    );
    check((welcome?.raids ?? []).length === 0, `${label} away suffers no raids`);
    check(
      Object.values(state.world.facilities).filter((f) => f.damaged).length === damagedBefore,
      `${label} away wrecks nothing`
    );
    check(graceRemaining(state) > 0, `${label} away is followed by a period of quiet`);
    log(`        threat now ${Math.round(state.threat ?? 0)}`
      + ` (offline ceiling ${THREAT.offlineCeiling})`);

    const gained = RESOURCE_IDS
      .filter((id) => (welcome?.gained[id] ?? 0) >= 1)
      .map((id) => `${RESOURCES[id].name} +${Math.round(welcome.gained[id])}`);
    log(`        gained: ${gained.join(', ') || 'nothing'}`);

    const spilled = Object.keys(welcome?.wasted ?? {}).filter((id) => welcome.wasted[id] > 1);
    if (spilled.length > 0) {
      log(`        overflowed: ${spilled.map((id) => RESOURCES[id].name).join(', ')} — build more storage`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run 2 — the pace: does a sensible kingdom actually get anywhere?
// ---------------------------------------------------------------------------

/** Play in bursts with time away between, the way this game is meant to be. */
function runPace(seed) {
  log(`\nTHE PACE — seed ${seed}`);
  const state = newGame(seed, { now: 0 });
  state.stats.tilesCleared += clearTerritoryFog(state);

  const reached = {};
  const mark = (key) => {
    if (reached[key] === undefined) {
      reached[key] = { day: dayNumber(state), playMinutes: Math.round(playTicks / 60) };
    }
  };

  let playTicks = 0;
  let now = 1_000_000;

  // Thirty sessions: ten minutes of play, then eight hours away. A month of
  // playing the way somebody actually would.
  for (let session = 0; session < 30; session++) {
    for (let minute = 0; minute < 10; minute++) {
      takeTurn(state);
      advanceTicks(state, 60);
      playTicks += 60;
    }

    if (townRank(state) >= 2) mark('rank 2');
    if (townRank(state) >= 3) mark('rank 3');
    if (state.townHalls.length >= 2) mark('second town hall');
    if (unlockedRing(state) >= 1) mark('the near country opens');

    if (TRACE) {
      const active = state.research.active;
      log(`        s${String(session).padStart(2)}  rank ${townRank(state)}`
        + `  dev ${developmentPoints(state)}/${promotionRequirement(state.townHalls[0].level).development}`
        + `  people ${state.residents.length}  beds ${freeBeds(state)}`
        + `  tiles ${clearedTileCount(state)}  studies ${state.research.completed.length}`
        + `  studying ${active ? `${active.id} ${Math.floor(active.progress)}/${active.total}` : 'nothing'}`
        + `  office ${surveyOffice(state) ? 'built' : stockOf(state, 'surveyor_office') > 0 ? 'in hand' : 'none'}`
        + `  [wood ${Math.round(state.resources.wood)} ore ${Math.round(state.resources.ore)}`
        + ` copper ${Math.round(state.resources.copper)}]`);
    }

    state.lastSaveTime = now;
    now += hours(8) * 1000;
    catchUp(state, now);
  }

  log(`        after ${Math.round(playTicks / 60)} minutes of play across 30 sessions:`);
  log(`        rank ${townRank(state)} · ${state.residents.length} residents · `
    + `${state.townHalls.length} halls · peace ${peaceLevel(state).toFixed(1)}% · `
    + `${clearedTileCount(state)} tiles · ${state.research.completed.length} studies`);
  for (const [key, when] of Object.entries(reached)) {
    log(`        ${key}: ${when.playMinutes} min of play`);
  }

  check(townRank(state) >= 3, 'reaches Town Hall rank 3', `got ${townRank(state)}`);
  check(state.townHalls.length >= 2, 'earns and founds a second town hall',
    `got ${state.townHalls.length}`);
  check(unlockedRing(state) >= 1, 'opens the near country',
    `peace ${peaceLevel(state).toFixed(1)}%, ${state.townHalls.length} halls`);
  check(state.residents.length >= 5, 'attracts a real population',
    `got ${state.residents.length}`);
  check(state.research.completed.length >= 5, 'gets through the early studies',
    `got ${state.research.completed.length}`);

  // The world should outlast a month of casual play. Before surveys had a
  // cooldown, this bot mapped all 9,216 tiles in twenty-three sessions and had
  // nowhere left to go.
  check(
    peaceLevel(state) < 95,
    'has not consumed the whole world already',
    `peace ${peaceLevel(state).toFixed(1)}%`
  );

  log(`        raids suffered ${state.stats.raidsSuffered}`
    + ` · nests cleared ${state.stats.nestsCleared}`
    + ` · ${activeNests(state).length} still standing`
    + ` · threat ${Math.round(state.threat ?? 0)}`
    + ` · wards ${Math.round(wardStrength(state) * 100)}%`);

  // A kingdom that is raided constantly is not a kingdom anybody wants to come
  // back to, and one that is never raided has no reason to build a watchtower.
  check(
    state.stats.raidsSuffered <= 40,
    'is not under constant attack',
    `${state.stats.raidsSuffered} raids in 30 sessions`
  );

  const wrecked = Object.values(state.world.facilities).filter((f) => f.damaged).length;
  check(
    wrecked <= Object.keys(state.world.facilities).length * 0.4,
    'is not left in ruins',
    `${wrecked} of ${Object.keys(state.world.facilities).length} damaged`
  );

  // KNOWN, and not a failure yet: with every study done and every facility
  // placed, there is nothing left to spend on, so the stores simply fill. The
  // sinks that fix this are equipment and skills (V6) and monsters (V5). This
  // becomes a hard check at V10, when there is something to buy.
  const caps = storageCapacity(state);
  const pinned = RESOURCE_IDS.filter((id) => state.resources[id] >= caps[id] - 0.5);
  note(
    pinned.length <= 2,
    'is not left with every store pinned full',
    pinned.length > 2 ? `${pinned.length} of ${RESOURCE_IDS.length} full` : 'none'
  );

  // Copper is the one that matters, because copper is what SKILLS cost, and
  // skills are the permanent sink V6 added for exactly this. A treasury pinned
  // at its cap means earning has stopped meaning anything.
  const skillsBought = state.residents.reduce((sum, r) => sum + (r.skills?.length ?? 0), 0);
  const gearMade = allItems(state).length;
  log(`        ${skillsBought} skills learned · ${gearMade} pieces forged · `
    + `copper ${Math.round(state.resources.copper)} of ${Math.round(caps.copper)} · `
    + `bronze ${Math.round(state.resources.bronze)} of ${Math.round(caps.bronze)}`);
  check(skillsBought > 0, 'spends copper on skills at all', `${skillsBought} learned`);
  check(gearMade > 0, 'forges gear at all', `${gearMade} pieces`);

  const hatched = state.allies.length;
  const eggsHeld = state.eggs.length;
  const stable = incubatorFor(state, 'stable') ? 'stable built' : 'NO STABLE';
  const room = incubatorFor(state, 'room') ? 'room built' : 'no room';
  log(`        ${hatched} monsters hatched · ${eggsHeld} eggs in hand · ${stable} · ${room}`);
  note(hatched > 0, 'hatches something from an egg', `${hatched} hatched, ${eggsHeld} still incubating`);
  for (const egg of state.eggs) {
    if (bandOf(egg).id === 'over') {
      failures.push(`the bot overfed a ${egg.colour} egg — it should stop at the window`);
    }
  }
  // OPEN FINDING, and the diagnosis has moved on. V6 left this pinned because
  // residents never levelled, so skill slots never opened; V7's levelling
  // nearly tripled the spend (32 skills -> 89 across the same run). It is still
  // pinned, so the remaining cause is simpler and duller: late-game copper
  // INCOME outruns every sink the design has, and no amount of one-off
  // purchases catches a rate. That is a tuning problem — sink sizes and income
  // curves — which is exactly what V10 is for, and it is recorded here with
  // the numbers rather than hidden behind a passing check.
  note(
    state.resources.copper < caps.copper - 0.5,
    'has somewhere left to spend its copper',
    `${Math.round(state.resources.copper)} of ${Math.round(caps.copper)} `
    + `— ${skillsBought} skills bought and still capped; income outruns the sinks (V10)`
  );

  return reached;
}

// ---------------------------------------------------------------------------

console.log('Kingdom Sim v2 — balance run');
console.log(`${SEEDS} seeds, ${TICKS_PER_SEASON}s seasons, ${DAY.ticksPerDay}s days\n`);

for (let seed = 1; seed <= SEEDS; seed++) {
  runPromise(seed);
  runPace(seed);
}

console.log(`\n${'-'.repeat(60)}`);
if (failures.length === 0) {
  console.log('All balance checks passed.');
  process.exit(0);
}
console.log(`${failures.length} balance failure${failures.length === 1 ? '' : 's'}:`);
for (const failure of failures) console.log(`  * ${failure}`);
process.exit(1);
