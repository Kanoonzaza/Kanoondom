// Buildings.
//
// Thirty-three of them, from a 1x1 torch to a 4x3 manor. Drawing every one as
// a literal grid would be four thousand hand-typed characters for the manor
// alone, and they would drift apart in style as I went.
//
// So a building is COMPOSED: a roof, a body, a door, windows, and then the one
// detail that says what it is — an anvil, a sheaf of wheat, a barred vault
// door. The composition keeps every roof pitched the same way and every wall
// lit from the same side, which is most of what makes a set of buildings look
// like they belong to one town. The details are hand-drawn, because they are
// the part a player actually reads.
//
// Everything here is data in the end: `facilityTemplates()` hands the sprite
// compiler ordinary grids, exactly like the terrain does.

import { P } from './palette.js';
import { TILE } from '../../ui/sprites.js';
import { FACILITIES } from '../facilities.js';

// Shared character set, so every building's palette means the same thing.
//   k outline   R/r/H roof, shade, highlight   W/w/V wall, shade, light
//   D/d door    G/g glass, frame               S/s detail, detail shade
//   . transparent
const CHARS = {
  clear: '.', ink: 'k',
  roof: 'R', roofShade: 'r', roofLight: 'H',
  wall: 'W', wallShade: 'w', wallLight: 'V',
  door: 'D', doorDark: 'd',
  glass: 'G', frame: 'g',
  detail: 'S', detailShade: 's',
};

function palette(colours) {
  return {
    '.': null,
    k: P.ink,
    R: colours.roof, r: colours.roofShade, H: colours.roofLight,
    W: colours.wall, w: colours.wallShade, V: colours.wallLight,
    D: colours.door ?? P.woodDark, d: P.ink,
    G: colours.glass ?? P.water, g: P.woodDark,
    S: colours.detail ?? P.gold, s: colours.detailShade ?? P.goldDark,
  };
}

/** A blank grid of transparent pixels. */
function blank(width, height) {
  return Array.from({ length: height }, () => CHARS.clear.repeat(width));
}

function put(grid, x, y, char) {
  if (y < 0 || y >= grid.length) return;
  const row = grid[y];
  if (x < 0 || x >= row.length) return;
  grid[y] = row.slice(0, x) + char + row.slice(x + 1);
}

function fill(grid, x0, y0, x1, y1, char) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) put(grid, x, y, char);
  }
}

/**
 * Stamp a small hand-drawn detail into the middle of a wall.
 *
 * The detail grids below use their own letters; anything not in the map is
 * treated as "leave the wall alone", so a detail can have holes in it.
 */
function stamp(grid, art, x0, y0, mapping) {
  art.forEach((row, y) => {
    [...row].forEach((char, x) => {
      const to = mapping[char];
      if (to) put(grid, x0 + x, y0 + y, to);
    });
  });
}

/**
 * Build one facility's sprite.
 *
 * The roof is a trapezoid so wide buildings read as long halls rather than as
 * tents; the body is lit from the left, which is the convention every sprite in
 * the game follows; and the bottom row is left dark so a building sits ON the
 * ground rather than floating above it.
 */
function makeBuilding(tilesWide, tilesHigh, options = {}) {
  const width = tilesWide * TILE;
  const height = tilesHigh * TILE;
  const grid = blank(width, height);

  const roofDepth = options.roofDepth ?? Math.max(5, Math.round(height * 0.42));
  const eaves = options.eaves ?? 0;
  const peak = Math.max(1, Math.round(width * (options.peak ?? 0.28)));

  // --- roof ---
  for (let y = 0; y < roofDepth; y++) {
    const t = roofDepth === 1 ? 1 : y / (roofDepth - 1);
    const inset = Math.round((1 - t) * (width / 2 - peak / 2));
    const left = Math.max(0, inset - eaves);
    const right = Math.min(width - 1, width - 1 - inset + eaves);

    fill(grid, left, y, right, y, CHARS.roof);
    put(grid, left, y, CHARS.ink);
    put(grid, right, y, CHARS.ink);
    // A lit strip near the ridge and shade along the eaves.
    if (y === 1) fill(grid, left + 1, y, right - 1, y, CHARS.roofLight);
    if (y >= roofDepth - 2) fill(grid, left + 1, y, right - 1, y, CHARS.roofShade);
  }

  // --- body ---
  const bodyTop = roofDepth;
  const bodyBottom = height - 1;
  fill(grid, 0, bodyTop, width - 1, bodyBottom, CHARS.wall);
  fill(grid, 0, bodyTop, 0, bodyBottom, CHARS.ink);
  fill(grid, width - 1, bodyTop, width - 1, bodyBottom, CHARS.ink);
  fill(grid, 0, bodyBottom, width - 1, bodyBottom, CHARS.ink);
  // Light down the left of the wall, shade down the right.
  fill(grid, 1, bodyTop, 1, bodyBottom - 1, CHARS.wallLight);
  fill(grid, width - 2, bodyTop, width - 2, bodyBottom - 1, CHARS.wallShade);

  // --- door ---
  if (options.door !== false) {
    const doorWidth = options.doorWidth ?? (width <= 16 ? 4 : 6);
    // The sign hangs above the door, so the door starts below it. Without this
    // the two were both centred and simply drew on top of each other.
    const signBottom = options.detail ? bodyTop + 2 + options.detail.art.length : bodyTop;
    const doorTop = Math.max(signBottom + 1, bodyBottom - Math.round((bodyBottom - bodyTop) * 0.62));
    const doorHeight = Math.max(4, bodyBottom - doorTop);
    const dx = Math.round(width / 2 - doorWidth / 2);
    const dy = bodyBottom - doorHeight;
    fill(grid, dx, dy, dx + doorWidth - 1, bodyBottom - 1, CHARS.door);
    fill(grid, dx, dy, dx + doorWidth - 1, dy, CHARS.ink);
    fill(grid, dx, dy, dx, bodyBottom - 1, CHARS.ink);
    fill(grid, dx + doorWidth - 1, dy, dx + doorWidth - 1, bodyBottom - 1, CHARS.ink);
  }

  // --- windows ---
  // A sign takes the middle of the wall, so windows keep to the sides.
  const signWidth = options.detail ? options.detail.art[0].length + 4 : 0;
  const windows = options.windows ?? (width <= 16 ? 0 : 2);
  if (windows > 0) {
    const size = width <= 32 ? 4 : 5;
    const wy = bodyTop + 2;
    const spread = width / (windows + 1);
    for (let i = 1; i <= windows; i++) {
      const wx = Math.round(spread * i - size / 2);
      if (signWidth > 0 && Math.abs(wx + size / 2 - width / 2) < signWidth / 2 + size / 2) continue;
      // Skip a window that would land on the door.
      const doorLeft = width / 2 - 4;
      const doorRight = width / 2 + 4;
      if (wx + size > doorLeft && wx < doorRight && bodyBottom - wy < 10) continue;
      fill(grid, wx, wy, wx + size - 1, wy + size - 1, CHARS.glass);
      fill(grid, wx - 1, wy - 1, wx + size, wy - 1, CHARS.frame);
      fill(grid, wx - 1, wy + size, wx + size, wy + size, CHARS.frame);
      fill(grid, wx - 1, wy, wx - 1, wy + size - 1, CHARS.frame);
      fill(grid, wx + size, wy, wx + size, wy + size - 1, CHARS.frame);
    }
  }

  if (options.detail) {
    const art = options.detail.art;
    const dx = Math.round(width / 2 - art[0].length / 2);
    // On the wall, just under the eaves: the one place on a small building
    // with room for something legible.
    const dy = bodyTop + 2;
    stamp(grid, art, dx, dy, { S: CHARS.detail, s: CHARS.detailShade, k: CHARS.ink });
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Hand-drawn details: the bit that says what a building is
// ---------------------------------------------------------------------------

// A sign has to be READ at sixteen pixels to a tile, from a phone, at arm's
// length. The first set of these was three pixels tall and sat on the roof,
// where every building looked like every other building with a gold speck on
// it. They are twice the size now and hang on the wall, which is where a real
// shop would put its sign anyway.
const DETAIL = {
  crown: [
    'k.k.k.k',
    'kSkSkSk',
    'kSSSSSk',
    'kSsSsSk',
    'kkkkkkk',
  ],
  wheat: [
    '..S.S..',
    '.SSSSS.',
    'S.SSS.S',
    '.SSSSS.',
    '..SSS..',
    '...s...',
    '...s...',
  ],
  tree: [
    '...S...',
    '..SSS..',
    '.SSSSS.',
    'SSSSSSS',
    '.SSSSS.',
    '...s...',
    '...s...',
  ],
  cow: [
    '.SSSSS.',
    'SSsSSsS',
    'SSSSSSS',
    'SSSSSSS',
    '.s.s.s.',
  ],
  pick: [
    'S.....S',
    '.S...S.',
    '..SSS..',
    '...s...',
    '...s...',
    '...s...',
  ],
  gem: [
    '..SSS..',
    '.SSSSS.',
    'SSSSSSS',
    '.SsssS.',
    '..SsS..',
    '...S...',
  ],
  coin: [
    '..SSS..',
    '.SsssS.',
    'SsSSSsS',
    'SsSSSsS',
    '.SsssS.',
    '..SSS..',
  ],
  book: [
    'SSSSSSS',
    'SsssssS',
    'SSSSSSS',
    'SsssssS',
    'SSSSSSS',
    'SsssssS',
    'SSSSSSS',
  ],
  hammer: [
    '.SSSSS.',
    'SSSSSSS',
    'SSSSSSS',
    '...s...',
    '...s...',
    '...s...',
  ],
  sword: [
    '...S...',
    '...S...',
    '...S...',
    'SSSSSSS',
    '...s...',
    '...s...',
  ],
  fish: [
    '..SSS..',
    '.SSSSSs',
    'SSsSSSs',
    '.SSSSSs',
    '..SSS..',
  ],
  steam: [
    '.S...S.',
    'S.S.S.S',
    '.S...S.',
    'S.S.S.S',
    '.S...S.',
  ],
  map: [
    'SSSSSSS',
    'SsSsSsS',
    'SSSSSSS',
    'SsSsSsS',
    'SSSSSSS',
  ],
  barrel: [
    '.SSSSS.',
    'SSSSSSS',
    'SsssssS',
    'SSSSSSS',
    'SsssssS',
    '.SSSSS.',
  ],
  key: [
    '.SSS...',
    'S...S..',
    'S...S..',
    '.SSS...',
    '..S....',
    '..SSS..',
    '..S.S..',
  ],
  stone: [
    '..SSS..',
    '.SSSSS.',
    'SSSSSSS',
    'SSsssSS',
    '.SSSSS.',
  ],
  paw: [
    'S.S.S.S',
    'S.S.S.S',
    '.SSSSS.',
    '.SSSSS.',
    '..SSS..',
  ],
  egg: [
    '..SSS..',
    '.SSSSS.',
    'SSSSSSS',
    'SSsSsSS',
    'SSSSSSS',
    '.SSSSS.',
  ],
};

// ---------------------------------------------------------------------------
// Colour schemes
// ---------------------------------------------------------------------------

const SCHEME = {
  civic: { roof: P.roofBlue, roofShade: P.roofBlueDark, roofLight: '#5a7fb5',
    wall: P.plaster, wallShade: P.plasterDark, wallLight: '#f0e8d8' },
  house: { roof: P.roofRed, roofShade: P.roofRedDark, roofLight: '#c25a3f',
    wall: P.plaster, wallShade: P.plasterDark, wallLight: '#f0e8d8' },
  thatch: { roof: P.thatch, roofShade: P.thatchDark, roofLight: P.thatchLight,
    wall: P.wood, wallShade: P.woodDark, wallLight: P.woodLight },
  stone: { roof: P.stone, roofShade: P.stoneDark, roofLight: P.stoneLight,
    wall: P.stone, wallShade: P.stoneDark, wallLight: P.stoneLight },
  work: { roof: P.ironDark, roofShade: '#3f444d', roofLight: P.iron,
    wall: P.wood, wallShade: P.woodDark, wallLight: P.woodLight },
};

/**
 * Every facility that is a BUILDING, with the scheme and detail that tell it
 * apart. Ground pieces — paths, walls, torches — are drawn by hand below,
 * because they are not buildings and a roof would be wrong on them.
 */
const BUILDINGS = {
  town_hall: { scheme: 'civic', detail: DETAIL.crown, windows: 2 },
  plot_s: { scheme: 'house', windows: 2 },
  plot_m: { scheme: 'house', windows: 3 },
  plot_l: { scheme: 'house', windows: 3 },
  plot_xl: { scheme: 'house', windows: 4, detail: DETAIL.crown },

  field: { scheme: 'thatch', detail: DETAIL.wheat, windows: 0, roofDepth: 6 },
  plantation: { scheme: 'thatch', detail: DETAIL.tree, windows: 0 },
  ranch: { scheme: 'thatch', detail: DETAIL.cow, windows: 1 },
  ore_mine: { scheme: 'stone', detail: DETAIL.pick, windows: 0 },
  mystic_mine: { scheme: 'stone', detail: DETAIL.gem, windows: 0 },
  market_stall: { scheme: 'thatch', detail: DETAIL.coin, windows: 0, door: false },
  granary: { scheme: 'thatch', detail: DETAIL.barrel, windows: 1 },
  lumber_yard: { scheme: 'work', detail: DETAIL.tree, windows: 1 },
  ore_store: { scheme: 'stone', detail: DETAIL.stone, windows: 1 },
  treasury: { scheme: 'civic', detail: DETAIL.coin, windows: 2 },
  great_granary: { scheme: 'thatch', detail: DETAIL.barrel, windows: 3 },
  deep_vault: { scheme: 'stone', detail: DETAIL.key, windows: 2 },
  stone_yard: { scheme: 'stone', detail: DETAIL.stone, windows: 2 },

  surveyor_office: { scheme: 'civic', detail: DETAIL.map, windows: 2 },
  library: { scheme: 'civic', detail: DETAIL.book, windows: 2 },
  hot_spring: { scheme: 'stone', detail: DETAIL.steam, windows: 0, door: false, roofDepth: 4 },
  training_yard: { scheme: 'work', detail: DETAIL.sword, windows: 1 },
  fishing_pond: { scheme: 'thatch', detail: DETAIL.fish, windows: 0, door: false, roofDepth: 4 },
  master_smithy: { scheme: 'work', detail: DETAIL.hammer, windows: 2 },
  monster_stable: { scheme: 'thatch', detail: DETAIL.paw, windows: 2 },
  monster_room: { scheme: 'work', detail: DETAIL.egg, windows: 1 },
};

// ---------------------------------------------------------------------------
// Ground pieces, drawn by hand — a roof would be wrong on any of these
// ---------------------------------------------------------------------------

const groundPalette = {
  '.': null, k: P.ink,
  s: P.stone, l: P.stoneLight, d: P.stoneDark,
  w: P.wood, W: P.woodLight, D: P.woodDark,
  f: P.fire, F: P.fireLight, g: P.gold,
  b: P.water, B: P.waterLight,
  c: P.cloth, C: P.plaster, r: P.roofRed,
};

const path = [
  'ssldssllsdlssdls',
  'sllssdllssldslls',
  'dsslsslddsslssdl',
  'sllddslsslldssls',
  'ssllsdlsdsslsdls',
  'lsdssllssllssdls',
  'sslsdssldsslssll',
  'dllssldssllsdssl',
  'ssldsslsslldsdls',
  'llssdllsdsslssls',
  'sdlsslldsslldssl',
  'sslsdsslsslsdlls',
  'lsslldsssdlssdls',
  'dsslsdllssllssls',
  'sllsslddsslsdlls',
  'sslldsslsdlsssdl',
];

const wall = [
  'kkkkkkkkkkkkkkkk',
  'kllllkkllllkkllk',
  'ksssskksssskkssk',
  'kddddkkddddkkddk',
  'kkkkkkkkkkkkkkkk',
  'llkkllllkkllllkk',
  'sskksssskksssskk',
  'ddkkddddkkddddkk',
  'kkkkkkkkkkkkkkkk',
  'kllllkkllllkkllk',
  'ksssskksssskkssk',
  'kddddkkddddkkddk',
  'kkkkkkkkkkkkkkkk',
  'llkkllllkkllllkk',
  'sskksssskksssskk',
  'kkkkkkkkkkkkkkkk',
];

const torchA = [
  '................',
  '................',
  '.......f........',
  '......fFf.......',
  '.....fFFFf......',
  '.....fFFFf......',
  '......fFf.......',
  '.......k........',
  '......kwk.......',
  '......kwk.......',
  '......kwk.......',
  '......kwk.......',
  '......kwk.......',
  '.....kkwkk......',
  '.....ksssk......',
  '.....kkkkk......',
];

const torchB = [
  '................',
  '.......f........',
  '......fFf.......',
  '.....fFFFf......',
  '....fFFFFFf.....',
  '.....fFFFf......',
  '......fFf.......',
  '.......k........',
  '......kwk.......',
  '......kwk.......',
  '......kwk.......',
  '......kwk.......',
  '......kwk.......',
  '.....kkwkk......',
  '.....ksssk......',
  '.....kkkkk......',
];

const watchtower = [
  '....kkkkkkkk....',
  '....krrrrrrk....',
  '....kkkkkkkk....',
  '...kllllllllk...',
  '...kslllllsk....',
  '...ksssssssk....',
  '...kskkkksk.....',
  '...ksbbbbsk.....',
  '...ksbbbbsk.....',
  '...ksssssssk....',
  '...ksdddddsk....',
  '...ksssssssk....',
  '..kkssssssskk...',
  '..ksdddddddsk...',
  '..ksssssssssk...',
  '..kkkkkkkkkkk...',
];

const well = [
  '................',
  '....kkkkkkkk....',
  '...kwwwwwwwwk...',
  '...kkkkkkkkkk...',
  '.....k....k.....',
  '.....k....k.....',
  '..kkkkkkkkkkkk..',
  '..kslllllllsk...',
  '..ksbBBBBBbsk...',
  '..ksbBbbBBbsk...',
  '..ksbbbbbbbsk...',
  '..ksllllllllsk..',
  '..ksdddddddsk...',
  '..kssssssssk....',
  '..kkkkkkkkkk....',
  '................',
];

const bench = [
  '................',
  '................',
  '................',
  '................',
  '...kkkkkkkkkk...',
  '...kWWWWWWWWk...',
  '...kwwwwwwwwk...',
  '...kkkkkkkkkk...',
  '....k......k....',
  '...kkkkkkkkkk...',
  '...kWWWWWWWWk...',
  '...kDDDDDDDDk...',
  '...kkkkkkkkkk...',
  '....k......k....',
  '....k......k....',
  '....kk....kk....',
];

const doubleBed = [
  '................',
  '..kkkkkkkkkkkk..',
  '..kwwwwwwwwwwk..',
  '..kkkkkkkkkkkk..',
  '..kCCCCCCCCCCk..',
  '..kCCCCCCCCCCk..',
  '..krrrrrrrrrrk..',
  '..krrrrrrrrrrk..',
  '..krrrrrrrrrrk..',
  '..kCCCCCCCCCCk..',
  '..kCCCCCCCCCCk..',
  '..krrrrrrrrrrk..',
  '..kkkkkkkkkkkk..',
  '..kwwwwwwwwwwk..',
  '..kkkkkkkkkkkk..',
  '................',
];

const GROUND = {
  path: { frames: [path] },
  wall: { frames: [wall] },
  torch: { frames: [torchA, torchB] },
  watchtower: { frames: [watchtower] },
  well: { frames: [well] },
  bench: { frames: [bench] },
  double_bed: { frames: [doubleBed] },
};

// ---------------------------------------------------------------------------
// Overlays: what a building looks like while it is going up, or broken
// ---------------------------------------------------------------------------

function scaffold(width, height) {
  const grid = blank(width, height);
  for (let y = 0; y < height; y += 5) fill(grid, 0, y, width - 1, y, 'w');
  for (let x = 2; x < width; x += 7) fill(grid, x, 0, x, height - 1, 'w');
  return grid;
}

function cracks(width, height) {
  const grid = blank(width, height);
  let x = Math.round(width * 0.35);
  for (let y = Math.round(height * 0.3); y < height - 1; y++) {
    put(grid, x, y, 'k');
    if (y % 3 === 0) put(grid, x + 1, y, 'k');
    x += y % 2 === 0 ? 1 : -1;
  }
  let x2 = Math.round(width * 0.7);
  for (let y = Math.round(height * 0.45); y < height - 1; y++) {
    put(grid, x2, y, 'k');
    x2 += y % 2 === 0 ? -1 : 1;
  }
  return grid;
}

// ---------------------------------------------------------------------------

/** Every facility sprite, keyed `facility:<id>`. */
export function facilityTemplates() {
  const table = {};

  for (const [id, art] of Object.entries(GROUND)) {
    table[`facility:${id}`] = { palette: groundPalette, frames: art.frames };
  }

  for (const [id, spec] of Object.entries(BUILDINGS)) {
    const def = FACILITIES[id];
    if (!def) continue;
    const colours = SCHEME[spec.scheme];
    table[`facility:${id}`] = {
      palette: palette({ ...colours, detail: spec.detailColour ?? P.gold }),
      frames: [makeBuilding(def.size.w, def.size.h, {
        windows: spec.windows,
        door: spec.door,
        roofDepth: spec.roofDepth,
        detail: spec.detail ? { art: spec.detail } : null,
      })],
    };
  }

  // Two overlays per footprint actually in use, rather than per facility.
  const footprints = new Set(
    Object.values(FACILITIES).map((def) => `${def.size.w}x${def.size.h}`)
  );
  for (const key of footprints) {
    const [w, h] = key.split('x').map(Number);
    table[`overlay:scaffold:${key}`] = {
      palette: { '.': null, w: P.woodLight },
      frames: [scaffold(w * TILE, h * TILE)],
    };
    table[`overlay:cracks:${key}`] = {
      palette: { '.': null, k: P.ink },
      frames: [cracks(w * TILE, h * TILE)],
    };
  }

  return table;
}

/** Which facilities have artwork. Used by the coverage test. */
export function facilityArtIds() {
  return [...Object.keys(GROUND), ...Object.keys(BUILDINGS)];
}
