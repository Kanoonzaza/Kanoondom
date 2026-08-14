import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, deserialize, dayNumber, SCHEMA_VERSION } from '../src/state.js';
import {
  bedBeside, hasChurch, canMarry, marry, possibleMatches, partnerOf, coupleOf,
  childrenAllowed, expecting, ticksToNextBirth, childOf, resolveBirths, couples,
} from '../src/sim/marriage.js';
import {
  makeResident, statsOf, baseStatsFor, residentRates, freeBeds,
} from '../src/sim/residents.js';
import { advanceTicks } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import { place, canPlace } from '../src/sim/facilities.js';
import { clearTerritoryFog, worldCentre, tileX, tileY } from '../src/sim/world.js';
import { MARRIAGE, DAY, RESIDENTS } from '../src/content/config.js';
import { RESEARCH } from '../src/content/research.js';
import { FACILITIES } from '../src/content/facilities.js';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources.js';

const centre = worldCentre();

function kingdom(seed = 41) {
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

function build(state, facilityId, at = null) {
  state.research.unlocked.push(facilityId);
  state.stock[facilityId] = (state.stock[facilityId] ?? 0) + 1;
  const spot = at ?? findSpot(state, facilityId);
  const result = place(state, spot.x, spot.y, facilityId);
  assert.equal(result.ok, true, result.reason ?? '');
  const facility = state.world.facilities[result.origin];
  facility.built = true;
  facility.buildTicksRemaining = 0;
  return result.origin;
}

function settle(state, professionId, home, level = 5, name = professionId) {
  const resident = makeResident(state, { name, professionId, level });
  resident.home = home;
  state.residents.push(resident);
  return resident;
}

/** A house with a double bed beside it, a monk in town, and two people in it. */
function readyToWed(state, { hearts = 40 } = {}) {
  const home = build(state, 'plot_l');

  // Put the bed on a tile adjacent to the house footprint.
  const hx = tileX(home);
  const hy = tileY(home);
  let bed = null;
  for (const [dx, dy] of [[3, 0], [-1, 0], [0, 3], [0, -1], [3, 3], [-1, -1]]) {
    const spot = { x: hx + dx, y: hy + dy };
    if (canPlace(state, spot.x, spot.y, 'double_bed').ok
        || (state.research.unlocked.push('double_bed'),
            state.stock.double_bed = (state.stock.double_bed ?? 0) + 1,
            canPlace(state, spot.x, spot.y, 'double_bed').ok)) {
      bed = build(state, 'double_bed', spot);
      break;
    }
  }
  assert.ok(bed !== null, 'the fixture needs a bed beside the house');

  const monkHome = build(state, 'plot_s');
  settle(state, 'monk', monkHome, 5, 'Brother Fen');

  const a = settle(state, 'cook', home, 5, 'Ilsa');
  const b = settle(state, 'blacksmith', home, 5, 'Corin');
  // Heart is what makes a match; give them enough without depending on layout.
  a.baseStats.heart = hearts;
  b.baseStats.heart = hearts;
  return { home, bed, a, b };
}

// ---------------------------------------------------------------------------
// The three requirements
// ---------------------------------------------------------------------------

test('a couple needs a double bed beside their house', () => {
  const state = kingdom();
  const home = build(state, 'plot_l');
  const monkHome = build(state, 'plot_s');
  settle(state, 'monk', monkHome);
  const a = settle(state, 'cook', home, 5, 'Ilsa');
  const b = settle(state, 'blacksmith', home, 5, 'Corin');
  a.baseStats.heart = 40;
  b.baseStats.heart = 40;

  assert.equal(bedBeside(state, home), null);
  const check = canMarry(state, a.id, b.id);
  assert.equal(check.ok, false);
  assert.match(check.reason, /Double Bed/);
});

test('a couple needs somebody to marry them', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  // Send the monk away and the ceremony has nobody to perform it.
  state.residents = state.residents.filter((person) => person.professionId !== 'monk');

  assert.equal(hasChurch(state), false);
  const check = canMarry(state, a.id, b.id);
  assert.equal(check.ok, false);
  assert.match(check.reason, /Monk/);
});

test('a couple must share a house', () => {
  const state = kingdom();
  const { a } = readyToWed(state);
  const elsewhere = build(state, 'plot_s');
  const c = settle(state, 'farmer', elsewhere, 5, 'Nera');
  c.baseStats.heart = 40;

  const check = canMarry(state, a.id, c.id);
  assert.equal(check.ok, false);
  assert.match(check.reason, /share a house/);
});

test('Heart is what makes a match, and the shortfall is named', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state, { hearts: 1 });

  const check = canMarry(state, a.id, b.id);
  assert.equal(check.ok, false);
  assert.match(check.reason, /Heart/);
  assert.match(check.reason, /of \d+ Heart/, 'the player must be told how far off they are');
});

test('a wedding pairs them and charges the ceremony', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  const copperBefore = state.resources.copper;

  const result = marry(state, a.id, b.id);
  assert.equal(result.ok, true, result.reason ?? '');
  assert.equal(a.partnerId, b.id);
  assert.equal(b.partnerId, a.id);
  assert.equal(state.resources.copper, copperBefore - MARRIAGE.cost.copper);
  assert.equal(partnerOf(state, a).id, b.id);
  assert.ok(coupleOf(state, a));
});

test('nobody marries twice', () => {
  const state = kingdom();
  const { home, a, b } = readyToWed(state);
  marry(state, a.id, b.id);

  const c = settle(state, 'farmer', home, 5, 'Nera');
  c.baseStats.heart = 40;
  const check = canMarry(state, a.id, c.id);
  assert.equal(check.ok, false);
  assert.match(check.reason, /already married/);
});

test('marriage makes people happier, and that shows in their trade', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  const heartBefore = statsOf(state, a).heart;
  const incomeBefore = residentRates(state).copper;

  marry(state, a.id, b.id);

  assert.equal(statsOf(state, a).heart, heartBefore + MARRIAGE.heartBonus);
  assert.ok(residentRates(state).copper > incomeBefore, 'and the shop does better for it');
});

test('the possible matches list only offers people who share a roof', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  const matches = possibleMatches(state);

  assert.ok(matches.some((m) => m.a.id === a.id && m.b.id === b.id));
  for (const match of matches) {
    assert.equal(match.a.home, match.b.home, 'never offer a pair who live apart');
  }
});

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

test('no children until the kingdom is three towns wide — the real rule', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  marry(state, a.id, b.id);

  assert.equal(childrenAllowed(state), false);
  assert.equal(ticksToNextBirth(state), Infinity);

  advanceTicks(state, MARRIAGE.gestationDays * DAY.ticksPerDay * 2);
  assert.equal(state.couples[0].children, 0, 'a two-town kingdom has no children');
});

/** Three halls, so children are permitted. */
function threeTowns(state) {
  const hall = state.townHalls[0];
  state.townHalls.push({ id: 900, x: hall.x + 20, y: hall.y, level: 1, origin: -1 });
  state.townHalls.push({ id: 901, x: hall.x, y: hall.y + 20, level: 1, origin: -2 });
}

test('a married couple has a child once there are three towns', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  build(state, 'plot_l');            // somewhere for the child to sleep
  marry(state, a.id, b.id);
  threeTowns(state);

  assert.equal(childrenAllowed(state), true);
  const report = advanceTicks(state, (MARRIAGE.gestationDays + 1) * DAY.ticksPerDay);

  assert.equal(report.births.length, 1);
  assert.equal(state.couples[0].children, 1);
  const child = state.residents.find((person) => person.id === report.births[0].id);
  assert.deepEqual(child.parents, [a.id, b.id]);
});

test('THE SECOND GENERATION IS STRONGER, AND STAYS STRONGER', () => {
  // The heritage bonus is a multiplier rather than adjusted numbers precisely
  // because base stats are re-derived on every level-up. Bake it in once and
  // the first level-up silently erases it.
  const state = kingdom();
  const { a, b } = readyToWed(state);
  build(state, 'plot_l');
  marry(state, a.id, b.id);
  threeTowns(state);

  advanceTicks(state, (MARRIAGE.gestationDays + 1) * DAY.ticksPerDay);
  const child = state.residents.find((person) => person.parents);
  assert.ok(child, 'a child was born');
  assert.ok(child.heritage > 1, 'and carries more than an immigrant');

  const ordinary = baseStatsFor(child.professionId, child.level, 1);
  assert.ok(child.baseStats.hp > ordinary.hp, 'stronger at birth');

  // Now grow them up and check the inheritance survived.
  const levelBefore = child.level;
  advanceTicks(state, 200000);
  assert.ok(child.level > levelBefore, 'the child grew');
  assert.equal(child.heritage > 1, true);

  const plainAtSameLevel = baseStatsFor(child.professionId, child.level, 1);
  assert.ok(
    child.baseStats.hp > plainAtSameLevel.hp,
    'levelling must not quietly erase what they were born with'
  );
});

test('a third generation is better again, up to a ceiling', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  marry(state, a.id, b.id);
  const couple = state.couples[0];

  a.heritage = MARRIAGE.maxHeritage;
  b.heritage = MARRIAGE.maxHeritage;
  const child = childOf(state, couple, a, b);
  assert.ok(child.heritage <= MARRIAGE.maxHeritage, 'but it does not run away');

  a.heritage = 1.2;
  b.heritage = 1;
  const second = childOf(state, couple, a, b);
  assert.ok(second.heritage > 1.2, 'each generation gains on the last');
});

test('a couple stops at the limit', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  for (let i = 0; i < 6; i++) build(state, 'plot_l');
  marry(state, a.id, b.id);
  threeTowns(state);

  advanceTicks(state, MARRIAGE.gestationDays * DAY.ticksPerDay * (MARRIAGE.maxChildren + 3));

  assert.equal(state.couples[0].children, MARRIAGE.maxChildren);
  assert.equal(expecting(state, state.couples[0]), false);
  assert.equal(ticksToNextBirth(state), Infinity);
});

test('A CHILD IS BORN INTO ITS PARENTS HOME, bed or no bed', () => {
  // The first version queued newborns for a spare bed like immigrants off the
  // boat. The balance run showed what that costs: housing is exactly consumed
  // by arrivals, free beds sit at zero, and couples go thousands of days
  // overdue with nowhere to put a baby. Babies live with their families.
  const state = kingdom();
  const { home, a, b } = readyToWed(state);
  marry(state, a.id, b.id);
  threeTowns(state);

  // Fill every last bed in the kingdom.
  settle(state, 'farmer', home, 3, 'Lodger');
  assert.equal(freeBeds(state), 0, 'the fixture must have no spare bed at all');

  const report = advanceTicks(state, (MARRIAGE.gestationDays + 2) * DAY.ticksPerDay);

  assert.equal(report.births.length, 1, 'the child comes anyway');
  const child = state.residents.find((person) => person.parents);
  assert.equal(child.home, home, 'and lives with its parents');
  assert.ok(freeBeds(state) < 0, 'the family home is simply fuller than its bed count');
});

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

test('a child is born while the player is away', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  build(state, 'plot_l');
  marry(state, a.id, b.id);
  threeTowns(state);

  state.lastSaveTime = 0;
  const welcome = catchUp(state, (MARRIAGE.gestationDays + 2) * DAY.ticksPerDay * 1000);

  assert.equal(state.couples[0].children, 1);
  assert.ok(welcome, 'and it is worth coming back to');
});

test('births are identical however the time is chunked', () => {
  const runs = [];
  for (const chunk of [1, 137, 100000]) {
    const state = kingdom(52);
    const { a, b } = readyToWed(state);
    for (let i = 0; i < 4; i++) build(state, 'plot_l');
    marry(state, a.id, b.id);
    threeTowns(state);

    let done = 0;
    const total = MARRIAGE.gestationDays * DAY.ticksPerDay * 3;
    while (done < total) {
      const step = Math.min(chunk, total - done);
      advanceTicks(state, step);
      done += step;
    }
    runs.push(state.residents
      .filter((person) => person.parents)
      .map((person) => `${person.name}:${person.professionId}:${person.heritage.toFixed(3)}`)
      .join('|'));
  }
  assert.equal(runs[1], runs[0], 'the same children, in the same order');
  assert.equal(runs[2], runs[0]);
  assert.ok(runs[0].length > 0, 'the run should actually have produced children');
});

test('time away never un-marries anybody or takes a child', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  build(state, 'plot_l');
  marry(state, a.id, b.id);
  threeTowns(state);
  advanceTicks(state, (MARRIAGE.gestationDays + 1) * DAY.ticksPerDay);

  const peopleBefore = state.residents.length;
  const childrenBefore = state.couples[0].children;

  state.lastSaveTime = 0;
  catchUp(state, 7 * 24 * 60 * 60 * 1000);

  assert.equal(a.partnerId, b.id, 'still married');
  assert.ok(state.residents.length >= peopleBefore, 'nobody vanished');
  assert.ok(state.couples[0].children >= childrenBefore, 'no child was taken back');
});

test('a full house never stalls the clock', () => {
  // Found as SLOWNESS, not as a failure, back when a birth could be blocked: it
  // came due, could not resolve, and `ticksToNextBirth` answered "one tick"
  // forever, collapsing the clock into single-tick segments. A seven-day
  // catch-up took 34 seconds with entirely correct output — which is why this
  // guards the timing rather than the result.
  const state = kingdom(61);
  const { home, a, b } = readyToWed(state);
  marry(state, a.id, b.id);
  threeTowns(state);
  settle(state, 'farmer', home, 3, 'Lodger');
  assert.equal(freeBeds(state), 0, 'every bed taken');

  const started = Date.now();
  advanceTicks(state, 7 * 24 * 60 * 60, { offline: true });
  const elapsed = Date.now() - started;

  assert.ok(state.couples[0].children > 0, 'and children still arrive');
  assert.ok(elapsed < 8000, `a week with a full town took ${elapsed}ms`);
});

test('marriage never happens on its own while nobody is watching', () => {
  // A player should never come back to find two of their people paired off by
  // the simulation. Choosing it is a decision; waking up to it is an event that
  // happened TO you.
  const state = kingdom();
  readyToWed(state);

  state.lastSaveTime = 0;
  catchUp(state, 30 * 24 * 60 * 60 * 1000);

  assert.equal(state.couples.length, 0, 'the clock does not marry people');
});

// ---------------------------------------------------------------------------
// Content and saves
// ---------------------------------------------------------------------------

test('the double bed is locked and reachable through a study', () => {
  assert.equal(FACILITIES.double_bed.locked, true);
  const unlocked = new Set();
  for (const def of Object.values(RESEARCH)) {
    for (const id of def.grants.unlock ?? []) unlocked.add(id);
  }
  assert.ok(unlocked.has('double_bed'));
});

test('a schema 5 save gains couples without losing anybody', () => {
  const state = kingdom();
  const home = build(state, 'plot_l');
  settle(state, 'cook', home);
  delete state.couples;
  delete state.residents[0].partnerId;
  delete state.residents[0].heritage;
  state.schemaVersion = 5;

  const restored = deserialize(JSON.stringify(state));

  assert.equal(restored.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(restored.couples, []);
  assert.equal(restored.residents[0].partnerId, null);
  assert.equal(restored.residents[0].heritage, 1);
});

test('a marriage and a child survive a save and load', () => {
  const state = kingdom();
  const { a, b } = readyToWed(state);
  build(state, 'plot_l');
  marry(state, a.id, b.id);
  threeTowns(state);
  advanceTicks(state, (MARRIAGE.gestationDays + 1) * DAY.ticksPerDay);

  const restored = deserialize(JSON.stringify(state));
  const child = restored.residents.find((person) => person.parents);

  assert.equal(restored.couples.length, 1);
  assert.equal(restored.couples[0].children, 1);
  assert.ok(child.heritage > 1, 'what they were born with is remembered');
  assert.equal(
    restored.residents.find((p) => p.id === a.id).partnerId, b.id
  );
});
