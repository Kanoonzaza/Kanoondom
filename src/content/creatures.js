// Eggs and the creatures that come out of them (research: creature-collection.md).
//
// THE MECHANIC WORTH COPYING EXACTLY
// ---------------------------------
// An egg is not a lottery ticket. While it incubates you FEED it, and what you
// feed decides what hatches. Each feed raises one category, and each category
// has bands — Low, Medium, High, and then **Over**, which throws the chance
// back to Low.
//
// That Over band is the whole design. It means the skill is hitting a WINDOW,
// not maximising a number, and it gives the system a real failure mode. It also
// fits the no-punishment pillar precisely: overfeeding costs you materials and
// a worse creature, never the egg and never a creature you already had.
//
// Feeding uses materials you already produce rather than a new item class:
//
//   Attack   ⛏️ Ore          — hard things, sharp things
//   Defense  🪵 Wood         — shells, plate, bulk
//   Balanced 🍎 Food         — plain good living
//   Special  💎 Mystic Ore   — whatever it is that makes a Rainbow

export const EGG_CATEGORIES = [
  { id: 'attack', name: 'Attack', icon: '⚔️', feed: 'ore' },
  { id: 'defense', name: 'Defense', icon: '🛡️', feed: 'wood' },
  { id: 'balanced', name: 'Balanced', icon: '⚖️', feed: 'food' },
  { id: 'special', name: 'Special', icon: '✨', feed: 'mysticOre' },
];

export const CATEGORY_IDS = EGG_CATEGORIES.map((category) => category.id);

export function categoryDef(id) {
  const category = EGG_CATEGORIES.find((entry) => entry.id === id);
  if (!category) throw new Error(`Unknown egg category: ${id}`);
  return category;
}

/**
 * The bands, in order. `over` is not a better band — it is the penalty.
 *
 * Thresholds are per RANK of egg: the wiki's figure is roughly ten items per
 * rank, so a rank 2 egg wants twice what a rank 1 does. That keeps the window
 * meaningful as eggs get rarer instead of trivially wide.
 */
export const BANDS = [
  { id: 'low', name: 'Low', from: 0, quality: 0 },
  { id: 'medium', name: 'Medium', from: 4, quality: 1 },
  { id: 'high', name: 'High', from: 8, quality: 2 },
  { id: 'over', name: 'Over', from: 14, quality: 0 },
];

/** Feeds per rank that each band boundary scales by. */
export const FEED_PER_RANK = 1;

/** How much of the category's material one feed costs, per rank. */
export const FEED_COST = { attack: 60, defense: 60, balanced: 50, special: 8 };

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
//
// Eight lines, as the research lists them. Rainbow is the legendary tier and is
// deliberately very rare — it is the thing you tell somebody about.

export const EGG_COLOURS = {
  white: { id: 'white', name: 'White', icon: '🥚', tint: '#e8e6df', weight: 22, rank: 1 },
  yellow: { id: 'yellow', name: 'Yellow', icon: '🟡', tint: '#d8b23c', weight: 18, rank: 1 },
  green: { id: 'green', name: 'Green', icon: '🟢', tint: '#5e9a4e', weight: 16, rank: 2 },
  blue: { id: 'blue', name: 'Blue', icon: '🔵', tint: '#4a7fb5', weight: 14, rank: 2 },
  red: { id: 'red', name: 'Red', icon: '🔴', tint: '#c14b3a', weight: 12, rank: 3 },
  purple: { id: 'purple', name: 'Purple', icon: '🟣', tint: '#8a5fb0', weight: 9, rank: 3 },
  black: { id: 'black', name: 'Black', icon: '⚫', tint: '#3b3f47', weight: 6, rank: 4 },
  rainbow: { id: 'rainbow', name: 'Rainbow', icon: '🌈', tint: '#c9a227', weight: 2, rank: 5 },
};

export const COLOUR_IDS = Object.keys(EGG_COLOURS);

export function colourDef(id) {
  const colour = EGG_COLOURS[id];
  if (!colour) throw new Error(`Unknown egg colour: ${id}`);
  return colour;
}

// ---------------------------------------------------------------------------
// The creatures
// ---------------------------------------------------------------------------
//
// Each is reached by a (colour, category, band) — so what you feed genuinely
// decides what you get, and the High band of each line is the one worth aiming
// at. `power`, `guard` and `speed` are on the same scale as content/monsters.js,
// because an ally fights on the same field as the things it fights.

export const CREATURES = {
  // --- white ---------------------------------------------------------------
  pipling: {
    id: 'pipling', name: 'Pipling', icon: '🐤', colour: 'white', category: 'balanced', band: 'low',
    power: 1.0, guard: 0.8, speed: 1.0,
    skill: 'Cheerful', skillBlurb: 'Everyone fights a little better for having it around.',
    blurb: 'Small, loud, and entirely convinced of itself.',
  },
  woolback: {
    id: 'woolback', name: 'Woolback', icon: '🐑', colour: 'white', category: 'defense', band: 'medium',
    power: 1.2, guard: 2.4, speed: 0.6,
    skill: 'Thick Coat', skillBlurb: 'Turns aside far more than it should.',
    blurb: 'Placid until it is not.',
  },
  alpacavalier: {
    id: 'alpacavalier', name: 'Alpacavalier', icon: '🦙', colour: 'white', category: 'attack', band: 'high',
    power: 2.6, guard: 1.6, speed: 1.6,
    skill: '2-Hit Attack', skillBlurb: 'Strikes twice where others strike once.',
    hits: 2,
    blurb: 'Dignified, well-armed, and faintly disapproving.',
  },

  // --- yellow --------------------------------------------------------------
  sparkmouse: {
    id: 'sparkmouse', name: 'Sparkmouse', icon: '🐭', colour: 'yellow', category: 'balanced', band: 'low',
    power: 1.1, guard: 0.6, speed: 1.9,
    skill: 'Quick', skillBlurb: 'First to arrive, first to bite.',
    blurb: 'You will hear it before you see it.',
  },
  thunderchick: {
    id: 'thunderchick', name: 'Thunderchick', icon: '🐥', colour: 'yellow', category: 'special', band: 'medium',
    power: 1.8, guard: 0.7, speed: 2.0, magic: true,
    skill: 'Static', skillBlurb: 'Magic, and magic ignores armour.',
    blurb: 'The air goes strange around it.',
  },
  voltbeast: {
    id: 'voltbeast', name: 'Voltbeast', icon: '⚡', colour: 'yellow', category: 'attack', band: 'high',
    power: 3.0, guard: 1.2, speed: 2.6, magic: true,
    skill: 'Chain Lightning', skillBlurb: 'It does not stop at the first one.',
    hits: 3,
    blurb: 'Faster than the sound it makes.',
  },

  // --- green ---------------------------------------------------------------
  mossling: {
    id: 'mossling', name: 'Mossling', icon: '🌿', colour: 'green', category: 'defense', band: 'low',
    power: 1.2, guard: 1.8, speed: 0.7,
    skill: 'Rooted', skillBlurb: 'Holds ground nobody else would.',
    blurb: 'Patient in the way that only plants are.',
  },
  thornhound: {
    id: 'thornhound', name: 'Thornhound', icon: '🐺', colour: 'green', category: 'attack', band: 'medium',
    power: 2.4, guard: 1.4, speed: 1.8,
    skill: 'Barbed', skillBlurb: 'Hurts to hit, hurts more to be hit by.',
    blurb: 'It has never once been called friendly.',
  },
  greatoak: {
    id: 'greatoak', name: 'Great Oak', icon: '🌳', colour: 'green', category: 'defense', band: 'high',
    power: 2.2, guard: 4.5, speed: 0.3,
    skill: 'Standing Wall', skillBlurb: 'The town behind it is simply harder to reach.',
    blurb: 'Older than the kingdom, and not especially impressed by it.',
  },

  // --- blue ----------------------------------------------------------------
  tideling: {
    id: 'tideling', name: 'Tideling', icon: '💧', colour: 'blue', category: 'balanced', band: 'low',
    power: 1.4, guard: 1.4, speed: 1.4,
    skill: 'Even', skillBlurb: 'Good at everything, best at nothing.',
    blurb: 'Cheerfully damp.',
  },
  frostfin: {
    id: 'frostfin', name: 'Frostfin', icon: '🐟', colour: 'blue', category: 'special', band: 'medium',
    power: 2.2, guard: 1.6, speed: 1.5, magic: true,
    skill: 'Chill', skillBlurb: 'Slows whatever it touches.',
    blurb: 'The water around it does not freeze, quite.',
  },
  leviathan: {
    id: 'leviathan', name: 'Leviathan', icon: '🐋', colour: 'blue', category: 'defense', band: 'high',
    power: 3.4, guard: 4.0, speed: 0.9,
    skill: 'Deep Guard', skillBlurb: 'Nothing gets past it in either direction.',
    blurb: 'It fits in the moat the way a hand fits in a glove that is too small.',
  },

  // --- red -----------------------------------------------------------------
  emberpup: {
    id: 'emberpup', name: 'Emberpup', icon: '🔥', colour: 'red', category: 'attack', band: 'low',
    power: 1.9, guard: 0.9, speed: 1.5,
    skill: 'Singe', skillBlurb: 'Sets about things with enthusiasm.',
    blurb: 'Do not leave it near the granary.',
  },
  magmaback: {
    id: 'magmaback', name: 'Magmaback', icon: '🌋', colour: 'red', category: 'defense', band: 'medium',
    power: 2.8, guard: 3.2, speed: 0.6,
    skill: 'Molten Hide', skillBlurb: 'Hitting it is a decision you make once.',
    blurb: 'It sleeps where nothing else can.',
  },
  flame_dragon: {
    id: 'flame_dragon', name: 'Flame Dragon', icon: '🐉', colour: 'red', category: 'attack', band: 'high',
    power: 4.6, guard: 2.8, speed: 1.9,
    skill: '4 Consecutive Attacks', skillBlurb: 'Four times, before anything answers.',
    hits: 4,
    blurb: 'The reason the far country is the far country.',
  },

  // --- purple --------------------------------------------------------------
  wispling: {
    id: 'wispling', name: 'Wispling', icon: '🪄', colour: 'purple', category: 'special', band: 'low',
    power: 1.6, guard: 0.5, speed: 1.7, magic: true,
    skill: 'Flicker', skillBlurb: 'Hard to hit something that is not quite there.',
    blurb: 'Counting them never gives the same answer twice.',
  },
  hexcat: {
    id: 'hexcat', name: 'Hexcat', icon: '🐈‍⬛', colour: 'purple', category: 'special', band: 'medium',
    power: 2.6, guard: 1.2, speed: 2.2, magic: true,
    skill: 'Ill Luck', skillBlurb: 'Things go wrong for whatever it is looking at.',
    blurb: 'It has decided about you already.',
  },
  archmagus: {
    id: 'archmagus', name: 'Archmagus Owl', icon: '🦉', colour: 'purple', category: 'special', band: 'high',
    power: 4.2, guard: 1.8, speed: 2.0, magic: true,
    skill: 'Elder Magic', skillBlurb: 'Armour has never once helped against this.',
    hits: 2,
    blurb: 'Awake at the hours when things go wrong.',
  },

  // --- black ---------------------------------------------------------------
  shadeling: {
    id: 'shadeling', name: 'Shadeling', icon: '🌑', colour: 'black', category: 'attack', band: 'low',
    power: 2.4, guard: 1.0, speed: 2.0,
    skill: 'Ambush', skillBlurb: 'Always moves first.',
    blurb: 'Only ever seen out of the corner of an eye.',
  },
  nightmare: {
    id: 'nightmare', name: 'Nightmare', icon: '🐴', colour: 'black', category: 'attack', band: 'high',
    power: 5.2, guard: 2.4, speed: 3.0,
    skill: 'Terror Charge', skillBlurb: 'Three strikes, and the rest lose their nerve.',
    hits: 3,
    blurb: 'It leaves scorch marks where it stood.',
  },

  // --- rainbow -------------------------------------------------------------
  prismling: {
    id: 'prismling', name: 'Prismling', icon: '🦄', colour: 'rainbow', category: 'balanced', band: 'low',
    power: 3.0, guard: 3.0, speed: 3.0,
    skill: 'Every Colour', skillBlurb: 'Good at all of it, which nothing else is.',
    blurb: 'Even a poor one is better than most things you own.',
  },
  kairo_kommander: {
    id: 'kairo_kommander', name: 'Kairo Kommander', icon: '🌈', colour: 'rainbow', category: 'special', band: 'high',
    power: 7.0, guard: 5.0, speed: 3.4, magic: true,
    skill: 'Command', skillBlurb: 'Everything else on the field fights better.',
    hits: 4,
    rally: 0.25,
    blurb: 'The legendary tier. You will tell somebody about this.',
  },
};

export const CREATURE_IDS = Object.keys(CREATURES);

export function creatureDef(id) {
  const creature = CREATURES[id];
  if (!creature) throw new Error(`Unknown creature: ${id}`);
  return creature;
}

// ---------------------------------------------------------------------------
// Where they hatch, and how long it takes
// ---------------------------------------------------------------------------

export const HATCHING = {
  /** Ticks to incubate, per rank of egg. Ranks 1-5, so a night to a few days. */
  ticksPerRank: 5400,
  /**
   * Chance a cleared nest or a cave was holding a SHINING monster, and so an
   * egg. Scales with the tier of what you beat, because the research says eggs
   * come off a special variant you have to be strong enough to kill.
   */
  eggChanceBase: 0.18,
  eggChancePerTier: 0.05,
  maxEggChance: 0.55,
};

/**
 * What a hatched creature is worth in a fight.
 *
 * `power`/`guard`/`speed` are on the monster scale (1-7); residents count in
 * the tens. This is the conversion, kept in one place so an ally's worth can be
 * tuned without touching either side.
 */
export const ALLY = {
  statScale: 8,
  /** Each extra hit past the first is worth this much of the base attack. */
  hitBonus: 0.35,
  /**
   * Allies pull their full weight, unlike a blacksmith who picks up a hammer.
   * Fighting is the only thing they do.
   */
  commitment: 1,
};

/** The two things an egg can be raised into. */
export const ROLES = {
  stable: {
    id: 'stable', name: 'Monster Stable', icon: '🏚️',
    blurb: 'Hatches defenders. They hold the town whether or not you are watching.',
  },
  room: {
    id: 'room', name: 'Monster Room', icon: '🚪',
    blurb: 'Hatches companions. They go with your people into nests and caves.',
  },
};
