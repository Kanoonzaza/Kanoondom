import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, deserialize, SCHEMA_VERSION } from '../src/state.js';
import {
  makeEgg, eggById, rollColour, eggChance, maybeDropEgg, totalFed,
  dominantCategory, bandFor, bandOf, nextBandAt, feedCost, canFeed, feed,
  creatureFor, incubatorFor, incubatorCapacity, incubating, waitingEggs,
  canIncubate, incubate, ticksToNextHatch, advanceIncubation, resolveHatching,
  alliesOf, allyEntries,
} from '../src/sim/creatures.js';
import { advanceTicks } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import { place, canPlace } from '../src/sim/facilities.js';
import { makeResident } from '../src/sim/residents.js';
import { musterStrength, defendersOf } from '../src/sim/combat.js';
import { productionRates, storageCapacity } from '../src/sim/economy.js';
import { clearTerritoryFog, worldCentre } from '../src/sim/world.js';
import { createRng } from '../src/sim/rng.js';
import {
  EGG_COLOURS, COLOUR_IDS, CREATURES, CREATURE_IDS, CATEGORY_IDS, BANDS,
  HATCHING, FEED_COST, EGG_CATEGORIES,
} from '../src/content/creatures.js';
import { RESEARCH } from '../src/content/research.js';
import { FACILITIES } from '../src/content/facilities.js';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources.js';

const centre = worldCentre();

function kingdom(seed = 31) {
  const state = newGame(seed, { now: 0 });
  state.stats.tilesCleared += clearTerritoryFog(state);
  for (const id of RESOURCE_IDS) state.resources[id] = RESOURCES[id].baseStorage;
  return state;
}

function findSpot(state, facilityId) {
  for (let radius = 2; radius < 16; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = centre.x + dx;
        const y = centre.y + dy;
        if (canPlace(state, x, y, facilityId).ok) return { x, y };
      }
    }
  }
  throw new Error(`nowhere to put a ${facilityId}`);
}

function build(state, facilityId) {
  state.research.unlocked.push(facilityId);
  state.stock[facilityId] = (state.stock[facilityId] ?? 0) + 1;
  const spot = findSpot(state, facilityId);
  const result = place(state, spot.x, spot.y, facilityId);
  assert.equal(result.ok, true, result.reason ?? '');
  const facility = state.world.facilities[result.origin];
  facility.built = true;
  facility.buildTicksRemaining = 0;
  return result.origin;
}

/** Feed an egg `n` times in one category. */
function feedTimes(state, egg, category, n) {
  for (let i = 0; i < n; i++) {
    const result = feed(state, egg.id, category);
    assert.equal(result.ok, true, result.reason ?? '');
  }
}

// ---------------------------------------------------------------------------
// The overfeed trap — the mechanic the whole system is built around
// ---------------------------------------------------------------------------

test('feeding walks an egg up the bands', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'white');
  incubate(state, egg.id, 'stable');

  assert.equal(bandOf(egg).id, 'low');
  feedTimes(state, egg, 'attack', 4);
  assert.equal(bandOf(egg).id, 'medium');
  feedTimes(state, egg, 'attack', 4);
  assert.equal(bandOf(egg).id, 'high');
});

test('OVERFEEDING THROWS IT BACK TO LOW', () => {
  // The single most important rule in this system. Without it, feeding is a
  // slider you push to the end and there is no decision in the whole mechanic.
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'white');
  incubate(state, egg.id, 'stable');

  feedTimes(state, egg, 'attack', 8);
  assert.equal(bandOf(egg).id, 'high');
  const goodOutcome = creatureFor(egg);

  feedTimes(state, egg, 'attack', 6);       // one feed too many, and then some
  assert.equal(bandOf(egg).id, 'over');
  assert.equal(bandOf(egg).quality, 0, 'Over is worth what Low is worth');
  assert.notEqual(creatureFor(egg), goodOutcome, 'and it costs you the good hatch');
});

test('the bands scale with the rank of the egg', () => {
  // Roughly ten items per rank, per the research — so a rank 3 egg wants three
  // times what a rank 1 does, and the window stays meaningful as eggs get rarer.
  assert.equal(bandFor(1, 4).id, 'medium');
  assert.equal(bandFor(3, 4).id, 'low', 'four feeds is nothing to a rank 3 egg');
  assert.equal(bandFor(3, 12).id, 'medium');
});

test('an egg says how far it is from the next band', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'white');
  incubate(state, egg.id, 'stable');
  feedTimes(state, egg, 'attack', 2);

  const next = nextBandAt(egg);
  assert.equal(next.band.id, 'medium');
  assert.equal(next.feedsAway, 2, 'the player must be able to see the window');
});

test('what you feed decides what hatches, not chance', () => {
  const state = kingdom();
  build(state, 'monster_stable');

  const attacker = makeEgg(state, 'white');
  const defender = makeEgg(state, 'white');
  incubate(state, attacker.id, 'stable');
  incubate(state, defender.id, 'stable');

  feedTimes(state, attacker, 'attack', 8);
  feedTimes(state, defender, 'defense', 4);

  assert.equal(creatureFor(attacker), 'alpacavalier');
  assert.equal(creatureFor(defender), 'woolback');
});

test('hatching is a pure function — the same egg always gives the same creature', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'red');
  incubate(state, egg.id, 'stable');
  // A rank 3 egg wants three times the feeds AND three times the material per
  // feed — more ore than a base store even holds. Raising a rare egg is meant
  // to be a project; the storage for it is part of the project.
  state.resources.ore = 99999;
  feedTimes(state, egg, 'attack', 24);

  const first = creatureFor(egg);
  for (let i = 0; i < 20; i++) {
    assert.equal(creatureFor(egg), first, 'no dice at the end of an egg');
  }
});

test('an unfed egg still hatches something', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'rainbow');
  incubate(state, egg.id, 'stable');

  assert.ok(CREATURES[creatureFor(egg)], 'never leave the player with nothing');
});

test('feeding costs the material of its category', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'white');
  incubate(state, egg.id, 'stable');

  const oreBefore = state.resources.ore;
  feed(state, egg.id, 'attack');
  assert.equal(state.resources.ore, oreBefore - FEED_COST.attack * egg.rank);
});

test('an egg cannot be fed before it is incubating', () => {
  const state = kingdom();
  const egg = makeEgg(state, 'white');
  const check = canFeed(state, egg.id, 'attack');
  assert.equal(check.ok, false);
  assert.match(check.reason, /incubate/);
});

// ---------------------------------------------------------------------------
// Stable or room — the fork
// ---------------------------------------------------------------------------

test('an egg needs somewhere to go', () => {
  const state = kingdom();
  const egg = makeEgg(state, 'white');
  const check = canIncubate(state, egg.id, 'stable');
  assert.equal(check.ok, false);
  assert.match(check.reason, /Monster Stable/);
});

test('incubators hold only so many at once', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const capacity = incubatorCapacity(state, 'stable');
  assert.ok(capacity > 0);

  for (let i = 0; i < capacity; i++) {
    const egg = makeEgg(state, 'white');
    assert.equal(incubate(state, egg.id, 'stable').ok, true);
  }
  const spare = makeEgg(state, 'white');
  const check = canIncubate(state, spare.id, 'stable');
  assert.equal(check.ok, false);
  assert.match(check.reason, /full/);
});

test('a better incubator holds more', () => {
  const state = kingdom();
  const origin = build(state, 'monster_stable');
  const before = incubatorCapacity(state, 'stable');
  state.world.facilities[origin].level = 3;
  assert.ok(incubatorCapacity(state, 'stable') > before);
});

test('the same egg becomes a defender or a companion, by where it is raised', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  build(state, 'monster_room');

  const held = makeEgg(state, 'white');
  const sent = makeEgg(state, 'white');
  incubate(state, held.id, 'stable');
  incubate(state, sent.id, 'room');

  advanceTicks(state, HATCHING.ticksPerRank * 2);

  assert.equal(alliesOf(state, 'stable').length, 1);
  assert.equal(alliesOf(state, 'room').length, 1);
});

// ---------------------------------------------------------------------------
// Hatching, and the clock
// ---------------------------------------------------------------------------

test('an egg hatches after its time and leaves the nest', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'white');
  incubate(state, egg.id, 'stable');
  feedTimes(state, egg, 'attack', 8);

  const report = advanceTicks(state, HATCHING.ticksPerRank * egg.rank + 10);

  assert.equal(report.hatched.length, 1);
  assert.equal(report.hatched[0].creatureId, 'alpacavalier');
  assert.equal(state.eggs.length, 0, 'the egg is gone');
  assert.equal(state.allies.length, 1, 'and something is standing there instead');
});

test('an egg hatches while the player is away', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'blue');
  incubate(state, egg.id, 'stable');

  state.lastSaveTime = 0;
  const welcome = catchUp(state, 24 * 60 * 60 * 1000);

  assert.equal(state.allies.length, 1, 'coming back to a hatched creature is the point');
  assert.ok(welcome, 'and it is worth telling them about');
});

test('hatching is identical however the time is chunked', () => {
  const rosters = [];
  for (const chunk of [1, 300, 100000]) {
    const state = kingdom(44);
    build(state, 'monster_stable');
    const egg = makeEgg(state, 'green');
    incubate(state, egg.id, 'stable');
    feedTimes(state, egg, 'defense', 8);

    let done = 0;
    const total = HATCHING.ticksPerRank * 3;
    while (done < total) {
      const step = Math.min(chunk, total - done);
      advanceTicks(state, step);
      done += step;
    }
    rosters.push(state.allies.map((ally) => ally.creatureId).join(','));
  }
  assert.equal(rosters[1], rosters[0]);
  assert.equal(rosters[2], rosters[0]);
});

test('an egg in hand is never lost to an absence', () => {
  const state = kingdom();
  const egg = makeEgg(state, 'purple');

  state.lastSaveTime = 0;
  catchUp(state, 7 * 24 * 60 * 60 * 1000);

  assert.equal(state.eggs.length, 1, 'an unplaced egg simply waits');
  assert.equal(eggById(state, egg.id).colour, 'purple');
});

test('hatching changes no production rate, which is why it needs no segment', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'red');
  incubate(state, egg.id, 'stable');

  const before = productionRates(state);
  advanceTicks(state, HATCHING.ticksPerRank * 4);
  const after = productionRates(state);

  assert.equal(state.allies.length, 1, 'it did hatch');
  for (const id of RESOURCE_IDS) {
    assert.equal(after[id], before[id], `${id} changed — an ally must only fight`);
  }
});

// ---------------------------------------------------------------------------
// Allies in a fight
// ---------------------------------------------------------------------------

test('a stabled monster turns out to defend the town', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const home = build(state, 'plot_s');
  const resident = makeResident(state, { name: 'Bryn', professionId: 'knight', level: 2 });
  resident.home = home;
  state.residents.push(resident);

  const before = musterStrength(defendersOf(state, centre.x, centre.y)).attack;

  state.allies.push({ id: 999, creatureId: 'alpacavalier', role: 'stable', colour: 'white' });
  const withAlly = musterStrength([
    ...defendersOf(state, centre.x, centre.y),
    ...allyEntries(state, 'stable'),
  ]).attack;

  assert.ok(withAlly > before, 'allies are participants, not decoration');
});

test('a companion goes out and a defender stays home', () => {
  const state = kingdom();
  state.allies.push({ id: 1, creatureId: 'greatoak', role: 'stable', colour: 'green' });
  state.allies.push({ id: 2, creatureId: 'flame_dragon', role: 'room', colour: 'red' });

  assert.equal(allyEntries(state, 'stable').length, 1);
  assert.equal(allyEntries(state, 'room')[0].def.id, 'flame_dragon');
});

test('a multi-hit creature hits harder than its raw power suggests', () => {
  const state = kingdom();
  state.allies.push({ id: 1, creatureId: 'flame_dragon', role: 'room', colour: 'red' });
  const entry = allyEntries(state, 'room')[0];

  assert.ok(
    entry.stats.atk > CREATURES.flame_dragon.power * 8,
    'four consecutive attacks should be worth more than one'
  );
});

test('a magic creature ignores armour, like a mage', () => {
  const state = kingdom();
  state.allies.push({ id: 1, creatureId: 'archmagus', role: 'room', colour: 'purple' });
  const entry = allyEntries(state, 'room')[0];

  assert.equal(entry.stats.atk, 0);
  assert.ok(entry.stats.int > 0);
  assert.equal(entry.profession.id, 'mage', 'so muster counts it at full magic');
});

// ---------------------------------------------------------------------------
// Where eggs come from
// ---------------------------------------------------------------------------

test('eggs get likelier the harder the thing you beat', () => {
  assert.ok(eggChance(4) > eggChance(1));
  assert.ok(eggChance(50) <= HATCHING.maxEggChance, 'but never a certainty');
});

test('a colour always comes out of a roll, and rare ones stay rare', () => {
  const rng = createRng(7);
  const counts = {};
  for (let i = 0; i < 4000; i++) {
    const colour = rollColour(rng);
    assert.ok(EGG_COLOURS[colour], 'every roll must name a real colour');
    counts[colour] = (counts[colour] ?? 0) + 1;
  }
  assert.ok((counts.rainbow ?? 0) < (counts.white ?? 0) / 5, 'rainbow must stay a story');
});

test('egg drops are deterministic for a seed', () => {
  const runs = [0, 1].map(() => {
    const state = kingdom(2024);
    const rng = createRng(99);
    return Array.from({ length: 30 }, () => maybeDropEgg(state, rng, 3)?.colour ?? '-').join(',');
  });
  assert.equal(runs[0], runs[1]);
});

// ---------------------------------------------------------------------------
// Content sanity
// ---------------------------------------------------------------------------

test('every creature names a real colour, category and band', () => {
  const bandIds = BANDS.map((band) => band.id);
  for (const def of Object.values(CREATURES)) {
    assert.ok(EGG_COLOURS[def.colour], `${def.id} has colour ${def.colour}`);
    assert.ok(CATEGORY_IDS.includes(def.category), `${def.id} has category ${def.category}`);
    assert.ok(bandIds.includes(def.band), `${def.id} has band ${def.band}`);
    assert.ok(def.power > 0 && def.guard >= 0 && def.speed > 0);
  }
});

test('every colour can hatch something', () => {
  for (const colourId of COLOUR_IDS) {
    const fromColour = CREATURE_IDS.filter((id) => CREATURES[id].colour === colourId);
    assert.ok(fromColour.length > 0, `nothing ever comes out of a ${colourId} egg`);
  }
});

test('every feed category spends a real resource', () => {
  for (const category of EGG_CATEGORIES) {
    assert.ok(RESOURCES[category.feed], `${category.id} feeds on unknown ${category.feed}`);
    assert.ok(FEED_COST[category.id] > 0);
  }
});

test('both incubators are reachable through research', () => {
  const unlocked = new Set();
  for (const def of Object.values(RESEARCH)) {
    for (const id of def.grants.unlock ?? []) unlocked.add(id);
  }
  for (const id of ['monster_stable', 'monster_room']) {
    assert.ok(FACILITIES[id].locked, `${id} should start locked`);
    assert.ok(unlocked.has(id), `${id} is locked but nothing unlocks it`);
  }
});

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

test('a schema 4 save gains eggs and allies without losing anything', () => {
  const state = kingdom();
  state.resources.wood = 777;
  delete state.eggs;
  delete state.allies;
  state.schemaVersion = 4;

  const restored = deserialize(JSON.stringify(state));

  assert.equal(restored.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(restored.eggs, []);
  assert.deepEqual(restored.allies, []);
  assert.equal(restored.resources.wood, 777);
});

test('eggs and allies survive a save and load', () => {
  const state = kingdom();
  build(state, 'monster_stable');
  const egg = makeEgg(state, 'yellow');
  incubate(state, egg.id, 'stable');
  feedTimes(state, egg, 'special', 4);
  state.allies.push({ id: 500, creatureId: 'woolback', role: 'stable', colour: 'white' });

  const restored = deserialize(JSON.stringify(state));

  assert.equal(restored.eggs.length, 1);
  assert.equal(restored.eggs[0].fed.special, 4);
  assert.equal(bandOf(restored.eggs[0]).id, 'medium', 'what it was fed is remembered');
  assert.equal(restored.allies[0].creatureId, 'woolback');
});
