// Global tuning constants.
//
// Everything here is an initial value for balancing. Nothing in sim/ may
// hard-code a number that belongs in this file.

// ---------------------------------------------------------------------------
// The world (research: world-and-map.md)
// ---------------------------------------------------------------------------

/**
 * The real game is roughly a hundred zones on an A–J x 1–10 grid, each zone a
 * 16x16 tile area. We launch with 6x6 zones; the schema handles the full size.
 */
export const WORLD = {
  zonesX: 6,
  zonesY: 6,
  /** Tiles along one edge of a zone. The real game's figure. */
  zoneTiles: 16,
  /** Zone columns are lettered, rows numbered, as in the real game. */
  columnLetters: 'ABCDEF',
};

export const WORLD_TILES_X = WORLD.zonesX * WORLD.zoneTiles; // 96
export const WORLD_TILES_Y = WORLD.zonesY * WORLD.zoneTiles; // 96
export const TILE_COUNT = WORLD_TILES_X * WORLD_TILES_Y;

/**
 * Territory is a radius around each Town Hall, not a set of owned regions.
 * The real game: base 14 tiles, +2 every 10 Town Hall levels, up to 5 halls.
 */
export const TOWN_HALL = {
  baseRadius: 14,
  radiusPerLevels: 10,
  radiusStep: 2,
  maxHalls: 5,
  maxLevel: 99,
  /** Monarch rank advances every this many Town Hall levels: D->C->B->A->S. */
  monarchRankPerLevels: 15,
  monarchRanks: ['D', 'C', 'B', 'A', 'S'],
};

/**
 * Zone unlock gates. Ring 0 is where you start.
 *
 * The real game's thresholds (59 / 69 / 77 / 89 / 94%) assume its own Peace
 * Level formula, which is undocumented. Ours measures the share of the WHOLE
 * world explored — see sim/world.js for why the denominator is fixed.
 *
 * THE CEILING THAT MATTERS: fog can only be lifted inside unlocked zones, so
 * while only ring 0 is open the very best a player can reach is ring 0's share
 * of the world. On a 6x6 map that is 4 zones of 36 — 11.1%. A gate above that
 * is not a hard gate, it is a locked door with no key, and the first draft of
 * this table had exactly that: ring 1 wanted 15%.
 *
 * So each gate is set as a fraction of the ceiling of the ring BELOW it:
 *
 *   ring 1 at  9.0%  = 81% of ring 0's 11.1% ceiling
 *   ring 2 at 28.0%  = 63% of ring 1's 44.4% ceiling
 *
 * `tests/world.test.js` asserts this relationship holds, so changing the world
 * size can never quietly re-lock the map.
 *
 * These are growth gates, never clocks — the player sets the pace.
 */
export const ZONE_UNLOCKS = [
  { ring: 0, peace: 0, townHalls: 0, label: 'Your homeland' },
  { ring: 1, peace: 9, townHalls: 2, label: 'The near country' },
  { ring: 2, peace: 28, townHalls: 3, label: 'The far country' },
];

/**
 * Peace Level, 0–100.
 *
 * The real game gates expansion on this but never says what feeds it. Ours:
 * the share of unlocked land you have cleared of fog, less a penalty for every
 * monster nest still active. So it rises by exploring and by clearing nests —
 * the two things we want the player doing — and it is legible at a glance.
 */
export const PEACE = {
  /** Percentage points removed per active nest in unlocked zones. */
  penaltyPerNest: 2,
  /** Peace can never be dragged below this by nests alone. */
  floor: 0,
};

/** Terrain generation. */
export const TERRAIN = {
  /** Larger = broader, smoother patches of the dominant biome. */
  patchScale: 7,
  /** Finer field that decides which secondary biome shows through. */
  detailScale: 3.5,
  /** Below this, a tile takes its zone's dominant biome. */
  dominantThreshold: 0.62,
  /** Fraction of the map edge given over to sea. */
  seaBandTiles: 3,
  /** Chance a non-sea tile is soil rather than its biome. */
  soilChance: 0.07,
  /** Tiles around the world centre guaranteed to be open grass to build on. */
  homeRadius: 5,
};

// ---------------------------------------------------------------------------
// Time (carried from v1 — see docs/specs/v2-design.md §11)
// ---------------------------------------------------------------------------

/** One tick is one real second at 1x speed. A season is five real minutes. */
export const TICKS_PER_SEASON = 300;
export const SEASONS_PER_YEAR = 4;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const SPEEDS = [0, 1, 2, 3];

/** Day/night within a season drives residents and monsters (research). */
export const DAY = {
  /** Ticks in one full day. Five days to a season. */
  ticksPerDay: 60,
  /** Fractions of a day given to each period, in order. */
  periods: [
    { id: 'morning', name: 'Morning', from: 0.0 },
    { id: 'day', name: 'Day', from: 0.25 },
    { id: 'night', name: 'Night', from: 0.7 },
  ],
  /** Days in a moon cycle. The full moon brings raids and opens caves. */
  daysPerMoon: 10,
};

/** Residents (research: residents-jobs.md). */
export const RESIDENTS = {
  /** Every stat starts here before a profession's leanings are added. */
  baseStat: 4,
  statGrowthPerLevel: 0.18,

  /** Arrival odds rise with how much land you have brought to light. */
  tilesPerArrivalChance: 4000,
  maxArrivalChance: 0.75,
  maxArrivalLevel: 3,

  /** Shop income scaling. */
  incomePerLevel: 0.25,
  incomePerHeart: 0.01,

  /** What residents bring home themselves. */
  gatherScale: 1,
  gatherPerPoint: 0.02,

  /**
   * Growing up.
   *
   * People gain experience simply by living and working here, and that
   * accrues while the player is away like everything else — a resident who
   * went to bed a level 3 farmer can wake up a level 4 one. It is what opens
   * skill slots, and without it the copper economy has nowhere to go (the V6
   * balance run measured the whole town's lifetime skill spend at ~2,100).
   *
   * The rate deliberately depends only on CHEAP things: whether they have a
   * roof, and how good it is. Making it depend on the aura would mean walking
   * every facility per resident inside `ticksToNextEvent`, which is the
   * performance mistake this project has made three times already.
   */
  maxLevel: 20,
  xpPerTick: 0.02,
  /** A better home grows the person in it. Shelves stand in for how good it is. */
  xpPerShelf: 0.06,
  /** Somebody minding a shop or out gathering learns faster than an idler. */
  xpWorkingBonus: 0.25,
  xpForLevelBase: 600,
  xpForLevelExponent: 1.25,
};

/**
 * Marriage and the second generation (research: residents-jobs.md).
 *
 * The real game's requirements, kept: a Double Bed placed next to the house, a
 * Church for the ceremony (which means a housed Monk), and children only once
 * the kingdom has three towns. Heart is what makes a match.
 *
 * Nothing here can take anything away. Nobody is ever forced to marry, nobody
 * dies, and a child is a pure addition — this game does not do loss.
 */
export const MARRIAGE = {
  /** Both partners need at least this much Heart. */
  heartNeeded: 14,
  /** The fee for the ceremony. A gift to the church, not a gate. */
  cost: { copper: 300 },
  /** Married people are happier, and it shows in their trade. */
  heartBonus: 6,

  /** Towns the kingdom must hold before there are children (the real rule). */
  townsForChildren: 3,
  /** Days between the wedding and a child, and between children after that. */
  gestationDays: 12,
  /** Children a couple will have, at most. */
  maxChildren: 3,
  /**
   * Cots a family home fits above its bed count.
   *
   * Children are born into their parents' house rather than queueing for a
   * spare bed anywhere in the kingdom — but they are not free. Without a bound
   * the population simply runs away: the first version let children ignore
   * housing entirely and a five-hour balance run produced 32 couples and 96
   * children, because every child grew up, married, and had three more.
   * Housing stays the pacing lever; a house just stretches a little for a family.
   */
  cotsPerHome: 2,

  /**
   * How much stronger the second generation is.
   *
   * Applied as a HERITAGE multiplier that survives levelling, and inherited
   * from the parents' own heritage so a third generation is better again.
   */
  generationBonus: 1.18,
  maxHeritage: 2.5,
};

/** Offline catch-up. */
export const OFFLINE = {
  minSecondsForReport: 60,
  /**
   * Longest span actually simulated on return. Stores fill within hours, so
   * past this nothing observable is still changing and simulating further only
   * costs a frozen page.
   */
  maxSimulatedSeconds: 30 * 24 * 60 * 60,
};
