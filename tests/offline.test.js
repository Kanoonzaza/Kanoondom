// The no-punishment suite.
//
// Every other test file proves a system behaves. This one proves the PROMISE
// the whole project was started for, in one place, so it cannot quietly erode
// one milestone at a time:
//
//   * an absence never leaves the kingdom poorer, in anything
//   * an absence never ages it
//   * an absence never costs it a person, a level, a study or a building
//   * nothing attacks while nobody is watching
//   * storage capacity is the ONLY thing that caps what an absence is worth
//   * a month walked in one step lands exactly where a month walked in ticks does
//
// If a future milestone breaks one of these, it breaks the reason the game
// exists, and it should fail here loudly rather than be discovered in play.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, serialize, deserialize } from '../src/state.js';
import { advanceTicks } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import { clearTerritoryFog, worldCentre } from '../src/sim/world.js';
import { place, canPlace } from '../src/sim/facilities.js';
import { makeResident, xpForLevel, xpRateOf, ticksToNextLevelUp } from '../src/sim/residents.js';
import { makeItem, equip, itemsAwaitingForge } from '../src/sim/equipment.js';
import { startResearch, isResearched } from '../src/sim/research.js';
import { storageCapacity, productionRates } from '../src/sim/economy.js';
import { worthShowing } from '../src/ui/welcome.js';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources.js';
import { RESIDENTS, OFFLINE } from '../src/content/config.js';
import { RESEARCH } from '../src/content/research.js';

const centre = worldCentre();
const HOUR = 60 * 60;

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

/**
 * A real town, not an empty map.
 *
 * Every performance and parity bug this project has had hid behind a sparse
 * fixture, so this one houses people, dresses them, and gives them work.
 */
function livingKingdom(seed = 21, people = 8) {
  const state = newGame(seed, { now: 0 });
  state.stats.tilesCleared += clearTerritoryFog(state);
  for (const id of RESOURCE_IDS) state.resources[id] = Math.floor(RESOURCES[id].baseStorage / 2);

  const homes = [];
  for (let i = 0; i < Math.ceil(people / 3); i++) homes.push(build(state, 'plot_l'));
  build(state, 'field');
  build(state, 'granary');

  const trades = ['cook', 'miner', 'farmer', 'researcher', 'knight', 'merchant'];
  for (let i = 0; i < people; i++) {
    const resident = makeResident(state, {
      name: `P${i}`, professionId: trades[i % trades.length], level: 2,
    });
    resident.home = homes[i % homes.length];
    state.residents.push(resident);

    const item = makeItem(state, i % 2 === 0 ? 'bronze_sword' : 'straw_charm');
    equip(state, resident, item.id);
  }
  return state;
}

/** Everything about a kingdom that an absence must never reduce. */
function snapshot(state) {
  return {
    resources: { ...state.resources },
    calendar: state.time.calendarTicks,
    people: state.residents.length,
    levels: state.residents.map((r) => r.level),
    studies: state.research.completed.length,
    stock: { ...state.stock },
    facilities: Object.keys(state.world.facilities).length,
    damaged: Object.values(state.world.facilities).filter((f) => f.damaged).length,
    itemLevels: Object.values(state.equipment).map((i) => i.level),
    itemExp: Object.values(state.equipment).map((i) => i.exp),
    tiles: state.world.clearedCount,
  };
}

// ---------------------------------------------------------------------------
// Nothing is ever taken
// ---------------------------------------------------------------------------

for (const [label, away] of [['an hour', HOUR], ['a night', 8 * HOUR], ['a week', 168 * HOUR]]) {
  test(`${label} away leaves the kingdom no poorer in anything`, () => {
    const state = livingKingdom();
    advanceTicks(state, 600);
    const before = snapshot(state);

    state.lastSaveTime = 0;
    catchUp(state, away * 1000);
    const after = snapshot(state);

    for (const id of RESOURCE_IDS) {
      assert.ok(
        after.resources[id] >= before.resources[id] - 1e-9,
        `${RESOURCES[id].name} fell from ${before.resources[id]} to ${after.resources[id]}`
      );
    }
    assert.ok(after.people >= before.people, 'nobody may vanish');
    assert.ok(after.studies >= before.studies, 'nothing may be un-learned');
    assert.equal(after.facilities, before.facilities, 'nothing may be demolished');
    assert.equal(after.damaged, before.damaged, 'nothing may be wrecked');
    assert.ok(after.tiles >= before.tiles, 'no land may be lost');

    for (let i = 0; i < before.levels.length; i++) {
      assert.ok(after.levels[i] >= before.levels[i], 'nobody may lose a level');
    }
    for (let i = 0; i < before.itemLevels.length; i++) {
      assert.ok(after.itemLevels[i] >= before.itemLevels[i], 'no item may lose a level');
      assert.ok(after.itemExp[i] >= before.itemExp[i] - 1e-9, 'no item may lose experience');
    }
  });

  test(`${label} away does not age the kingdom`, () => {
    const state = livingKingdom();
    advanceTicks(state, 600);
    const calendarBefore = state.time.calendarTicks;

    state.lastSaveTime = 0;
    catchUp(state, away * 1000);

    assert.equal(
      state.time.calendarTicks, calendarBefore,
      'the calendar advances during play only — that is the whole two-clock design'
    );
  });

  test(`${label} away brings no attack`, () => {
    const state = livingKingdom();
    state.threat = 1e6;             // as provoked as it is possible to be

    state.lastSaveTime = 0;
    const welcome = catchUp(state, away * 1000);

    assert.equal(welcome.raids.length, 0, 'nothing resolves while nobody is watching');
    assert.equal(
      Object.values(state.world.facilities).filter((f) => f.damaged).length, 0,
      'and so nothing is damaged'
    );
  });
}

// ---------------------------------------------------------------------------
// The absence is worth exactly what the clock says
// ---------------------------------------------------------------------------

test('a long absence in one step lands where the same span in pieces does', () => {
  // Six hours, not a month: chunk size 1 means one call per tick, and a month
  // at that resolution is 2.6 million calls — a test that takes minutes is a
  // test nobody runs. Six hours still crosses seasons, days, arrivals and
  // level-ups, which is everything that could drift.
  const runs = [];
  const total = 6 * HOUR;
  for (const chunk of [1, 97, 5000, total]) {
    const state = livingKingdom(3);
    let done = 0;
    while (done < total) {
      const step = Math.min(chunk, total - done);
      advanceTicks(state, step, { offline: true });
      done += step;
    }
    runs.push(snapshot(state));
  }

  for (const run of runs) {
    for (const id of RESOURCE_IDS) {
      assert.ok(
        Math.abs(run.resources[id] - runs[0].resources[id]) < 1e-6,
        `${RESOURCES[id].name} differs by chunk size: ${run.resources[id]} vs ${runs[0].resources[id]}`
      );
    }
    assert.deepEqual(run.levels, runs[0].levels, 'levels must not depend on chunk size');
    assert.equal(run.people, runs[0].people, 'arrivals must not depend on chunk size');
    assert.equal(run.studies, runs[0].studies);
  }
});

test('storage is the only thing that caps an absence', () => {
  const small = livingKingdom(7);
  const large = livingKingdom(7);
  build(large, 'granary');
  build(large, 'lumber_yard');
  build(large, 'treasury');

  for (const state of [small, large]) {
    for (const id of RESOURCE_IDS) state.resources[id] = 0;
    state.lastSaveTime = 0;
  }

  const smallGain = catchUp(small, 48 * HOUR * 1000).gained;
  const largeGain = catchUp(large, 48 * HOUR * 1000).gained;

  const smallTotal = RESOURCE_IDS.reduce((sum, id) => sum + (smallGain[id] ?? 0), 0);
  const largeTotal = RESOURCE_IDS.reduce((sum, id) => sum + (largeGain[id] ?? 0), 0);

  assert.ok(
    largeTotal > smallTotal,
    'more storage must make the same absence worth more — otherwise storage is decoration'
  );
});

test('an absence past the simulated cap still never goes backwards', () => {
  const state = livingKingdom();
  advanceTicks(state, 600);
  const before = { ...state.resources };

  state.lastSaveTime = 0;
  const welcome = catchUp(state, (OFFLINE.maxSimulatedSeconds + 90 * 24 * HOUR) * 1000);

  assert.equal(welcome.capped, true, 'a very long absence is capped');
  for (const id of RESOURCE_IDS) {
    assert.ok(state.resources[id] >= before[id] - 1e-9, `${id} fell`);
  }
});

// ---------------------------------------------------------------------------
// What the absence actually produced
// ---------------------------------------------------------------------------

test('a night away grows people, gear and studies together', () => {
  const state = livingKingdom();
  startResearch(state, 'carpentry');

  state.lastSaveTime = 0;
  const welcome = catchUp(state, 12 * HOUR * 1000);

  assert.ok(welcome.levelUps.length > 0, 'people should grow by living there');
  assert.equal(isResearched(state, 'carpentry'), true, 'a running study should finish');
  assert.ok(itemsAwaitingForge(state).length > 0, 'gear should have learned something');
  assert.ok(worthShowing(welcome), 'and all of that is worth a panel');
});

test('a resident who levelled up really is better at their trade', () => {
  const state = livingKingdom(4, 3);
  const before = productionRates(state);

  state.lastSaveTime = 0;
  const welcome = catchUp(state, 24 * HOUR * 1000);

  assert.ok(welcome.levelUps.length > 0);
  assert.ok(
    productionRates(state).copper > before.copper,
    'levels must actually change what the town earns, or they are cosmetic'
  );
});

test('a homeless resident does not grow', () => {
  const state = livingKingdom(5, 3);
  const wanderer = makeResident(state, { name: 'Nobody', professionId: 'wanderer', level: 1 });
  state.residents.push(wanderer);

  assert.equal(xpRateOf(state, wanderer), 0);
  advanceTicks(state, 20000);
  assert.equal(wanderer.level, 1, 'a roof is what makes somebody grow here');
});

test('nobody grows past the ceiling', () => {
  const state = livingKingdom(6, 2);
  for (const resident of state.residents) resident.level = RESIDENTS.maxLevel;
  // Newcomers turn up during the run, at their own levels — only the people
  // who were already maxed are the subject here.
  const maxed = state.residents.map((resident) => resident.id);

  assert.equal(ticksToNextLevelUp(state), Infinity, 'a maxed town schedules no level-up');
  advanceTicks(state, 50000);

  for (const id of maxed) {
    const resident = state.residents.find((person) => person.id === id);
    assert.equal(resident.level, RESIDENTS.maxLevel);
    assert.equal(xpRateOf(state, resident), 0, 'and stops banking experience it cannot use');
  }
});

test('the level boundary does not flood the clock with segments', () => {
  // Levels change stats, so unlike gear experience they need a real segment
  // boundary. That is exactly the shape that cost eight seconds in V3, so the
  // cost of having it is measured rather than assumed.
  const state = livingKingdom(8, 24);

  const started = Date.now();
  advanceTicks(state, 30 * 24 * HOUR, { offline: true });
  const elapsed = Date.now() - started;

  // Segments were counted rather than guessed: a month is ~8,650 of them and
  // only 11 come from level-ups — season boundaries dominate. Measured ~1.6s
  // in suite; budget set for the order-of-magnitude case, not for drift.
  assert.ok(
    elapsed < 8000,
    `a month away took ${elapsed}ms with 24 people levelling — the boundary is too eager`
  );
});

// ---------------------------------------------------------------------------
// The panel itself
// ---------------------------------------------------------------------------

test('no two residents share a name', () => {
  // Thirty-two names against a town of twenty-five: collisions are near
  // certain, and two people called Wystan is a real thing a player has to
  // untangle. Long enough here to fill the town several times over.
  const state = livingKingdom(12, 3);
  for (let i = 0; i < 12; i++) build(state, 'plot_l');
  advanceTicks(state, 400 * 24 * 60);

  const names = state.residents.map((resident) => resident.name);
  assert.ok(names.length > 20, `the test needs a crowd, got ${names.length}`);
  assert.equal(new Set(names).size, names.length, `duplicate name in: ${names.join(', ')}`);
});

test('names stay the same however the time is chunked', () => {
  const rosters = [];
  for (const chunk of [1, 500, 60000]) {
    const state = livingKingdom(15, 3);
    for (let i = 0; i < 6; i++) build(state, 'plot_l');
    let done = 0;
    while (done < 60000) {
      const step = Math.min(chunk, 60000 - done);
      advanceTicks(state, step);
      done += step;
    }
    rosters.push(state.residents.map((r) => r.name).join(','));
  }
  assert.equal(rosters[1], rosters[0], 'picking an unused name must stay deterministic');
  assert.equal(rosters[2], rosters[0]);
});

test('a trivial absence raises no panel', () => {
  const state = livingKingdom();
  state.lastSaveTime = 0;
  assert.equal(worthShowing(catchUp(state, 5 * 1000)), false, 'five seconds is not news');
});

test('the panel can say when a store filled, not just that it did', () => {
  const state = livingKingdom();
  for (const id of RESOURCE_IDS) state.resources[id] = storageCapacity(state)[id] - 1;

  state.lastSaveTime = 0;
  const welcome = catchUp(state, 24 * HOUR * 1000);

  const overflowed = RESOURCE_IDS.filter((id) => (welcome.wasted[id] ?? 0) > 0);
  assert.ok(overflowed.length > 0, 'the fixture should overflow something');
  assert.ok(
    overflowed.some((id) => typeof welcome.filledSecondsAgo[id] === 'number'),
    'at least one should say how long ago it filled — that is what teaches storage'
  );
});

// ---------------------------------------------------------------------------
// A hidden page is an absence, not a pause
// ---------------------------------------------------------------------------
//
// The live loop clamps its frame delta to five seconds, so a page that stays
// alive but hidden for an hour cannot be caught up by ticking: it would credit
// five seconds and silently drop the hour. The fix is to treat becoming hidden
// as leaving and becoming visible as returning — the same catch-up the boot
// path runs.
//
// These two tests pin that down. The first proves the two journeys agree; the
// second proves the calendar stays frozen across the hidden one, because a
// backgrounded tab must not age the kingdom any more than a closed one does.

test('an hour spent hidden lands exactly where an hour spent closed does', () => {
  const away = HOUR * 1000;

  // Closed: the save goes to storage and comes back as a fresh object.
  const closed = livingKingdom();
  const reopened = deserialize(serialize(closed, 0));
  const closedWelcome = catchUp(reopened, away);

  // Hidden: the very same object is still in memory, never serialised.
  const hidden = livingKingdom();
  serialize(hidden, 0);                  // what saving on `visibilitychange` does
  const hiddenWelcome = catchUp(hidden, away);

  assert.deepEqual(
    snapshot(hidden), snapshot(reopened),
    'a page that was hidden and a page that was closed must return to the same kingdom'
  );
  assert.deepEqual(
    hiddenWelcome.gained, closedWelcome.gained,
    'and must be told they earned the same things while they were gone'
  );
  assert.equal(hiddenWelcome.awaySeconds, closedWelcome.awaySeconds);
});

test('time spent hidden does not age the kingdom', () => {
  const state = livingKingdom();
  advanceTicks(state, 600);              // some real play first
  const playedTo = state.time.calendarTicks;

  serialize(state, 0);
  catchUp(state, 8 * HOUR * 1000);

  assert.equal(
    state.time.calendarTicks, playedTo,
    'the calendar only moves while somebody is playing — a hidden tab is not playing'
  );
  assert.ok(
    state.time.totalTicks > playedTo,
    'but the simulation clock did run, or nothing would have grown'
  );
});
