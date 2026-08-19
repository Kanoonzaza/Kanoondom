// What is inside every building.
//
// The whole point of drawing rooms rather than houses is that a player can see
// what a building IS without tapping it — a bed means somebody lives here, an
// anvil means a smithy, rows of green mean a field. So this table is really
// the game's iconography, and it earns its keep at a glance.
//
// Positions are given in a UNIT SQUARE: x and y run 0..1 across the room's
// footprint, whatever that footprint happens to be. A bed at { x: 0.1, y: 0.1,
// w: 0.35, h: 0.5 } sits in the same corner of a 2x2 cottage and a 4x3 manor.
// That is what lets one description serve five different building sizes.
//
//   x, y     where the piece starts, 0..1 of the room
//   w, h     how much of the room it covers
//   tall     height in tile-heights; 0.5 is table-high, 1.2 is a wardrobe
//   colour   the sides
//   top      the face you actually read, defaults to `colour`

import { P } from './palette.js';

const bed = (x, y) => ({
  x, y, w: 0.34, h: 0.46, tall: 0.32, colour: P.wood, top: P.plaster,
});
const rug = (x, y) => ({
  x, y, w: 0.34, h: 0.34, tall: 0.02, colour: P.roofRed, top: P.roofRed,
});
const table = (x, y) => ({
  x, y, w: 0.3, h: 0.26, tall: 0.36, colour: P.woodDark, top: P.woodLight,
});
const counter = (x, y, w = 0.7) => ({
  x, y, w, h: 0.16, tall: 0.42, colour: P.woodDark, top: P.wood,
});
const crate = (x, y) => ({
  x, y, w: 0.2, h: 0.2, tall: 0.34, colour: P.woodDark, top: P.wood,
});
const barrel = (x, y) => ({
  x, y, w: 0.18, h: 0.18, tall: 0.42, colour: '#7a5230', top: P.thatch,
});
const crop = (x, y, w, h, colour) => ({
  x, y, w, h, tall: 0.16, colour, top: colour,
});
const water = (x, y, w, h) => ({
  x, y, w, h, tall: 0.04, colour: P.water, top: P.waterLight,
});
const stone = (x, y) => ({
  x, y, w: 0.24, h: 0.24, tall: 0.3, colour: P.stoneDark, top: P.stone,
});

/**
 * One entry per facility. Anything missing simply draws an empty room, which
 * is honest rather than wrong — and `tests/sprites.test.js` refuses to let a
 * building ship without furnishings.
 */
export const FURNISHINGS = {
  // --- civic ---------------------------------------------------------------
  town_hall: [
    rug(0.33, 0.33),
    { x: 0.36, y: 0.14, w: 0.28, h: 0.2, tall: 0.75, colour: P.stoneDark, top: P.gold },
    table(0.12, 0.62), table(0.6, 0.62),
  ],

  // --- homes ---------------------------------------------------------------
  plot_s: [bed(0.08, 0.1), table(0.58, 0.6)],
  plot_m: [bed(0.06, 0.06), bed(0.06, 0.5), table(0.62, 0.36), rug(0.4, 0.6)],
  plot_l: [
    bed(0.05, 0.06), bed(0.05, 0.5), bed(0.62, 0.06),
    table(0.6, 0.58), rug(0.34, 0.34),
  ],
  plot_xl: [
    bed(0.04, 0.05), bed(0.04, 0.5), bed(0.66, 0.05), bed(0.66, 0.5),
    rug(0.33, 0.3), table(0.36, 0.66),
  ],
  double_bed: [{ x: 0.1, y: 0.1, w: 0.8, h: 0.8, tall: 0.3, colour: P.wood, top: P.roofRed }],

  // --- growing things ------------------------------------------------------
  field: [
    crop(0.08, 0.1, 0.84, 0.16, P.wheat), crop(0.08, 0.34, 0.84, 0.16, P.wheatDark),
    crop(0.08, 0.58, 0.84, 0.16, P.wheat),
  ],
  plantation: [
    { x: 0.12, y: 0.12, w: 0.24, h: 0.24, tall: 0.9, colour: P.trunk, top: P.leaf },
    { x: 0.58, y: 0.16, w: 0.24, h: 0.24, tall: 0.8, colour: P.trunk, top: P.leafLight },
    { x: 0.3, y: 0.58, w: 0.24, h: 0.24, tall: 0.85, colour: P.trunk, top: P.leaf },
  ],
  ranch: [
    crop(0.06, 0.06, 0.88, 0.5, P.grassLight),
    { x: 0.2, y: 0.62, w: 0.22, h: 0.18, tall: 0.4, colour: '#c9b89a', top: P.plaster },
    { x: 0.56, y: 0.66, w: 0.22, h: 0.18, tall: 0.4, colour: '#5c4a3a', top: '#7a6450' },
  ],
  fishing_pond: [water(0.08, 0.08, 0.84, 0.84), stone(0.1, 0.72)],
  hot_spring: [
    { x: 0.1, y: 0.1, w: 0.8, h: 0.8, tall: 0.05, colour: '#6fa8bf', top: '#9fd0e0' },
    stone(0.06, 0.06), stone(0.72, 0.74),
  ],

  // --- digging -------------------------------------------------------------
  ore_mine: [
    { x: 0.28, y: 0.24, w: 0.44, h: 0.5, tall: 0.1, colour: '#2b2118', top: '#1b1410' },
    stone(0.06, 0.7), stone(0.74, 0.1),
  ],
  mystic_mine: [
    { x: 0.28, y: 0.24, w: 0.44, h: 0.5, tall: 0.1, colour: '#2a2438', top: '#181426' },
    { x: 0.08, y: 0.68, w: 0.18, h: 0.18, tall: 0.4, colour: '#6f4fa0', top: P.magicLight },
  ],
  stone_yard: [stone(0.1, 0.12), stone(0.42, 0.2), stone(0.66, 0.56), stone(0.16, 0.62)],
  lumber_yard: [
    { x: 0.08, y: 0.1, w: 0.5, h: 0.16, tall: 0.3, colour: P.trunk, top: P.woodLight },
    { x: 0.08, y: 0.34, w: 0.5, h: 0.16, tall: 0.3, colour: P.trunk, top: P.woodLight },
    crate(0.7, 0.62),
  ],

  // --- storing things ------------------------------------------------------
  granary: [barrel(0.12, 0.14), barrel(0.4, 0.14), barrel(0.68, 0.14), crate(0.2, 0.6)],
  great_granary: [
    barrel(0.1, 0.12), barrel(0.34, 0.12), barrel(0.58, 0.12), barrel(0.78, 0.12),
    barrel(0.1, 0.55), barrel(0.34, 0.55), crate(0.66, 0.6),
  ],
  ore_store: [stone(0.12, 0.16), stone(0.5, 0.2), crate(0.2, 0.62), crate(0.62, 0.62)],
  deep_vault: [
    { x: 0.24, y: 0.22, w: 0.5, h: 0.5, tall: 0.5, colour: P.ironDark, top: P.iron },
    { x: 0.36, y: 0.34, w: 0.26, h: 0.26, tall: 0.56, colour: P.goldDark, top: P.gold },
  ],
  treasury: [
    { x: 0.16, y: 0.2, w: 0.28, h: 0.28, tall: 0.45, colour: P.goldDark, top: P.goldLight },
    { x: 0.56, y: 0.2, w: 0.28, h: 0.28, tall: 0.4, colour: P.goldDark, top: P.gold },
    crate(0.36, 0.66),
  ],
  market_stall: [counter(0.1, 0.55, 0.8), crate(0.12, 0.12)],

  // --- work ----------------------------------------------------------------
  master_smithy: [
    { x: 0.1, y: 0.16, w: 0.26, h: 0.24, tall: 0.5, colour: '#3f444d', top: P.iron },
    { x: 0.46, y: 0.14, w: 0.3, h: 0.24, tall: 0.55, colour: '#5a2a1c', top: P.fire },
    counter(0.1, 0.66, 0.7),
  ],
  training_yard: [
    crop(0.08, 0.08, 0.84, 0.84, '#b09a70'),
    { x: 0.2, y: 0.24, w: 0.16, h: 0.16, tall: 0.7, colour: P.woodDark, top: P.iron },
    { x: 0.62, y: 0.5, w: 0.16, h: 0.16, tall: 0.7, colour: P.woodDark, top: P.iron },
  ],
  library: [
    { x: 0.08, y: 0.1, w: 0.18, h: 0.7, tall: 1.0, colour: P.woodDark, top: P.roofRed },
    { x: 0.36, y: 0.1, w: 0.18, h: 0.7, tall: 1.0, colour: P.woodDark, top: P.roofBlue },
    table(0.66, 0.5),
  ],
  surveyor_office: [
    table(0.3, 0.3), counter(0.08, 0.72, 0.6),
    { x: 0.66, y: 0.14, w: 0.2, h: 0.2, tall: 0.6, colour: P.woodDark, top: P.thatch },
  ],
  monster_stable: [
    crop(0.06, 0.06, 0.88, 0.88, '#8a7a5a'),
    { x: 0.14, y: 0.2, w: 0.24, h: 0.3, tall: 0.28, colour: P.thatchDark, top: P.thatch },
    { x: 0.58, y: 0.4, w: 0.24, h: 0.3, tall: 0.28, colour: P.thatchDark, top: P.thatch },
  ],
  monster_room: [
    rug(0.3, 0.3),
    { x: 0.14, y: 0.16, w: 0.22, h: 0.22, tall: 0.4, colour: '#5a4a6a', top: P.magicLight },
    { x: 0.6, y: 0.58, w: 0.22, h: 0.22, tall: 0.4, colour: '#5a4a6a', top: P.magicLight },
  ],
  bench: [{ x: 0.1, y: 0.35, w: 0.8, h: 0.3, tall: 0.28, colour: P.woodDark, top: P.woodLight }],

  // --- ground furniture ----------------------------------------------------
  well: [
    { x: 0.18, y: 0.18, w: 0.64, h: 0.64, tall: 0.42, colour: P.stoneDark, top: P.water },
  ],
  torch: [
    { x: 0.38, y: 0.38, w: 0.24, h: 0.24, tall: 1.1, colour: P.woodDark, top: P.fireLight },
  ],
  watchtower: [
    { x: 0.2, y: 0.2, w: 0.6, h: 0.6, tall: 1.8, colour: P.stoneDark, top: P.roofRed },
  ],
  wall: [
    { x: 0, y: 0, w: 1, h: 1, tall: 0.9, colour: P.stoneDark, top: P.stone },
  ],
  path: [
    { x: 0, y: 0, w: 1, h: 1, tall: 0.03, colour: P.stoneDark, top: P.stone },
  ],
};

/** Which facilities have something inside them. Used by the coverage test. */
export function furnishedIds() {
  return Object.keys(FURNISHINGS);
}
