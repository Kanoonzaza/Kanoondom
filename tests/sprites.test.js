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
