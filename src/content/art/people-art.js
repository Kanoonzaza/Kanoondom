// People.
//
// Fifteen professions, and not fifteen drawings. They are one body — big head,
// small tunic, stubby legs, which is the shape this whole genre uses because it
// stays readable at sixteen pixels — recoloured per trade and given a hat.
//
// The walk is two frames and the second is just the first lifted a pixel. That
// bob is doing almost all of the work: a townsperson who bounces reads as
// walking, and one who does not reads as a statue. It costs one line of code
// and no extra artwork.
//
// Hats are what actually tell trades apart at this size. A cook and a knight
// have the same silhouette otherwise, and the eye finds a shape on the head
// long before it finds a tunic colour.

import { P } from './palette.js';

// h hair/hat   S skin   e eye   T tunic   B legs   k outline
const BODY = [
  '................',
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...kSSSSSSSSk...',
  '...kSeSSSSeSk...',
  '...kSSSSSSSSk...',
  '...kSSSSSSSSk...',
  '....kkkkkkkk....',
  '.....kTTTTk.....',
  '....kTTTTTTk....',
  '....kTTTTTTk....',
  '.....kTTTTk.....',
  '.....kBkBk......',
  '.....kkkkk......',
];

/** Lift every row by one, for the bounce halfway through a step. */
function bob(grid) {
  return [...grid.slice(1), '.'.repeat(grid[0].length)];
}

/** Flip left-to-right, so somebody walking west is not walking backwards. */
function mirror(grid) {
  return grid.map((row) => [...row].reverse().join(''));
}

// ---------------------------------------------------------------------------
// Hats: drawn over the head, and the main thing that says what somebody does
// ---------------------------------------------------------------------------

const HATS = {
  none: null,
  cap: [
    '....HHHHHHHH....',
    '...HHHHHHHHHH...',
  ],
  wide: [
    '..HHHHHHHHHHHH..',
    '...HHHHHHHHHH...',
  ],
  pointed: [
    '.......HH.......',
    '.....HHHHHH.....',
    '...HHHHHHHHHH...',
  ],
  helm: [
    '....HHHHHHHH....',
    '...HHHHHHHHHH...',
    '...HH.HHHH.HH...',
  ],
  hood: [
    '....HHHHHHHH....',
    '...HHHHHHHHHH...',
    '...HH......HH...',
  ],
  chef: [
    '....HHHHHHHH....',
    '....HHHHHHHH....',
    '...HHHHHHHHHH...',
  ],
};

/** Lay a hat over the head rows of a body. */
function withHat(grid, hat) {
  if (!hat) return grid;
  const out = [...grid];
  hat.forEach((row, index) => {
    const y = 2 + index;
    if (y >= out.length) return;
    let merged = '';
    for (let x = 0; x < row.length; x++) {
      merged += row[x] === 'H' ? 'H' : out[y][x];
    }
    out[y] = merged;
  });
  return out;
}

/**
 * Every profession: what they wear, and what is on their head.
 *
 * Colours lean warm and distinct rather than realistic — at this size a
 * player is picking a trade out of a crowd by its colour, and two muddy browns
 * next to each other are two people they cannot tell apart.
 */
const TRADES = {
  blacksmith: { tunic: '#7a4a2e', hat: 'cap', hatColour: P.ironDark },
  artisan: { tunic: '#a86a34', hat: 'cap', hatColour: P.wood },
  cook: { tunic: '#d8d2c4', hat: 'chef', hatColour: '#f2eee4' },
  merchant: { tunic: '#7a5aa8', hat: 'wide', hatColour: P.gold },
  researcher: { tunic: '#3f6fa8', hat: 'pointed', hatColour: '#2e5280' },
  monk: { tunic: '#c9a24d', hat: 'hood', hatColour: '#a17e35' },
  farmer: { tunic: '#6a9a4a', hat: 'wide', hatColour: P.wheat },
  miner: { tunic: '#8a6a45', hat: 'helm', hatColour: P.iron },
  forester: { tunic: '#4c7a3a', hat: 'cap', hatColour: P.leafDark },
  rancher: { tunic: '#b5763f', hat: 'wide', hatColour: '#8a5a2e' },
  knight: { tunic: '#5b7fa8', hat: 'helm', hatColour: P.silver },
  archer: { tunic: '#5a8a5a', hat: 'pointed', hatColour: P.leafDark },
  mage: { tunic: '#8a5fb0', hat: 'pointed', hatColour: P.magic },
  healer: { tunic: '#e2d8c3', hat: 'hood', hatColour: '#c9d8e8' },
  wanderer: { tunic: '#9a8a6a', hat: 'none', hatColour: P.hair },
};

function palette(trade) {
  return {
    '.': null,
    k: P.ink,
    S: P.skin,
    e: P.ink,
    T: trade.tunic,
    B: P.woodDark,
    h: P.hair,
    H: trade.hatColour,
  };
}

/**
 * A child: the same person, smaller.
 *
 * Squashed rather than redrawn, because a child in this game is a resident like
 * any other and should read as one — just newer.
 */
function small(grid) {
  const out = grid.map((row) => row);
  // Trim two rows off the legs and shift down, so they stand on the same spot.
  return ['.'.repeat(16), '.'.repeat(16), ...out.slice(2, 14).map((row) => row)]
    .slice(0, 16);
}

/** Templates for the sprite compiler: `person:<trade>` and `:flip`. */
export function peopleTemplates() {
  const table = {};

  for (const [id, trade] of Object.entries(TRADES)) {
    const dressed = withHat(BODY, HATS[trade.hat]);
    table[`person:${id}`] = {
      palette: palette(trade),
      frames: [dressed, bob(dressed)],
    };
    table[`person:${id}:flip`] = {
      palette: palette(trade),
      frames: [mirror(dressed), mirror(bob(dressed))],
    };
  }

  // Somebody asleep, shown over a house at night instead of a walker.
  table['person:asleep'] = {
    palette: { '.': null, k: P.ink, z: P.plaster },
    frames: [
      [
        '................',
        '................',
        '................',
        '..........kkkk..',
        '..........kzzk..',
        '.........kkzkk..',
        '.........kzkk...',
        '.........kzzzk..',
        '.......kkkk.....',
        '.......kzzk.....',
        '......kkzkk.....',
        '......kzkk......',
        '......kzzzk.....',
        '................',
        '................',
        '................',
      ],
      [
        '................',
        '................',
        '..........kkkk..',
        '..........kzzk..',
        '.........kkzkk..',
        '.........kzkk...',
        '.........kzzzk..',
        '................',
        '.......kkkk.....',
        '.......kzzk.....',
        '......kkzkk.....',
        '......kzkk......',
        '......kzzzk.....',
        '................',
        '................',
        '................',
      ],
    ],
  };

  return table;
}

export function tradeIds() {
  return Object.keys(TRADES);
}
