// Ground.
//
// Eight biomes at sixteen pixels to a tile. The old map filled one flat colour
// per tile and scaled it up, which is why it read as a spreadsheet: at any zoom
// the whole world was made of identical squares.
//
// Three things fix that, and the first draft of this file managed only one:
//
//   COVERAGE. Scattering a handful of darker dots over a flat fill still looks
//   like a flat fill with dust on it. Texture has to cover a good third of the
//   tile before the eye stops reading the base colour as the whole story.
//
//   STRUCTURE. Grain on its own is just noise. Grass needs blades, rock needs
//   boulders with a lit top and a shadowed underside, water needs bands of
//   swell. Shapes are what make a tile read as a material rather than as static.
//
//   VARIANTS. Most biomes have two stamps, chosen by a hash of the tile's
//   position, so a meadow is not one picture repeated ninety-six times across.
//   The choice is a pure function of where the tile is, so the same tile always
//   draws the same way and the terrain sheet stays cacheable.
//
// Sea and lava carry a second FRAME instead — water that shifts and lava that
// pulses, the two parts of a landscape that should never sit still.
//
// Rows are sixteen characters. `tests/sprites.test.js` refuses anything else.

import { P } from './palette.js';

// ---------------------------------------------------------------------------
// Grass: upright blades in clumps, over a mottled base
// ---------------------------------------------------------------------------

const grassPalette = {
  g: P.grass, d: P.grassDark, l: P.grassLight, t: P.grassTuft,
  f: P.thatchLight, w: P.plaster,
};

const grassA = [
  'gdggltggdggggtdg',
  'gdgggdggdggggdgg',
  'ggdggdgglgggggdg',
  'ltggdggggdgggggt',
  'gdggdggggdgggggd',
  'gdgggggtdggltggg',
  'ggggtdggggggdggg',
  'gdggdgggdgggdggl',
  'gdgggggtdgggggtg',
  'ggltggdggdggggdg',
  'gggdggdgggggtdgg',
  'tdgggggggltgggdg',
  'dggggtdgggdgggdg',
  'gggggdggggdggggt',
  'gltggggdgglggggd',
  'ggdggggdgggggdgg',
];

const grassB = [
  'ggdgggtdggltgggd',
  'ggdgggdgggggdggd',
  'ltgggggdgggdgggg',
  'gdggltgggggdgggd',
  'gdgggdggdggggggd',
  'ggggggggdgggtdgg',
  'gtdggdgggggggdgl',
  'ggdggdggltggggdg',
  'gggggggggdggggdg',
  'gdggtdgggdgglggg',
  'gdgggdgggggggtdg',
  'ggggggggltggggdg',
  'gltgggdgggdggggd',
  'gggdggdgggdgggtg',
  'ggdgggggtdggggdg',
  'ggdgglggdgggggdg',
];

/**
 * The third stamp, with wildflowers in it.
 *
 * Grass is most of what a player ever looks at — the homeland is forced to it,
 * and it is the commonest biome besides. With two stamps the middle of the map
 * still read as one flat green field, so this one breaks the run with small
 * flowers rather than more of the same blades.
 */
const grassC = [
  'gdgggfwfggdggggd',
  'gdggggfgggdggggd',
  'ggdgggggltgggggg',
  'ltggdgggggdggwfw',
  'gdggdgggggdgggfg',
  'ggggggtdgggggggg',
  'gwfwgdggggtdgggl',
  'gfgggdggggdggggd',
  'gggggggggggggggd',
  'gdggltggwfwgggtg',
  'gdgggggggfggggdg',
  'ggtdggdggggggggg',
  'gggdggdgggltgggd',
  'wfwggggdgggggggd',
  'gfgggtdggggdgggg',
  'ggdggdggggdgglgg',
];

// ---------------------------------------------------------------------------
// Soil: broken furrows, with stones turned up in them
// ---------------------------------------------------------------------------

const soilPalette = { s: P.soil, d: P.soilDark, l: P.soilLight, r: P.soilStone };

const soilA = [
  'ddddssssddddddss',
  'ssssssdrdssssssd',
  'lllssssssslllsss',
  'ssssddddssssssdd',
  'sdrdsssssssrdsss',
  'ssssssslllssssll',
  'ddddssssssssdddd',
  'ssssssdrdsssssss',
  'ssslllsssssdrdss',
  'ddddsssslllsssss',
  'ssssssddddssssdd',
  'sdrdssssssssssss',
  'ssssslllsssdrdss',
  'llsssssssssssssl',
  'ssdddddssslllsss',
  'ssssssssddddssss',
];

const soilB = [
  'sssddddssssssddd',
  'sdrdssssssdrdsss',
  'ssssslllssssssss',
  'ddddsssssslllsss',
  'sssssssdrdsssssd',
  'llssddddsssssddd',
  'ssssssssssdrdsss',
  'ssdrdsslllssssss',
  'lllsssssssssdddd',
  'ssssddddssssssss',
  'sdrdssssssslllss',
  'sssssslllsssssdd',
  'ddddssssssdrdsss',
  'ssssssdddddsssss',
  'ssdrdsssssssssll',
  'lllsssssssddddss',
];

// ---------------------------------------------------------------------------
// Swamp: standing water in pools, rimmed with darker mud
// ---------------------------------------------------------------------------

const swampPalette = {
  s: P.swamp, d: P.swampDark, w: P.swampWater, l: P.swampLight,
};

const swampA = [
  'sdsslddwwwddssds',
  'ddwwddwwwwwddwwd',
  'dwwwwdwwwwwdwwww',
  'dwwwwddwwwddwwww',
  'ddwwddsdddsddwwd',
  'sddssllsssssddsl',
  'slsddwwwddsslsss',
  'sddwwwwwwddsdlds',
  'dwwwwwwwwwdsdwwd',
  'ddwwwwwwwwddwwww',
  'sddwwwwwwddwwwww',
  'ssddwwwwddsdwwwd',
  'lssddwwddsssddss',
  'sslsddddslsslsss',
  'ssssdddssslsddwd',
  'sdssslssdsssdwwd',
];

// ---------------------------------------------------------------------------
// Desert: wind ripples running across the dunes
// ---------------------------------------------------------------------------

const sandPalette = { s: P.sand, d: P.sandDark, l: P.sandLight, r: P.sandStone };

const sandA = [
  'sslllssssssllsss',
  'ddssdddsssddsddd',
  'ssssssslllssssss',
  'ssddddsssssdddds',
  'lllsssssrsssssll',
  'sssdddsssssdddss',
  'ssssssslllsssssd',
  'sdddsssssdddsssd',
  'sssssllsssssslls',
  'ddsssssdddsssssd',
  'ssslllsssssssdds',
  'ddddssssssrsssss',
  'sssssssdddslllss',
  'sllssssssssssddd',
  'sssdddsssdddssss',
  'ddssssslllssssss',
];

const sandB = [
  'ssssdddsssslllss',
  'lllssssssdddssss',
  'ssssssllsssssddd',
  'sdddssssssssssss',
  'sssssssdddslllss',
  'ssllssssssssssdd',
  'dddsssssrssdddss',
  'sssssslllssssdss',
  'ssdddsssssssssll',
  'llsssssssdddssss',
  'ssssdddsssssssdd',
  'sssssssssllsssss',
  'ddsssrsdddssssss',
  'ssslllsssssdddss',
  'ssssssssdddsssll',
  'sdddssllssssssss',
];

// ---------------------------------------------------------------------------
// Rock: boulders with a lit top edge and a shadow beneath
// ---------------------------------------------------------------------------

const rockPalette = { r: P.rock, d: P.rockDark, l: P.rockLight, c: P.rockCrack };

const rockA = [
  'llllrrcdllllrrcd',
  'rrrrrrcdrrrrrrcd',
  'rrrrrrcdrrrrrrcd',
  'ddddddcdddddddcd',
  'cccccccccccccccc',
  'rrcdllllrrcdllll',
  'rrcdrrrrrrcdrrrr',
  'rrcdrrrrrrcdrrrr',
  'ddcdddddddcddddd',
  'cccccccccccccccc',
  'llllrrcdllllrrcd',
  'rrrrrrcdrrrrrrcd',
  'rrrrrrcdrrrrrrcd',
  'ddddddcdddddddcd',
  'cccccccccccccccc',
  'rrcdllllrrcdllll',
];

const rockB = [
  'rrcdllllrrrrcdll',
  'rrcdrrrrrrrrcdrr',
  'ddcdrrrrddddcdrr',
  'cccdddddccccdddd',
  'llllccccllllcccc',
  'rrrrllllrrrrllll',
  'rrrrrrrrrrrrrrrr',
  'ddddrrrrddddrrrr',
  'ccccddddccccdddd',
  'llllccccllllcccc',
  'rrrrllllrrrrllll',
  'rrrrrrrrrrrrrrrr',
  'ddddrrrrddddrrrr',
  'ccccddddccccdddd',
  'llllccccllllcccc',
  'rrrrllllrrrrllll',
];

// ---------------------------------------------------------------------------
// Snow: drifts, with packed ice blue in the hollows
// ---------------------------------------------------------------------------

const snowPalette = { s: P.snow, d: P.snowDark, l: P.snowLight, b: P.snowBlue };

const snowA = [
  'llllssssddddssss',
  'llsssssdddbbdddd',
  'ssssssddbbbbbbdd',
  'sssllsdbbbbbbbds',
  'slllllsdbbbbdssl',
  'llllssssddddsssl',
  'ssssssssssssssll',
  'ddddsssslllsssss',
  'bbddsssslllllsss',
  'bbbddssssllllsss',
  'dbbbdsssssssslll',
  'ddbbdddsssssllll',
  'sddddddsssssssll',
  'ssssssdddssssssl',
  'llssssssddddssss',
  'llllsssssddbbdds',
];

const snowB = [
  'ssssddddssssllll',
  'ddddbbdddsssssll',
  'ddbbbbbbddssssss',
  'sdbbbbbbbdsllsss',
  'lssdbbbbdsllllls',
  'lsssddddssssllll',
  'llssssssssssssss',
  'sssslllssssddddd',
  'ssslllllssssbbdd',
  'sssllllssssdbbbd',
  'lllssssssssddbbd',
  'llllsssssdddbbdd',
  'llssssssssdddddd',
  'lsssssssdddsssss',
  'ssssddddsssssssl',
  'sddbbddsssssllll',
];

// ---------------------------------------------------------------------------
// Lava: a crust of cooled rock, cracked open and glowing through
// ---------------------------------------------------------------------------

const lavaPalette = {
  r: P.lavaRock, d: P.lavaDark, g: P.lavaGlow, h: P.lavaHot, b: P.lavaBright,
};

const lavaA = [
  'rrdggghdrrrdgghd',
  'rdggbbhgdrdgbhgd',
  'rdghhbgdrrdghgdr',
  'rrdgghdrrrrdgdrr',
  'rrrdgdrrdrrrdrrr',
  'drrrdrrdgghdrrrd',
  'ggdrrrdgbbhgdrdg',
  'bhgdrrdghhbgdrgb',
  'ghdrrrrdgghdrrgh',
  'drrrdgdrrdrrrrrd',
  'rrdgghgdrrrdggdr',
  'rdgbbbhgdrdgbhgd',
  'rdghhhgdrrdghgdr',
  'rrdgghdrrrrddrrr',
  'rrrddrrrdggdrrrd',
  'rrrrrrrdgbhgdrdg',
];

const lavaB = [
  'rrdgghgdrrrdghgd',
  'rdgbhbgdrdgbbhgd',
  'rdghbhgdrrdghhgd',
  'rrdgghdrrrrdggdr',
  'rrrdgdrrdrrrdrrr',
  'drrrdrrdgghgdrrd',
  'ghdrrrdgbhbgdrdg',
  'bbgdrrdghbhgdrgh',
  'ghdrrrrdgghdrrgb',
  'drrrdgdrrdrrrrrd',
  'rrdghhgdrrrdggdr',
  'rdgbbhgdrdgbbhgd',
  'rdghhbgdrrdghhgd',
  'rrdgghdrrrrddrrr',
  'rrrddrrrdgghdrrd',
  'rrrrrrrdgbbhgdrg',
];

// ---------------------------------------------------------------------------
// Sea: bands of swell, with foam on the crests
// ---------------------------------------------------------------------------

const seaPalette = { s: P.sea, d: P.seaDark, l: P.seaLight, f: P.seaFoam };

const seaA = [
  'ssssddddssssdddd',
  'sllssssssllsssss',
  'lffldssslffldsss',
  'sllssdddsllssddd',
  'ssssssssssssssss',
  'ddddssssddddssss',
  'ssssllssssssllss',
  'dsslffldsssdlffl',
  'ddssllssdddsslls',
  'ssssssssssssssss',
  'ssddddssssddddss',
  'llssssssllssssss',
  'ffldsssslffldsss',
  'llssdddssllssddd',
  'ssssssssssssssss',
  'ddddssssddddssss',
];

const seaB = [
  'ssddddssssddddss',
  'ssssllssssssllss',
  'dsslffldsssdlffl',
  'ddssllssdddsslls',
  'ssssssssssssssss',
  'ssssddddssssdddd',
  'sllssssssllsssss',
  'lffldssslffldsss',
  'sllssdddsllssddd',
  'ssssssssssssssss',
  'ddddssssddddssss',
  'ssllssssssllssss',
  'slffldssslffldss',
  'ssllssdddsllssdd',
  'ssssssssssssssss',
  'ssddddssssddddss',
];

// ---------------------------------------------------------------------------
// Fog: cloud lying over land nobody has walked yet
// ---------------------------------------------------------------------------

const fogPalette = { f: P.fog, d: P.fogDark, l: P.fogLight };

const fogA = [
  'ffffdddffffffddd',
  'fffddddddffffddd',
  'ffdddddddffffddd',
  'fdddlddddfffdddd',
  'ffdddddddfffdddf',
  'fffdddddfffffdff',
  'ffffdddfffffffff',
  'fffffffffffddddf',
  'ffffffffffdddddd',
  'fdddffffdddddldd',
  'ddddddffdddddddd',
  'dddddddfffdddddf',
  'fdddldffffffdddf',
  'ffdddffffffffdff',
  'ffffffffffffffff',
  'ffffdddfffffffff',
];

/**
 * One entry per biome, plus fog.
 *
 * `variants` are interchangeable stamps chosen by position; `frames` inside a
 * variant are animation.
 */
export const TERRAIN_ART = {
  grass: { palette: grassPalette, variants: [grassA, grassB, grassC] },
  soil: { palette: soilPalette, variants: [soilA, soilB] },
  swamp: { palette: swampPalette, variants: [swampA] },
  desert: { palette: sandPalette, variants: [sandA, sandB] },
  rock: { palette: rockPalette, variants: [rockA, rockB] },
  snow: { palette: snowPalette, variants: [snowA, snowB] },
  lava: { palette: lavaPalette, variants: [lavaA], frames: [lavaA, lavaB] },
  sea: { palette: seaPalette, variants: [seaA], frames: [seaA, seaB] },
  fog: { palette: fogPalette, variants: [fogA] },
};

/** Templates in the shape the sprite compiler wants: `terrain:grass:0`. */
export function terrainTemplates() {
  const table = {};

  for (const [id, art] of Object.entries(TERRAIN_ART)) {
    if (art.frames) {
      table[`terrain:${id}:0`] = { palette: art.palette, frames: art.frames };
      continue;
    }
    art.variants.forEach((variant, index) => {
      table[`terrain:${id}:${index}`] = { palette: art.palette, frames: [variant] };
    });
  }

  return table;
}

/** How many interchangeable stamps a biome has. */
export function variantCount(biomeId) {
  const art = TERRAIN_ART[biomeId];
  if (!art) return 1;
  return art.frames ? 1 : art.variants.length;
}
