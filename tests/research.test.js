import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, deserialize, serialize, SCHEMA_VERSION } from '../src/state.js';
import {
  townRank, developmentPoints, promotionRequirement, canPromote, promote,
  studyPower, facilityStudyPower, researchStatus, researchList, startResearch,
  cancelResearch, isResearched, isFacilityUnlocked, applyGrants, checkMapRewards,
} from '../src/sim/research.js';
import {
  runSurvey, canSurvey, surveyCost, surveyReach, surveyOffice, revealFrontier, rollFind,
} from '../src/sim/survey.js';
import { place, canPlace, palette, isUnlocked } from '../src/sim/facilities.js';
import { advanceTicks } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import { productionRates } from '../src/sim/economy.js';
import { makeResident } from '../src/sim/residents.js';
import { clearTerritoryFog, worldCentre, peaceLevel, ringCeiling } from '../src/sim/world.js';
import { createRng } from '../src/sim/rng.js';
import { RESEARCH, MAP_REWARDS, SURVEY_FINDS, STUDY, PROMOTION } from '../src/content/research.js';
import { FACILITIES } from '../src/content/facilities.js';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources.js';
import { ZONE_UNLOCKS, TILE_COUNT } from '../src/content/config.js';

const centre = worldCentre();

/** A kingdom with full stores, so tests measure rules rather than poverty. */
function kingdom(seed = 7) {
  const state = newGame(seed, { now: 0 });
  state.stats.tilesCleared += clearTerritoryFog(state);
  for (const id of RESOURCE_IDS) state.resources[id] = RESOURCES[id].baseStorage;
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

/** Build one, finished and working. */
function build(state, facilityId) {
  state.stock[facilityId] = (state.stock[facilityId] ?? 0) + 1;
  const spot = findSpot(state, facilityId);
  const result = place(state, spot.x, spot.y, facilityId);
  assert.equal(result.ok, true, result.reason ?? '');
  const facility = state.world.facilities[result.origin];
  facility.built = true;
  facility.buildTicksRemaining = 0;
  return { ...spot, origin: result.origin, facility };
}

/** Finish a study outright, whatever it costs. */
function learn(state, id) {
  for (const [resource, amount] of Object.entries(RESEARCH[id].cost)) {
    state.resources[resource] = Math.max(state.resources[resource], amount);
  }
  assert.equal(startResearch(state, id).ok, true);
  advanceTicks(state, RESEARCH[id].study * 2);
  assert.equal(isResearched(state, id), true);
}

// ---------------------------------------------------------------------------
// Town Hall rank
// ---------------------------------------------------------------------------

test('a new kingdom starts at rank 1', () => {
  assert.equal(townRank(kingdom()), 1);
});

test('development counts people, buildings and explored ground', () => {
  const state = kingdom();
  const before = developmentPoints(state);

  state.residents.push(makeResident(state, { name: 'Ada', professionId: 'farmer', level: 1 }));
  assert.equal(developmentPoints(state), before + PROMOTION.perResident);

  build(state, 'field');
  assert.equal(developmentPoints(state), before + PROMOTION.perResident + PROMOTION.perFacility);
});

test('promotion is refused until the town is developed enough', () => {
  const state = kingdom();
  const check = canPromote(state, 0);
  assert.equal(check.ok, false);
  assert.match(check.reason, /not developed enough/);
});

test('promotion raises the rank, charges the fee, and reveals the new reach', () => {
  const state = kingdom();
  for (let i = 0; i < 6; i++) {
    state.residents.push(makeResident(state, { name: `P${i}`, professionId: 'farmer', level: 1 }));
  }

  const requirement = promotionRequirement(1);
  const woodBefore = state.resources.wood;
  const result = promote(state, 0);

  assert.equal(result.ok, true, result.reason ?? '');
  assert.equal(state.townHalls[0].level, 2);
  assert.equal(state.resources.wood, woodBefore - requirement.cost.wood);
  assert.equal(townRank(state), 2);
});

test('a higher rank offers studies that were hidden before', () => {
  const state = kingdom();
  assert.equal(researchStatus(state, 'masonry'), 'rank');

  state.townHalls[0].level = 2;
  assert.equal(researchStatus(state, 'masonry'), 'ready');
});

test('promotion never costs the kingdom land or people', () => {
  const state = kingdom();
  for (let i = 0; i < 6; i++) {
    state.residents.push(makeResident(state, { name: `P${i}`, professionId: 'farmer', level: 1 }));
  }
  const tilesBefore = state.stats.tilesCleared;
  const peopleBefore = state.residents.length;

  promote(state, 0);

  assert.ok(state.stats.tilesCleared >= tilesBefore);
  assert.equal(state.residents.length, peopleBefore);
});

// ---------------------------------------------------------------------------
// Studying
// ---------------------------------------------------------------------------

test('a study charges its fee up front and finishes on study points', () => {
  const state = kingdom();
  const def = RESEARCH.carpentry;
  const woodBefore = state.resources.wood;

  assert.equal(startResearch(state, 'carpentry').ok, true);
  assert.equal(state.resources.wood, woodBefore - def.cost.wood);
  assert.equal(state.research.active.id, 'carpentry');

  const plotsBefore = state.stock.plot_s;
  const report = advanceTicks(state, Math.ceil(def.study / STUDY.basePower));

  assert.equal(state.research.active, null);
  assert.equal(isResearched(state, 'carpentry'), true);
  assert.equal(state.stock.plot_s, plotsBefore + def.grants.stock.plot_s);
  assert.equal(report.research.length, 1);
  assert.equal(report.research[0].id, 'carpentry');
});

test('only one study runs at a time', () => {
  const state = kingdom();
  startResearch(state, 'carpentry');
  const second = startResearch(state, 'surveying');
  assert.equal(second.ok, false);
  assert.match(second.reason, /already being studied/);
});

test('a study cannot start before what it requires', () => {
  const state = kingdom();
  state.townHalls[0].level = 5;
  assert.equal(researchStatus(state, 'estates'), 'requires');
  const result = startResearch(state, 'estates');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Civic Planning/);
});

test('setting a study aside keeps every point already studied', () => {
  const state = kingdom();
  startResearch(state, 'carpentry');
  advanceTicks(state, 60);
  const progress = state.research.active.progress;
  assert.ok(progress > 0);

  const cancelled = cancelResearch(state);
  assert.equal(cancelled.ok, true);
  assert.equal(state.research.active, null);

  assert.equal(startResearch(state, 'carpentry').ok, true);
  assert.equal(state.research.active.progress, progress);
});

test('setting a study aside returns half the fee', () => {
  const state = kingdom();
  const woodBefore = state.resources.wood;
  startResearch(state, 'carpentry');
  cancelResearch(state);
  const paid = woodBefore - state.resources.wood;
  assert.equal(paid, Math.ceil(RESEARCH.carpentry.cost.wood / 2));
});

test('finished study progress is never spent on the next one', () => {
  const state = kingdom();
  startResearch(state, 'carpentry');
  advanceTicks(state, RESEARCH.carpentry.study * 10);

  assert.equal(state.research.active, null);
  assert.equal(state.research.completed.length, 1);
});

test('researchers and libraries both raise the study rate', () => {
  const state = kingdom();
  const base = studyPower(state);
  assert.equal(base, STUDY.basePower);

  const home = build(state, 'plot_s');
  const scholar = makeResident(state, { name: 'Vela', professionId: 'researcher', level: 1 });
  scholar.home = home.origin;
  state.residents.push(scholar);
  const withScholar = studyPower(state);
  assert.ok(withScholar > base, 'a researcher should study');

  state.research.unlocked.push('library');
  build(state, 'library');
  assert.ok(studyPower(state) > withScholar, 'a library should study');
  assert.ok(facilityStudyPower(state) > 0);
});

test('a researcher writes tomes into the kingdom stores', () => {
  const state = kingdom();
  const home = build(state, 'plot_s');
  const scholar = makeResident(state, { name: 'Vela', professionId: 'researcher', level: 2 });
  scholar.home = home.origin;
  state.residents.push(scholar);

  assert.ok(productionRates(state).tome > 0);
});

// ---------------------------------------------------------------------------
// The offline promise, applied to research
// ---------------------------------------------------------------------------

test('a study finishes while the player is away', () => {
  const state = kingdom();
  startResearch(state, 'carpentry');
  state.lastSaveTime = 0;

  const welcome = catchUp(state, RESEARCH.carpentry.study * 1000);

  assert.equal(isResearched(state, 'carpentry'), true);
  assert.equal(welcome.research.length, 1);
  assert.equal(welcome.research[0].id, 'carpentry');
});

test('study progress is identical however the time is chunked', () => {
  const total = 150;
  const results = [];

  for (const chunk of [1, 7, 50, 150]) {
    const state = kingdom(42);
    // Long enough that no chunk size can finish it inside the run.
    assert.ok(RESEARCH.carpentry.study > total);
    assert.equal(startResearch(state, 'carpentry').ok, true);
    let done = 0;
    while (done < total) {
      const step = Math.min(chunk, total - done);
      advanceTicks(state, step);
      done += step;
    }
    results.push(state.research.active.progress);
  }

  for (const progress of results) {
    assert.equal(progress, results[0], 'chunking must not change how much was studied');
  }
});

test('time away never un-learns anything', () => {
  const state = kingdom();
  learn(state, 'carpentry');
  const stockBefore = state.stock.plot_s;

  state.lastSaveTime = 0;
  catchUp(state, 7 * 24 * 60 * 60 * 1000);

  assert.equal(isResearched(state, 'carpentry'), true);
  assert.ok(state.stock.plot_s >= stockBefore, 'granted stock must not evaporate');
});

test('a kingdom with nothing can still earn its way into research', () => {
  // The soft-lock this guards against: tomes come from researchers and from
  // surveys, but surveys must be RESEARCHED, at a cost in tomes. Strip the
  // starting stock and a kingdom with no scholar would have no way to earn
  // either — the v1 death spiral wearing a different hat.
  const state = newGame(3, { now: 0 });
  state.stats.tilesCleared += clearTerritoryFog(state);
  for (const id of RESOURCE_IDS) state.resources[id] = 0;
  state.residents = [];

  advanceTicks(state, 12 * 60 * 60);   // half a day, nobody studying

  assert.ok(
    state.resources.tome >= RESEARCH.surveying.cost.tome,
    'the capital must produce tomes on its own, or research can dead-end'
  );
});

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------

test('locked facilities stay out of the build menu until studied', () => {
  const state = kingdom();
  assert.equal(isFacilityUnlocked(state, 'surveyor_office'), false);
  assert.equal(isUnlocked(state, 'surveyor_office'), false);
  assert.ok(!palette(state).some((entry) => entry.def.id === 'surveyor_office'));

  learn(state, 'surveying');

  assert.equal(isFacilityUnlocked(state, 'surveyor_office'), true);
  assert.ok(palette(state).some((entry) => entry.def.id === 'surveyor_office'));
});

test('a locked facility cannot be placed even with stock in hand', () => {
  const state = kingdom();
  state.stock.hot_spring = 5;
  const spot = findSpot(state, 'field');
  const result = canPlace(state, spot.x, spot.y, 'hot_spring');
  assert.equal(result.ok, false);
  assert.match(result.reason, /knows how/);
});

test('being granted stock of a locked thing unlocks it too', () => {
  const state = kingdom();
  applyGrants(state, { stock: { hot_spring: 1 } });
  assert.equal(isFacilityUnlocked(state, 'hot_spring'), true);
});

test('every facility a study unlocks is actually marked locked', () => {
  for (const def of Object.values(RESEARCH)) {
    for (const facilityId of def.grants.unlock ?? []) {
      assert.ok(FACILITIES[facilityId], `${def.id} unlocks unknown ${facilityId}`);
      assert.equal(
        FACILITIES[facilityId].locked, true,
        `${facilityId} is unlocked by ${def.id} but was never locked`
      );
    }
  }
});

test('every locked facility is reachable through some study', () => {
  const reachable = new Set();
  for (const def of Object.values(RESEARCH)) {
    for (const id of def.grants.unlock ?? []) reachable.add(id);
    for (const id of Object.keys(def.grants.stock ?? {})) reachable.add(id);
  }
  for (const def of Object.values(FACILITIES)) {
    if (!def.locked) continue;
    assert.ok(reachable.has(def.id), `${def.id} is locked but nothing unlocks it`);
  }
});

test('every study names real facilities and real resources', () => {
  for (const def of Object.values(RESEARCH)) {
    for (const resource of Object.keys(def.cost)) {
      assert.ok(RESOURCES[resource], `${def.id} costs unknown ${resource}`);
    }
    for (const id of Object.keys(def.grants.stock ?? {})) {
      assert.ok(FACILITIES[id], `${def.id} grants unknown ${id}`);
    }
    for (const need of def.requires ?? []) {
      assert.ok(RESEARCH[need], `${def.id} requires unknown study ${need}`);
      assert.ok(
        RESEARCH[need].rank <= def.rank,
        `${def.id} (rank ${def.rank}) requires ${need} of a higher rank`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

test('surveying needs an office', () => {
  const state = kingdom();
  assert.equal(surveyOffice(state), null);
  const check = canSurvey(state);
  assert.equal(check.ok, false);
  assert.equal(runSurvey(state).ok, false);
});

test('a survey reveals land and brings something back', () => {
  const state = kingdom();
  learn(state, 'surveying');
  build(state, 'surveyor_office');

  const tilesBefore = state.stats.tilesCleared;
  const peaceBefore = peaceLevel(state);
  const result = runSurvey(state);

  assert.equal(result.ok, true, result.reason ?? '');
  assert.ok(result.revealed > 0, 'a survey must reveal ground');
  assert.equal(state.stats.tilesCleared, tilesBefore + result.revealed);
  assert.ok(peaceLevel(state) > peaceBefore, 'revealing land must raise Peace');
  assert.ok(result.find, 'a survey must return a find');
});

test('a survey charges its cost, and the next one asks for more', () => {
  const state = kingdom();
  learn(state, 'surveying');
  build(state, 'surveyor_office');

  const first = surveyCost(state);
  const grassBefore = state.resources.grass;
  runSurvey(state);

  assert.ok(state.resources.grass <= grassBefore - first.grass + 200);
  const second = surveyCost(state);
  assert.ok(second.grass > first.grass, 'surveys should get dearer');
});

test('surveys are deterministic for a given seed', () => {
  const runs = [0, 1].map(() => {
    const state = kingdom(2024);
    learn(state, 'surveying');
    build(state, 'surveyor_office');
    return [0, 1, 2].map(() => runSurvey(state).find.id);
  });
  assert.deepEqual(runs[0], runs[1]);
});

test('a better office covers more ground', () => {
  const state = kingdom();
  learn(state, 'surveying');
  const office = build(state, 'surveyor_office');
  const reach = surveyReach(state);

  state.world.facilities[office.origin].level = 3;
  assert.ok(surveyReach(state) > reach);
});

test('surveys never reveal country that is still closed', () => {
  const state = kingdom();
  learn(state, 'surveying');
  build(state, 'surveyor_office');

  // Far more budget than ring 0 holds.
  revealFrontier(state, 5000);
  assert.ok(
    peaceLevel(state) <= ringCeiling(0) + 0.001,
    'exploration must stop at the edge of the open world'
  );
});

test('every survey find names real things', () => {
  for (const find of SURVEY_FINDS) {
    for (const resource of Object.keys(find.resources ?? {})) {
      assert.ok(RESOURCES[resource], `find ${find.id} gives unknown ${resource}`);
    }
    for (const id of find.stockPool ?? []) {
      assert.ok(FACILITIES[id], `find ${find.id} gives unknown ${id}`);
      assert.ok(!FACILITIES[id].locked, `find ${find.id} would hand out locked ${id}`);
    }
    assert.ok(find.weight > 0);
  }
});

test('the find table is exhaustive — every roll returns something', () => {
  const rng = createRng(1);
  for (let i = 0; i < 500; i++) assert.ok(rollFind(rng));
});

// ---------------------------------------------------------------------------
// Map rewards
// ---------------------------------------------------------------------------

test('map rewards pay out once, in order, and never twice', () => {
  const state = kingdom();
  state.stats.tilesCleared = MAP_REWARDS[1].tiles;

  const first = checkMapRewards(state);
  assert.equal(first.length, 2, 'both thresholds passed should pay');

  const second = checkMapRewards(state);
  assert.equal(second.length, 0, 'nothing should pay twice');
});

test('map reward thresholds only ever climb', () => {
  for (let i = 1; i < MAP_REWARDS.length; i++) {
    assert.ok(MAP_REWARDS[i].tiles > MAP_REWARDS[i - 1].tiles);
  }
});

test('exploring pays before the near country is even open', () => {
  // Ring 0's ceiling in tiles. A first reward above it cannot be collected by
  // a player who has not yet expanded — which is precisely who it is for.
  const ceiling = (ringCeiling(0) / 100) * TILE_COUNT;
  assert.ok(
    MAP_REWARDS[0].tiles < ceiling,
    `the first map reward wants ${MAP_REWARDS[0].tiles} tiles but only ${ceiling} exist in ring 0`
  );
  assert.ok(MAP_REWARDS[1].tiles < ceiling, 'the second should be reachable too');
});

test('no map reward is beyond the whole world', () => {
  for (const reward of MAP_REWARDS) {
    assert.ok(reward.tiles < TILE_COUNT, `${reward.name} can never be reached`);
  }
});

// ---------------------------------------------------------------------------
// The gates, and the ceiling they have to sit under
// ---------------------------------------------------------------------------

test('every zone gate is reachable from the ring below it', () => {
  for (const gate of ZONE_UNLOCKS) {
    if (gate.ring === 0) continue;
    const ceiling = ringCeiling(gate.ring - 1);
    assert.ok(
      gate.peace < ceiling,
      `ring ${gate.ring} wants ${gate.peace}% peace but only ${ceiling.toFixed(1)}% `
      + 'can ever be reached while it is closed — the map would be locked shut'
    );
  }
});

test('a charter exists for every town hall the gates ask for', () => {
  const granted = Object.values(RESEARCH)
    .reduce((sum, def) => sum + (def.grants.stock?.town_hall ?? 0), 0);
  const wanted = Math.max(...ZONE_UNLOCKS.map((gate) => gate.townHalls));
  assert.ok(granted + 1 >= wanted, 'the gates ask for halls no study can grant');
});

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

test('a schema 1 save still opens, with research fields filled in', () => {
  const state = kingdom();
  delete state.research;
  delete state.surveys;
  delete state.resources.tome;
  state.schemaVersion = 1;

  const restored = deserialize(JSON.stringify(state));

  assert.equal(restored.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(restored.research.completed, []);
  assert.equal(restored.surveys.done, 0);
  assert.equal(restored.resources.tome, 0, 'a missing store must read 0, never undefined');
});

test('research survives a save and load intact', () => {
  const state = kingdom();
  learn(state, 'surveying');
  startResearch(state, 'carpentry');
  advanceTicks(state, 30);

  const restored = deserialize(serialize(state));

  assert.deepEqual(restored.research.completed, ['surveying']);
  assert.equal(restored.research.active.id, 'carpentry');
  assert.equal(restored.research.active.progress, state.research.active.progress);
  assert.ok(restored.research.unlocked.includes('surveyor_office'));
});
