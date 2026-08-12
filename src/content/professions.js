// Professions and the shops they open (research: residents-jobs.md, houses.md).
//
// The rule from the real game: give a resident land and they set up a store
// based on their profession. A Blacksmith opens a Weapon Shop, a Cook a
// Restaurant, a Monk a Church. Fighting classes — Knight, Archer, Mage — do not
// open shops at all; they are who you send out into the world.
//
// Shop income scales with the resident's level and with how many shelves their
// house affords them, which is why housing size is a real decision.
//
// DEFERRED: the real game has some shops consume materials (a Restaurant eats
// Food). Input-consuming shops need the segment to break when an input runs
// dry, or offline catch-up and live play would disagree about how long the shop
// ran. Worth doing properly in V4 with the wider resource chain, not bolted on
// here.

export const PROFESSIONS = {
  // --- shopkeepers ---------------------------------------------------------
  blacksmith: {
    id: 'blacksmith', name: 'Blacksmith', icon: '⚒️',
    shop: { name: 'Weapon Shop', icon: '🗡️', cost: { ore: 12 }, incomePerShelf: 0.012 },
    statBias: { atk: 3, dex: 2, vigor: 1 },
    blurb: 'Sells arms, and sharpens the ones your people already carry.',
  },
  artisan: {
    id: 'artisan', name: 'Artisan', icon: '🪚',
    shop: { name: 'Furniture Shop', icon: '🪑', cost: { wood: 14 }, incomePerShelf: 0.011 },
    statBias: { dex: 3, int: 1 },
    blurb: 'Makes the things that fill a house.',
  },
  cook: {
    id: 'cook', name: 'Cook', icon: '🍲',
    shop: { name: 'Restaurant', icon: '🍽️', cost: { wood: 10, grass: 10 }, incomePerShelf: 0.014 },
    statBias: { hp: 4, heart: 2 },
    blurb: 'A hot meal draws a crowd, and a crowd spends.',
  },
  merchant: {
    id: 'merchant', name: 'Merchant', icon: '💰',
    shop: { name: 'Inn', icon: '🛏️', cost: { wood: 16 }, incomePerShelf: 0.016 },
    statBias: { luck: 3, heart: 2 },
    blurb: 'Beds for travellers, and a sharp eye for a price.',
  },
  researcher: {
    id: 'researcher', name: 'Researcher', icon: '📚',
    shop: { name: 'Research Lab', icon: '🔬', cost: { wood: 12, ore: 8 }, incomePerShelf: 0.008 },
    statBias: { int: 4, mp: 2 },
    /** Speeds research once V4 arrives. */
    researchPower: 1,
    blurb: 'Slow to earn, but the whole kingdom learns faster for it.',
  },
  monk: {
    id: 'monk', name: 'Monk', icon: '🙏',
    shop: { name: 'Church', icon: '⛪', cost: { ore: 18 }, incomePerShelf: 0.007 },
    statBias: { heart: 4, mp: 2 },
    /** Marriages happen here (V9). */
    weds: true,
    blurb: 'Where your people are married, and comforted.',
  },

  // --- gatherers -----------------------------------------------------------
  farmer: {
    id: 'farmer', name: 'Farmer', icon: '🌾',
    shop: { name: 'Produce Stand', icon: '🥕', cost: { wood: 8 }, incomePerShelf: 0.009 },
    statBias: { vigor: 3, gather: 3 },
    gathers: { grass: 0.4, food: 0.3 },
    blurb: 'Works the land, and sells what is left over.',
  },
  miner: {
    id: 'miner', name: 'Miner', icon: '⛏️',
    shop: null,
    statBias: { atk: 2, vigor: 3, gather: 3 },
    gathers: { ore: 0.5, mysticOre: 0.08 },
    blurb: 'No shop. Brings stone home instead.',
  },
  forester: {
    id: 'forester', name: 'Forester', icon: '🪵',
    shop: null,
    statBias: { dex: 2, gather: 3, move: 2 },
    gathers: { wood: 0.5 },
    blurb: 'No shop. Brings timber home instead.',
  },
  rancher: {
    id: 'rancher', name: 'Rancher', icon: '🐄',
    shop: { name: 'Dairy', icon: '🥛', cost: { wood: 12, grass: 12 }, incomePerShelf: 0.010 },
    statBias: { hp: 3, heart: 2, gather: 2 },
    gathers: { food: 0.45 },
    blurb: 'Keeps beasts, and sells what they give.',
  },

  // --- fighters: no shops, these are who you send out ----------------------
  knight: {
    id: 'knight', name: 'Knight', icon: '🛡️',
    shop: null, fighter: true,
    statBias: { hp: 5, def: 4, atk: 3 },
    blurb: 'Stands in front. Opens no shop.',
  },
  archer: {
    id: 'archer', name: 'Archer', icon: '🏹',
    shop: null, fighter: true,
    statBias: { dex: 4, spd: 3, atk: 2 },
    blurb: 'Strikes from range. Opens no shop.',
  },
  mage: {
    id: 'mage', name: 'Mage', icon: '🔮',
    shop: null, fighter: true,
    statBias: { int: 5, mp: 4 },
    blurb: 'Magic ignores armour. Opens no shop.',
  },
  healer: {
    id: 'healer', name: 'Healer', icon: '✨',
    shop: null, fighter: true,
    statBias: { mp: 3, heart: 3, int: 2 },
    blurb: 'Brings people home alive. Opens no shop.',
  },

  // --- the unemployed ------------------------------------------------------
  wanderer: {
    id: 'wanderer', name: 'Wanderer', icon: '🚶',
    shop: null,
    statBias: { move: 3, luck: 1 },
    blurb: 'No trade yet. Give them a job and they will find one.',
  },
};

export const PROFESSION_IDS = Object.keys(PROFESSIONS);

/** Who can arrive off the boat, and how likely each is. */
export const ARRIVAL_WEIGHTS = {
  wanderer: 14, farmer: 12, forester: 10, miner: 9, cook: 8, artisan: 8,
  merchant: 7, blacksmith: 6, rancher: 6, knight: 5, archer: 5, mage: 4,
  researcher: 4, monk: 3, healer: 3,
};

export function professionDef(id) {
  const profession = PROFESSIONS[id];
  if (!profession) throw new Error(`Unknown profession: ${id}`);
  return profession;
}

export const SHOPKEEPERS = PROFESSION_IDS.filter((id) => PROFESSIONS[id].shop);
export const FIGHTERS = PROFESSION_IDS.filter((id) => PROFESSIONS[id].fighter);
