// The master palette.
//
// One place for every colour in the game's artwork, so the whole map stays in
// one world rather than becoming a patchwork of whatever looked right at the
// time. The hues follow the UI's own tokens (see styles.css) — warm gold on
// cool slate — and lean slightly desaturated and earthy, which is what makes
// tile art read as a place rather than as a chart.
//
// Every entry is used by name in the art files, so a colour can be adjusted
// once here and the whole kingdom shifts with it.

export const P = {
  // --- ink and shadow ------------------------------------------------------
  ink: '#241f2b',          // the outline colour for everything
  shadow: '#00000033',     // soft drop shadow under objects
  night: '#0d1220',

  // --- grass ---------------------------------------------------------------
  grass: '#5d8a4a',
  grassDark: '#4a7139',
  grassLight: '#77a45c',
  grassTuft: '#3d5f2f',

  // --- soil ----------------------------------------------------------------
  soil: '#8a6a45',
  soilDark: '#6d5234',
  soilLight: '#a3835a',
  soilStone: '#5c452b',

  // --- swamp ---------------------------------------------------------------
  swamp: '#55684a',
  swampDark: '#43543b',
  swampWater: '#496b5e',
  swampLight: '#6b7f5a',

  // --- desert --------------------------------------------------------------
  sand: '#d4b877',
  sandDark: '#bda164',
  sandLight: '#e6cf95',
  sandStone: '#a8894f',

  // --- rock ----------------------------------------------------------------
  rock: '#8a8d97',
  rockDark: '#6f727c',
  rockLight: '#a5a8b2',
  rockCrack: '#565963',

  // --- snow ----------------------------------------------------------------
  snow: '#dce7f0',
  snowDark: '#c2d2e0',
  snowLight: '#f4f8fc',
  snowBlue: '#a8bccf',

  // --- lava ----------------------------------------------------------------
  lavaRock: '#4a2820',
  lavaDark: '#331a14',
  lavaGlow: '#d9601f',
  lavaHot: '#f5a63c',
  lavaBright: '#ffd76e',

  // --- sea -----------------------------------------------------------------
  sea: '#2f6a8f',
  seaDark: '#24567a',
  seaLight: '#4b87ad',
  seaFoam: '#a9d4e8',

  // --- fog: unexplored land ------------------------------------------------
  fog: '#141926',
  fogDark: '#0f1420',
  fogLight: '#1c2434',

  // --- built things --------------------------------------------------------
  wood: '#8a5f35',
  woodDark: '#6b4728',
  woodLight: '#a87b4a',
  thatch: '#c9a24d',
  thatchDark: '#a17e35',
  thatchLight: '#e0bf6b',
  stone: '#9a9db0',
  stoneDark: '#767a8c',
  stoneLight: '#bcc0d0',
  plaster: '#e2d8c3',
  plasterDark: '#c4b89f',
  roofRed: '#a8462f',
  roofRedDark: '#83321f',
  roofBlue: '#3f5f8a',
  roofBlueDark: '#2e476b',

  // --- metal and treasure --------------------------------------------------
  gold: '#d9a441',
  goldDark: '#a87c25',
  goldLight: '#f2cd72',
  iron: '#7e8592',
  ironDark: '#5c626d',
  copper: '#c47a3d',
  silver: '#c3cbd6',

  // --- people --------------------------------------------------------------
  skin: '#e8b48c',
  skinDark: '#c48c66',
  hair: '#4a3628',
  hairLight: '#8a6440',
  cloth: '#5b7fa8',
  clothDark: '#42607f',

  // --- nature --------------------------------------------------------------
  leaf: '#4c7a3a',
  leafDark: '#3a5f2c',
  leafLight: '#6d9a52',
  trunk: '#6b4a2e',
  wheat: '#d9b862',
  wheatDark: '#b3934a',
  water: '#4a7fb5',
  waterLight: '#7ab0d9',

  // --- creatures and effects ----------------------------------------------
  slime: '#6fbf5a',
  slimeDark: '#4e9440',
  fire: '#e8632a',
  fireLight: '#ffc355',
  magic: '#a06fd0',
  magicLight: '#c9a3ec',
  danger: '#c14b3a',
  bone: '#e6dfcc',
};

// A typo in a colour name yields `undefined`, which the sprite compiler treats
// as "no colour" and quietly skips — a hole in the artwork rather than an
// error. This turns that into a loud failure at import time instead.
for (const [name, value] of Object.entries(P)) {
  if (typeof value !== 'string' || !value.startsWith('#')) {
    throw new Error(`palette.js: ${name} is not a colour (${value})`);
  }
}
