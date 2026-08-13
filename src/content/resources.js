// Resources (research: economy-time.md).
//
// The real game runs three separate coins and five materials, each with its own
// dedicated storage building — you cannot pour ore into a granary. That split
// is the whole reason storage is interesting, so we keep it.

export const RESOURCES = {
  // --- coins ---
  copper: {
    id: 'copper', name: 'Copper', icon: '🟠', kind: 'coin',
    baseStorage: 9000,
    blurb: 'What your residents spend in each other\'s shops, and what skills cost.',
  },
  bronze: {
    id: 'bronze', name: 'Bronze', icon: '🟤', kind: 'coin',
    baseStorage: 6000,
    blurb: 'Buys and levels equipment.',
  },
  silver: {
    id: 'silver', name: 'Silver', icon: '⚪', kind: 'coin',
    baseStorage: 2000,
    blurb: 'Rare coin for rare things.',
  },

  // --- materials ---
  wood: {
    id: 'wood', name: 'Wood', icon: '🪵', kind: 'material',
    baseStorage: 4000,
    blurb: 'Cut from trees and thickets.',
  },
  grass: {
    id: 'grass', name: 'Grass', icon: '🌾', kind: 'material',
    baseStorage: 4000,
    blurb: 'Thatch and feed, from open country.',
  },
  food: {
    id: 'food', name: 'Food', icon: '🍎', kind: 'material',
    baseStorage: 4000,
    blurb: 'Feeds your people and your beasts.',
  },
  ore: {
    id: 'ore', name: 'Ore', icon: '⛏️', kind: 'material',
    baseStorage: 3500,
    blurb: 'Dug from rock and desert. Tools, walls, weapons.',
  },
  mysticOre: {
    id: 'mysticOre', name: 'Mystic Ore', icon: '💎', kind: 'material',
    baseStorage: 1500,
    blurb: 'Rare stone from the cold and the burning places.',
  },

  // --- knowledge (research: research-system.md) --------------------------
  // The real game's research spends no points: it spends materials, plus
  // "sample" and "knowledge" items whose only job is to gate a category. We
  // keep that, because it gives materials a purpose beyond construction.
  tome: {
    id: 'tome', name: "Sage's Tome", icon: '\u{1F4D6}', kind: 'knowledge',
    baseStorage: 240,
    blurb: 'Written by your researchers. Every study consumes some.',
  },
  sample: {
    id: 'sample', name: 'Sample', icon: '\u{1F9EA}', kind: 'knowledge',
    baseStorage: 160,
    blurb: 'Brought back by surveyors. Gates the studies that need a thing to copy.',
  },

  // --- special ---
  energy: {
    id: 'energy', name: 'Energy', icon: '⚡', kind: 'special',
    baseStorage: 100,
    /** Regrows on its own; caves spend it (research). */
    regenPerTick: 0.004,
    blurb: 'Spent entering caves. It returns on its own, given time.',
  },
};

export const RESOURCE_IDS = Object.keys(RESOURCES);
export const COIN_IDS = RESOURCE_IDS.filter((id) => RESOURCES[id].kind === 'coin');
export const MATERIAL_IDS = RESOURCE_IDS.filter((id) => RESOURCES[id].kind === 'material');
export const KNOWLEDGE_IDS = RESOURCE_IDS.filter((id) => RESOURCES[id].kind === 'knowledge');

/**
 * What the Town Hall itself brings in, per tick, regardless of what is built.
 *
 * THE RULE THIS ENFORCES: no resource may ever reach a value the kingdom
 * cannot climb back from. Every entry below is a floor, not an economy — one
 * Field out-produces the grass trickle five times over — but a floor is what
 * makes the difference between a slow patch and an unwinnable save.
 *
 * Learned three times now, each time the hard way:
 *
 *   v1  income could reach zero while upkeep drained, and a bankrupt kingdom
 *       switched off its own farms and starved with no way back.
 *   V4  tomes came only from researchers and surveys — and surveys had to be
 *       researched, at a cost in tomes.
 *   V4  ore was worse, because it was invisible. Every producer of ore cost
 *       ore: the mine (20), the Surveyor's Office (25), the promotion fee
 *       (80), and the research that grants a mine sat behind that fee. Spend
 *       your opening ore on houses, as anyone would, and the kingdom was over
 *       — still collecting wood and copper, with nothing to tell you why
 *       nothing worked any more. The balance run found it; nothing else could.
 */
export const CAPITAL_INCOME = {
  copper: 0.05,
  wood: 0.02,
  grass: 0.02,
  food: 0.02,
  ore: 0.02,
  tome: 0.0008,
  // Deliberately NOT mysticOre: nothing needed to recover is bought with it.
};

/** Starting purse. Enough to place a first few things and make a mistake. */
export const STARTING_RESOURCES = {
  copper: 400, bronze: 100, silver: 0,
  wood: 220, grass: 200, food: 200, ore: 120, mysticOre: 0,
  tome: 6, sample: 0,
  energy: 40,
};

export function resourceDef(id) {
  const resource = RESOURCES[id];
  if (!resource) throw new Error(`Unknown resource: ${id}`);
  return resource;
}

export function emptyResources() {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0]));
}
