// Monsters.
//
// Thirteen species, built the same way the townspeople are: a handful of body
// shapes, recoloured per species. A slime and a great toad are the same blob
// with different colours and a different face; a frost wolf and a boar are the
// same four-legged silhouette.
//
// That is not a shortcut so much as how readable sprite sets work at this size.
// Sixteen pixels does not hold enough detail to tell a wolf from a boar by its
// anatomy, so the eye goes on shape-family plus colour — and shape-family plus
// colour is exactly what this gives it.
//
// Everything bobs, because a monster standing perfectly still on a nest looks
// like scenery rather than a threat.

import { P } from './palette.js';

// k outline   A body   a body shade   e eye   H horn/spine   m mouth
const BLOB = [
  '................',
  '................',
  '................',
  '.....kkkkkk.....',
  '...kkAAAAAAkk...',
  '..kAAAAAAAAAAk..',
  '..kAAeAAAAeAAk..',
  '..kAAAAAAAAAAk..',
  '..kAAAmmmmAAAk..',
  '..kaAAAAAAAAak..',
  '..kaaAAAAAAaak..',
  '...kaaaaaaaak...',
  '....kkkkkkkk....',
  '................',
  '................',
  '................',
];

const BEAST = [
  '................',
  '................',
  '..kkk...........',
  '.kAAAkkkkkkk....',
  '.kAeAAAAAAAAkk..',
  '.kAAAAAAAAAAAAk.',
  '.kmAAAAAAAAAAAk.',
  '.kkAAAAAAAAAAAk.',
  '..kAAAAAAAAAAAk.',
  '..kaAAAAAAAAaak.',
  '..kaakkkkkkaaak.',
  '..kak....kakkk..',
  '..kak....kak....',
  '..kkk....kkk....',
  '................',
  '................',
];

const FLYER = [
  '................',
  '................',
  '................',
  '..kk........kk..',
  '.kAAkk....kkAAk.',
  '.kAAAAkkkkAAAAk.',
  '..kAAAAAAAAAAk..',
  '...kkAAAAAAkk...',
  '.....kAeeAk.....',
  '.....kAAAAk.....',
  '.....kaaaak.....',
  '......kkkk......',
  '................',
  '................',
  '................',
  '................',
];

const UPRIGHT = [
  '................',
  '................',
  '......kkkk......',
  '....kkAAAAkk....',
  '....kHAAAAHk....',
  '....kAeAAeAk....',
  '....kAAmmAAk....',
  '.....kAAAAk.....',
  '...kkkAAAAkkk...',
  '..kAAkAAAAkAAk..',
  '..kAAkAAAAkAAk..',
  '..kkkkaaaakkkk..',
  '.....kaakaak....',
  '.....kkk.kkk....',
  '................',
  '................',
];

const HULK = [
  '................',
  '......kkkk......',
  '....kkAAAAkk....',
  '...kHAAAAAAHk...',
  '...kAAeAAeAAk...',
  '...kAAAAAAAAk...',
  '...kAAmmmmAAk...',
  '..kkAAAAAAAAkk..',
  '.kAAAAAAAAAAAAk.',
  '.kAAAAAAAAAAAAk.',
  '.kaAAAAAAAAAAak.',
  '.kaakkAAAAkkaak.',
  '.kkk.kaaaak.kkk.',
  '.....kkkkkk.....',
  '................',
  '................',
];

const SHAPES = { BLOB, BEAST, FLYER, UPRIGHT, HULK };

/** Lift by one for the bob. */
function bob(grid) {
  return ['.'.repeat(grid[0].length), ...grid.slice(0, -1)];
}

/**
 * The bestiary: a shape, a colour, and whether it has horns.
 *
 * Colours follow where a species lives — sand tones in the desert, ice blues in
 * the snow, ember reds in the lava — so a monster on the map reads as belonging
 * to the ground it is standing on.
 */
const SPECIES = {
  slime: { shape: 'BLOB', body: P.slime, shade: P.slimeDark },
  boar: { shape: 'BEAST', body: '#8a6a45', shade: '#6d5234' },
  bee: { shape: 'FLYER', body: '#d8b23c', shade: '#a8862a' },
  ghost: { shape: 'BLOB', body: '#b8c4d8', shade: '#8d9ab0' },
  toad: { shape: 'BLOB', body: '#5f8a4a', shade: '#496b39' },
  cactitus: { shape: 'UPRIGHT', body: '#4c7a3a', shade: '#3a5f2c', horn: '#d8e0c0' },
  scorpion: { shape: 'BEAST', body: '#c2884a', shade: '#95653a' },
  golem: { shape: 'HULK', body: P.rock, shade: P.rockDark, horn: P.rockLight },
  kobold: { shape: 'UPRIGHT', body: '#a8563f', shade: '#7d3d2c', horn: P.bone },
  frostwolf: { shape: 'BEAST', body: '#a8bccf', shade: '#7f93a8' },
  yeti: { shape: 'HULK', body: '#e2ecf4', shade: '#b8c8d8', horn: '#9aacc0' },
  imp: { shape: 'UPRIGHT', body: '#e8632a', shade: '#b04519', horn: '#ffc355' },
  drago: { shape: 'HULK', body: '#8c3b2a', shade: '#66271b', horn: P.gold },
};

function palette(species) {
  return {
    '.': null,
    k: P.ink,
    A: species.body,
    a: species.shade,
    e: P.ink,
    m: P.ink,
    H: species.horn ?? species.body,
  };
}

/** Templates for the sprite compiler, keyed `monster:<id>`. */
export function monsterTemplates() {
  const table = {};
  for (const [id, species] of Object.entries(SPECIES)) {
    const grid = SHAPES[species.shape];
    table[`monster:${id}`] = {
      palette: palette(species),
      frames: [grid, bob(grid)],
    };
  }
  return table;
}

export function monsterArtIds() {
  return Object.keys(SPECIES);
}
