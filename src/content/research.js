// Research, surveys and Town Hall rank (research: research-system.md).
//
// The structural fact from the real game: there is NO research currency. A
// study consumes real materials plus knowledge items, and what is even offered
// to you is gated by TOWN HALL RANK. So progression runs on two independent
// axes — how developed your capital is, and what you have in store.
//
// That is why research is worth having at all: it is the only thing that grows
// the build menu. Facilities marked `locked` in content/facilities.js do not
// appear until a study reveals them, and STOCK — how many of a thing you own —
// comes from studies, surveys and map rewards, never from money.
//
// Each entry declares:
//   section   which list it appears under
//   rank      lowest Town Hall level that offers it
//   cost      materials and knowledge items, spent when the study STARTS
//   study     study points needed; roughly one point per tick at base rate
//   requires  other study ids that must be finished first
//   grants    { unlock: [...facility ids], stock: {...}, resources: {...} }

export const RESEARCH_SECTIONS = [
  { id: 'facilities', name: 'Facilities', blurb: 'New things to build, and more of what you have.' },
  { id: 'charters', name: 'Charters', blurb: 'The right to found another town.' },
];

export const RESEARCH = {
  // --- rank 1 -------------------------------------------------------------
  surveying: {
    id: 'surveying', name: 'Surveying', section: 'facilities', rank: 1,
    cost: { wood: 40, ore: 20, tome: 2 },
    study: 240,
    grants: { unlock: ['surveyor_office'], stock: { surveyor_office: 1 } },
    blurb: 'Surveyors go out, and come back with land on a map and something in a sack.',
  },
  carpentry: {
    id: 'carpentry', name: 'Carpentry', section: 'facilities', rank: 1,
    cost: { wood: 60, tome: 1 },
    study: 200,
    grants: { stock: { plot_s: 2, field: 1 } },
    blurb: 'Straighter joints. Two more small plots and another field.',
  },

  // --- rank 2 -------------------------------------------------------------
  masonry: {
    id: 'masonry', name: 'Masonry', section: 'facilities', rank: 2,
    cost: { ore: 60, wood: 30, tome: 2 },
    study: 300,
    grants: { stock: { wall: 6, ore_mine: 1 } },
    blurb: 'Cut stone, and the sense to know where it belongs.',
  },
  husbandry: {
    id: 'husbandry', name: 'Husbandry', section: 'facilities', rank: 2,
    cost: { grass: 80, wood: 60, tome: 2 },
    study: 320,
    grants: { stock: { ranch: 1, plantation: 2 } },
    blurb: 'Beasts and timber both do better when somebody knows what they need.',
  },
  civic_planning: {
    id: 'civic_planning', name: 'Civic Planning', section: 'facilities', rank: 2,
    cost: { wood: 90, grass: 40, tome: 2 },
    study: 300,
    grants: { stock: { plot_m: 1, path: 10 } },
    blurb: 'A town laid out on purpose, instead of wherever there was room.',
  },

  // --- rank 3 -------------------------------------------------------------
  royal_charter: {
    id: 'royal_charter', name: 'Royal Charter', section: 'charters', rank: 3,
    cost: { wood: 150, ore: 100, copper: 400, tome: 4 },
    study: 480,
    grants: { stock: { town_hall: 1 } },
    blurb: 'The right to found a second town hall — and with it, a second country.',
  },
  warehousing: {
    id: 'warehousing', name: 'Warehousing', section: 'facilities', rank: 3,
    cost: { wood: 120, ore: 60, tome: 3 },
    study: 420,
    grants: { stock: { granary: 1, lumber_yard: 1 } },
    blurb: 'More room in store is more kept while you are away.',
  },
  watchcraft: {
    id: 'watchcraft', name: 'Watchcraft', section: 'facilities', rank: 3,
    cost: { wood: 120, ore: 80, tome: 3 },
    study: 400,
    grants: { stock: { watchtower: 2, torch: 4 } },
    blurb: 'Light and high ground. Both matter more once the nights get busy.',
  },

  // --- rank 4 -------------------------------------------------------------
  letters: {
    id: 'letters', name: 'Letters', section: 'facilities', rank: 4,
    cost: { wood: 100, ore: 40, tome: 5 },
    study: 500,
    grants: { unlock: ['library'], stock: { library: 1 } },
    blurb: 'A library. The kingdom studies faster, and keeps more of what it writes.',
  },
  comforts: {
    id: 'comforts', name: 'Small Comforts', section: 'facilities', rank: 4,
    cost: { wood: 60, grass: 40, tome: 4, sample: 1 },
    study: 380,
    grants: { unlock: ['bench'], stock: { bench: 6 } },
    blurb: 'Benches. Trivial alone; a different town once there are six.',
  },
  fisheries: {
    id: 'fisheries', name: 'Fisheries', section: 'facilities', rank: 4,
    cost: { wood: 90, grass: 60, tome: 4, sample: 1 },
    study: 450,
    grants: { unlock: ['fishing_pond'], stock: { fishing_pond: 1 } },
    blurb: 'Food out of standing water, which no field will grow on.',
  },

  // --- rank 5 -------------------------------------------------------------
  estates: {
    id: 'estates', name: 'Estates', section: 'facilities', rank: 5,
    requires: ['civic_planning'],
    cost: { wood: 200, ore: 60, tome: 5 },
    study: 560,
    grants: { stock: { plot_l: 1, plot_m: 1 } },
    blurb: 'Bigger roofs: more beds, and more shelves for the shop beneath.',
  },
  drill_grounds: {
    id: 'drill_grounds', name: 'Drill Grounds', section: 'facilities', rank: 5,
    cost: { wood: 140, ore: 120, tome: 6, sample: 2 },
    study: 640,
    grants: { unlock: ['training_yard'], stock: { training_yard: 1 } },
    blurb: 'House your fighters beside it and they are worth sending out.',
  },
  geology: {
    id: 'geology', name: 'Geology', section: 'facilities', rank: 5,
    requires: ['masonry'],
    cost: { ore: 150, wood: 80, tome: 6 },
    study: 620,
    grants: { stock: { mystic_mine: 1, ore_store: 1 } },
    blurb: 'Knowing which rock is worth cutting into.',
  },

  // --- rank 6 -------------------------------------------------------------
  marcher_charter: {
    id: 'marcher_charter', name: 'Charter of the Marches', section: 'charters', rank: 6,
    requires: ['royal_charter'],
    cost: { wood: 300, ore: 220, copper: 1200, tome: 8, sample: 2 },
    study: 900,
    grants: { stock: { town_hall: 1 } },
    blurb: 'A third town hall, for the country past the near hills.',
  },
  bathing: {
    id: 'bathing', name: 'Bathing', section: 'facilities', rank: 6,
    cost: { ore: 180, wood: 120, tome: 8, sample: 2 },
    study: 800,
    grants: { unlock: ['hot_spring'], stock: { hot_spring: 1 } },
    blurb: 'The strongest thing you can put beside a house.',
  },

  // --- rank 7 -------------------------------------------------------------
  high_granaries: {
    id: 'high_granaries', name: 'High Granaries', section: 'facilities', rank: 7,
    requires: ['warehousing'],
    cost: { wood: 300, ore: 150, tome: 10, sample: 3 },
    study: 1000,
    grants: { unlock: ['great_granary'], stock: { great_granary: 1 } },
    blurb: 'Food and feed that survive a week away instead of a night.',
  },
  deep_vaults: {
    id: 'deep_vaults', name: 'Deep Vaults', section: 'facilities', rank: 7,
    requires: ['warehousing'],
    cost: { ore: 300, mysticOre: 30, tome: 10, sample: 3 },
    study: 1100,
    grants: { unlock: ['deep_vault'], stock: { deep_vault: 1 } },
    blurb: 'Coin stops overflowing, however long you are gone.',
  },
  stoneyards: {
    id: 'stoneyards', name: 'Stone Yards', section: 'facilities', rank: 7,
    requires: ['geology'],
    cost: { ore: 280, wood: 200, tome: 10 },
    study: 1050,
    grants: { unlock: ['stone_yard'], stock: { stone_yard: 1 } },
    blurb: 'Room for everything your miners drag home.',
  },

  // --- rank 8 -------------------------------------------------------------
  manors: {
    id: 'manors', name: 'Manors', section: 'facilities', rank: 8,
    requires: ['estates'],
    cost: { wood: 300, ore: 140, mysticOre: 15, tome: 8 },
    study: 900,
    grants: { stock: { plot_xl: 1 } },
    blurb: 'Nine shelves under one roof. The best shop a resident can be given.',
  },
};

export const RESEARCH_IDS = Object.keys(RESEARCH);

export function researchDef(id) {
  const def = RESEARCH[id];
  if (!def) throw new Error(`Unknown research: ${id}`);
  return def;
}

// ---------------------------------------------------------------------------
// Study rate
// ---------------------------------------------------------------------------

export const STUDY = {
  /**
   * Study points per tick with nobody studying at all.
   *
   * A floor, for the same reason the Town Hall has an income floor: a kingdom
   * that cannot possibly finish its first study is a kingdom with no way out
   * of its opening position.
   */
  basePower: 1,
  /** A researcher's own contribution, before their wits are counted. */
  researcherPower: 0.8,
  /** How much a point of INT is worth to a scholar. */
  perInt: 0.03,
  /** Tomes a researcher writes per tick, scaled the same way. */
  tomesPerTick: 0.0016,
};

// ---------------------------------------------------------------------------
// Town Hall rank
// ---------------------------------------------------------------------------
//
// The wiki is clear that rank gates research, raises territory and drives the
// monarch's rank, but never says what RAISES it. Ours: the town's own
// development, plus a fee. Development counts the things we want the player
// doing anyway — housing people, building, and pushing back the fog.

export const PROMOTION = {
  perResident: 4,
  perFacility: 2,
  tilesPerPoint: 60,
  perNestCleared: 3,
  /** Development needed to leave level L: round(base * L^exponent). */
  base: 18,
  exponent: 1.45,
  /** Fee to leave level L, per resource, multiplied by L. */
  costPerLevel: { wood: 120, ore: 80, copper: 150 },
};

// ---------------------------------------------------------------------------
// Surveys — our replacement for the real game's gacha
// ---------------------------------------------------------------------------
//
// Same role: a randomised source of new facilities and rare goods. Different
// currency: materials you produced, never money. A survey always reveals land,
// which is what makes it worth running even when the find is dull — and land
// is what Peace Level, and therefore expansion, is made of.

export const SURVEY = {
  cost: { grass: 40, wood: 40, copper: 60 },
  /** Each survey run costs this much more than the last. */
  costGrowth: 0.15,
  /** Tiles revealed by a level 1 office; scales with the office's level. */
  tilesRevealed: 40,
};

/**
 * What a survey can bring back. A find with a `stockPool` picks uniformly from
 * that pool once the find itself has been rolled, so a rare find stays rare no
 * matter how many things are in its pool.
 */
export const SURVEY_FINDS = [
  {
    id: 'maps', weight: 18, name: 'Old maps',
    resources: { tome: 1 },
    text: 'Charts from somebody who came this way before.',
  },
  {
    id: 'timber', weight: 12, name: 'A stand of good timber',
    resources: { wood: 180, grass: 90 },
    text: 'Cut and stacked before the weather turned.',
  },
  {
    id: 'seam', weight: 10, name: 'An open seam',
    resources: { ore: 150 },
    text: 'Shallow enough that your miners simply walked in.',
  },
  {
    id: 'purse', weight: 16, name: 'A buried purse',
    resources: { copper: 320 },
    text: 'Nobody ever came back for it.',
  },
  {
    id: 'sample', weight: 14, name: 'Something worth copying',
    resources: { sample: 1 },
    text: 'Your surveyors could not say what it does, but they drew it carefully.',
  },
  {
    id: 'materiel', weight: 14, name: 'Abandoned works',
    stockPool: ['path', 'wall', 'torch', 'field', 'plantation', 'market_stall'],
    stockAmount: 2,
    text: 'Left half-finished. Your people took what they could carry.',
  },
  {
    id: 'holdings', weight: 8, name: 'A deserted holding',
    stockPool: ['plot_s', 'well', 'ranch', 'ore_mine'],
    stockAmount: 1,
    text: 'Empty for years, and still sound.',
  },
  {
    id: 'trove', weight: 6, name: 'A scholar’s trove',
    resources: { tome: 4, sample: 1 },
    text: 'Somebody spent a life on these, and then stopped.',
  },
  {
    id: 'silver', weight: 5, name: 'Silver',
    resources: { silver: 120 },
    text: 'Rare coin, for rare things.',
  },
  {
    id: 'mystic', weight: 4, name: 'A mystic vein',
    resources: { mysticOre: 40 },
    text: 'It hums, faintly, and nobody wants to say so out loud.',
  },
];

// ---------------------------------------------------------------------------
// Map rewards
// ---------------------------------------------------------------------------
//
// The third source of facilities in the real game, alongside research and
// surveys. Ours pay out for exploring, so pushing back the fog is worth doing
// for its own sake and not only for Peace Level.

// The first two thresholds sit INSIDE ring 0's ceiling (1,024 tiles on a 6x6
// world) so that exploring pays before the near country opens. A reward past
// the ceiling of the ring you are standing in is a reward you cannot collect,
// which is the same trap the zone gates fell into.
export const MAP_REWARDS = [
  { tiles: 700, name: 'The lands about your capital', stock: { path: 4, torch: 1 } },
  { tiles: 900, name: 'The near valleys', stock: { plot_s: 1, wall: 4 } },
  { tiles: 1400, name: 'The old road', stock: { field: 1 }, resources: { tome: 3 } },
  { tiles: 2400, name: 'The border hills', stock: { plot_m: 1 }, resources: { sample: 1 } },
  { tiles: 4000, name: 'The far watershed', stock: { granary: 1 } },
  { tiles: 6500, name: 'The world’s edge', stock: { plot_l: 1 }, resources: { tome: 5, sample: 2 } },
];
