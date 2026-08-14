// Facilities (research: facilities.md).
//
// The real game has 100+ across four categories. V2 covers Environment and
// Materials; Amenity and Indoor arrive with residents in V3.
//
// NOTE ON UPKEEP: there is none, and that is deliberate. The research turns up
// no per-season running cost anywhere — facilities cost materials to build and
// can be removed and rebuilt by paying again. What limits you is STOCK (you own
// only so many of each), space, and materials. v1 had upkeep and it produced a
// death spiral: a bankrupt kingdom switched its own farms off and starved with
// no way back. Dropping it is both more faithful and strictly safer.
//
// Every facility declares:
//   size          footprint in tiles, {w, h}
//   cost          materials to place
//   buildTicks    real seconds to raise
//   stock         how many you own at the start
//   produces      per-tick output, before biome and level scaling
//   storage       capacity added, per resource
//   aura          { radius, stats } granted to residents nearby
//   likesBiome    biomes that boost output, and by how much
//   requiresBiome hard restriction, if any

export const FACILITIES = {
  // --- Environment ---------------------------------------------------------
  town_hall: {
    id: 'town_hall', name: 'Town Hall', icon: '🏛️', category: 'environment',
    size: { w: 2, h: 2 },
    cost: { wood: 200, ore: 150 },
    buildTicks: 240,
    stock: 0, // earned, never given
    aura: { radius: 6, stats: { heart: 6, vigor: 4 } },
    unique: false,
    isTownHall: true,
    blurb: 'Claims land around it. Place them far apart — overlapping reach is wasted.',
  },
  path: {
    id: 'path', name: 'Path', icon: '🛤️', category: 'environment',
    size: { w: 1, h: 1 },
    cost: { grass: 4 },
    buildTicks: 4,
    stock: 40,
    aura: { radius: 1, stats: { move: 6 } },
    blurb: 'Residents move quicker along it. Cheap, and it adds up.',
  },
  torch: {
    id: 'torch', name: 'Torch', icon: '🔥', category: 'environment',
    size: { w: 1, h: 1 },
    cost: { wood: 25, ore: 5 },
    buildTicks: 20,
    stock: 6,
    aura: { radius: 4, stats: { def: 3, luck: 2 } },
    /** Keeps the dark back a little; matters from V5. */
    wardsMonsters: 0.25,
    blurb: 'Light against the night. Monsters keep their distance.',
  },
  watchtower: {
    id: 'watchtower', name: 'Watchtower', icon: '🗼', category: 'environment',
    size: { w: 1, h: 1 },
    cost: { wood: 60, ore: 40 },
    buildTicks: 60,
    stock: 2,
    aura: { radius: 6, stats: { def: 8, dex: 4 } },
    wardsMonsters: 0.6,
    blurb: 'Sees trouble coming, and blunts it when it arrives.',
  },
  wall: {
    id: 'wall', name: 'Wall', icon: '🧱', category: 'environment',
    size: { w: 1, h: 1 },
    cost: { ore: 12 },
    buildTicks: 12,
    stock: 24,
    aura: { radius: 1, stats: { def: 5 } },
    blocksMovement: true,
    blurb: 'Stone between your people and whatever is out there.',
  },
  well: {
    id: 'well', name: 'Well', icon: '💧', category: 'environment',
    size: { w: 1, h: 1 },
    cost: { ore: 20, wood: 10 },
    buildTicks: 25,
    stock: 4,
    aura: { radius: 3, stats: { vigor: 8, hp: 4 } },
    blurb: 'Everything near clean water does a little better.',
  },

  // --- Housing -------------------------------------------------------------
  // "Give land to your residents and they'll set up stores based on their
  // profession" (research). Plot size decides two things at once: how many
  // people live there, and how many shelves their shop gets — which is why a
  // Weapon Shop in an XL house is worth three of one in a small one.
  plot_s: {
    id: 'plot_s', name: 'Small Plot', icon: '🏠', category: 'housing',
    size: { w: 2, h: 2 },
    cost: { wood: 35 },
    buildTicks: 35,
    stock: 4,
    housing: { beds: 1, shelves: 3 },
    aura: { radius: 2, stats: { heart: 2 } },
    blurb: 'Room for one. Every kingdom starts here.',
  },
  plot_m: {
    id: 'plot_m', name: 'Medium Plot', icon: '🏡', category: 'housing',
    size: { w: 3, h: 2 },
    cost: { wood: 70, ore: 15 },
    buildTicks: 60,
    stock: 2,
    housing: { beds: 2, shelves: 5 },
    aura: { radius: 3, stats: { heart: 3, vigor: 1 } },
    blurb: 'Two beds and a wider shopfront.',
  },
  plot_l: {
    id: 'plot_l', name: 'Large Plot', icon: '🏘️', category: 'housing',
    size: { w: 3, h: 3 },
    cost: { wood: 120, ore: 40 },
    buildTicks: 95,
    stock: 1,
    housing: { beds: 3, shelves: 7 },
    aura: { radius: 3, stats: { heart: 4, vigor: 2 } },
    blurb: 'Three under one roof, and shelves to match.',
  },
  plot_xl: {
    id: 'plot_xl', name: 'Manor', icon: '🏰', category: 'housing',
    size: { w: 4, h: 3 },
    cost: { wood: 200, ore: 90, mysticOre: 10 },
    buildTicks: 150,
    stock: 0,
    housing: { beds: 4, shelves: 9 },
    aura: { radius: 4, stats: { heart: 6, vigor: 3, luck: 2 } },
    blurb: 'Nine shelves. The best shop a resident can be given.',
  },

  // --- Materials: production ----------------------------------------------
  field: {
    id: 'field', name: 'Field', icon: '🌾', category: 'materials',
    size: { w: 2, h: 2 },
    cost: { wood: 30 },
    buildTicks: 40,
    stock: 3,
    produces: { grass: 0.10 },
    likesBiome: { grass: 0.3, soil: 0.15, swamp: 0.1 },
    aura: { radius: 2, stats: { gather: 3 } },
    blurb: 'Thatch and feed. Wants open grass under it.',
  },
  plantation: {
    id: 'plantation', name: 'Plantation', icon: '🌳', category: 'materials',
    size: { w: 2, h: 2 },
    // Grass only, for the same reason the mine takes no ore.
    cost: { grass: 45 },
    buildTicks: 45,
    stock: 3,
    produces: { wood: 0.09 },
    likesBiome: { swamp: 0.3, grass: 0.15 },
    aura: { radius: 2, stats: { vigor: 3 } },
    blurb: 'Timber, grown rather than felled.',
  },
  ranch: {
    id: 'ranch', name: 'Ranch', icon: '🐄', category: 'materials',
    size: { w: 2, h: 2 },
    cost: { wood: 45, grass: 40 },
    buildTicks: 55,
    stock: 2,
    produces: { food: 0.11 },
    likesBiome: { grass: 0.3, soil: 0.2 },
    aura: { radius: 2, stats: { hp: 4, heart: 2 } },
    blurb: 'Beasts and their keeping. The steadiest food there is.',
  },
  ore_mine: {
    id: 'ore_mine', name: 'Ore Mine', icon: '⛏️', category: 'materials',
    size: { w: 2, h: 2 },
    // Costs no ore: a mine you cannot dig without ore is a mine you cannot dig.
    cost: { wood: 60 },
    buildTicks: 70,
    stock: 2,
    produces: { ore: 0.07 },
    likesBiome: { rock: 0.4, desert: 0.25 },
    aura: { radius: 2, stats: { atk: 3, dex: 2 } },
    blurb: 'Cut into stone for what stone holds.',
  },
  mystic_mine: {
    id: 'mystic_mine', name: 'Mystic Mine', icon: '💠', category: 'materials',
    size: { w: 2, h: 2 },
    cost: { wood: 80, ore: 90 },
    buildTicks: 110,
    stock: 1,
    produces: { mysticOre: 0.03 },
    likesBiome: { snow: 0.5, lava: 0.6, rock: 0.15 },
    aura: { radius: 2, stats: { int: 5, mp: 4 } },
    blurb: 'Only the cold and the burning places give it up.',
  },
  market_stall: {
    id: 'market_stall', name: 'Market Stall', icon: '🏪', category: 'materials',
    size: { w: 1, h: 1 },
    cost: { wood: 40, grass: 20 },
    buildTicks: 45,
    stock: 2,
    produces: { copper: 0.05 },
    aura: { radius: 3, stats: { heart: 3, luck: 2 } },
    blurb: 'A little trade of its own, until your residents open real shops.',
  },

  // --- Materials: storage --------------------------------------------------
  // The most important buildings in the game for anyone who plays in bursts:
  // storage is the only thing capping what accumulates while you are away.
  granary: {
    id: 'granary', name: 'Granary', icon: '🛖', category: 'materials',
    size: { w: 2, h: 2 },
    cost: { wood: 70, ore: 20 },
    buildTicks: 60,
    stock: 1,
    storage: { food: 3500, grass: 2000 },
    aura: { radius: 2, stats: { vigor: 2 } },
    blurb: 'Holds food and feed, so more of it survives your time away.',
  },
  lumber_yard: {
    id: 'lumber_yard', name: 'Lumber Yard', icon: '🪵', category: 'materials',
    size: { w: 2, h: 2 },
    cost: { wood: 50, ore: 30 },
    buildTicks: 60,
    stock: 1,
    storage: { wood: 3500 },
    aura: { radius: 2, stats: { dex: 2 } },
    blurb: 'Stacked timber against a long absence.',
  },
  ore_store: {
    id: 'ore_store', name: 'Ore Store', icon: '🏚️', category: 'materials',
    size: { w: 2, h: 2 },
    cost: { wood: 60, ore: 50 },
    buildTicks: 70,
    stock: 1,
    storage: { ore: 3000, mysticOre: 1200 },
    aura: { radius: 2, stats: { def: 2 } },
    blurb: 'Stone and rare stone, kept dry.',
  },
  treasury: {
    id: 'treasury', name: 'Treasury', icon: '🏦', category: 'materials',
    size: { w: 2, h: 2 },
    cost: { wood: 80, ore: 80 },
    buildTicks: 90,
    stock: 1,
    storage: { copper: 6000, bronze: 4000, silver: 1500 },
    aura: { radius: 2, stats: { luck: 3 } },
    blurb: 'Deep coffers. Coin stops overflowing while you sleep.',
  },

  // --- Amenity (research: facilities.md) -----------------------------------
  // Every one of these is LOCKED until researched. That is the point of the
  // research layer: the build menu grows as the kingdom learns, rather than
  // handing you everything on day one.
  surveyor_office: {
    id: 'surveyor_office', name: "Surveyor's Office", icon: '\u{1F5FA}\uFE0F', category: 'amenity',
    size: { w: 2, h: 2 },
    cost: { wood: 60, ore: 25 },
    buildTicks: 60,
    stock: 0,
    locked: true,
    aura: { radius: 3, stats: { move: 4, luck: 3 } },
    /** Surveys are run from here. A better office reaches further out. */
    surveys: true,
    blurb: 'Sends out surveyors, who bring back land and finds.',
  },
  library: {
    id: 'library', name: 'Library', icon: '\u{1F3EB}', category: 'amenity',
    size: { w: 2, h: 2 },
    cost: { wood: 90, ore: 30 },
    buildTicks: 90,
    stock: 0,
    locked: true,
    storage: { tome: 200, sample: 100 },
    aura: { radius: 3, stats: { int: 6, mp: 3 } },
    /** Study points added regardless of who lives nearby. */
    studyPower: 0.6,
    blurb: 'The kingdom studies faster, and keeps more of what it has written.',
  },
  bench: {
    id: 'bench', name: 'Bench', icon: '\u{1FA91}', category: 'amenity',
    size: { w: 1, h: 1 },
    cost: { wood: 12 },
    buildTicks: 8,
    stock: 0,
    locked: true,
    aura: { radius: 2, stats: { heart: 3, vigor: 2 } },
    blurb: 'Somewhere to sit. Cheap, and it adds up.',
  },
  hot_spring: {
    id: 'hot_spring', name: 'Hot Spring', icon: '\u{2668}\uFE0F', category: 'amenity',
    size: { w: 2, h: 2 },
    cost: { ore: 70, wood: 40 },
    buildTicks: 100,
    stock: 0,
    locked: true,
    aura: { radius: 4, stats: { vigor: 12, hp: 8, heart: 4 } },
    blurb: 'The strongest thing you can put next to a house.',
  },
  training_yard: {
    id: 'training_yard', name: 'Training Yard', icon: '\u{2694}\uFE0F', category: 'amenity',
    size: { w: 2, h: 2 },
    cost: { wood: 70, ore: 50 },
    buildTicks: 85,
    stock: 0,
    locked: true,
    aura: { radius: 3, stats: { atk: 7, def: 5, dex: 4 } },
    blurb: 'Fighters who live near it are worth sending out.',
  },
  fishing_pond: {
    id: 'fishing_pond', name: 'Fishing Pond', icon: '\u{1F41F}', category: 'amenity',
    size: { w: 2, h: 2 },
    cost: { wood: 55, grass: 35 },
    buildTicks: 70,
    stock: 0,
    locked: true,
    produces: { food: 0.09 },
    likesBiome: { swamp: 0.45, soil: 0.2, grass: 0.1 },
    aura: { radius: 2, stats: { heart: 3, luck: 3 } },
    blurb: 'Food from standing water. Wants swamp under it.',
  },

  master_smithy: {
    id: 'master_smithy', name: 'Master Smithy', icon: '\u{1F528}', category: 'amenity',
    size: { w: 3, h: 2 },
    cost: { ore: 160, wood: 90 },
    buildTicks: 120,
    stock: 0,
    locked: true,
    aura: { radius: 3, stats: { atk: 5, dex: 6 } },
    /** Gear is forged and levelled here (research: equipment.md). */
    forges: true,
    blurb: 'Forges gear, and raises what your people already carry. Levelling costs bronze.',
  },

  monster_stable: {
    id: 'monster_stable', name: 'Monster Stable', icon: '\u{1F3DA}\uFE0F', category: 'amenity',
    size: { w: 3, h: 2 },
    cost: { wood: 130, grass: 90, ore: 40 },
    buildTicks: 110,
    stock: 0,
    locked: true,
    aura: { radius: 3, stats: { def: 4, heart: 3 } },
    /** Eggs raised here hatch into DEFENDERS of the town (research). */
    incubates: 'stable',
    incubatorSlots: 2,
    blurb: 'Eggs raised here hatch into defenders. They hold the town whether or not you are watching.',
  },
  monster_room: {
    id: 'monster_room', name: 'Monster Room', icon: '\u{1F6AA}', category: 'amenity',
    size: { w: 2, h: 2 },
    cost: { wood: 110, grass: 70, ore: 30 },
    buildTicks: 95,
    stock: 0,
    locked: true,
    aura: { radius: 3, stats: { atk: 4, heart: 3 } },
    /** Eggs raised here hatch into COMPANIONS for nests and caves (research). */
    incubates: 'room',
    incubatorSlots: 2,
    blurb: 'Eggs raised here hatch into companions, and go out with your people.',
  },

  double_bed: {
    id: 'double_bed', name: 'Double Bed', icon: '\u{1F6CF}\uFE0F', category: 'housing',
    size: { w: 1, h: 1 },
    cost: { wood: 45, grass: 25 },
    buildTicks: 25,
    stock: 0,
    locked: true,
    aura: { radius: 2, stats: { heart: 5, vigor: 2 } },
    /** Two people sharing a home with one of these next door may marry. */
    weddingBed: true,
    blurb: 'Place it beside a house. The two people living there may marry.',
  },

  // --- Materials: high-grade storage ---------------------------------------
  // The research-gated tier. Storage is the only cap on what accumulates while
  // you are away, so these are the most valuable things research can give you.
  great_granary: {
    id: 'great_granary', name: 'Great Granary', icon: '\u{1F3E3}', category: 'materials',
    size: { w: 3, h: 3 },
    cost: { wood: 200, ore: 90 },
    buildTicks: 150,
    stock: 0,
    locked: true,
    storage: { food: 12000, grass: 8000 },
    aura: { radius: 3, stats: { vigor: 3, heart: 2 } },
    blurb: 'Three times a granary, and then some.',
  },
  deep_vault: {
    id: 'deep_vault', name: 'Deep Vault', icon: '\u{1F5DD}\uFE0F', category: 'materials',
    size: { w: 3, h: 3 },
    cost: { wood: 180, ore: 200, mysticOre: 20 },
    buildTicks: 180,
    stock: 0,
    locked: true,
    storage: { copper: 24000, bronze: 16000, silver: 6000 },
    aura: { radius: 3, stats: { luck: 5 } },
    blurb: 'Coin stops overflowing, however long you are gone.',
  },
  stone_yard: {
    id: 'stone_yard', name: 'Stone Yard', icon: '\u{1F3D7}\uFE0F', category: 'materials',
    size: { w: 3, h: 3 },
    cost: { wood: 150, ore: 160 },
    buildTicks: 160,
    stock: 0,
    locked: true,
    storage: { ore: 11000, mysticOre: 4500 },
    aura: { radius: 3, stats: { def: 4, atk: 2 } },
    blurb: 'Room for everything your miners drag home.',
  },
};

export const FACILITY_IDS = Object.keys(FACILITIES);
export const FACILITY_CATEGORIES = ['environment', 'housing', 'materials', 'amenity'];

export const CATEGORY_LABELS = {
  environment: 'Environment',
  housing: 'Housing — homes and the shops they carry',
  materials: 'Materials — production and storage',
  amenity: 'Amenity — what makes your people better at living here',
};

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
//
// The real game levels facilities with treasure and items. We have no item
// layer yet, so upgrades cost materials — same decision shape, no new system.

export const MAX_FACILITY_LEVEL = 5;

/** Output, storage and aura all scale by this. */
export const LEVEL_EFFECT = [1, 1.6, 2.3, 3.1, 4.0];

/** Cost multiplier to go FROM level n TO n+1, indexed by current level. */
export const LEVEL_UPGRADE_COST = [1.3, 2.6, 4.2, 6.2];
export const LEVEL_UPGRADE_TIME = [1.2, 1.6, 2.0, 2.5];

/**
 * COPPER to raise a facility, by the level it is leaving. This is the sink the
 * whole copper economy was missing.
 *
 * Measured before it was written, because the shortfall was not a nudge: a
 * town of twenty-five level-8 residents earns about 579,000 copper a DAY, and
 * every copper sink in the game put together — all 24 skills, every equipment
 * pattern, every study, a wedding — came to roughly 20,000, ever. The treasury
 * simply sat at its cap and earning stopped meaning anything, which is the one
 * thing a tycoon game cannot afford.
 *
 * Upgrades are the right home for it: repeatable across every building, always
 * wanted, and steeply scaling with ambition. Taking one facility from 1 to 5
 * costs 13,600; a whole town of them is a few days of a mature kingdom's income.
 *
 * THE TOP STEP IS SIZED AGAINST WHAT A TREASURY HOLDS. The first draft put it
 * at 12,000 against a base copper cap of 9,000 — a player with no Treasury
 * could not physically bank enough to buy it, which is the tome dead-end
 * wearing a different hat. At 9,000 the base cap plus one Treasury (15,000)
 * leaves real headroom, and the Treasury becomes something you genuinely need
 * rather than something you eventually get round to.
 *
 * The first step is 200, so an early player is never blocked.
 */
export const LEVEL_UPGRADE_COPPER = [200, 900, 3500, 9000];

export function effectScale(level = 1) {
  return LEVEL_EFFECT[Math.max(0, Math.min(LEVEL_EFFECT.length - 1, level - 1))];
}

export function facilityDef(id) {
  const def = FACILITIES[id];
  if (!def) throw new Error(`Unknown facility: ${id}`);
  return def;
}

export function upgradeCostFor(facilityId, level) {
  if (level >= MAX_FACILITY_LEVEL) return null;
  const def = facilityDef(facilityId);
  const multiplier = LEVEL_UPGRADE_COST[level - 1];
  const cost = {};
  for (const [resource, amount] of Object.entries(def.cost)) {
    cost[resource] = Math.round(amount * multiplier);
  }
  cost.copper = (cost.copper ?? 0) + LEVEL_UPGRADE_COPPER[level - 1];
  return cost;
}

export function upgradeTicksFor(facilityId, level) {
  if (level >= MAX_FACILITY_LEVEL) return null;
  return Math.round(facilityDef(facilityId).buildTicks * LEVEL_UPGRADE_TIME[level - 1]);
}
