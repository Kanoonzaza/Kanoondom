import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/state.js';
import {
  productionRates, storageCapacity, applyProduction, settleStorage,
  canAfford, trySpend, fullStores, forEachActiveFacility,
} from '../src/sim/economy.js';
import { place, remove, canPlace } from '../src/sim/facilities.js';
import { advanceTicks, createReport } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import { clearTerritoryFog, worldCentre } from '../src/sim/world.js';
import {
  RESOURCES, RESOURCE_IDS, MATERIAL_IDS, CAPITAL_INCOME, STARTING_RESOURCES,
} from '../src/content/resources.js';
import { FACILITIES, effectScale } from '../src/content/facilities.js';
import { TICKS_PER_SEASON, OFFLINE } from '../src/content/config.js';

const centre = worldCentre();
const HOUR = 3600;
const DAY = 24 * HOUR;

function kingdom(seed = 1, now = 0) {
  const state = newGame(seed, { now });
  clearTerritoryFog(state);
  return state;
}

function rich(seed = 1, now = 0) {
  const state = kingdom(seed, now);
  for (const id of RESOURCE_IDS) state.resources[id] = RESOURCES[id].baseStorage;
  for (const id of Object.keys(state.stock)) state.stock[id] = 20;
  return state;
}

function build(state, x, y, id) {
  const result = place(state, x, y, id);
  assert.ok(result.ok, `could not place ${id}: ${result.reason}`);
  const facility = state.world.facilities[result.origin];
  facility.buildTicksRemaining = 0;
  facility.built = true;
  return result.origin;
}

/**
 * Nearest spot where this facility will actually go.
 *
 * Terrain is seeded, so fixed coordinates land on lava for some seeds and grass
 * for others — tests that hard-code offsets pass or fail by luck.
 */
function findSpot(state, facilityId) {
  for (let radius = 2; radius < 14; radius++) {
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

function buildSomewhere(state, id) {
  const spot = findSpot(state, id);
  return { origin: build(state, spot.x, spot.y, id), ...spot };
}

/** A plausible opening: some production and some storage. */
function developed(seed = 7, now = 0) {
  const state = rich(seed, now);
  for (const id of ['field', 'ranch', 'plantation', 'granary', 'market_stall']) {
    buildSomewhere(state, id);
  }
  // Leave one under construction, so rates change partway through a run.
  const spot = findSpot(state, 'lumber_yard');
  place(state, spot.x, spot.y, 'lumber_yard');
  for (const id of RESOURCE_IDS) state.resources[id] = STARTING_RESOURCES[id] ?? 0;
  state.lastSaveTime = now;
  return state;
}

// --- production -------------------------------------------------------------

test('a bare kingdom still earns something', () => {
  // v1's hardest lesson: income that can reach zero traps a new player.
  const state = kingdom();
  assert.ok(productionRates(state).copper >= CAPITAL_INCOME.copper);
});

test('energy returns on its own', () => {
  const state = kingdom();
  assert.equal(productionRates(state).energy, RESOURCES.energy.regenPerTick);
});

/**
 * What the BUILDINGS produce, with the Town Hall's own floor taken out.
 *
 * The capital trickles a little of every basic material so no kingdom can dig
 * itself into an unrecoverable hole (see CAPITAL_INCOME). That floor is not a
 * facility's doing, so these tests measure above it.
 */
function built(state, resource) {
  return productionRates(state)[resource] - (CAPITAL_INCOME[resource] ?? 0);
}

test('a finished field produces; a building site does not', () => {
  const state = rich();
  const spot = findSpot(state, 'field');
  place(state, spot.x, spot.y, 'field');
  assert.equal(built(state, 'grass'), 0, 'not until it is finished');

  advanceTicks(state, FACILITIES.field.buildTicks);
  assert.ok(built(state, 'grass') > 0);
});

test('the ground beneath a facility changes what it yields', () => {
  // Built on the guaranteed grass homeland, a field should beat its base rate.
  const state = rich();
  build(state, centre.x - 3, centre.y - 3, 'field');
  const onGrass = built(state, 'grass');
  assert.ok(
    onGrass > FACILITIES.field.produces.grass,
    `grass should reward a field: ${onGrass} vs base ${FACILITIES.field.produces.grass}`
  );
});

test('levels multiply production', () => {
  const state = rich();
  const { origin } = buildSomewhere(state, 'field');
  const before = built(state, 'grass');

  state.world.facilities[origin].level = 3;
  assert.ok(Math.abs(built(state, 'grass') - before * effectScale(3)) < 1e-9);
});

test('a removed facility stops producing', () => {
  const state = rich();
  const spot = buildSomewhere(state, 'field');
  assert.ok(built(state, 'grass') > 0);

  remove(state, spot.x, spot.y);
  assert.equal(built(state, 'grass'), 0);
});

// --- storage ------------------------------------------------------------------

test('every resource has its own store, at its own capacity', () => {
  const state = kingdom();
  const caps = storageCapacity(state);
  for (const id of RESOURCE_IDS) {
    assert.equal(caps[id], RESOURCES[id].baseStorage, `${id} should start at its base capacity`);
  }
});

test('a granary raises food and grass, and nothing else', () => {
  const state = rich();
  const before = storageCapacity(state);
  buildSomewhere(state, 'granary');
  const after = storageCapacity(state);

  assert.equal(after.food, before.food + FACILITIES.granary.storage.food);
  assert.equal(after.grass, before.grass + FACILITIES.granary.storage.grass);
  assert.equal(after.ore, before.ore, 'ore does not fit in a granary');
});

test('production clamps at capacity and records the waste', () => {
  const state = kingdom();
  const report = createReport();
  const caps = { ...storageCapacity(state), food: 100 };
  state.resources.food = 90;

  applyProduction(state, 100, { food: 1 }, caps, report, 0);

  assert.equal(state.resources.food, 100, 'clamped');
  assert.equal(report.gained.food, 10);
  assert.equal(report.wasted.food, 90, 'the rest had nowhere to go');
});

test('the moment a store filled is recorded, so the UI can say when', () => {
  const state = kingdom();
  const report = createReport();
  state.resources.food = 80;

  applyProduction(state, 100, { food: 1 }, { food: 100 }, report, 500);
  assert.equal(report.filledAtTick.food, 520, '20 ticks into the span');
});

test('stores settle when capacity falls', () => {
  // Demolishing a granary must not strand food above a cap it can never drain to.
  const state = rich();
  const spot = buildSomewhere(state, 'granary');
  state.resources.food = storageCapacity(state).food;

  remove(state, spot.x, spot.y);
  settleStorage(state, createReport());

  assert.equal(state.resources.food, storageCapacity(state).food);
});

test('fullStores names what is overflowing', () => {
  const state = kingdom();
  assert.deepEqual(fullStores(state), []);
  state.resources.food = storageCapacity(state).food;
  assert.deepEqual(fullStores(state), ['food']);
});

// --- spending -----------------------------------------------------------------

test('spending is all or nothing', () => {
  const state = kingdom();
  state.resources.wood = 10;
  state.resources.ore = 100;

  assert.equal(canAfford(state, { wood: 20, ore: 10 }), false);
  assert.equal(trySpend(state, { wood: 20, ore: 10 }), false);
  assert.equal(state.resources.ore, 100, 'nothing is taken on a failed purchase');

  assert.equal(trySpend(state, { wood: 10, ore: 10 }), true);
  assert.equal(state.resources.wood, 0);
  assert.equal(state.resources.ore, 90);
});

// --- the clock ----------------------------------------------------------------

test('OFFLINE PARITY: one long advance equals many short ones', () => {
  // The invariant the whole offline promise rests on.
  const ticks = 4000;
  const bulk = developed();
  const stepwise = developed();

  advanceTicks(bulk, ticks);
  for (let i = 0; i < ticks; i++) advanceTicks(stepwise, 1);

  for (const id of RESOURCE_IDS) {
    assert.ok(
      Math.abs(bulk.resources[id] - stepwise.resources[id]) < 1e-6,
      `${id} drifted: ${bulk.resources[id]} vs ${stepwise.resources[id]}`
    );
  }
  assert.equal(bulk.time.totalTicks, stepwise.time.totalTicks);
  assert.deepEqual(bulk.world.facilities, stepwise.world.facilities);
});

test('OFFLINE PARITY: holds at every chunk size', () => {
  const ticks = 3000;
  const reference = developed();
  advanceTicks(reference, ticks);

  for (const chunk of [1, 7, 60, 300, 999, 3000]) {
    const state = developed();
    let remaining = ticks;
    while (remaining > 0) {
      const step = Math.min(chunk, remaining);
      advanceTicks(state, step);
      remaining -= step;
    }
    for (const id of RESOURCE_IDS) {
      assert.ok(
        Math.abs(state.resources[id] - reference.resources[id]) < 1e-6,
        `chunk ${chunk}: ${id} drifted`
      );
    }
  }
});

test('construction finishes exactly on time, and is reported once', () => {
  const state = rich();
  const spot = findSpot(state, 'field');
  place(state, spot.x, spot.y, 'field');
  const buildTime = FACILITIES.field.buildTicks;

  let report = advanceTicks(state, buildTime - 1);
  assert.equal(report.completed.length, 0);

  report = advanceTicks(state, 1);
  assert.equal(report.completed.length, 1);
  assert.equal(report.completed[0].facilityId, 'field');

  report = advanceTicks(state, 500);
  assert.equal(report.completed.length, 0, 'not re-reported forever');
});

test('days and full moons are counted', () => {
  const state = kingdom();
  const report = advanceTicks(state, 60 * 10);
  assert.equal(report.daysElapsed, 10);
  assert.equal(report.fullMoons, 1, 'one full moon every ten days');
});

// --- offline --------------------------------------------------------------------

test('the kingdom keeps working while you are away', () => {
  const state = developed(3);
  const before = { ...state.resources };
  const summary = catchUp(state, 4 * HOUR * 1000);

  assert.ok(summary);
  assert.ok(state.resources.grass > before.grass);
  assert.equal(summary.awaySeconds, 4 * HOUR);
});

test('BEING AWAY IS NEVER PUNISHED: no absence leaves you poorer', () => {
  // There is no upkeep anywhere in the design, so this should hold trivially —
  // which is exactly why it is worth pinning down before anything can drain.
  for (const hours of [1, 8, 24, 24 * 7, 24 * 40]) {
    const state = developed(11);
    const before = { ...state.resources };
    catchUp(state, hours * HOUR * 1000);

    for (const id of RESOURCE_IDS) {
      assert.ok(
        state.resources[id] >= before[id] - 1e-9,
        `${hours}h away cost the player ${id}: ${state.resources[id]} < ${before[id]}`
      );
    }
  }
});

test('TIME AWAY DOES NOT AGE THE KINGDOM', () => {
  const state = developed(12);
  state.time.calendarTicks = TICKS_PER_SEASON * 6;
  const before = state.time.calendarTicks;

  catchUp(state, 7 * DAY * 1000);

  assert.equal(state.time.calendarTicks, before, 'the date waits for the player');
  assert.ok(state.time.totalTicks > before, 'but the realm worked the whole time');
});

test('storage is the only thing limiting an absence', () => {
  const plain = developed(13);
  const stocked = developed(13);
  buildSomewhere(stocked, 'granary');

  const a = catchUp(plain, 3 * DAY * 1000);
  const b = catchUp(stocked, 3 * DAY * 1000);

  assert.ok((b.wasted.food ?? 0) < (a.wasted.food ?? 0), 'more storage should waste less');
  assert.ok(stocked.resources.food > plain.resources.food);
});

test('a clock moved backwards never rewinds the kingdom', () => {
  const state = developed(14, 10 * HOUR * 1000);
  const before = { ...state.resources, ticks: state.time.totalTicks };

  const summary = catchUp(state, 1 * HOUR * 1000);

  assert.equal(summary, null);
  assert.equal(state.time.totalTicks, before.ticks);
  assert.equal(state.resources.grass, before.grass);
});

test('a brief absence advances the sim but shows no panel', () => {
  const state = developed(15);
  const before = state.resources.grass;
  assert.equal(catchUp(state, 30 * 1000), null);
  assert.ok(state.resources.grass > before);
  assert.equal(state.time.totalTicks, 30);
});

test('very long absences are capped, and say so, at no cost to the player', () => {
  const capped = developed(16);
  const justUnder = developed(16);

  const summary = catchUp(capped, 400 * DAY * 1000);
  catchUp(justUnder, OFFLINE.maxSimulatedSeconds * 1000);

  assert.equal(summary.capped, true);
  assert.equal(summary.awaySeconds, 400 * DAY, 'the true absence is still reported');
  for (const id of RESOURCE_IDS) {
    assert.ok(
      Math.abs(capped.resources[id] - justUnder.resources[id]) < 1e-6,
      `${id} differs across the cap — stores should long since have filled`
    );
  }
});

test('a long catch-up is fast enough to run on page load', () => {
  const state = developed(17);
  const started = Date.now();
  catchUp(state, 400 * DAY * 1000);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1500, `catch-up took ${elapsed}ms`);
});

test('the summary reports what finished while away', () => {
  const state = developed(18);
  const summary = catchUp(state, 2 * HOUR * 1000);
  assert.ok(
    summary.completed.some((entry) => entry.facilityId === 'lumber_yard'),
    'the yard left under construction should have finished'
  );
});

// ---------------------------------------------------------------------------
// Dead ends — the class of bug that ends a save without announcing itself
// ---------------------------------------------------------------------------

test('no material has to be spent to produce itself', () => {
  // The V4 ore trap: every producer of ore cost ore. The mine wanted 20, the
  // Surveyor's Office 25, the promotion fee 80, and the study that grants a
  // mine sat behind that fee. Spend your opening ore on housing and the
  // kingdom was finished, with nothing on screen to say so.
  for (const material of MATERIAL_IDS) {
    const producers = Object.values(FACILITIES).filter((def) => def.produces?.[material]);
    if (producers.length === 0) continue;

    const free = producers.filter((def) => def.cost[material] === undefined);
    assert.ok(
      free.length > 0,
      `every building that produces ${material} also costs ${material} `
      + `(${producers.map((def) => def.id).join(', ')}) — a kingdom that runs out can never start again`
    );
  }
});

test('a kingdom stripped to nothing climbs back out on its own', () => {
  const state = newGame(4, { now: 0 });
  clearTerritoryFog(state);
  for (const id of RESOURCE_IDS) state.resources[id] = 0;
  state.residents = [];

  advanceTicks(state, 6 * 60 * 60);   // six hours, nobody home

  // Enough to build the cheapest producer of each material it needs.
  for (const material of MATERIAL_IDS) {
    const producers = Object.values(FACILITIES)
      .filter((def) => def.produces?.[material] && def.cost[material] === undefined);
    if (producers.length === 0) continue;

    const cheapest = producers.sort(
      (a, b) => Object.values(a.cost).reduce((x, y) => x + y, 0)
        - Object.values(b.cost).reduce((x, y) => x + y, 0)
    )[0];

    for (const [resource, amount] of Object.entries(cheapest.cost)) {
      assert.ok(
        state.resources[resource] >= amount,
        `cannot afford a ${cheapest.id} to restart ${material}: `
        + `needs ${amount} ${resource}, has ${state.resources[resource].toFixed(1)}`
      );
    }
  }
});
