import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, serialize, deserialize } from '../src/state.js';
import {
  biomeAt, zoneBiomes, zoneOf, zoneIndex, zoneLabel, zoneRing, worldCentre,
  tileIndex, tileX, tileY, inBounds, noise,
  hallRadius, inTerritory, territoryTiles, monarchRank,
  peaceLevel, unlockedRing, isZoneUnlocked, nextGate,
  clearFog, clearTerritoryFog, isCleared, degrade, restore, wastelandAt, isWasteland,
  tileInfo,
  markCleared,
} from '../src/sim/world.js';
import { BIOMES, BIOME_IDS } from '../src/content/biomes.js';
import {
  WORLD, WORLD_TILES_X, WORLD_TILES_Y, TOWN_HALL, ZONE_UNLOCKS, PEACE,
} from '../src/content/config.js';

// --- coordinates -----------------------------------------------------------

test('tile indices round-trip', () => {
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [95, 95], [48, 48], [12, 73]]) {
    const index = tileIndex(x, y);
    assert.equal(tileX(index), x);
    assert.equal(tileY(index), y);
  }
});

test('the world is zones of 16x16 tiles', () => {
  assert.equal(WORLD_TILES_X, WORLD.zonesX * WORLD.zoneTiles);
  assert.equal(WORLD_TILES_Y, WORLD.zonesY * WORLD.zoneTiles);
  assert.equal(WORLD.zoneTiles, 16, 'the real game uses 16x16 zones');
});

test('zones are labelled like the real game', () => {
  assert.equal(zoneLabel(0, 0), 'A1');
  assert.equal(zoneLabel(2, 3), 'C4');
  assert.deepEqual(zoneOf(0, 0), { zx: 0, zy: 0 });
  assert.deepEqual(zoneOf(16, 32), { zx: 1, zy: 2 });
});

test('rings count outward from a centre BAND, not a centre point', () => {
  // The grid is even-sized, so the middle falls between two columns. Rounding
  // the distance would leave ring 0 empty and lock the player out of their own
  // homeland, so the centre 2x2 is ring 0.
  const centre = worldCentre();
  const home = zoneOf(centre.x, centre.y);
  assert.equal(zoneRing(home.zx, home.zy), 0, 'you start in ring 0');

  assert.equal(zoneRing(2, 2), 0);
  assert.equal(zoneRing(3, 3), 0);
  assert.equal(zoneRing(1, 2), 1);
  assert.equal(zoneRing(0, 0), 2);
  assert.equal(zoneRing(5, 5), 2);

  let ringZero = 0;
  for (let zy = 0; zy < WORLD.zonesY; zy++) {
    for (let zx = 0; zx < WORLD.zonesX; zx++) if (zoneRing(zx, zy) === 0) ringZero++;
  }
  assert.equal(ringZero, 4, 'the homeland is a 2x2 block');
});

test('bounds are respected', () => {
  assert.ok(inBounds(0, 0));
  assert.ok(inBounds(WORLD_TILES_X - 1, WORLD_TILES_Y - 1));
  assert.ok(!inBounds(-1, 0));
  assert.ok(!inBounds(WORLD_TILES_X, 0));
});

// --- terrain is deterministic and never stored -----------------------------

test('the same seed always grows the same world', () => {
  const a = newGame(4242, { now: 0 });
  const b = newGame(4242, { now: 0 });

  for (let i = 0; i < 400; i++) {
    const x = (i * 7) % WORLD_TILES_X;
    const y = (i * 13) % WORLD_TILES_Y;
    assert.equal(biomeAt(a, x, y), biomeAt(b, x, y), `tile ${x},${y} differs`);
  }
});

test('different seeds grow different worlds', () => {
  const a = newGame(1, { now: 0 });
  const b = newGame(2, { now: 0 });

  let differences = 0;
  for (let y = 20; y < 76; y++) {
    for (let x = 20; x < 76; x++) {
      if (biomeAt(a, x, y) !== biomeAt(b, x, y)) differences++;
    }
  }
  assert.ok(differences > 200, `only ${differences} tiles differed`);
});

test('terrain is NOT written into the save', () => {
  // The whole point of deriving terrain: a 96x96 world must cost nothing.
  const state = newGame(7, { now: 0 });
  const json = serialize(state, 0);

  assert.ok(json.length < 4000, `save is ${json.length} bytes; terrain leaked in`);
  assert.ok(!json.includes('zoneBiomes'), 'derived zone table must not be stored');
});

test('a save round-trips and still grows the same world', () => {
  const state = newGame(31337, { now: 0 });
  clearFog(state, 48, 48);
  degrade(state, 49, 48, 0.5);

  const restored = deserialize(serialize(state, 0));

  assert.deepEqual(restored, state);
  for (let i = 0; i < 100; i++) {
    const x = 30 + (i % 40);
    const y = 30 + Math.floor(i / 40);
    assert.equal(biomeAt(restored, x, y), biomeAt(state, x, y));
  }
});

test('every tile has a known biome', () => {
  const state = newGame(99, { now: 0 });
  for (let y = 0; y < WORLD_TILES_Y; y += 3) {
    for (let x = 0; x < WORLD_TILES_X; x += 3) {
      const biome = biomeAt(state, x, y);
      assert.ok(BIOME_IDS.includes(biome), `unknown biome ${biome} at ${x},${y}`);
    }
  }
});

test('home is always grass, and the rim is sea', () => {
  for (const seed of [1, 2, 3, 77, 12345]) {
    const state = newGame(seed, { now: 0 });
    const centre = worldCentre();

    assert.equal(biomeAt(state, centre.x, centre.y), 'grass', 'you always start on grass');
    // And enough of it to actually build on, whatever the seed rolled.
    assert.equal(biomeAt(state, centre.x + 4, centre.y), 'grass');
    assert.equal(biomeAt(state, centre.x, centre.y - 4), 'grass');
    assert.equal(biomeAt(state, 0, 0), 'sea', 'the world is ringed by sea');
    assert.equal(biomeAt(state, WORLD_TILES_X - 1, WORLD_TILES_Y - 1), 'sea');
  }
});

test('biomes come in patches, not static', () => {
  // Coherence check: a tile usually matches its neighbour. Pure noise would
  // give roughly 1/6; real patches should be far higher.
  const state = newGame(5, { now: 0 });
  let same = 0;
  let total = 0;
  for (let y = 25; y < 70; y++) {
    for (let x = 25; x < 70; x++) {
      if (biomeAt(state, x, y) === biomeAt(state, x + 1, y)) same++;
      total++;
    }
  }
  assert.ok(same / total > 0.6, `only ${((same / total) * 100).toFixed(0)}% matched their neighbour`);
});

test('harder terrain sits further out', () => {
  // Averaged over seeds: the far country should be harsher than home.
  let homeTier = 0;
  let edgeTier = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const tiers = { grass: 0, soil: 0, swamp: 1, desert: 1, sea: 1, rock: 2, snow: 3, lava: 4 };

  for (const seed of seeds) {
    const zones = zoneBiomes(seed);
    for (let zy = 0; zy < WORLD.zonesY; zy++) {
      for (let zx = 0; zx < WORLD.zonesX; zx++) {
        const tier = tiers[zones.get(zoneIndex(zx, zy))];
        if (zoneRing(zx, zy) === 0) homeTier += tier;
        if (zoneRing(zx, zy) >= 2) edgeTier += tier;
      }
    }
  }
  assert.ok(edgeTier / seeds.length > homeTier / seeds.length, 'the edge should be harsher');
});

test('noise is smooth and in range', () => {
  for (let i = 0; i < 500; i++) {
    const value = noise(123, i * 0.7, i * 1.3, 6);
    assert.ok(value >= 0 && value < 1, `noise out of range: ${value}`);
  }
  const a = noise(1, 10, 10, 8);
  const b = noise(1, 10.1, 10, 8);
  assert.ok(Math.abs(a - b) < 0.2, 'neighbouring samples should be close');
});

// --- territory: a radius around Town Halls ---------------------------------

test('territory is a radius, at the real game figures', () => {
  assert.equal(hallRadius({ level: 1 }), 14, 'base radius is 14 tiles');
  assert.equal(hallRadius({ level: 10 }), 14, 'still 14 just before the step');
  assert.equal(hallRadius({ level: 11 }), 16, '+2 every 10 levels');
  assert.equal(hallRadius({ level: 21 }), 18);
  assert.equal(hallRadius({ level: 31 }), 20);
});

test('tiles inside the radius are territory, outside are not', () => {
  const state = newGame(1, { now: 0 });
  const hall = state.townHalls[0];

  assert.ok(inTerritory(state, hall.x, hall.y));
  assert.ok(inTerritory(state, hall.x + 13, hall.y));
  assert.ok(!inTerritory(state, hall.x + 15, hall.y));
  assert.ok(!inTerritory(state, hall.x + 11, hall.y + 11), 'corners are outside a circle');
});

test('a levelled Town Hall reaches further', () => {
  const state = newGame(1, { now: 0 });
  const hall = state.townHalls[0];
  assert.ok(!inTerritory(state, hall.x + 15, hall.y));

  hall.level = 11;
  assert.ok(inTerritory(state, hall.x + 15, hall.y), 'radius 16 now covers it');
});

test('a second Town Hall adds its own territory', () => {
  const state = newGame(1, { now: 0 });
  const before = territoryTiles(state).size;

  state.townHalls.push({ id: 2, x: 20, y: 20, level: 1 });
  assert.ok(territoryTiles(state).size > before);
  assert.ok(inTerritory(state, 20, 20));
});

test('overlapping Town Halls waste space, as the tips warn', () => {
  const apart = newGame(1, { now: 0 });
  apart.townHalls.push({ id: 2, x: 20, y: 20, level: 1 });

  const stacked = newGame(1, { now: 0 });
  stacked.townHalls.push({ id: 2, x: stacked.townHalls[0].x + 2, y: stacked.townHalls[0].y, level: 1 });

  assert.ok(
    territoryTiles(apart).size > territoryTiles(stacked).size,
    'halls placed apart should cover more ground'
  );
});

test('monarch rank climbs every 15 Town Hall levels', () => {
  const state = newGame(1, { now: 0 });
  const hall = state.townHalls[0];

  hall.level = 1; assert.equal(monarchRank(state), 'D');
  hall.level = 15; assert.equal(monarchRank(state), 'C');
  hall.level = 30; assert.equal(monarchRank(state), 'B');
  hall.level = 45; assert.equal(monarchRank(state), 'A');
  hall.level = 60; assert.equal(monarchRank(state), 'S');
  hall.level = 99; assert.equal(monarchRank(state), 'S', 'and stops there');
});

// --- Peace Level and unlocking ---------------------------------------------

test('a new kingdom starts at ring 0 with nothing cleared', () => {
  const state = newGame(1, { now: 0 });
  assert.equal(peaceLevel(state), 0);
  assert.equal(unlockedRing(state), 0);
  assert.ok(isZoneUnlocked(state, zoneOf(48, 48).zx, zoneOf(48, 48).zy));
  assert.ok(!isZoneUnlocked(state, 0, 0), 'the far country is shut');
});

test('clearing fog raises Peace Level', () => {
  const state = newGame(1, { now: 0 });
  const before = peaceLevel(state);
  clearTerritoryFog(state);
  assert.ok(peaceLevel(state) > before);
});

test('nests hold Peace Level down', () => {
  const state = newGame(1, { now: 0 });
  clearTerritoryFog(state);
  const peaceful = peaceLevel(state);

  state.world.nests[tileIndex(50, 50)] = { tier: 1 };
  state.world.nests[tileIndex(52, 50)] = { tier: 1 };

  assert.equal(peaceLevel(state), Math.max(PEACE.floor, peaceful - 2 * PEACE.penaltyPerNest));
});

test('Peace Level stays inside 0..100', () => {
  const state = newGame(1, { now: 0 });
  for (let i = 0; i < 40; i++) state.world.nests[i] = { tier: 1 };
  assert.ok(peaceLevel(state) >= 0);

  const full = newGame(1, { now: 0 });
  full.townHalls.push({ id: 2, x: 20, y: 20, level: 1 });
  for (let i = 0; i < WORLD_TILES_X * WORLD_TILES_Y; i++) markCleared(full, i);
  assert.ok(peaceLevel(full) <= 100);
});

test('unlocking needs BOTH peace and Town Halls', () => {
  const state = newGame(1, { now: 0 });
  const gate = ZONE_UNLOCKS.find((g) => g.ring === 1);

  // Peace alone is not enough.
  for (let i = 0; i < 3000; i++) markCleared(state, i);
  assert.ok(peaceLevel(state) >= gate.peace, 'test needs peace above the gate');
  assert.equal(unlockedRing(state), 0, 'still shut without the halls');

  state.townHalls.push({ id: 2, x: 20, y: 20, level: 1 });
  assert.equal(unlockedRing(state), 1, 'and now it opens');
});

test('Peace Level never falls because you made progress', () => {
  // It is measured against the WHOLE world, so nothing you earn can enlarge
  // the denominator and push the number down. An earlier version measured
  // against reachable land, where founding a second town hall would have made
  // peace appear to drop.
  const state = newGame(1, { now: 0 });
  clearTerritoryFog(state);
  const before = peaceLevel(state);

  state.townHalls.push({ id: 2, x: 20, y: 20, level: 1 });
  assert.equal(peaceLevel(state), before, 'founding a hall must not lower peace');

  state.townHalls[0].level = 31;
  assert.equal(peaceLevel(state), before, 'nor must growing one');

  clearTerritoryFog(state);
  assert.ok(peaceLevel(state) > before, 'only exploring moves it');
});

test('a fresh kingdom starts humble, not most of the way to the first gate', () => {
  const state = newGame(1, { now: 0 });
  clearTerritoryFog(state);
  const peace = peaceLevel(state);
  const gate = ZONE_UNLOCKS.find((g) => g.ring === 1);

  assert.ok(peace > 2, `peace started at ${peace.toFixed(1)}%, suspiciously low`);
  assert.ok(
    peace < gate.peace,
    `peace started at ${peace.toFixed(1)}%, already past the ${gate.peace}% gate`
  );
});

test('the next gate is reported until the world is fully open', () => {
  const state = newGame(1, { now: 0 });
  const gate = nextGate(state);
  assert.ok(gate);
  assert.equal(gate.ring, 1);
});

// --- fog and wasteland ------------------------------------------------------

test('fog clears once, and only inside unlocked zones', () => {
  const state = newGame(1, { now: 0 });
  assert.ok(!isCleared(state, 48, 48));

  assert.equal(clearFog(state, 48, 48), true);
  assert.equal(isCleared(state, 48, 48), true);
  assert.equal(clearFog(state, 48, 48), false, 'clearing twice is not progress');

  assert.equal(clearFog(state, 2, 2), false, 'the far country is still shut');
});

test('settling clears the fog across the whole territory', () => {
  const state = newGame(1, { now: 0 });
  const count = clearTerritoryFog(state);
  assert.ok(count > 400, `only ${count} tiles cleared`);
  assert.ok(isCleared(state, 48, 48));
  assert.equal(state.stats.tilesCleared, 0, 'the caller owns the stat, not the helper');
});

test('gathering wears land down, and it can be restored', () => {
  const state = newGame(1, { now: 0 });
  assert.equal(wastelandAt(state, 50, 50), 0);

  degrade(state, 50, 50, 0.4);
  assert.equal(wastelandAt(state, 50, 50), 0.4);
  assert.ok(!isWasteland(state, 50, 50));

  degrade(state, 50, 50, 0.8);
  assert.equal(wastelandAt(state, 50, 50), 1, 'degradation is capped');
  assert.ok(isWasteland(state, 50, 50));

  restore(state, 50, 50);
  assert.equal(wastelandAt(state, 50, 50), 0);
  assert.equal(state.world.wasteland[tileIndex(50, 50)], undefined, 'healthy land is not stored');
});

test('tileInfo gathers everything the UI needs', () => {
  const state = newGame(1, { now: 0 });
  clearFog(state, 48, 48);
  const info = tileInfo(state, 48, 48);

  assert.equal(info.x, 48);
  assert.equal(info.biome, 'grass');
  assert.equal(info.cleared, true);
  assert.equal(info.inTerritory, true);
  assert.equal(info.wasteland, 0);
  assert.equal(info.nest, null);
  assert.ok(BIOMES[info.biome], 'biome must be a real one');
});
