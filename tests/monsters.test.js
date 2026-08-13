import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, deserialize, dayNumber, isFullMoon, SCHEMA_VERSION,
} from '../src/state.js';
import {
  nestSites, activeNests, knownNests, isNestCleared, threatRate, wardStrength,
  pressingNests, distanceToKingdom, monsterStrength, threatFraction, threatLabel,
} from '../src/sim/monsters.js';
import {
  stepThreat, accrueThreat, raidsPermitted, grantGrace, graceRemaining,
  raidChance, resolveRaid, clearNest, canRaidNest, expeditionForecast,
  openCave, canEnterCave, enterCave, raidBand,
} from '../src/sim/raids.js';
import {
  defendersOf, musterStrength, bandStrength, resolveBattle, raidTargets,
} from '../src/sim/combat.js';
import { advanceTicks, createReport } from '../src/sim/tick.js';
import { catchUp } from '../src/sim/offline.js';
import {
  place, canPlace, isActive, isStanding, repair, repairCostFor,
} from '../src/sim/facilities.js';
import { makeResident, freeBeds, totalBeds } from '../src/sim/residents.js';
import { clearTerritoryFog, worldCentre, peaceLevel, biomeAt, tileX, tileY } from '../src/sim/world.js';
import { createRng } from '../src/sim/rng.js';
import { MONSTERS, THREAT, NESTS, CAVE, RAID } from '../src/content/monsters.js';
import { RESOURCES, RESOURCE_IDS } from '../src/content/resources.js';
import { FACILITIES } from '../src/content/facilities.js';
import { DAY } from '../src/content/config.js';

const centre = worldCentre();

function kingdom(seed = 1) {
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
  state.stock[facilityId] = (state.stock[facilityId] ?? 0) + 1;
  const spot = findSpot(state, facilityId);
  const result = place(state, spot.x, spot.y, facilityId);
  assert.equal(result.ok, true, result.reason ?? '');
  const facility = state.world.facilities[result.origin];
  facility.built = true;
  facility.buildTicksRemaining = 0;
  return { ...spot, origin: result.origin, facility };
}

/** A kingdom with people in it, so there is somebody to fight. */
function garrison(state, count = 4, professionId = 'knight') {
  const home = build(state, 'plot_l');
  for (let i = 0; i < count; i++) {
    const resident = makeResident(state, { name: `G${i}`, professionId, level: 3 });
    resident.home = home.origin;
    state.residents.push(resident);
  }
  return home;
}

// ---------------------------------------------------------------------------
// Nests
// ---------------------------------------------------------------------------

test('nests are derived from the seed, never stored', () => {
  const state = kingdom();
  const sites = nestSites(state);
  assert.ok(sites.size > 0, 'a world should have nests in it');

  const save = JSON.parse(JSON.stringify(state));
  assert.equal(save.world.nests, undefined, 'nest positions must not be in the save');
  assert.deepEqual(save.world.nestsCleared, {}, 'only clearances are stored');
});

test('the same seed always puts nests in the same places', () => {
  const a = [...nestSites(kingdom(77)).keys()].sort();
  const b = [...nestSites(kingdom(77)).keys()].sort();
  assert.deepEqual(a, b);
});

test('no nest opens on the doorstep', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const state = kingdom(seed);
    for (const nest of nestSites(state).values()) {
      const distance = Math.hypot(nest.x - centre.x, nest.y - centre.y);
      assert.ok(
        distance >= NESTS.safeRadius,
        `seed ${seed}: a nest sits ${distance.toFixed(1)} tiles from the capital`
      );
    }
  }
});

test('every nest stands on ground its species actually lives on', () => {
  const state = kingdom(5);
  for (const nest of nestSites(state).values()) {
    const biome = biomeAt(state, nest.x, nest.y);
    assert.ok(
      MONSTERS[nest.speciesId].biomes.includes(biome),
      `${nest.speciesId} should not live on ${biome}`
    );
  }
});

test('nests in locked country do not count against you', () => {
  const state = kingdom();
  const all = nestSites(state).size;
  assert.ok(activeNests(state).length < all, 'the far country is not your problem yet');
});

test('clearing a nest removes it for good', () => {
  const state = kingdom();
  garrison(state, 8);
  const nest = activeNests(state)[0];
  assert.ok(nest, 'this seed should offer a nest');

  const result = clearNest(state, nest);
  if (result.won) {
    assert.equal(isNestCleared(state, nest.index), true);
    assert.ok(!activeNests(state).some((n) => n.index === nest.index));
    assert.equal(state.stats.nestsCleared, 1);
  }
});

// ---------------------------------------------------------------------------
// Threat
// ---------------------------------------------------------------------------

test('nests near the kingdom gather threat; distant ones do not', () => {
  const state = kingdom();
  const rate = threatRate(state);
  const pressing = pressingNests(state);

  if (pressing.length === 0) assert.equal(rate, 0, 'nothing near means nothing gathering');
  else assert.ok(rate > 0, 'a nest within reach should press on you');
});

test('torches and towers hold threat off', () => {
  const state = kingdom();
  const before = threatRate(state);
  if (before === 0) return;   // this seed has nothing near; nothing to prove

  build(state, 'watchtower');
  assert.ok(wardStrength(state) > 0);
  assert.ok(threatRate(state) < before, 'a watchtower should blunt it');
});

test('wards stack with diminishing returns, and something always gets through', () => {
  // The balance run caught this: wards multiply, so fifteen cheap torches took
  // threat to zero and switched the whole monster system off. A defence you
  // can max out with the cheapest building in the game is not a defence, it is
  // an off switch.
  const state = kingdom();
  let last = 0;
  for (let i = 0; i < 20; i++) {
    build(state, 'torch');
    const ward = wardStrength(state);
    assert.ok(ward >= last, 'each ward should help, or at worst not hurt');
    assert.ok(ward <= NESTS.maxWard, `wards must never exceed ${NESTS.maxWard}`);
    last = ward;
  }
  assert.equal(last, NESTS.maxWard, 'and twenty torches should reach the ceiling');
});

test('no amount of building makes a kingdom immune', () => {
  const state = kingdom();
  if (threatRate(state) === 0) return;   // this seed has nothing near
  for (let i = 0; i < 12; i++) build(state, 'torch');
  build(state, 'watchtower');
  assert.ok(threatRate(state) > 0, 'something must always be gathering out there');
});

test('threat is capped however long it gathers', () => {
  const state = kingdom();
  const report = createReport();
  accrueThreat(state, 10_000_000, report, false);
  assert.ok(state.threat <= THREAT.ceiling);
});

// ---------------------------------------------------------------------------
// THE PROMISE — nothing attacks while the player is away
// ---------------------------------------------------------------------------

test('NO RAID EVER FIRES WHILE THE PLAYER IS AWAY', () => {
  // The single most important assertion in this project. If this ever fails,
  // the reason the game exists has failed with it.
  for (let seed = 1; seed <= 6; seed++) {
    const state = kingdom(seed);
    garrison(state, 2);
    state.threat = THREAT.ceiling;          // as bad as it can possibly get

    const report = advanceTicks(state, 30 * 24 * 60 * 60, { offline: true });

    assert.equal(report.raids.length, 0, `seed ${seed}: something attacked while away`);
    assert.equal(state.stats.raidsSuffered, 0, `seed ${seed}: a raid was recorded`);
  }
});

test('an absence never damages a single building', () => {
  const state = kingdom();
  garrison(state, 1);
  build(state, 'granary');
  state.threat = THREAT.ceiling;

  state.lastSaveTime = 0;
  catchUp(state, 14 * 24 * 60 * 60 * 1000);

  for (const facility of Object.values(state.world.facilities)) {
    assert.equal(facility.damaged, false, 'nothing may be wrecked while you are gone');
  }
});

test('threat gathered while away is held under a lower ceiling', () => {
  const state = kingdom();
  const report = createReport();
  accrueThreat(state, 10_000_000, report, true);
  assert.ok(
    state.threat <= THREAT.offlineCeiling,
    'time away must not pile up more than live play would'
  );
  assert.ok(THREAT.offlineCeiling < THREAT.ceiling);
});

test('coming back buys a period of quiet', () => {
  const state = kingdom();
  state.threat = THREAT.ceiling;
  state.lastSaveTime = 0;
  catchUp(state, 24 * 60 * 60 * 1000);

  assert.ok(graceRemaining(state) > 0, 'there should be a moment to breathe');
  assert.equal(raidsPermitted(state, false), false, 'and nothing may attack inside it');

  advanceTicks(state, THREAT.graceTicks + 1);
  assert.equal(graceRemaining(state), 0, 'the quiet ends');
  // Restated because a raid may already have fired and spent the threat that
  // allowed it — grace is what is being tested here, not the threshold.
  state.threat = THREAT.ceiling;
  assert.equal(raidsPermitted(state, false), true, 'after which the world resumes');
});

test('catch-up warns about the gathering without ever resolving it', () => {
  const state = kingdom();
  garrison(state, 1);
  state.threat = THREAT.raidThreshold;

  state.lastSaveTime = 0;
  const welcome = catchUp(state, 24 * 60 * 60 * 1000);

  assert.equal(welcome.raids.length, 0);
  assert.ok(welcome.raidWarnings.length > 0, 'the player should be told they gathered');
});

test('an absence still leaves nothing poorer, even under full threat', () => {
  const state = kingdom();
  garrison(state, 2);
  state.threat = THREAT.ceiling;
  const before = { ...state.resources };

  state.lastSaveTime = 0;
  catchUp(state, 7 * 24 * 60 * 60 * 1000);

  for (const id of RESOURCE_IDS) {
    assert.ok(state.resources[id] >= before[id] - 1e-9, `${id} fell while away`);
  }
});

// ---------------------------------------------------------------------------
// Raids in live play
// ---------------------------------------------------------------------------

test('raids need threat, and wait for the grace period', () => {
  const state = kingdom();
  state.threat = 0;
  assert.equal(raidsPermitted(state, false), false, 'no threat, no raid');

  state.threat = THREAT.raidThreshold;
  state.graceUntilTick = state.time.totalTicks + 100;
  assert.equal(raidsPermitted(state, false), false, 'not during grace');

  state.graceUntilTick = 0;
  assert.equal(raidsPermitted(state, false), true);
});

test('the dark and the full moon both make a raid likelier', () => {
  const state = kingdom();
  state.threat = THREAT.raidThreshold;
  state.graceUntilTick = 0;

  const chances = [];
  for (let day = 0; day < DAY.daysPerMoon * 2; day++) {
    for (const fraction of [0.1, 0.8]) {
      state.time.totalTicks = Math.round((day + fraction) * DAY.ticksPerDay);
      chances.push({
        chance: raidChance(state, false),
        night: fraction > 0.7,
        moon: isFullMoon(state),
      });
    }
  }

  const day = chances.filter((c) => !c.night && !c.moon).map((c) => c.chance);
  const night = chances.filter((c) => c.night && !c.moon).map((c) => c.chance);
  assert.ok(Math.max(...night) > Math.max(...day), 'nights should be worse');

  const moonNight = chances.filter((c) => c.night && c.moon).map((c) => c.chance);
  if (moonNight.length > 0) {
    assert.ok(Math.max(...moonNight) > Math.max(...night), 'a full moon worse still');
  }
});

test('a raid spends the threat that summoned it', () => {
  const state = kingdom();
  garrison(state, 3);
  state.threat = THREAT.ceiling;
  const report = createReport();

  const raid = resolveRaid(state, report);
  if (raid) assert.ok(state.threat < THREAT.ceiling, 'the pressure should drop');
});

test('losing a raid costs buildings, never people', () => {
  const state = kingdom();
  const home = garrison(state, 1, 'wanderer');   // nobody who can fight
  build(state, 'granary');
  state.threat = THREAT.ceiling;

  const peopleBefore = state.residents.length;
  const report = createReport();
  for (let i = 0; i < 12; i++) {
    state.threat = THREAT.ceiling;
    resolveRaid(state, report);
  }

  assert.equal(state.residents.length, peopleBefore, 'nobody may ever be deleted');
  for (const resident of state.residents) {
    assert.ok(resident.home !== null || totalBeds(state) === 0);
  }
});

test('a damaged home still shelters the people inside it', () => {
  // freeBeds went NEGATIVE the first time a raid hit a plot: the beds stopped
  // counting while the people in them did not.
  const state = kingdom();
  const home = garrison(state, 3);
  state.world.facilities[home.origin].damaged = true;

  assert.equal(isActive(state.world.facilities[home.origin]), false, 'it does not work');
  assert.equal(isStanding(state.world.facilities[home.origin]), true, 'but it stands');
  assert.ok(freeBeds(state) >= 0, 'and nobody is thrown into the street');
});

test('raids go for what stands nearest the hall', () => {
  const state = kingdom();
  const near = build(state, 'well');
  const targets = raidTargets(state, 3);
  assert.ok(targets.length > 0);
  for (let i = 1; i < targets.length; i++) {
    assert.ok(targets[i].distance >= targets[i - 1].distance, 'nearest first');
  }
  assert.ok(!targets.some((t) => t.def.isTownHall), 'never the hall itself');
});

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

test('a battle shows its whole arithmetic', () => {
  const state = kingdom();
  garrison(state, 4);
  const outcome = resolveBattle(state, {
    ours: musterStrength(defendersOf(state, centre.x, centre.y)),
    theirs: bandStrength([monsterStrength('slime', 1), monsterStrength('boar', 1)]),
    rng: createRng(1),
  });

  assert.ok(outcome.lines.length >= 4, 'every term should be written down');
  for (const line of outcome.lines) {
    assert.ok(line.label, 'a line needs a label');
    assert.notEqual(line.value, undefined);
  }
});

test('the same fight always resolves the same way', () => {
  const runs = [0, 1].map(() => {
    const state = kingdom(31);
    garrison(state, 3);
    return resolveBattle(state, {
      ours: musterStrength(defendersOf(state, centre.x, centre.y)),
      theirs: bandStrength([monsterStrength('golem', 2)]),
      rng: createRng(999),
    });
  });
  assert.equal(runs[0].won, runs[1].won);
  assert.ok(Math.abs(runs[0].ourPower - runs[1].ourPower) < 1e-9);
});

test('more fighters beat fewer', () => {
  const small = kingdom(12);
  garrison(small, 1);
  const large = kingdom(12);
  garrison(large, 6);

  const band = [monsterStrength('boar', 1), monsterStrength('boar', 1)];
  const weak = resolveBattle(small, {
    ours: musterStrength(defendersOf(small, centre.x, centre.y)),
    theirs: bandStrength(band), rng: createRng(5),
  });
  const strong = resolveBattle(large, {
    ours: musterStrength(defendersOf(large, centre.x, centre.y)),
    theirs: bandStrength(band), rng: createRng(5),
  });
  assert.ok(strong.ourPower > weak.ourPower);
});

test('fighters count for more than shopkeepers', () => {
  const state = kingdom(3);
  const home = build(state, 'plot_l');
  const knight = makeResident(state, { name: 'K', professionId: 'knight', level: 3 });
  knight.home = home.origin;
  const cook = makeResident(state, { name: 'C', professionId: 'cook', level: 3 });
  cook.home = home.origin;

  state.residents = [knight];
  const withKnight = musterStrength(defendersOf(state, centre.x, centre.y)).count;
  state.residents = [cook];
  const withCook = musterStrength(defendersOf(state, centre.x, centre.y)).count;

  assert.ok(withKnight > withCook, 'a knight turns out properly; a cook helps');
});

test('people too far away do not turn out', () => {
  const state = kingdom();
  const home = garrison(state, 2);
  const near = defendersOf(state, centre.x, centre.y, 30).length;
  const far = defendersOf(state, 5, 5, 4).length;
  assert.ok(near > 0);
  assert.equal(far, 0, 'nobody walks across the world for a fight');
});

// ---------------------------------------------------------------------------
// Caves
// ---------------------------------------------------------------------------

test('a cave opens with the full moon and closes again', () => {
  const state = kingdom();
  state.time.totalTicks = 0;
  assert.ok(openCave(state), 'day zero is a full moon');

  state.time.totalTicks = DAY.ticksPerDay * (CAVE.openDays + 1);
  assert.equal(openCave(state), null, 'and it does not stay open');

  state.time.totalTicks = DAY.ticksPerDay * DAY.daysPerMoon;
  assert.ok(openCave(state), 'the next moon opens another');
});

test('going into a cave costs energy', () => {
  const state = kingdom();
  garrison(state, 3);
  state.time.totalTicks = 0;
  state.resources.energy = CAVE.energyCost + 5;

  const result = enterCave(state);
  assert.equal(result.ok, true, result.reason ?? '');
  assert.equal(Math.round(state.resources.energy), 5);
});

test('a cave cannot be entered without the energy for it', () => {
  const state = kingdom();
  garrison(state, 3);
  state.time.totalTicks = 0;
  state.resources.energy = 1;

  const check = canEnterCave(state);
  assert.equal(check.ok, false);
  assert.match(check.reason, /energy/);
});

test('one visit per cave', () => {
  const state = kingdom();
  garrison(state, 3);
  state.time.totalTicks = 0;
  state.resources.energy = 500;

  assert.equal(enterCave(state).ok, true);
  assert.equal(enterCave(state).ok, false, 'the same cave twice is not a cave');
});

test('nobody comes back from a cave empty-handed', () => {
  const state = kingdom(9);
  garrison(state, 1, 'wanderer');   // certain to lose
  state.time.totalTicks = 0;
  state.resources.energy = 500;
  const before = state.resources.copper;

  const result = enterCave(state);
  assert.equal(result.ok, true);
  assert.ok(state.resources.copper > before, 'even a beating pays for the trip');
});

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

test('a schema 2 save gains the monster fields without losing anything', () => {
  const state = kingdom();
  state.resources.wood = 1234;
  delete state.world.nestsCleared;
  delete state.threat;
  delete state.caves;
  state.schemaVersion = 2;

  const restored = deserialize(JSON.stringify(state));

  assert.equal(restored.schemaVersion, SCHEMA_VERSION, 'migrated all the way forward');
  assert.deepEqual(restored.world.nestsCleared, {});
  assert.equal(restored.threat, 0);
  assert.equal(restored.caves.visits, 0);
  assert.equal(restored.resources.wood, 1234, 'and the kingdom is untouched');
});

test('what comes for you scales with how far you have got', () => {
  // The research is explicit that difficulty tracks the player, and without it
  // the nests near home stay tier 1 for ever: a kingdom with three knights
  // could never lose a raid again, which makes every watchtower pointless.
  const weak = kingdom(4);
  garrison(weak, 3);
  weak.threat = THREAT.ceiling;
  weak.stats.highestTierCleared = 1;

  const strong = kingdom(4);
  garrison(strong, 3);
  strong.threat = THREAT.ceiling;
  strong.stats.highestTierCleared = 4;

  const power = (state) => {
    const rng = createRng(11);
    return bandStrength(raidBand(state, rng)).attack
      + bandStrength(raidBand(state, createRng(11))).magic;
  };

  assert.ok(
    power(strong) > power(weak),
    'a kingdom that has cleared tier 4 should not be raided by tier 1 forever'
  );
});

test('a wrecked building can be put back to work', () => {
  // Without repair a damaged facility is stuck for ever: canUpgrade refuses to
  // touch one, so the only cure was demolition.
  const state = kingdom();
  const granary = build(state, 'granary');
  state.world.facilities[granary.origin].damaged = true;
  assert.equal(isActive(state.world.facilities[granary.origin]), false);

  const cost = repairCostFor('granary');
  assert.ok(Object.keys(cost).length > 0, 'repair should cost something');
  const woodBefore = state.resources.wood;

  const result = repair(state, granary.x, granary.y);
  assert.equal(result.ok, true, result.reason ?? '');
  assert.equal(isActive(state.world.facilities[granary.origin]), true, 'and it works again');
  assert.equal(state.resources.wood, woodBefore - (cost.wood ?? 0));
});

test('repairing costs less than rebuilding', () => {
  for (const id of ['granary', 'plot_l', 'watchtower']) {
    const repairCost = Object.values(repairCostFor(id)).reduce((a, b) => a + b, 0);
    const buildCost = Object.values(FACILITIES[id].cost).reduce((a, b) => a + b, 0);
    assert.ok(repairCost < buildCost, `${id}: a raid should cost an errand, not a rebuild`);
  }
});
