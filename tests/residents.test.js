import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, dayNumber } from '../src/state.js';
import {
  homes, freeBeds, totalBeds, firstFreeHome, arrivalForDay, baseStatsFor,
  statsOf, shopIncomeOf, shopIncome, gatherRates, activityOf, rehouse, residentsOf,
} from '../src/sim/residents.js';
import { place, remove, canPlace } from '../src/sim/facilities.js';
import { advanceTicks } from '../src/sim/tick.js';
import { productionRates } from '../src/sim/economy.js';
import { catchUp } from '../src/sim/offline.js';
import { clearTerritoryFog, worldCentre, tileIndex, markCleared } from '../src/sim/world.js';
import { auraAt } from '../src/sim/aura.js';
import { PROFESSIONS, professionDef } from '../src/content/professions.js';
import { FACILITIES } from '../src/content/facilities.js';
import { RESIDENTS, DAY } from '../src/content/config.js';
import { RESOURCES, RESOURCE_IDS, STARTING_RESOURCES } from '../src/content/resources.js';
import { STAT_IDS } from '../src/content/stats.js';

const centre = worldCentre();

function kingdom(seed = 1, now = 0) {
  const state = newGame(seed, { now });
  clearTerritoryFog(state);
  for (const id of RESOURCE_IDS) state.resources[id] = Math.min(100000, RESOURCES[id].baseStorage);
  for (const id of Object.keys(state.stock)) state.stock[id] = 20;
  return state;
}

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

function build(state, facilityId) {
  const spot = findSpot(state, facilityId);
  const result = place(state, spot.x, spot.y, facilityId);
  assert.ok(result.ok, result.reason);
  const facility = state.world.facilities[result.origin];
  facility.buildTicksRemaining = 0;
  facility.built = true;
  return { ...spot, origin: result.origin };
}

/** Put a specific person in a specific home, bypassing the arrival lottery. */
function settle(state, home, professionId, level = 1) {
  const resident = {
    id: state.nextId++,
    name: `Test ${professionId}`,
    professionId,
    level,
    xp: 0,
    home: home.origin,
    baseStats: baseStatsFor(professionId, level),
    arrivedOnDay: 0,
  };
  state.residents.push(resident);
  return resident;
}

// --- housing ----------------------------------------------------------------

test('a plot provides beds and shelves, by its size', () => {
  const state = kingdom();
  assert.equal(totalBeds(state), 0, 'a town hall is not a home');

  build(state, 'plot_s');
  assert.equal(totalBeds(state), FACILITIES.plot_s.housing.beds);
  assert.equal(freeBeds(state), 1);

  build(state, 'plot_l');
  assert.equal(totalBeds(state), 1 + FACILITIES.plot_l.housing.beds);
  assert.equal(homes(state).length, 2);
});

test('an unfinished plot houses nobody', () => {
  const state = kingdom();
  const spot = findSpot(state, 'plot_s');
  place(state, spot.x, spot.y, 'plot_s');
  assert.equal(totalBeds(state), 0, 'a building site is not a home');

  advanceTicks(state, FACILITIES.plot_s.buildTicks);
  assert.equal(totalBeds(state), 1);
});

test('bigger plots carry more shelves, which is why they are worth building', () => {
  assert.ok(FACILITIES.plot_xl.housing.shelves > FACILITIES.plot_s.housing.shelves * 2);
});

// --- arrival -----------------------------------------------------------------

test('nobody arrives at a kingdom with no beds', () => {
  const state = kingdom();
  advanceTicks(state, DAY.ticksPerDay * 30);
  assert.equal(state.residents.length, 0, 'people need somewhere to sleep');
});

test('people arrive once there is a roof', () => {
  const state = kingdom(4);
  for (let i = 0; i < 4; i++) build(state, 'plot_s');

  const report = advanceTicks(state, DAY.ticksPerDay * 60);
  assert.ok(state.residents.length > 0, 'somebody should have come');
  assert.equal(report.arrivals.length, state.residents.length);
  assert.ok(state.residents.every((resident) => resident.home !== null));
});

test('arrivals stop once every bed is taken', () => {
  const state = kingdom(5);
  build(state, 'plot_s'); // one bed only

  advanceTicks(state, DAY.ticksPerDay * 200);
  assert.equal(state.residents.length, 1, 'one bed, one resident');
  assert.equal(freeBeds(state), 0);
});

test('ARRIVALS ARE CHUNK-INDEPENDENT', () => {
  // Arrivals are keyed to the DAY, not drawn from the shared RNG stream — if
  // they were, a chunked run and one long run would consume the stream a
  // different number of times and the two would drift apart.
  const ticks = DAY.ticksPerDay * 80;
  const bulk = kingdom(9);
  const stepwise = kingdom(9);
  for (const state of [bulk, stepwise]) for (let i = 0; i < 4; i++) build(state, 'plot_m');

  advanceTicks(bulk, ticks);
  for (let i = 0; i < ticks; i++) advanceTicks(stepwise, 1);

  assert.deepEqual(
    bulk.residents.map((r) => `${r.name}/${r.professionId}/${r.level}`),
    stepwise.residents.map((r) => `${r.name}/${r.professionId}/${r.level}`),
    'the same people should arrive either way'
  );
});

test('who arrives on a given day is fixed by that day', () => {
  const state = kingdom(11);
  const first = arrivalForDay(state, 42);
  const again = arrivalForDay(state, 42);
  assert.deepEqual(first, again, 'day 42 always brings the same person');
});

test('a wider-explored kingdom attracts more people', () => {
  const quiet = kingdom(12);
  const known = kingdom(12);
  for (let i = 0; i < 3000; i++) markCleared(known, i);

  const count = (state) => {
    let arrivals = 0;
    for (let day = 1; day < 200; day++) if (arrivalForDay(state, day)) arrivals++;
    return arrivals;
  };
  assert.ok(count(known) > count(quiet), 'word gets around');
});

// --- stats -------------------------------------------------------------------

test('a resident is their own growth plus wherever they live', () => {
  const state = kingdom(13);
  const home = build(state, 'plot_s');
  const resident = settle(state, home, 'blacksmith', 1);

  const alone = { ...resident.baseStats };
  const withHome = statsOf(state, resident);
  const aura = auraAt(state, home.x, home.y);

  for (const stat of STAT_IDS) {
    assert.ok(
      Math.abs(withHome[stat] - (alone[stat] + (aura[stat] ?? 0))) < 1e-9,
      `${stat} should be base plus aura`
    );
  }
  assert.ok(withHome.heart > alone.heart, 'the plot itself lifts heart');
});

test('moving a well next door makes a resident better, immediately', () => {
  // Stats are computed live rather than stored, so layout changes land at once
  // and nothing can fall out of sync.
  const state = kingdom(14);
  const home = build(state, 'plot_s');
  const resident = settle(state, home, 'farmer');
  const before = statsOf(state, resident).vigor;

  const wellSpot = { x: home.x + 1, y: home.y + 2 };
  if (canPlace(state, wellSpot.x, wellSpot.y, 'well').ok) {
    const result = place(state, wellSpot.x, wellSpot.y, 'well');
    state.world.facilities[result.origin].built = true;
    state.world.facilities[result.origin].buildTicksRemaining = 0;
    assert.ok(statsOf(state, resident).vigor > before, 'a well should lift vigor');
  }
});

test('a profession leans its own way', () => {
  const mage = baseStatsFor('mage', 1);
  const knight = baseStatsFor('knight', 1);
  assert.ok(mage.int > knight.int, 'mages think harder');
  assert.ok(knight.def > mage.def, 'knights take the blows');
});

test('levels raise every stat', () => {
  const low = baseStatsFor('blacksmith', 1);
  const high = baseStatsFor('blacksmith', 5);
  for (const stat of STAT_IDS) assert.ok(high[stat] > low[stat], `${stat} should grow`);
});

// --- shops --------------------------------------------------------------------

test('a shopkeeper earns; a fighter does not', () => {
  const state = kingdom(15);
  const home = build(state, 'plot_s');
  const smith = settle(state, home, 'blacksmith');
  assert.ok(shopIncomeOf(state, smith) > 0);

  state.residents = [];
  const knight = settle(state, home, 'knight');
  assert.equal(shopIncomeOf(state, knight), 0, 'knights open no shop');
});

test('more shelves means more income — the point of a bigger plot', () => {
  const small = kingdom(16);
  const large = kingdom(16);
  const smallHome = build(small, 'plot_s');
  const largeHome = build(large, 'plot_l');

  settle(small, smallHome, 'merchant');
  settle(large, largeHome, 'merchant');

  assert.ok(shopIncomeOf(large, large.residents[0]) > shopIncomeOf(small, small.residents[0]));
});

test('a higher-level shopkeeper earns more', () => {
  const state = kingdom(17);
  const home = build(state, 'plot_m');
  const novice = settle(state, home, 'cook', 1);
  const veteran = settle(state, home, 'cook', 5);
  assert.ok(shopIncomeOf(state, veteran) > shopIncomeOf(state, novice));
});

test('shop income reaches the kingdom purse', () => {
  const state = kingdom(18);
  const before = productionRates(state).copper;

  const home = build(state, 'plot_s');
  settle(state, home, 'merchant');

  assert.ok(Math.abs(productionRates(state).copper - (before + shopIncome(state))) < 1e-9);
  assert.ok(productionRates(state).copper > before);
});

test('gatherers bring materials home', () => {
  const state = kingdom(19);
  const home = build(state, 'plot_m');
  settle(state, home, 'miner');

  const rates = gatherRates(state);
  assert.ok(rates.ore > 0, 'a miner should bring back ore');
  assert.ok(productionRates(state).ore > 0);
});

test('an evicted resident earns nothing but is never deleted', () => {
  const state = kingdom(20);
  const home = build(state, 'plot_s');
  const resident = settle(state, home, 'merchant');
  assert.ok(shopIncomeOf(state, resident) > 0);

  remove(state, home.x, home.y);

  assert.equal(state.residents.length, 1, 'losing a roof must not delete a person');
  assert.equal(state.residents[0].home, null);
  assert.equal(shopIncomeOf(state, state.residents[0]), 0, 'but they cannot trade');
});

test('rehousing puts the homeless back to work', () => {
  const state = kingdom(21);
  const first = build(state, 'plot_s');
  const resident = settle(state, first, 'merchant');
  remove(state, first.x, first.y);

  build(state, 'plot_m');
  assert.equal(rehouse(state), 1);
  assert.notEqual(state.residents[0].home, null);
  assert.ok(shopIncomeOf(state, state.residents[0]) > 0);
});

// --- day and night ------------------------------------------------------------

test('residents keep the hours the manual describes', () => {
  const state = kingdom(22);
  const home = build(state, 'plot_s');
  const smith = settle(state, home, 'blacksmith');
  const miner = settle(state, home, 'miner');

  assert.equal(activityOf(state, smith, { id: 'night' }), 'asleep');
  assert.equal(activityOf(state, smith, { id: 'day' }), 'minding the shop');
  assert.equal(activityOf(state, miner, { id: 'day' }), 'out gathering');
});

// --- the offline promise, with people in the town -----------------------------

test('a long catch-up stays fast with a POPULATED town', () => {
  // This guards a regression that a sparser test missed entirely. Residents put
  // work on the clock's hot path, and breaking segments at every day boundary
  // once made a month-long absence take eight seconds of frozen page.
  const state = kingdom(30);
  for (let i = 0; i < 8; i++) build(state, 'plot_m');
  advanceTicks(state, DAY.ticksPerDay * 200);
  assert.ok(state.residents.length >= 8, 'the test needs a busy town to be meaningful');

  state.lastSaveTime = 0;
  const started = Date.now();
  catchUp(state, 30 * 24 * 3600 * 1000);
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 2500, `a month-long catch-up took ${elapsed}ms`);
});

test('residents do not break the no-poorer promise', () => {
  const state = kingdom(23);
  for (let i = 0; i < 3; i++) build(state, 'plot_m');
  advanceTicks(state, DAY.ticksPerDay * 40);

  const before = { ...state.resources };
  catchUp(state, 24 * 3600 * 1000);

  for (const id of RESOURCE_IDS) {
    assert.ok(state.resources[id] >= before[id] - 1e-9, `a day away cost the player ${id}`);
  }
});

test('people arrive while you are away, and the town is working when you return', () => {
  const state = kingdom(24);
  for (let i = 0; i < 4; i++) build(state, 'plot_m');
  // Start from a starting purse, not a full one — a treasury already at its cap
  // would overflow everything and report no gain at all.
  state.resources = { ...STARTING_RESOURCES };
  state.lastSaveTime = 0;

  const summary = catchUp(state, 12 * 3600 * 1000);

  assert.ok(state.residents.length > 0, 'the docks do not close when you close the app');
  assert.ok(summary.gained.copper > 0, 'and their shops traded the whole time');
  assert.ok(
    state.resources.copper > STARTING_RESOURCES.copper,
    'so the purse is fuller than it was left'
  );
});
