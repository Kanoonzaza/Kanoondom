import test from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources.js';
import { newGame, serialize, deserialize } from '../src/state.js';
import {
  canPlace, place, remove, relocate, upgrade, canUpgrade,
  facilityAt, footprintTiles, countPlaced, stockOf, allFacilities,
  reindexOccupancy, outputMultiplier,
} from '../src/sim/facilities.js';
import { auraAt, auraSources, auraScore, distanceToFootprint } from '../src/sim/aura.js';
import {
  clearTerritoryFog, clearFog, isCleared, inTerritory, tileIndex, worldCentre, biomeAt,
} from '../src/sim/world.js';
import { BIOMES } from '../src/content/biomes.js';

const buildableGrass = (state, x, y) => BIOMES[biomeAt(state, x, y)]?.buildable === true;
import { advanceTicks } from '../src/sim/tick.js';
import { FACILITIES, MAX_FACILITY_LEVEL, effectScale } from '../src/content/facilities.js';
import { TOWN_HALL } from '../src/content/config.js';

/** A settled kingdom with plenty in the coffers. */
function kingdom(seed = 1) {
  const state = newGame(seed, { now: 0 });
  clearTerritoryFog(state);
  for (const id of RESOURCE_IDS) state.resources[id] = Math.min(100000, RESOURCES[id].baseStorage);
  for (const id of Object.keys(state.stock)) state.stock[id] = 20;
  return state;
}

const centre = worldCentre();

/** Place and finish instantly. */
function build(state, x, y, id) {
  const result = place(state, x, y, id);
  assert.ok(result.ok, `could not place ${id}: ${result.reason}`);
  const facility = state.world.facilities[result.origin];
  facility.buildTicksRemaining = 0;
  facility.built = true;
  return result.origin;
}

// --- footprints and occupancy ----------------------------------------------

test('a footprint covers every tile of its size', () => {
  assert.deepEqual(
    footprintTiles(10, 10, { w: 2, h: 2 }).sort((a, b) => a - b),
    [tileIndex(10, 10), tileIndex(11, 10), tileIndex(10, 11), tileIndex(11, 11)].sort((a, b) => a - b)
  );
});

test('every covered tile answers with the same facility', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'field'); // 2x2

  const origin = facilityAt(state, centre.x, centre.y - 3);
  assert.equal(origin.id, 'field');

  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const found = facilityAt(state, centre.x + dx, centre.y - 3 + dy);
    assert.ok(found, `tile ${dx},${dy} of the footprint reports nothing`);
    assert.equal(found.origin, origin.origin, 'all four tiles share one origin');
  }
  assert.equal(facilityAt(state, centre.x + 2, centre.y - 3), null, 'and it stops there');
});

test('nothing may be built on top of something else', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'field');

  // Overlapping by a single corner is still overlapping.
  const check = canPlace(state, centre.x + 1, centre.y - 2, 'field');
  assert.equal(check.ok, false);
  assert.match(check.reason, /already stands/);
});

test('occupancy stays true to the facilities after churn', () => {
  // The index is maintained rather than recomputed, so it could drift.
  const state = kingdom(3);
  const spots = [[centre.x - 4, centre.y - 4], [centre.x, centre.y - 4], [centre.x + 4, centre.y - 4]];
  for (const [x, y] of spots) build(state, x, y, 'field');

  remove(state, spots[1][0], spots[1][1]);
  build(state, centre.x, centre.y + 4, 'plantation');

  const maintained = { ...state.world.occupied };
  const rebuilt = reindexOccupancy(state);
  assert.deepEqual(maintained, rebuilt, 'the maintained index drifted from the truth');
});

// --- placement rules --------------------------------------------------------

test('you cannot build what you have none of', () => {
  const state = kingdom();
  state.stock.field = 0;
  const check = canPlace(state, centre.x, centre.y - 3, 'field');
  assert.equal(check.ok, false);
  assert.match(check.reason, /None left/);
});

test('placing spends materials and takes one from your hand', () => {
  const state = kingdom();
  const woodBefore = state.resources.wood;
  const stockBefore = stockOf(state, 'field');

  build(state, centre.x, centre.y - 3, 'field');

  assert.equal(state.resources.wood, woodBefore - FACILITIES.field.cost.wood);
  assert.equal(stockOf(state, 'field'), stockBefore - 1);
  assert.equal(countPlaced(state, 'field'), 1);
});

test('you cannot build what you cannot afford', () => {
  const state = kingdom();
  for (const id of Object.keys(state.resources)) state.resources[id] = 0;
  const check = canPlace(state, centre.x, centre.y - 3, 'field');
  assert.equal(check.ok, false);
  assert.match(check.reason, /Not enough/);
});

test('you cannot build outside your borders, or on unexplored land', () => {
  const state = kingdom();
  const far = canPlace(state, centre.x + 30, centre.y, 'field');
  assert.equal(far.ok, false);
  assert.match(far.reason, /not open to you|Explore|borders/);
});

test('a town hall alone may be founded outside the borders', () => {
  // Otherwise the kingdom could never expand.
  const state = kingdom();
  state.stock.town_hall = 1;

  // Somewhere explored and buildable, beyond the border but still inside the
  // homeland ring — which means the corners, since the radius reaches further
  // along the axes than the zone edge does.
  let spot = null;
  for (let d = 11; d <= 14 && !spot; d++) {
    const x = centre.x + d;
    const y = centre.y + d;
    const tiles = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
    if (!tiles.every(([tx, ty]) => buildableGrass(state, tx, ty))) continue;
    if (inTerritory(state, x, y)) continue;
    for (const [tx, ty] of tiles) clearFog(state, tx, ty);
    if (tiles.every(([tx, ty]) => isCleared(state, tx, ty))) spot = [x, y];
  }
  assert.ok(spot, 'test needs open ground beyond the border but inside the homeland');

  assert.equal(canPlace(state, spot[0], spot[1], 'field').ok, false, 'a field may not');
  assert.equal(canPlace(state, spot[0], spot[1], 'town_hall').ok, true, 'a town hall may');
});

test('founding a town hall extends the kingdom', () => {
  const state = kingdom();
  state.stock.town_hall = 1;
  const before = state.townHalls.length;

  build(state, centre.x - 2, centre.y - 2, 'town_hall');
  assert.equal(state.townHalls.length, before + 1);
});

test('only five town halls, as the real game allows', () => {
  const state = kingdom();
  state.stock.town_hall = 10;
  for (let i = 1; i < TOWN_HALL.maxHalls; i++) {
    build(state, centre.x - 4 + i * 3, centre.y - 6, 'town_hall');
  }
  assert.equal(state.townHalls.length, TOWN_HALL.maxHalls);

  const check = canPlace(state, centre.x, centre.y + 6, 'town_hall');
  assert.equal(check.ok, false);
  assert.match(check.reason, /5 town halls/);
});

test('nothing stands on lava or sea', () => {
  const state = kingdom();
  // The rim is always sea.
  clearFog(state, 1, 1);
  const check = canPlace(state, 1, 1, 'field');
  assert.equal(check.ok, false);
});

// --- removal and relocation -------------------------------------------------

test('removing returns the facility to your hand and refunds materials', () => {
  const state = kingdom();
  const stockBefore = stockOf(state, 'field');
  build(state, centre.x, centre.y - 3, 'field');
  const woodAfterBuild = state.resources.wood;

  assert.ok(remove(state, centre.x, centre.y - 3).ok);

  assert.equal(stockOf(state, 'field'), stockBefore, 'it is back in your hand');
  assert.equal(state.resources.wood, woodAfterBuild + Math.floor(FACILITIES.field.cost.wood / 2));
  assert.equal(facilityAt(state, centre.x, centre.y - 3), null);
  assert.equal(state.world.occupied[tileIndex(centre.x + 1, centre.y - 2)], undefined);
});

test('the last town hall may never be removed', () => {
  const state = kingdom();
  const hall = state.townHalls[0];
  const check = remove(state, hall.x, hall.y);
  assert.equal(check.ok, false);
  assert.match(check.reason, /last town hall/);
});

test('relocating costs the price again but keeps the level', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'field');
  const facility = state.world.facilities[tileIndex(centre.x, centre.y - 3)];
  facility.level = 3;

  const woodBefore = state.resources.wood;
  assert.ok(relocate(state, centre.x, centre.y - 3, centre.x + 4, centre.y - 3).ok);

  assert.equal(facilityAt(state, centre.x, centre.y - 3), null, 'gone from the old spot');
  const moved = facilityAt(state, centre.x + 4, centre.y - 3);
  assert.equal(moved.id, 'field');
  assert.equal(moved.level, 3, 'the investment survives the move');
  assert.ok(state.resources.wood < woodBefore, 'and it cost to move');
});

test('a failed relocation puts the facility back exactly as it was', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'field');
  const facility = state.world.facilities[tileIndex(centre.x, centre.y - 3)];
  facility.level = 2;

  // Somewhere it cannot go.
  const result = relocate(state, centre.x, centre.y - 3, 1, 1);
  assert.equal(result.ok, false);

  const back = facilityAt(state, centre.x, centre.y - 3);
  assert.ok(back, 'the facility must not vanish on a failed move');
  assert.equal(back.level, 2);
  assert.equal(back.built, true);
  assert.equal(countPlaced(state, 'field'), 1, 'and must not be duplicated');
});

test('a one-tile nudge does not collide with itself', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'field');
  const result = relocate(state, centre.x, centre.y - 3, centre.x + 1, centre.y - 3);
  assert.ok(result.ok, `overlapping move refused: ${result.reason}`);
});

// --- the ground beneath ------------------------------------------------------

test('a field does better on grass than on rock', () => {
  const state = kingdom();
  const origin = build(state, centre.x, centre.y - 3, 'field');
  const onGrass = outputMultiplier(state, state.world.facilities[origin], origin);
  assert.ok(onGrass > 1, 'grass should reward a field');
  assert.ok(onGrass <= 1 + 0.3 + 1e-9);
});

test('levels multiply output', () => {
  const state = kingdom();
  const origin = build(state, centre.x, centre.y - 3, 'field');
  const atOne = outputMultiplier(state, state.world.facilities[origin], origin);

  state.world.facilities[origin].level = 2;
  const atTwo = outputMultiplier(state, state.world.facilities[origin], origin);
  assert.ok(Math.abs(atTwo - atOne * effectScale(2)) < 1e-9);
});

// --- upgrading ---------------------------------------------------------------

test('upgrading raises the level and stops at the maximum', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'granary');

  for (let level = 1; level < MAX_FACILITY_LEVEL; level++) {
    const result = upgrade(state, centre.x, centre.y - 3);
    assert.ok(result.ok, result.reason);
    advanceTicks(state, result.ticks);
  }

  assert.equal(facilityAt(state, centre.x, centre.y - 3).level, MAX_FACILITY_LEVEL);
  assert.match(canUpgrade(state, centre.x, centre.y - 3).reason, /best/);
});

test('a facility keeps working while it is being upgraded', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'field');
  const result = upgrade(state, centre.x, centre.y - 3);

  assert.equal(facilityAt(state, centre.x, centre.y - 3).level, 1, 'still level 1');
  advanceTicks(state, result.ticks - 1);
  assert.equal(facilityAt(state, centre.x, centre.y - 3).level, 1);

  const report = advanceTicks(state, 1);
  assert.equal(facilityAt(state, centre.x, centre.y - 3).level, 2);
  assert.equal(report.upgraded.length, 1, 'and it is reported exactly once');
});

// --- auras -------------------------------------------------------------------
//
// These build well clear of the founding Town Hall: it is a real facility with
// a radius-6 aura of its own, so anything inside that would be measuring two
// buildings at once.
const AURA_Y = centre.y - 9;

test('distance is measured to the nearest tile of a footprint', () => {
  // A 2x2 building radiates from its whole body, not one corner.
  assert.equal(distanceToFootprint(10, 10, 10, 10, { w: 2, h: 2 }), 0);
  assert.equal(distanceToFootprint(11, 11, 10, 10, { w: 2, h: 2 }), 0);
  assert.equal(distanceToFootprint(12, 10, 10, 10, { w: 2, h: 2 }), 1);
  assert.equal(distanceToFootprint(9, 9, 10, 10, { w: 2, h: 2 }), 1);
  assert.equal(distanceToFootprint(14, 10, 10, 10, { w: 2, h: 2 }), 3);
});

test('an aura reaches its radius and no further', () => {
  const state = kingdom();
  build(state, centre.x, AURA_Y, 'well'); // radius 3, vigor 8

  assert.equal(auraAt(state, centre.x, AURA_Y).vigor, FACILITIES.well.aura.stats.vigor);
  assert.equal(auraAt(state, centre.x + 3, AURA_Y).vigor, FACILITIES.well.aura.stats.vigor);
  assert.equal(auraAt(state, centre.x + 4, AURA_Y).vigor, 0, 'and stops at the edge');
});

test('auras from several facilities add up', () => {
  const state = kingdom();
  build(state, centre.x, AURA_Y, 'well');   // vigor 8
  build(state, centre.x + 1, AURA_Y, 'path'); // move 6, radius 1

  const aura = auraAt(state, centre.x + 1, AURA_Y);
  assert.equal(aura.vigor, FACILITIES.well.aura.stats.vigor);
  assert.equal(aura.move, FACILITIES.path.aura.stats.move);
});

test('an unfinished facility radiates nothing', () => {
  const state = kingdom();
  const result = place(state, centre.x, AURA_Y, 'well');
  assert.ok(result.ok);

  assert.equal(auraAt(state, centre.x, AURA_Y).vigor, 0, 'a building site is not a well');
  advanceTicks(state, FACILITIES.well.buildTicks);
  assert.ok(auraAt(state, centre.x, AURA_Y).vigor > 0, 'and now it is');
});

test('levelling a facility strengthens its aura', () => {
  const state = kingdom();
  const origin = build(state, centre.x, AURA_Y, 'well');
  const before = auraAt(state, centre.x, AURA_Y).vigor;

  state.world.facilities[origin].level = 3;
  assert.equal(auraAt(state, centre.x, AURA_Y).vigor, before * effectScale(3));
});

test('aura sources explain WHY a spot is good', () => {
  const state = kingdom();
  build(state, centre.x, AURA_Y, 'well');
  build(state, centre.x + 1, AURA_Y, 'path');

  const sources = auraSources(state, centre.x + 1, AURA_Y);
  assert.equal(sources.length, 2);
  assert.ok(sources.every((source) => source.name && source.stats));
  assert.ok(sources[0].distance <= sources[1].distance, 'nearest first');
  assert.ok(auraScore(state, centre.x + 1, AURA_Y) > 0);
});

// --- persistence -------------------------------------------------------------

test('facilities survive a save round-trip, occupancy included', () => {
  const state = kingdom();
  build(state, centre.x, centre.y - 3, 'field');
  build(state, centre.x + 3, centre.y - 3, 'granary');

  const restored = deserialize(serialize(state, 0));
  assert.deepEqual(restored, state);
  assert.equal(facilityAt(restored, centre.x + 1, centre.y - 2).id, 'field');
  assert.deepEqual(
    allFacilities(restored).map((f) => f.id).sort(),
    ['field', 'granary', 'town_hall'],
    'the founding hall is a facility too'
  );
});
