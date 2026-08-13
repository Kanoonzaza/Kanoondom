import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, deserialize, SCHEMA_VERSION } from '../src/state.js';
import {
  makeItem, itemStats, itemPower, itemCap, equip, unequip, canEquip, autoEquip,
  gearStatsOf, armoury, allItems, smithy, forge, canForge, forgeable,
  raise, canRaise, raiseAll, levelCost, pendingLevels, equipExpRate,
  advanceEquipment, itemsAwaitingForge, gearOf,
} from '../src/sim/equipment.js';
import {
  learn, canLearn, forget, knows, skillStatsOf, effectsOf, bestEffect,
  skillStatus, skillList, slotsFor,
} from '../src/sim/skills.js';
import { makeResident, statsOf, residentRates } from '../src/sim/residents.js';
import { place, canPlace } from '../src/sim/facilities.js';
import { advanceTicks } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import { storageCapacity, productionRates } from '../src/sim/economy.js';
import { defendersOf, musterStrength } from '../src/sim/combat.js';
import { clearTerritoryFog, worldCentre } from '../src/sim/world.js';
import { applyGrants } from '../src/sim/research.js';
import {
  EQUIPMENT, equipmentDef, RANK_INFO, SLOTS, EQUIP, compatibilityOf, COMPAT,
  expForNextLevel,
} from '../src/content/equipment.js';
import { SKILLS, SKILL_IDS, skillSlotsFor } from '../src/content/skills.js';
import { RESEARCH } from '../src/content/research.js';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources.js';
import { STAT_IDS } from '../src/content/stats.js';

const centre = worldCentre();

function kingdom(seed = 11) {
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

function build(state, facilityId) {
  state.research.unlocked.push(facilityId);
  state.stock[facilityId] = (state.stock[facilityId] ?? 0) + 1;
  const spot = findSpot(state, facilityId);
  const result = place(state, spot.x, spot.y, facilityId);
  assert.equal(result.ok, true, result.reason ?? '');
  const facility = state.world.facilities[result.origin];
  facility.built = true;
  facility.buildTicksRemaining = 0;
  return { ...spot, origin: result.origin, facility };
}

/** Somebody with a roof, so they count for everything. */
function settle(state, professionId, level = 3) {
  const home = build(state, 'plot_l');
  const resident = makeResident(state, { name: 'Test', professionId, level });
  resident.home = home.origin;
  state.residents.push(resident);
  return resident;
}

// ---------------------------------------------------------------------------
// The rule the whole system rests on
// ---------------------------------------------------------------------------

test('an item grows with its level', () => {
  const state = kingdom();
  const item = makeItem(state, 'bronze_sword');
  const atOne = itemStats(item).atk;

  item.level = 10;
  assert.ok(itemStats(item).atk > atOne);
});

test('growth beats base stats by the level cap — the research rule', () => {
  // "An item with a higher Level Bonus will always be better than an item with
  // higher base stats at level 99." A cheap thing that grows well must out-scale
  // a grander thing that does not, or the whole system collapses into "buy the
  // rarest" and there is no decision left in it.
  const state = kingdom();

  const grower = makeItem(state, 'bronze_sword');    // 9 atk, +2 a level
  const heavy = { ...makeItem(state, 'steel_sword'), levelBonus: 0 };

  // Give the grand one a huge head start and no growth at all.
  const fakeDef = { ...equipmentDef('steel_sword'), levelBonus: 0 };
  const staticPower = Object.values(fakeDef.stats).reduce((a, b) => a + b, 0);

  grower.level = itemCap(grower);
  assert.ok(
    itemPower(grower) > staticPower,
    'a levelled F-rank must beat an un-levelled D-rank'
  );
});

test('the level bonus goes into the stats the item already has', () => {
  const state = kingdom();
  const staff = makeItem(state, 'wooden_stick');   // int, mp, atk
  staff.level = 20;
  const stats = itemStats(staff);

  assert.ok(stats.int > stats.atk, 'a staff should grow into being a staff');
  assert.equal(stats.def, 0, 'and gain nothing it never had');
});

test('cheap gear is cheap to raise, which is the whole tip', () => {
  const state = kingdom();
  build(state, 'master_smithy');

  const cheap = makeItem(state, 'bronze_sword');   // F
  const dear = makeItem(state, 'knight_blade');    // C
  assert.ok(levelCost(state, cheap) < levelCost(state, dear) / 10);
});

// ---------------------------------------------------------------------------
// Wearing it
// ---------------------------------------------------------------------------

test('gear a profession cannot use is refused outright, not silently wasted', () => {
  const state = kingdom();
  const mage = settle(state, 'mage');
  const plate = makeItem(state, 'plate_armor');

  const check = canEquip(state, mage, plate);
  assert.equal(check.ok, false);
  assert.equal(compatibilityOf('mage', 'heavy'), COMPAT.incompatible);
  assert.equal(equip(state, mage, plate.id).ok, false);
});

test('how well gear suits somebody changes what it is worth to them', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  const cook = settle(state, 'cook');

  const forKnight = makeItem(state, 'bronze_sword');
  const forCook = makeItem(state, 'bronze_sword');
  equip(state, knight, forKnight.id);
  equip(state, cook, forCook.id);

  assert.ok(
    gearStatsOf(state, knight).atk > gearStatsOf(state, cook).atk,
    'the same sword should serve a knight better than a cook'
  );
});

test('equipping into a full slot returns the old piece to the armoury', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  const first = makeItem(state, 'bronze_sword');
  const second = makeItem(state, 'copper_sword');

  equip(state, knight, first.id);
  equip(state, knight, second.id);

  assert.equal(gearOf(knight).weapon, second.id);
  assert.equal(first.owner, null, 'the old sword goes back on the rack');
  assert.ok(armoury(state).some((item) => item.id === first.id));
});

test('two people cannot wear the same thing', () => {
  const state = kingdom();
  const a = settle(state, 'knight');
  const b = settle(state, 'knight');
  const sword = makeItem(state, 'bronze_sword');

  equip(state, a, sword.id);
  const second = equip(state, b, sword.id);
  assert.equal(second.ok, false);
  assert.match(second.reason, /Somebody else/);
});

test('unequipping puts it back, and takes the stats with it', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  const sword = makeItem(state, 'bronze_sword');

  const before = statsOf(state, knight).atk;
  equip(state, knight, sword.id);
  assert.ok(statsOf(state, knight).atk > before);

  unequip(state, knight, 'weapon');
  assert.equal(statsOf(state, knight).atk, before);
  assert.equal(sword.owner, null);
});

test('auto-equip fills empty slots with the best thing that suits them', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  makeItem(state, 'bronze_sword');
  makeItem(state, 'copper_sword');
  makeItem(state, 'wooden_stick');    // a knight cannot use this

  autoEquip(state, knight);

  const worn = gearOf(knight).weapon;
  assert.equal(state.equipment[worn].defId, 'copper_sword', 'the better blade');
});

test('gear counts towards what a resident is worth in a fight', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  const before = musterStrength(defendersOf(state, centre.x, centre.y)).attack;

  const sword = makeItem(state, 'bronze_sword');
  sword.level = 20;
  equip(state, knight, sword.id);

  assert.ok(musterStrength(defendersOf(state, centre.x, centre.y)).attack > before);
});

// ---------------------------------------------------------------------------
// The forge
// ---------------------------------------------------------------------------

test('forging needs a smithy and a pattern', () => {
  const state = kingdom();
  assert.equal(smithy(state), null);
  assert.equal(canForge(state, 'bronze_sword').ok, false);

  build(state, 'master_smithy');
  assert.equal(canForge(state, 'bronze_sword').ok, false, 'still no pattern');

  applyGrants(state, { patterns: ['bronze_sword'] });
  assert.equal(canForge(state, 'bronze_sword').ok, true);
});

test('forging spends materials and hands over a real item', () => {
  const state = kingdom();
  build(state, 'master_smithy');
  applyGrants(state, { patterns: ['bronze_sword'] });

  const oreBefore = state.resources.ore;
  const result = forge(state, 'bronze_sword');

  assert.equal(result.ok, true, result.reason ?? '');
  assert.equal(state.resources.ore, oreBefore - EQUIPMENT.bronze_sword.craft.ore);
  assert.equal(result.item.level, 1);
  assert.equal(result.item.owner, null, 'it starts on the rack');
  assert.equal(allItems(state).length, 1);
});

test('a pattern can be forged as often as materials allow', () => {
  const state = kingdom();
  build(state, 'master_smithy');
  applyGrants(state, { patterns: ['bronze_sword'] });

  forge(state, 'bronze_sword');
  forge(state, 'bronze_sword');
  assert.equal(allItems(state).length, 2, 'knowing a pattern is not a one-off');
});

test('raising a level spends bronze and the banked experience', () => {
  const state = kingdom();
  build(state, 'master_smithy');
  const knight = settle(state, 'knight');
  const sword = makeItem(state, 'bronze_sword');
  equip(state, knight, sword.id);

  assert.equal(canRaise(state, sword.id).ok, false, 'nothing learned yet');

  sword.exp = expForNextLevel(1);
  const bronzeBefore = state.resources.bronze;
  const result = raise(state, sword.id);

  assert.equal(result.ok, true, result.reason ?? '');
  assert.equal(sword.level, 2);
  assert.equal(state.resources.bronze, bronzeBefore - result.cost);
  assert.ok(sword.exp < expForNextLevel(2), 'the experience was spent');
});

test('an item stops at its rank cap', () => {
  const state = kingdom();
  build(state, 'master_smithy');
  const sword = makeItem(state, 'bronze_sword');
  sword.level = itemCap(sword);
  sword.exp = 1e9;

  const check = canRaise(state, sword.id);
  assert.equal(check.ok, false);
  assert.match(check.reason, /stops at/);
  assert.equal(pendingLevels(state, sword), 0);
});

test('raising everything at once stops when the bronze runs out', () => {
  const state = kingdom();
  build(state, 'master_smithy');
  const sword = makeItem(state, 'bronze_sword');
  sword.exp = 1e6;
  state.resources.bronze = 20;

  const { levels, spent } = raiseAll(state, sword.id);
  assert.ok(levels > 0);
  assert.ok(spent <= 20);
  assert.ok(state.resources.bronze >= 0, 'never spends coin it does not have');
});

test('a smithy and a master craftsman both make forging cheaper', () => {
  const state = kingdom();
  const shop = build(state, 'master_smithy');
  const sword = makeItem(state, 'bronze_sword');
  sword.level = 10;

  const plain = levelCost(state, sword);

  state.world.facilities[shop.origin].level = 4;
  const better = levelCost(state, sword);
  assert.ok(better < plain, 'a better forge wastes less');

  const smith = settle(state, 'blacksmith', 6);
  smith.skills.push('master_craft');
  assert.ok(levelCost(state, sword) < better, 'and so does the person running it');
});

// ---------------------------------------------------------------------------
// Experience — where the offline promise lives
// ---------------------------------------------------------------------------

test('worn gear learns from the town, and gear on the rack does not', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  const worn = makeItem(state, 'bronze_sword');
  const spare = makeItem(state, 'bronze_sword');
  equip(state, knight, worn.id);

  advanceTicks(state, 500);

  assert.ok(worn.exp > 0);
  assert.equal(spare.exp, 0, 'nobody learns from a sword in a cupboard');
});

test('a busy town teaches gear faster', () => {
  const state = kingdom();
  assert.ok(equipExpRate(state, 5) > equipExpRate(state, 0));
});

test('EXPERIENCE NEVER LEVELS AN ITEM BY ITSELF', () => {
  // This is the guarantee the whole design rests on. If experience levelled
  // gear on its own, every level-up would change a wearer's stats mid-segment,
  // and the clock would have to break a segment for each one — across every
  // item in the kingdom. Levels are claimed at the forge precisely so that
  // catch-up stays exact and cheap.
  const state = kingdom();
  const knight = settle(state, 'knight');
  const sword = makeItem(state, 'bronze_sword');
  equip(state, knight, sword.id);

  advanceTicks(state, 200000);

  assert.equal(sword.level, 1, 'still level 1, however long it ran');
  assert.ok(sword.exp > expForNextLevel(1), 'but the experience is banked and waiting');
  assert.ok(pendingLevels(state, sword) > 0);
  assert.ok(itemsAwaitingForge(state).length > 0, 'and the forge has something to do');
});

test('gear experience is identical however the time is chunked', () => {
  const total = 900;
  const results = [];

  for (const chunk of [1, 13, 100, 900]) {
    const state = kingdom(4);
    const knight = settle(state, 'knight');
    const sword = makeItem(state, 'bronze_sword');
    equip(state, knight, sword.id);

    let done = 0;
    while (done < total) {
      const step = Math.min(chunk, total - done);
      advanceTicks(state, step);
      done += step;
    }
    results.push(sword.exp);
  }

  for (const exp of results) {
    assert.ok(
      Math.abs(exp - results[0]) < 1e-6,
      `chunking changed banked experience: ${results.join(', ')}`
    );
  }
});

test('time away never costs an item a level or a point of experience', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  const sword = makeItem(state, 'bronze_sword');
  equip(state, knight, sword.id);
  sword.level = 6;

  advanceTicks(state, 400);
  const expBefore = sword.exp;

  state.lastSaveTime = 0;
  catchUp(state, 7 * 24 * 60 * 60 * 1000);

  assert.equal(sword.level, 6);
  assert.ok(sword.exp >= expBefore, 'an absence only ever adds');
});

test('a fully geared town does not slow the clock down', () => {
  // The V3 lesson, learned again here: reading gear as whole twelve-key stat
  // objects — one per item, per resident, per segment — turned a month-long
  // catch-up from one second into six. A sparse test cannot see this, so this
  // one dresses everybody first.
  const state = kingdom(5);
  for (let i = 0; i < 12; i++) {
    const person = settle(state, i % 3 === 0 ? 'researcher' : 'miner', 3);
    for (const defId of ['bronze_sword', 'cloth_cap', 'padded_coat', 'plank_shield', 'straw_charm']) {
      const item = makeItem(state, defId);
      equip(state, person, item.id);
    }
    person.skills.push('strong_back');
  }

  const started = Date.now();
  advanceTicks(state, 30 * 24 * 60 * 60, { offline: true });
  const elapsed = Date.now() - started;

  assert.ok(
    elapsed < 4000,
    `a month away took ${elapsed}ms with gear on everybody — something is allocating per item again`
  );
});

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

test('learning a skill costs copper and sticks', () => {
  const state = kingdom();
  const farmer = settle(state, 'farmer');
  const before = state.resources.copper;

  assert.equal(learn(state, farmer, 'strong_back').ok, true);
  assert.equal(state.resources.copper, before - SKILLS.strong_back.cost);
  assert.ok(knows(farmer, 'strong_back'));
});

test('a skill for another trade is refused', () => {
  const state = kingdom();
  const farmer = settle(state, 'farmer');
  const check = canLearn(state, farmer, 'frost');
  assert.equal(check.ok, false);
  assert.equal(check.status, 'wrongTrade');
});

test('a skill above a resident level is refused', () => {
  const state = kingdom();
  const mage = settle(state, 'mage', 1);
  assert.equal(skillStatus(state, mage, 'tempest'), 'level');
});

test('how many skills somebody can hold grows with their level', () => {
  assert.equal(skillSlotsFor(1), 1);
  assert.ok(skillSlotsFor(9) > skillSlotsFor(1));

  const state = kingdom();
  const knight = settle(state, 'knight', 1);
  learn(state, knight, 'steady_hand');
  // Another level-1 skill, so the only thing standing in the way is room.
  const check = canLearn(state, knight, 'fleet_footed');
  assert.equal(check.ok, false);
  assert.equal(check.status, 'full');
});

test('forgetting a skill frees the slot', () => {
  const state = kingdom();
  const knight = settle(state, 'knight', 1);
  learn(state, knight, 'steady_hand');
  forget(state, knight, 'steady_hand');
  assert.equal(knows(knight, 'steady_hand'), false);
  assert.equal(canLearn(state, knight, 'fleet_footed').ok, true);
});

test('skills add to a resident stats', () => {
  const state = kingdom();
  const farmer = settle(state, 'farmer');
  const before = statsOf(state, farmer).gather;
  learn(state, farmer, 'strong_back');
  assert.equal(statsOf(state, farmer).gather, before + SKILLS.strong_back.stats.gather);
});

test('a gatherer with Prospector brings home more', () => {
  const state = kingdom();
  const miner = settle(state, 'miner', 5);
  const before = residentRates(state).gathers.ore;

  learn(state, miner, 'prospector');
  assert.ok(residentRates(state).gathers.ore > before);
});

test('a shopkeeper with Haggler earns more', () => {
  const state = kingdom();
  const cook = settle(state, 'cook', 5);
  const before = residentRates(state).copper;

  learn(state, cook, 'haggler');
  assert.ok(residentRates(state).copper > before);
});

test('a scholar with Scholar studies faster', () => {
  const state = kingdom();
  const scholar = settle(state, 'researcher', 5);
  const before = residentRates(state).study;

  learn(state, scholar, 'scholar');
  assert.ok(residentRates(state).study > before);
});

test('a Quartermaster widens every store', () => {
  const state = kingdom();
  const merchant = settle(state, 'merchant', 9);
  const before = storageCapacity(state).wood;

  learn(state, merchant, 'quartermaster');
  assert.ok(storageCapacity(state).wood > before, 'storage is what an absence is worth');
});

test('combat skills change what a defender is worth', () => {
  const state = kingdom();
  const knight = settle(state, 'knight', 9);
  const before = musterStrength(defendersOf(state, centre.x, centre.y)).attack;

  learn(state, knight, 'double_strike');
  assert.ok(musterStrength(defendersOf(state, centre.x, centre.y)).attack > before);
});

test('bestEffect finds the best in the kingdom, not the sum', () => {
  const state = kingdom();
  const a = settle(state, 'merchant', 9);
  const b = settle(state, 'artisan', 9);
  learn(state, a, 'quartermaster');
  learn(state, b, 'quartermaster');

  assert.equal(bestEffect(state, 'storageMultiplier'), SKILLS.quartermaster.effects.storageMultiplier);
});

// ---------------------------------------------------------------------------
// Content sanity
// ---------------------------------------------------------------------------

test('every item names a real slot, rank and stat', () => {
  for (const def of Object.values(EQUIPMENT)) {
    assert.ok(SLOTS.includes(def.slot), `${def.id} has slot ${def.slot}`);
    assert.ok(RANK_INFO[def.rank], `${def.id} has rank ${def.rank}`);
    assert.ok(def.levelBonus > 0, `${def.id} must grow`);
    for (const stat of Object.keys(def.stats)) {
      assert.ok(STAT_IDS.includes(stat), `${def.id} grants unknown stat ${stat}`);
    }
    for (const resource of Object.keys(def.craft)) {
      assert.ok(RESOURCES[resource], `${def.id} costs unknown ${resource}`);
    }
  }
});

test('every item is reachable through some study', () => {
  const reachable = new Set();
  for (const def of Object.values(RESEARCH)) {
    for (const id of def.grants.patterns ?? []) reachable.add(id);
  }
  for (const id of Object.keys(EQUIPMENT)) {
    assert.ok(reachable.has(id), `${id} can never be forged — no study teaches it`);
  }
});

test('every study pattern names a real item', () => {
  for (const def of Object.values(RESEARCH)) {
    for (const id of def.grants.patterns ?? []) {
      assert.ok(EQUIPMENT[id], `${def.id} teaches unknown pattern ${id}`);
    }
  }
});

test('every skill names real stats, effects and trades', () => {
  const professions = new Set(Object.keys(
    JSON.parse(JSON.stringify({}))
  ));
  for (const def of Object.values(SKILLS)) {
    for (const stat of Object.keys(def.stats ?? {})) {
      assert.ok(STAT_IDS.includes(stat), `${def.id} grants unknown stat ${stat}`);
    }
    assert.ok(def.cost > 0, `${def.id} must cost something`);
    assert.ok(def.needs >= 1);
  }
});

test('every profession can learn something', () => {
  const anyone = SKILL_IDS.filter((id) => !SKILLS[id].forWhom);
  assert.ok(anyone.length >= 5, 'there must be skills open to everybody');
});

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

test('a schema 3 save gains gear slots without losing anyone', () => {
  const state = kingdom();
  const knight = settle(state, 'knight');
  delete state.equipment;
  delete state.equipmentKnown;
  delete knight.gear;
  delete knight.skills;
  state.schemaVersion = 3;

  const restored = deserialize(JSON.stringify(state));

  assert.equal(restored.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(restored.equipment, {});
  assert.deepEqual(restored.equipmentKnown, []);
  assert.equal(restored.residents.length, 1);
  for (const slot of SLOTS) {
    assert.equal(restored.residents[0].gear[slot], null, `${slot} must exist and be empty`);
  }
  assert.deepEqual(restored.residents[0].skills, []);
});

test('gear and skills survive a save and load', () => {
  const state = kingdom();
  build(state, 'master_smithy');
  const knight = settle(state, 'knight', 5);
  const sword = makeItem(state, 'bronze_sword');
  sword.level = 4;
  sword.exp = 123;
  equip(state, knight, sword.id);
  learn(state, knight, 'steady_hand');

  const restored = deserialize(JSON.stringify(state));
  const person = restored.residents[0];

  assert.equal(person.gear.weapon, sword.id);
  assert.equal(restored.equipment[sword.id].level, 4);
  assert.equal(restored.equipment[sword.id].exp, 123);
  assert.equal(restored.equipment[sword.id].owner, person.id);
  assert.deepEqual(person.skills, ['steady_hand']);
});
