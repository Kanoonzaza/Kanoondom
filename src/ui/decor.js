// The things that make a town look lived in.
//
// Put the reference game's screen next to an early version of this one and the
// difference that survives after the projection and the rooms is DENSITY. Its
// land is covered in bushes, trees, crates, barrels and lamp posts; ours was
// tidy green nothing with buildings sitting on it.
//
// So the ground grows things. Which tile has what is a PURE FUNCTION of the
// world seed and the tile's position, exactly like the terrain variants and the
// townsfolk: nothing stored, nothing saved, nothing to migrate, and the same
// bush is under the same tree every time you come back.
//
// Decoration never appears where it would be in the way — not on a building,
// not on water or lava, not on unexplored land — and it thins out beyond your
// borders, so the difference between the land you have made yours and the
// wilderness beyond it reads at a glance.

import { P } from '../content/art/palette.js';
import { biomeAt, isCleared, inTerritory } from '../sim/world.js';
import { WORLD_TILES_X } from '../content/config.js';

/** Nothing grows on these. */
const BARE = new Set(['sea', 'lava']);

/**
 * What can be scattered, and how often.
 *
 * `weight` is relative; `tall` and the colours are read by the same box drawing
 * the room furniture uses, so a bush outside and a barrel indoors are lit the
 * same way and belong to the same world.
 */
const PROPS = [
  { id: 'bush', weight: 30, size: 0.42, tall: 0.34, colour: P.leafDark, top: P.leaf,
    biomes: ['grass', 'soil', 'swamp'] },
  { id: 'tree', weight: 16, size: 0.5, tall: 1.0, colour: P.trunk, top: P.leaf,
    biomes: ['grass', 'swamp'] },
  { id: 'pine', weight: 12, size: 0.46, tall: 1.1, colour: P.trunk, top: P.leafDark,
    biomes: ['snow', 'rock'] },
  { id: 'flowers', weight: 18, size: 0.36, tall: 0.1, colour: P.grassDark, top: P.thatchLight,
    biomes: ['grass', 'soil'] },
  { id: 'rock', weight: 20, size: 0.4, tall: 0.28, colour: P.stoneDark, top: P.stone,
    biomes: ['rock', 'desert', 'snow', 'grass'] },
  { id: 'shrub', weight: 14, size: 0.38, tall: 0.3, colour: '#7a6a3a', top: '#a89a55',
    biomes: ['desert'] },
  { id: 'crate', weight: 7, size: 0.34, tall: 0.32, colour: P.woodDark, top: P.wood,
    biomes: ['grass', 'soil', 'desert', 'rock', 'snow'], townOnly: true },
  { id: 'barrel', weight: 6, size: 0.32, tall: 0.4, colour: '#7a5230', top: P.thatch,
    biomes: ['grass', 'soil', 'desert', 'rock', 'snow'], townOnly: true },
];

const TOTAL_WEIGHT = PROPS.reduce((sum, prop) => sum + prop.weight, 0);

function hash(seed, x, y) {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * What stands on this tile, if anything.
 *
 * Called for every visible tile, so it does the cheapest rejections first and
 * never allocates.
 */
export function decorAt(state, x, y) {
  const index = y * WORLD_TILES_X + x;
  if (state.world.occupied[index] !== undefined) return null;
  if (!isCleared(state, x, y)) return null;

  const biome = biomeAt(state, x, y);
  if (BARE.has(biome)) return null;

  const roll = hash(state.seed, x, y);

  // Your own land is tended and busy; the wild is sparser.
  const mine = inTerritory(state, x, y);
  const chance = mine ? 0.22 : 0.1;
  if ((roll % 1000) / 1000 >= chance) return null;

  // Pick a prop that suits this ground.
  let pick = ((roll >>> 10) % TOTAL_WEIGHT);
  for (const prop of PROPS) {
    pick -= prop.weight;
    if (pick > 0) continue;
    if (!prop.biomes.includes(biome)) return null;
    if (prop.townOnly && !mine) return null;
    return prop;
  }
  return null;
}

/**
 * A stable jitter for a prop, so a hedgerow does not look like a grid.
 *
 * Returns an offset within the tile, in tiles.
 */
export function decorOffset(state, x, y) {
  const roll = hash(state.seed ^ 0x5bf03635, x, y);
  return {
    dx: ((roll % 64) / 64) * 0.35 + 0.1,
    dy: (((roll >>> 6) % 64) / 64) * 0.35 + 0.1,
  };
}
