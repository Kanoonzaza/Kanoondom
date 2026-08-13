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
 * Hard-won from v1: an economy that can reach zero income while anything drains
 * will bankrupt a new player into a corner they cannot climb out of. A floor
 * costs nothing and removes the entire failure mode.
 */
export const CAPITAL_INCOME = {
  copper: 0.05,
  /**
   * A trickle of scholarship, for exactly the same reason.
   *
   * Tomes otherwise come only from researchers and from surveys — and surveys
   * must themselves be RESEARCHED, at a cost in tomes. A kingdom with no tomes
   * and no scholar would have no way to earn either: the v1 death spiral in a
   * new costume. Slow is fine; zero is not.
   */
  tome: 0.0008,
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
