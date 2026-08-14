// The artwork, checked the way the content tables are checked.
//
// Sprites are authored as ASCII grids, which means they go wrong the way
// hand-written data goes wrong: a row a character short, a letter with no
// colour behind it, a biome that quietly has no art at all. None of those
// throw at runtime — they draw a mangled tile, or nothing, and the first anyone
// knows is that the map looks odd.
//
// So the grids are validated here, and every content id is checked to HAVE art.
// That second part is the lesson from docs/lessons.md entry 6 applied to
// pictures: a table and a list that must mirror each other should never be
// maintained by hand and hope.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateTemplate, parseColour, TILE } from '../src/ui/sprites.js';
import { P } from '../src/content/art/palette.js';
import { TERRAIN_ART, terrainTemplates, variantCount } from '../src/content/art/terrain-art.js';
import { BIOMES } from '../src/content/biomes.js';
import { facilityTemplates, facilityArtIds } from '../src/content/art/facilities-art.js';
import { FACILITIES } from '../src/content/facilities.js';
import { peopleTemplates, tradeIds } from '../src/content/art/people-art.js';
import { monsterTemplates, monsterArtIds } from '../src/content/art/monsters-art.js';
import { PROFESSIONS } from '../src/content/professions.js';
import { MONSTERS } from '../src/content/monsters.js';
import { townsfolkAt, isNight } from '../src/ui/townsfolk.js';
import { newGame } from '../src/state.js';
import { makeResident } from '../src/sim/residents.js';

test('every terrain template is a well-formed grid', () => {
  const templates = terrainTemplates();
  assert.ok(Object.keys(templates).length > 0, 'there is art to check');

  for (const [id, template] of Object.entries(templates)) {
    const problems = validateTemplate(id, template);
    assert.deepEqual(problems, [], problems.join('\n'));
  }
});

test('every terrain tile is exactly one tile square', () => {
  for (const [id, template] of Object.entries(terrainTemplates())) {
    for (const frame of template.frames) {
      assert.equal(frame.length, TILE, `${id}: ${frame.length} rows, expected ${TILE}`);
      for (const row of frame) {
        assert.equal(row.length, TILE, `${id}: a row is ${row.length}, expected ${TILE}`);
      }
    }
  }
});

test('every biome in the game has ground art', () => {
  // A biome with no art draws nothing at all: a hole in the world, in the one
  // place a player is guaranteed to be looking.
  for (const id of Object.keys(BIOMES)) {
    assert.ok(TERRAIN_ART[id], `${id} is a biome with no artwork`);
  }
  assert.ok(TERRAIN_ART.fog, 'unexplored land needs art too');
});

test('animated ground has more than one frame, and still ones do not', () => {
  const templates = terrainTemplates();

  // Water and lava are the two things in a landscape that should never sit
  // still, and the only two the ground layer animates.
  assert.equal(templates['terrain:sea:0'].frames.length, 2, 'the sea moves');
  assert.equal(templates['terrain:lava:0'].frames.length, 2, 'lava pulses');

  assert.equal(templates['terrain:rock:0'].frames.length, 1, 'rock does not');
  assert.equal(templates['terrain:snow:0'].frames.length, 1);
});

test('variant counts match the art actually present', () => {
  const templates = terrainTemplates();
  for (const id of Object.keys(TERRAIN_ART)) {
    const count = variantCount(id);
    for (let index = 0; index < count; index++) {
      assert.ok(
        templates[`terrain:${id}:${index}`],
        `${id} claims ${count} variants but variant ${index} has no art`
      );
    }
    assert.equal(
      templates[`terrain:${id}:${count}`], undefined,
      `${id} has art for a variant it never uses`
    );
  }
});

test('grass and desert have more than one stamp', () => {
  // The biomes a player stares at most. One repeated stamp across a whole
  // meadow is exactly the grid-of-squares look this redesign exists to remove.
  assert.ok(variantCount('grass') >= 2, 'grass needs variety');
  assert.ok(variantCount('desert') >= 2, 'so does sand');
});

test('the palette is complete and every entry is a real colour', () => {
  for (const [name, value] of Object.entries(P)) {
    assert.match(
      value, /^#[0-9a-fA-F]{3,8}$/,
      `palette.${name} is "${value}", which is not a colour`
    );
  }
});

test('colours parse to the bytes they say they are', () => {
  assert.deepEqual(parseColour('#ffffff'), [255, 255, 255, 255]);
  assert.deepEqual(parseColour('#000000'), [0, 0, 0, 255]);
  assert.deepEqual(parseColour('#d9a441'), [0xd9, 0xa4, 0x41, 255]);
  assert.deepEqual(parseColour('#fff'), [255, 255, 255, 255], 'shorthand expands');
  assert.deepEqual(parseColour('#00000080'), [0, 0, 0, 0x80], 'alpha is honoured');
});

test('a broken template is reported, not drawn', () => {
  const short = { palette: { a: '#fff', '.': null }, frames: [['aa', 'a']] };
  const problems = validateTemplate('short', short);
  assert.ok(problems.some((p) => p.includes('row 1')), 'the short row is named');

  const unknown = { palette: { a: '#fff' }, frames: [['ab']] };
  assert.ok(
    validateTemplate('unknown', unknown).some((p) => p.includes("'b'")),
    'a letter with no colour behind it is named'
  );

  assert.deepEqual(
    validateTemplate('fine', { palette: { a: '#fff' }, frames: [['aa', 'aa']] }), [],
    'and a good template is left alone'
  );
});

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

test('every facility in the game has artwork', () => {
  // A facility with no sprite falls back to a grey box on the map. That is a
  // safety net, not a plan: shipping one would look like a bug, and nobody
  // would notice until somebody researched it.
  const drawn = new Set(facilityArtIds());
  const missing = Object.keys(FACILITIES).filter((id) => !drawn.has(id));
  assert.deepEqual(missing, [], `these facilities have no art: ${missing.join(', ')}`);
});

test('every facility sprite is exactly its footprint', () => {
  const templates = facilityTemplates();

  for (const [id, def] of Object.entries(FACILITIES)) {
    const template = templates[`facility:${id}`];
    assert.ok(template, `${id} has no template`);

    const frame = template.frames[0];
    assert.equal(
      frame[0].length, def.size.w * TILE,
      `${id} is ${frame[0].length}px wide but stands on ${def.size.w} tiles`
    );
    assert.equal(
      frame.length, def.size.h * TILE,
      `${id} is ${frame.length}px tall but stands on ${def.size.h} tiles`
    );
  }
});

test('every facility template is a well-formed grid', () => {
  for (const [id, template] of Object.entries(facilityTemplates())) {
    const problems = validateTemplate(id, template);
    assert.deepEqual(problems, [], problems.join('\n'));
  }
});

test('there is a scaffold and a crack overlay for every footprint in use', () => {
  const templates = facilityTemplates();
  const footprints = new Set(
    Object.values(FACILITIES).map((def) => `${def.size.w}x${def.size.h}`)
  );

  for (const key of footprints) {
    assert.ok(templates[`overlay:scaffold:${key}`], `nothing to show while a ${key} goes up`);
    assert.ok(templates[`overlay:cracks:${key}`], `nothing to show when a ${key} breaks`);
  }
});

test('a building has a silhouette rather than being a solid block', () => {
  // A roof narrower than the walls is most of what makes a building read as a
  // building. If the top row were full width it would just be a box again,
  // which is exactly what this whole redesign is replacing.
  const house = facilityTemplates()['facility:plot_s'].frames[0];
  const solid = (row) => [...row].filter((char) => char !== '.').length;

  assert.ok(
    solid(house[0]) < solid(house[house.length - 1]),
    'the roof should be narrower than the base'
  );
  assert.ok(solid(house[0]) > 0, 'but the roof is still drawn');
});

// ---------------------------------------------------------------------------
// People and monsters
// ---------------------------------------------------------------------------

test('every profession and every monster has a sprite', () => {
  const trades = new Set(tradeIds());
  const missingTrades = Object.keys(PROFESSIONS).filter((id) => !trades.has(id));
  assert.deepEqual(missingTrades, [], `no art for: ${missingTrades.join(', ')}`);

  const beasts = new Set(monsterArtIds());
  const missingBeasts = Object.keys(MONSTERS).filter((id) => !beasts.has(id));
  assert.deepEqual(missingBeasts, [], `no art for: ${missingBeasts.join(', ')}`);
});

test('people and monsters are well-formed, and every one of them moves', () => {
  for (const table of [peopleTemplates(), monsterTemplates()]) {
    for (const [id, template] of Object.entries(table)) {
      assert.deepEqual(validateTemplate(id, template), [], `${id} is malformed`);
      assert.equal(
        template.frames.length, 2,
        `${id} needs two frames — a townsperson who does not bob reads as a statue`
      );
      assert.notDeepEqual(template.frames[0], template.frames[1], `${id} frames are identical`);
    }
  }
});

test('somebody walking west is not drawn walking backwards', () => {
  const people = peopleTemplates();
  for (const id of tradeIds()) {
    const facing = people[`person:${id}`].frames[0];
    const flipped = people[`person:${id}:flip`].frames[0];
    assert.equal(flipped.length, facing.length);
    assert.deepEqual(
      flipped, facing.map((row) => [...row].reverse().join('')),
      `${id}'s mirrored sprite is not its mirror`
    );
  }
});

// ---------------------------------------------------------------------------
// Where the townsfolk are
// ---------------------------------------------------------------------------

function townWithPeople(count = 6) {
  const state = newGame(99, { now: 0 });
  for (let i = 0; i < count; i++) {
    const resident = makeResident(state, {
      name: `P${i}`, professionId: 'farmer', level: 1,
    });
    resident.home = 48 * 96 + 48;
    state.residents.push(resident);
  }
  return state;
}

const WHOLE_MAP = { firstX: 0, lastX: 95, firstY: 0, lastY: 95 };

test('where somebody is standing depends only on who they are and the time', () => {
  // The whole point of keeping this out of the save: it must be reproducible
  // from nothing. Two calls at the same moment must agree exactly, or a repaint
  // would make everybody jump.
  const state = townWithPeople();
  const first = townsfolkAt(state, 1_700_000_000_000, WHOLE_MAP);
  const second = townsfolkAt(state, 1_700_000_000_000, WHOLE_MAP);
  assert.deepEqual(first, second, 'the same instant must give the same town');
  assert.ok(first.length > 0, 'and somebody should be outside in the daytime');
});

test('people stay near their own homes', () => {
  const state = townWithPeople(12);
  const homeX = 48;
  const homeY = 48;

  // Sample across several strolls; nobody should ever wander off across the map.
  for (let at = 0; at < 60_000; at += 900) {
    for (const person of townsfolkAt(state, at, WHOLE_MAP)) {
      assert.ok(
        Math.abs(person.x - homeX) < 5 && Math.abs(person.y - homeY) < 5,
        `somebody strayed to ${person.x.toFixed(1)}, ${person.y.toFixed(1)}`
      );
    }
  }
});

test('nobody is homeless and outside', () => {
  const state = townWithPeople(4);
  const stray = makeResident(state, { name: 'Stray', professionId: 'cook', level: 1 });
  stray.home = null;                       // just off the boat, no bed yet
  state.residents.push(stray);

  const outside = townsfolkAt(state, 5000, WHOLE_MAP);
  assert.ok(
    !outside.some((person) => person.id === stray.id),
    'somebody with nowhere to live has nowhere to potter about outside of'
  );
});

test('at night the streets are empty', () => {
  const state = townWithPeople();
  // Night begins at 0.7 of the way through a 60-tick day.
  state.time.totalTicks = 50;
  assert.equal(isNight(state), true, 'tick 50 of 60 is night');
  assert.deepEqual(townsfolkAt(state, 5000, WHOLE_MAP), [], 'everybody is indoors');

  state.time.totalTicks = 20;
  assert.equal(isNight(state), false, 'tick 20 is the middle of the day');
  assert.ok(townsfolkAt(state, 5000, WHOLE_MAP).length > 0, 'and they come back out');
});

test('somebody far off screen is not walked at all', () => {
  const state = townWithPeople(8);
  const elsewhere = { firstX: 0, lastX: 8, firstY: 0, lastY: 8 };
  assert.deepEqual(
    townsfolkAt(state, 5000, elsewhere), [],
    'a house nowhere near the view costs nothing to draw'
  );
});

test('the signs that tell buildings apart are big enough to read', () => {
  // The first draft of these was three pixels tall and sat on the roof. Every
  // building looked like every other building with a gold speck on it.
  const templates = facilityTemplates();
  const smithy = templates['facility:master_smithy'].frames[0];
  const stable = templates['facility:monster_stable'].frames[0];

  assert.notDeepEqual(
    smithy, stable,
    'two buildings of the same size and scheme must not draw identically'
  );
});
