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
 * Level formula, which is undocumented. Ours measures the share of the whole
 * world explored, so the numbers are scaled to that: a fresh kingdom sits near
 * 7%, two well-spaced town halls plus some exploring reaches 15%, and the far
 * country wants real expansion.
 *
 * These are growth gates, never clocks — the player sets the pace.
 */
export const ZONE_UNLOCKS = [
  { ring: 0, peace: 0, townHalls: 0, label: 'Your homeland' },
  { ring: 1, peace: 15, townHalls: 2, label: 'The near country' },
  { ring: 2, peace: 35, townHalls: 3, label: 'The far country' },
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
