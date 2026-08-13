// Equipment (research: equipment.md).
//
// THE RULE THAT GOVERNS THIS WHOLE SYSTEM, straight from the wiki:
//
//   "An item with a higher Level Bonus will always be better than an item with
//    higher base stats at level 99."
//
// Growth beats starting numbers. That inverts the usual rarity reflex and is
// the reason the system is interesting at all: a humble Bronze Sword levelled
// patiently outfights a flashy one left at level 1. The community tip that
// follows from it — level the CHEAP things early, because their forge cost is
// trivial — falls straight out of the cost table below.
//
// Each item declares:
//   slot         where it is worn
//   kind         what sort of thing it is; professions are picky about this
//   rank         F..S, which sets its level cap and what forging costs
//   stats        base bonuses, in the same twelve columns residents use
//   levelBonus   points gained per level, shared out across those same stats
//   craft        materials to forge a copy at the Master Smithy

export const SLOTS = ['weapon', 'head', 'armor', 'shield', 'accessory'];

export const SLOT_INFO = {
  weapon: { id: 'weapon', name: 'Weapon', icon: '🗡️' },
  head: { id: 'head', name: 'Head', icon: '⛑️' },
  armor: { id: 'armor', name: 'Armor', icon: '🧥' },
  shield: { id: 'shield', name: 'Shield', icon: '🛡️' },
  accessory: { id: 'accessory', name: 'Accessory', icon: '💍' },
};

export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

/**
 * What a rank is worth.
 *
 * `cap` is how far the item can be levelled; `forgePerLevel` is the bronze it
 * costs to take it up one. The wiki's own figures for F/E/D/C (3/20/80/190)
 * are kept, and B/A/S — which the real game gates behind special unlocks and
 * its paid layer — are extended along the same curve instead.
 *
 * Note what this does: an F item can be taken to level 30 for 87 bronze. A C
 * item costs 11,210 to reach 60. Cheap gear is not a consolation prize, it is
 * the right early answer, exactly as the research's tip says.
 */
export const RANK_INFO = {
  F: { rank: 'F', cap: 30, forgePerLevel: 3, colour: '#8a8f98' },
  E: { rank: 'E', cap: 40, forgePerLevel: 20, colour: '#7fa06a' },
  D: { rank: 'D', cap: 50, forgePerLevel: 80, colour: '#6f97b8' },
  C: { rank: 'C', cap: 60, forgePerLevel: 190, colour: '#a884c8' },
  B: { rank: 'B', cap: 75, forgePerLevel: 400, colour: '#c8a04a' },
  A: { rank: 'A', cap: 90, forgePerLevel: 800, colour: '#d4763a' },
  S: { rank: 'S', cap: 99, forgePerLevel: 1500, colour: '#d24a4a' },
};

export function rankInfo(rank) {
  const info = RANK_INFO[rank];
  if (!info) throw new Error(`Unknown equipment rank: ${rank}`);
  return info;
}

// ---------------------------------------------------------------------------
// Job compatibility
// ---------------------------------------------------------------------------
//
// The real game grades every profession against every equipment type, from
// optimal through weak to outright incompatible. Rather than write a full
// matrix nobody can hold in their head, each profession names only what it is
// BEST with and what it cannot use at all; everything else is merely fine.

export const COMPAT = {
  optimal: { id: 'optimal', factor: 1, label: 'suits them' },
  fine: { id: 'fine', factor: 0.75, label: 'serviceable' },
  weak: { id: 'weak', factor: 0.4, label: 'awkward for them' },
  incompatible: { id: 'incompatible', factor: 0, label: 'they cannot use it' },
};

/** Everything not named is `fine`; `weak` is for the clumsy-but-possible. */
export const PROFESSION_GEAR = {
  knight: { optimal: ['blade', 'heavy'], weak: ['bow'], cannot: ['staff', 'robe'] },
  archer: { optimal: ['bow', 'light'], weak: ['blade'], cannot: ['heavy', 'staff'] },
  mage: { optimal: ['staff', 'robe'], weak: [], cannot: ['blade', 'bow', 'heavy'] },
  healer: { optimal: ['staff', 'robe'], weak: ['blade'], cannot: ['heavy', 'bow'] },

  // Everyone else can defend their home, but they are not soldiers.
  blacksmith: { optimal: ['blade'], weak: ['bow', 'staff'], cannot: ['robe'] },
  miner: { optimal: [], weak: ['bow', 'staff'], cannot: ['robe'] },
  forester: { optimal: ['bow'], weak: ['staff'], cannot: ['heavy'] },
  farmer: { optimal: [], weak: ['staff', 'heavy'], cannot: [] },
  rancher: { optimal: [], weak: ['staff', 'heavy'], cannot: [] },
  cook: { optimal: [], weak: ['bow', 'staff', 'heavy'], cannot: [] },
  artisan: { optimal: [], weak: ['staff', 'heavy'], cannot: [] },
  merchant: { optimal: [], weak: ['heavy', 'staff'], cannot: [] },
  researcher: { optimal: ['staff', 'robe'], weak: ['blade', 'bow'], cannot: ['heavy'] },
  monk: { optimal: ['staff', 'robe'], weak: ['blade'], cannot: ['heavy', 'bow'] },
  wanderer: { optimal: [], weak: ['heavy'], cannot: [] },
};

/** How well this profession gets on with this sort of gear. */
export function compatibilityOf(professionId, kind) {
  // Trinkets suit everyone; that is what makes them the safe gift.
  if (kind === 'trinket') return COMPAT.optimal;

  const rules = PROFESSION_GEAR[professionId];
  if (!rules) return COMPAT.fine;
  if (rules.cannot.includes(kind)) return COMPAT.incompatible;
  if (rules.optimal.includes(kind)) return COMPAT.optimal;
  if (rules.weak.includes(kind)) return COMPAT.weak;
  return COMPAT.fine;
}

// ---------------------------------------------------------------------------
// The items
// ---------------------------------------------------------------------------

export const EQUIPMENT = {
  // --- weapons: blades ----------------------------------------------------
  bronze_sword: {
    id: 'bronze_sword', name: 'Bronze Sword', icon: '🗡️', slot: 'weapon', kind: 'blade',
    rank: 'F', stats: { atk: 9, spd: 4, hp: 1 }, levelBonus: 2,
    craft: { ore: 45, wood: 15 },
    blurb: 'Soft metal, honest edge. Cheap to keep sharpening — which is the point.',
  },
  copper_sword: {
    id: 'copper_sword', name: 'Copper Sword', icon: '⚔️', slot: 'weapon', kind: 'blade',
    rank: 'E', stats: { atk: 15, spd: 9, vigor: 3 }, levelBonus: 2,
    craft: { ore: 90, wood: 20 },
    blurb: 'Heavier in the hand, and it holds an edge through a whole night.',
  },
  steel_sword: {
    id: 'steel_sword', name: 'Steel Sword', icon: '⚔️', slot: 'weapon', kind: 'blade',
    rank: 'D', stats: { atk: 26, spd: 12, def: 4 }, levelBonus: 3,
    craft: { ore: 180, mysticOre: 4 },
    blurb: 'The first blade a knight is not embarrassed to carry.',
  },
  knight_blade: {
    id: 'knight_blade', name: "Knight's Blade", icon: '🗡️', slot: 'weapon', kind: 'blade',
    rank: 'C', stats: { atk: 40, spd: 18, def: 8, luck: 4 }, levelBonus: 3,
    craft: { ore: 320, mysticOre: 14 },
    blurb: 'Balanced for someone who expects to be standing at the end.',
  },
  ice_scalpel: {
    id: 'ice_scalpel', name: 'Ice Scalpel', icon: '🔪', slot: 'weapon', kind: 'blade',
    rank: 'A', stats: { atk: 53, spd: 37, vigor: 12 }, levelBonus: 4,
    craft: { ore: 600, mysticOre: 70 },
    blurb: 'Thin, cold, and far too quiet.',
  },
  blizzard_sword: {
    id: 'blizzard_sword', name: 'Blizzard Sword', icon: '❄️', slot: 'weapon', kind: 'blade',
    rank: 'S', stats: { atk: 63, spd: 45, hp: 15 }, levelBonus: 5,
    craft: { ore: 900, mysticOre: 160 },
    blurb: 'The air around it never quite thaws.',
  },

  // --- weapons: bows ------------------------------------------------------
  sling: {
    id: 'sling', name: 'Sling', icon: '🪃', slot: 'weapon', kind: 'bow',
    rank: 'F', stats: { atk: 6, dex: 6, spd: 3 }, levelBonus: 2,
    craft: { grass: 30, wood: 10 },
    blurb: 'A strip of leather and a good arm. Costs almost nothing to master.',
  },
  short_bow: {
    id: 'short_bow', name: 'Short Bow', icon: '🏹', slot: 'weapon', kind: 'bow',
    rank: 'E', stats: { atk: 13, dex: 11, spd: 7 }, levelBonus: 2,
    craft: { wood: 70, grass: 40 },
    blurb: 'Quick to draw in close country.',
  },
  hunting_bow: {
    id: 'hunting_bow', name: 'Hunting Bow', icon: '🏹', slot: 'weapon', kind: 'bow',
    rank: 'D', stats: { atk: 22, dex: 18, spd: 12, luck: 3 }, levelBonus: 3,
    craft: { wood: 150, ore: 40 },
    blurb: 'Made for patience, and it rewards it.',
  },
  war_bow: {
    id: 'war_bow', name: 'War Bow', icon: '🎯', slot: 'weapon', kind: 'bow',
    rank: 'C', stats: { atk: 36, dex: 26, spd: 16 }, levelBonus: 3,
    craft: { wood: 260, ore: 120, mysticOre: 10 },
    blurb: 'Takes a strong back to string, and clears a field.',
  },
  storm_bow: {
    id: 'storm_bow', name: 'Storm Bow', icon: '⚡', slot: 'weapon', kind: 'bow',
    rank: 'A', stats: { atk: 50, dex: 40, spd: 30 }, levelBonus: 4,
    craft: { wood: 500, mysticOre: 65 },
    blurb: 'The arrows arrive before the sound does.',
  },

  // --- weapons: staves ----------------------------------------------------
  wooden_stick: {
    id: 'wooden_stick', name: 'Wooden Stick', icon: '🪵', slot: 'weapon', kind: 'staff',
    rank: 'F', stats: { int: 7, mp: 5, atk: 2 }, levelBonus: 2,
    craft: { wood: 25 },
    blurb: 'A stick. Levelled far enough, a genuinely frightening stick.',
  },
  oak_staff: {
    id: 'oak_staff', name: 'Oak Staff', icon: '🪄', slot: 'weapon', kind: 'staff',
    rank: 'E', stats: { int: 14, mp: 9, heart: 3 }, levelBonus: 2,
    craft: { wood: 80, grass: 30 },
    blurb: 'Cut from a tree that had been standing a long time.',
  },
  rune_staff: {
    id: 'rune_staff', name: 'Rune Staff', icon: '🔮', slot: 'weapon', kind: 'staff',
    rank: 'D', stats: { int: 24, mp: 16, luck: 4 }, levelBonus: 3,
    craft: { wood: 140, mysticOre: 18 },
    blurb: 'The carvings mean something. Nobody local can say what.',
  },
  sage_staff: {
    id: 'sage_staff', name: 'Sage Staff', icon: '🌟', slot: 'weapon', kind: 'staff',
    rank: 'C', stats: { int: 38, mp: 26, heart: 6, luck: 5 }, levelBonus: 3,
    craft: { wood: 220, mysticOre: 45 },
    blurb: 'Studies faster than the scholar holding it, some say.',
  },
  star_staff: {
    id: 'star_staff', name: 'Star Staff', icon: '✨', slot: 'weapon', kind: 'staff',
    rank: 'A', stats: { int: 55, mp: 40, luck: 12 }, levelBonus: 4,
    craft: { wood: 400, mysticOre: 90 },
    blurb: 'Cold to hold, and it throws no shadow.',
  },

  // --- head ---------------------------------------------------------------
  cloth_cap: {
    id: 'cloth_cap', name: 'Cloth Cap', icon: '🧢', slot: 'head', kind: 'light',
    rank: 'F', stats: { def: 4, vigor: 3 }, levelBonus: 2,
    craft: { grass: 25 },
    blurb: 'Keeps the sun off. Better than nothing, and cheap to improve.',
  },
  leather_hood: {
    id: 'leather_hood', name: 'Leather Hood', icon: '🎩', slot: 'head', kind: 'light',
    rank: 'E', stats: { def: 9, dex: 5, spd: 3 }, levelBonus: 2,
    craft: { grass: 60, wood: 20 },
    blurb: 'Quiet, and it does not catch on branches.',
  },
  iron_helm: {
    id: 'iron_helm', name: 'Iron Helm', icon: '⛑️', slot: 'head', kind: 'heavy',
    rank: 'D', stats: { def: 18, hp: 10 }, levelBonus: 3,
    craft: { ore: 150 },
    blurb: 'Heavy, hot, and it has saved more heads than anything else here.',
  },
  great_helm: {
    id: 'great_helm', name: 'Great Helm', icon: '🪖', slot: 'head', kind: 'heavy',
    rank: 'C', stats: { def: 30, hp: 20, spd: -4 }, levelBonus: 3,
    craft: { ore: 280, mysticOre: 12 },
    blurb: 'You will not hear anyone shouting at you. That cuts both ways.',
  },
  star_circlet: {
    id: 'star_circlet', name: 'Star Circlet', icon: '👑', slot: 'head', kind: 'robe',
    rank: 'B', stats: { int: 26, mp: 18, luck: 8 }, levelBonus: 4,
    craft: { mysticOre: 60, ore: 120 },
    blurb: 'Worn by people who would rather not be hit at all.',
  },

  // --- armor --------------------------------------------------------------
  padded_coat: {
    id: 'padded_coat', name: 'Padded Coat', icon: '🧥', slot: 'armor', kind: 'light',
    rank: 'F', stats: { def: 7, hp: 5 }, levelBonus: 2,
    craft: { grass: 45, wood: 10 },
    blurb: 'Layers of cloth, patiently quilted. Astonishing value, levelled.',
  },
  leather_jerkin: {
    id: 'leather_jerkin', name: 'Leather Jerkin', icon: '🦺', slot: 'armor', kind: 'light',
    rank: 'E', stats: { def: 14, hp: 9, spd: 4 }, levelBonus: 2,
    craft: { grass: 90, ore: 20 },
    blurb: 'Turns a claw, and lets you run afterwards.',
  },
  chain_mail: {
    id: 'chain_mail', name: 'Chain Mail', icon: '🥋', slot: 'armor', kind: 'heavy',
    rank: 'D', stats: { def: 26, hp: 18, spd: -3 }, levelBonus: 3,
    craft: { ore: 220 },
    blurb: 'A season of somebody’s evenings, ring by ring.',
  },
  plate_armor: {
    id: 'plate_armor', name: 'Plate Armor', icon: '🛡️', slot: 'armor', kind: 'heavy',
    rank: 'C', stats: { def: 42, hp: 30, spd: -6 }, levelBonus: 3,
    craft: { ore: 400, mysticOre: 20 },
    blurb: 'Nothing gets through it. Nothing gets out of it quickly, either.',
  },
  robe_of_stars: {
    id: 'robe_of_stars', name: 'Robe of Stars', icon: '🌌', slot: 'armor', kind: 'robe',
    rank: 'B', stats: { int: 30, mp: 24, def: 10 }, levelBonus: 4,
    craft: { grass: 200, mysticOre: 70 },
    blurb: 'Magic goes through armour anyway. Better to answer in kind.',
  },

  // --- shield -------------------------------------------------------------
  plank_shield: {
    id: 'plank_shield', name: 'Plank Shield', icon: '🪵', slot: 'shield', kind: 'light',
    rank: 'F', stats: { def: 6, hp: 3 }, levelBonus: 2,
    craft: { wood: 30 },
    blurb: 'Boards and a strap. It splinters, and you make another.',
  },
  buckler: {
    id: 'buckler', name: 'Buckler', icon: '🛡️', slot: 'shield', kind: 'light',
    rank: 'E', stats: { def: 12, spd: 5, dex: 4 }, levelBonus: 2,
    craft: { ore: 70, wood: 25 },
    blurb: 'Small enough to punch with.',
  },
  kite_shield: {
    id: 'kite_shield', name: 'Kite Shield', icon: '🛡️', slot: 'shield', kind: 'heavy',
    rank: 'D', stats: { def: 24, hp: 12 }, levelBonus: 3,
    craft: { ore: 190, wood: 40 },
    blurb: 'Covers a leg as well as a chest, which matters more than people think.',
  },
  tower_shield: {
    id: 'tower_shield', name: 'Tower Shield', icon: '🚪', slot: 'shield', kind: 'heavy',
    rank: 'C', stats: { def: 40, hp: 24, spd: -5 }, levelBonus: 3,
    craft: { ore: 340, mysticOre: 16 },
    blurb: 'A wall you can carry, at the pace a wall moves.',
  },

  // --- accessory ----------------------------------------------------------
  // Trinkets suit everybody, which makes them the thing you hand a farmer.
  straw_charm: {
    id: 'straw_charm', name: 'Straw Charm', icon: '🌾', slot: 'accessory', kind: 'trinket',
    rank: 'F', stats: { luck: 5, heart: 3 }, levelBonus: 2,
    craft: { grass: 20 },
    blurb: 'Plaited by somebody’s grandmother. It works, apparently.',
  },
  copper_ring: {
    id: 'copper_ring', name: 'Copper Ring', icon: '💍', slot: 'accessory', kind: 'trinket',
    rank: 'E', stats: { luck: 8, heart: 5, gather: 3 }, levelBonus: 2,
    craft: { ore: 60, copper: 200 },
    blurb: 'Plain, and never off their finger.',
  },
  lucky_coin: {
    id: 'lucky_coin', name: 'Lucky Coin', icon: '🪙', slot: 'accessory', kind: 'trinket',
    rank: 'D', stats: { luck: 16, gather: 6, heart: 4 }, levelBonus: 3,
    craft: { copper: 900, ore: 80 },
    blurb: 'Landed the right way up once, at an important moment.',
  },
  gatherers_amulet: {
    id: 'gatherers_amulet', name: "Gatherer's Amulet", icon: '🧿', slot: 'accessory', kind: 'trinket',
    rank: 'C', stats: { gather: 18, vigor: 10, luck: 8 }, levelBonus: 3,
    craft: { mysticOre: 30, copper: 1600 },
    blurb: 'Miners will not go down without one.',
  },
  heart_stone: {
    id: 'heart_stone', name: 'Heart Stone', icon: '💗', slot: 'accessory', kind: 'trinket',
    rank: 'B', stats: { heart: 30, luck: 14, hp: 12 }, levelBonus: 4,
    craft: { mysticOre: 55, copper: 2600 },
    blurb: 'Warm, always. Shopkeepers wearing one are never short of customers.',
  },
};

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);

export function equipmentDef(id) {
  const def = EQUIPMENT[id];
  if (!def) throw new Error(`Unknown equipment: ${id}`);
  return def;
}

// ---------------------------------------------------------------------------
// Levelling and experience
// ---------------------------------------------------------------------------

export const EQUIP = {
  /**
   * Experience for the level after `level`: round(base * level^exponent).
   * Gentle enough that a first item climbs visibly overnight.
   */
  expBase: 60,
  expExponent: 1.35,

  /**
   * Gear gains experience because RESIDENTS SHOP — the research is explicit
   * that buying in a store raises equipment EXP. So a healthy town economy
   * improves everyone's kit as a side effect, which ties this system to the
   * economy pillar rather than bolting a second currency onto it.
   */
  expPerTick: 0.05,
  /** Trade multiplies it: this much extra per copper per tick the town earns. */
  expPerCopperRate: 0.6,
  /** Gear nobody is wearing learns nothing. */
  requiresOwner: true,

  /** Levels are FORGED, not granted — see sim/equipment.js for why. */
  forgeDiscountPerDex: 0.004,
  maxForgeDiscount: 0.4,
};

/**
 * The sum of an item's base stats, which is how its level bonus is shared out.
 *
 * Memoised per definition: this sits under the clock's hot path, and working it
 * out per item per segment was most of a six-second catch-up.
 */
const STAT_TOTALS = new Map();

export function statTotalOf(def) {
  let total = STAT_TOTALS.get(def.id);
  if (total === undefined) {
    total = 0;
    for (const value of Object.values(def.stats)) total += Math.abs(value);
    STAT_TOTALS.set(def.id, total);
  }
  return total;
}

/** Experience needed to go from `level` to the next. */
export function expForNextLevel(level) {
  return Math.round(EQUIP.expBase * Math.pow(level, EQUIP.expExponent));
}
