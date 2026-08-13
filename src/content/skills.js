// Skills (research: residents-jobs.md).
//
// The real game has around 150, bought with copper coins for anything from 25
// to 1800. We ship a curated 24 at launch across the same three families —
// combat, support, utility — and the schema takes the rest without changing.
//
// Skills are the COPPER SINK. Before this milestone the balance run finished
// with every store pinned full and nothing worth buying, which is the state a
// tycoon game must never reach: earning stops meaning anything the moment
// there is nothing to spend on. A skill is bought once, for one person, and
// never expires — so the coin goes somewhere permanent.
//
// Each skill declares:
//   cost      copper, paid once, by the resident who learns it
//   stats     permanent additions to that resident's twelve
//   effects   named multipliers the simulation reads directly
//   forWhom   professions that can learn it, or null for anyone
//   needs     resident level required

export const SKILL_FAMILIES = [
  { id: 'combat', name: 'Combat', icon: '⚔️', blurb: 'For the people you send out.' },
  { id: 'support', name: 'Support', icon: '✨', blurb: 'Keeping others standing.' },
  { id: 'utility', name: 'Utility', icon: '🧰', blurb: 'Work, trade and study.' },
];

export const SKILLS = {
  // --- combat -------------------------------------------------------------
  steady_hand: {
    id: 'steady_hand', name: 'Steady Hand', icon: '🤚', family: 'combat',
    cost: 25, needs: 1, forWhom: null,
    stats: { atk: 4, dex: 3 },
    blurb: 'The first thing anyone learns. Cheap, and it never stops helping.',
  },
  shield_wall: {
    id: 'shield_wall', name: 'Shield Wall', icon: '🧱', family: 'combat',
    cost: 120, needs: 2, forWhom: ['knight', 'blacksmith'],
    stats: { def: 10, hp: 8 },
    blurb: 'Stand still, take the blow, do not move. Harder than it sounds.',
  },
  double_strike: {
    id: 'double_strike', name: 'Double Strike', icon: '⚔️', family: 'combat',
    cost: 340, needs: 3, forWhom: ['knight', 'archer'],
    stats: { atk: 12 },
    effects: { attackMultiplier: 0.15 },
    blurb: 'Two blows in the time most people manage one.',
  },
  keen_eye: {
    id: 'keen_eye', name: 'Keen Eye', icon: '🎯', family: 'combat',
    cost: 180, needs: 2, forWhom: ['archer', 'forester'],
    stats: { dex: 10, luck: 6 },
    blurb: 'Finds the gap in the armour, and the gap in the trees.',
  },
  first_blood: {
    id: 'first_blood', name: 'First Blood', icon: '💨', family: 'combat',
    cost: 260, needs: 3, forWhom: null,
    stats: { spd: 12 },
    effects: { speedMultiplier: 0.2 },
    blurb: 'Whoever moves first usually decides how the rest of it goes.',
  },
  ember: {
    id: 'ember', name: 'Ember', icon: '🔥', family: 'combat',
    cost: 200, needs: 2, forWhom: ['mage', 'researcher'],
    stats: { int: 12, mp: 6 },
    blurb: 'The first tier of fire. Magic ignores armour, which is the point.',
  },
  frost: {
    id: 'frost', name: 'Frost', icon: '❄️', family: 'combat',
    cost: 620, needs: 4, forWhom: ['mage'],
    stats: { int: 22, mp: 12 },
    effects: { magicMultiplier: 0.2 },
    blurb: 'The second tier, and the first one monsters genuinely dislike.',
  },
  tempest: {
    id: 'tempest', name: 'Tempest', icon: '🌩️', family: 'combat',
    cost: 1800, needs: 6, forWhom: ['mage'],
    stats: { int: 40, mp: 26 },
    effects: { magicMultiplier: 0.45 },
    blurb: 'The highest tier anyone here has written down.',
  },
  berserk: {
    id: 'berserk', name: 'Berserk', icon: '💢', family: 'combat',
    cost: 900, needs: 5, forWhom: ['knight'],
    stats: { atk: 30, def: -6 },
    effects: { attackMultiplier: 0.25 },
    blurb: 'More of everything that matters, less of what keeps you alive.',
  },

  // --- support ------------------------------------------------------------
  field_dressing: {
    id: 'field_dressing', name: 'Field Dressing', icon: '🩹', family: 'support',
    cost: 90, needs: 1, forWhom: null,
    stats: { hp: 10, heart: 4 },
    blurb: 'Everyone should know this. Most people do not.',
  },
  mend: {
    id: 'mend', name: 'Mend', icon: '✨', family: 'support',
    cost: 300, needs: 2, forWhom: ['healer', 'monk'],
    stats: { mp: 14, heart: 10 },
    effects: { guardMultiplier: 0.15 },
    blurb: 'Nobody dies of the first wound if somebody is paying attention.',
  },
  sanctuary: {
    id: 'sanctuary', name: 'Sanctuary', icon: '⛪', family: 'support',
    cost: 1100, needs: 5, forWhom: ['healer', 'monk'],
    stats: { heart: 26, mp: 20, def: 8 },
    effects: { guardMultiplier: 0.3 },
    blurb: 'The whole party fights better for knowing they will get home.',
  },
  dodge: {
    id: 'dodge', name: 'Dodge', icon: '🌀', family: 'support',
    cost: 240, needs: 2, forWhom: null,
    stats: { spd: 9, def: 6 },
    blurb: 'The cheapest armour there is.',
  },
  rally: {
    id: 'rally', name: 'Rally', icon: '📣', family: 'support',
    cost: 700, needs: 4, forWhom: ['knight', 'monk', 'merchant'],
    stats: { heart: 18 },
    effects: { musterBonus: 0.2 },
    blurb: 'More of the town turns out when this one calls.',
  },
  hearth_keeper: {
    id: 'hearth_keeper', name: 'Hearth Keeper', icon: '🔥', family: 'support',
    cost: 150, needs: 1, forWhom: null,
    stats: { vigor: 10, hp: 6 },
    blurb: 'Sleeps well, eats properly, and is no trouble to anyone.',
  },

  // --- utility ------------------------------------------------------------
  strong_back: {
    id: 'strong_back', name: 'Strong Back', icon: '🧺', family: 'utility',
    cost: 60, needs: 1, forWhom: null,
    stats: { gather: 8, vigor: 5 },
    blurb: 'Carries more per trip. It adds up faster than anyone expects.',
  },
  prospector: {
    id: 'prospector', name: 'Prospector', icon: '⛏️', family: 'utility',
    cost: 420, needs: 3, forWhom: ['miner', 'forester', 'farmer', 'rancher'],
    stats: { gather: 16, dex: 6 },
    effects: { gatherMultiplier: 0.25 },
    blurb: 'Knows which seam is worth the afternoon.',
  },
  haggler: {
    id: 'haggler', name: 'Haggler', icon: '🪙', family: 'utility',
    cost: 380, needs: 2, forWhom: null,
    stats: { heart: 12, luck: 5 },
    effects: { incomeMultiplier: 0.2 },
    blurb: 'Somehow everything in their shop goes for a little more.',
  },
  shopkeeper: {
    id: 'shopkeeper', name: 'Shopkeeper', icon: '🏪', family: 'utility',
    cost: 850, needs: 4, forWhom: null,
    stats: { heart: 22, luck: 10 },
    effects: { incomeMultiplier: 0.4 },
    blurb: 'The shelves are always full and the door is always open.',
  },
  scholar: {
    id: 'scholar', name: 'Scholar', icon: '📖', family: 'utility',
    cost: 500, needs: 3, forWhom: ['researcher', 'monk', 'mage'],
    stats: { int: 16, mp: 8 },
    effects: { studyMultiplier: 0.35 },
    blurb: 'Reads faster, and remembers what they read.',
  },
  cartographer: {
    id: 'cartographer', name: 'Cartographer', icon: '🗺️', family: 'utility',
    cost: 640, needs: 3, forWhom: null,
    stats: { move: 14, dex: 8 },
    effects: { surveyBonus: 0.3 },
    blurb: 'Surveys under them come back having covered more ground.',
  },
  fleet_footed: {
    id: 'fleet_footed', name: 'Fleet Footed', icon: '👟', family: 'utility',
    cost: 110, needs: 1, forWhom: null,
    stats: { move: 12, spd: 4 },
    blurb: 'Gets there and back before anyone has noticed they left.',
  },
  master_craft: {
    id: 'master_craft', name: 'Master Craft', icon: '🔨', family: 'utility',
    cost: 1300, needs: 5, forWhom: ['blacksmith', 'artisan'],
    stats: { dex: 28, int: 10 },
    effects: { forgeDiscount: 0.25 },
    blurb: 'Forging under their eye wastes far less bronze.',
  },
  quartermaster: {
    id: 'quartermaster', name: 'Quartermaster', icon: '📦', family: 'utility',
    cost: 1500, needs: 5, forWhom: ['merchant', 'artisan'],
    stats: { heart: 16, dex: 12 },
    effects: { storageMultiplier: 0.15 },
    blurb: 'Finds room in the stores that nobody else could see.',
  },
};

export const SKILL_IDS = Object.keys(SKILLS);

export function skillDef(id) {
  const skill = SKILLS[id];
  if (!skill) throw new Error(`Unknown skill: ${id}`);
  return skill;
}

/** Every effect name the simulation understands, with its default. */
export const EFFECT_IDS = [
  'attackMultiplier', 'magicMultiplier', 'guardMultiplier', 'speedMultiplier',
  'musterBonus', 'gatherMultiplier', 'incomeMultiplier', 'studyMultiplier',
  'surveyBonus', 'forgeDiscount', 'storageMultiplier',
];

/**
 * How many skills one resident may hold.
 *
 * Capped so that a skill is a CHOICE about a person rather than a checklist to
 * complete, and so copper keeps mattering as the town grows: more people is
 * the way to hold more skills, not more coin on one prodigy.
 */
export const SKILL_SLOTS = {
  base: 1,
  perLevels: 2,
  max: 6,
};

export function skillSlotsFor(level) {
  return Math.min(SKILL_SLOTS.max, SKILL_SLOTS.base + Math.floor((level - 1) / SKILL_SLOTS.perLevels));
}
