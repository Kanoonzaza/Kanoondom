// Monsters, nests and caves (research: monsters-dungeons.md).
//
// The real game has 200+ species keyed to BIOME, each appearing at several
// level tiers rather than being replaced by stronger cousins — an Assault Bee
// turns up at level 15 and again at 777. We keep that shape with a smaller
// roster: a species belongs to a biome, and its level comes from where it is
// found rather than from the species itself.
//
// The rule that matters most, from a community tip: the level of what you meet
// tracks YOUR progress, not the location's. Difficulty follows the player.

export const MONSTERS = {
  // --- grass ---------------------------------------------------------------
  slime: {
    id: 'slime', name: 'Slime', icon: '🟢', biomes: ['grass', 'soil'],
    power: 1.0, guard: 0.6, speed: 0.8,
    blurb: 'Barely a threat, but they never come alone.',
  },
  boar: {
    id: 'boar', name: 'Wild Boar', icon: '🐗', biomes: ['grass', 'swamp'],
    power: 1.4, guard: 1.0, speed: 1.2,
    blurb: 'Fast, heavy, and entirely without second thoughts.',
  },
  bee: {
    id: 'bee', name: 'Assault Bee', icon: '🐝', biomes: ['grass', 'swamp'],
    power: 1.2, guard: 0.5, speed: 1.8,
    blurb: 'Strikes first. Almost always strikes first.',
  },

  // --- swamp ---------------------------------------------------------------
  ghost: {
    id: 'ghost', name: 'Ghost', icon: '👻', biomes: ['swamp'],
    power: 1.6, guard: 0.4, speed: 1.3,
    magic: true,
    blurb: 'Armour is no use. It simply passes through.',
  },
  toad: {
    id: 'toad', name: 'Great Toad', icon: '🐸', biomes: ['swamp'],
    power: 1.5, guard: 1.4, speed: 0.6,
    blurb: 'Slow, and takes a great deal of convincing.',
  },

  // --- desert --------------------------------------------------------------
  cactitus: {
    id: 'cactitus', name: 'Cactitus', icon: '🌵', biomes: ['desert'],
    power: 1.7, guard: 1.5, speed: 0.7,
    blurb: 'Hitting it is its own punishment.',
  },
  scorpion: {
    id: 'scorpion', name: 'Sand Scorpion', icon: '🦂', biomes: ['desert', 'rock'],
    power: 1.9, guard: 0.9, speed: 1.6,
    blurb: 'Quick, and it goes for the gaps.',
  },

  // --- rock ----------------------------------------------------------------
  golem: {
    id: 'golem', name: 'Stone Golem', icon: '🗿', biomes: ['rock'],
    power: 2.0, guard: 2.4, speed: 0.4,
    blurb: 'You will be there a while.',
  },
  kobold: {
    id: 'kobold', name: 'Kobold', icon: '👺', biomes: ['rock', 'desert'],
    power: 1.8, guard: 1.1, speed: 1.4,
    blurb: 'Digs where you were going to dig.',
  },

  // --- snow ----------------------------------------------------------------
  frostwolf: {
    id: 'frostwolf', name: 'Frost Wolf', icon: '🐺', biomes: ['snow'],
    power: 2.2, guard: 1.2, speed: 1.9,
    blurb: 'Hunts in a line and turns as one.',
  },
  yeti: {
    id: 'yeti', name: 'Yeti', icon: '❄️', biomes: ['snow'],
    power: 2.6, guard: 2.0, speed: 0.9,
    blurb: 'The cold is on its side.',
  },

  // --- lava ----------------------------------------------------------------
  imp: {
    id: 'imp', name: 'Ember Imp', icon: '🔥', biomes: ['lava'],
    power: 2.4, guard: 0.8, speed: 2.0,
    magic: true,
    blurb: 'Small, and entirely made of bad ideas.',
  },
  drago: {
    id: 'drago', name: 'Drago', icon: '🐲', biomes: ['lava', 'rock'],
    power: 3.4, guard: 2.6, speed: 1.5,
    magic: true,
    blurb: 'The reason the far country is the far country.',
  },
};

export const MONSTER_IDS = Object.keys(MONSTERS);

export function monsterDef(id) {
  const def = MONSTERS[id];
  if (!def) throw new Error(`Unknown monster: ${id}`);
  return def;
}

/** Everything that lives on this ground. */
export function monstersOfBiome(biome) {
  return MONSTER_IDS.filter((id) => MONSTERS[id].biomes.includes(biome));
}

// ---------------------------------------------------------------------------
// Nests
// ---------------------------------------------------------------------------
//
// "Nests spawn monsters continuously until cleared" — so the threat has a
// VISIBLE SOURCE you can go and remove, rather than a hidden timer counting up
// somewhere. That is the whole reason to model nests at all.
//
// Like terrain, nest positions are derived from the seed and never stored. The
// save records only which ones the player has cleared.

export const NESTS = {
  /** Roughly one nest per this many wild tiles. */
  tilesPerNest: 420,
  /** Nests never appear this close to the world centre. */
  safeRadius: 12,
  /** A nest this far from every town hall is somebody else's problem. */
  threatReach: 22,
  /** Threat per tick from one nest at the very edge of its reach. */
  threatPerNest: 0.010,
  /** A nest sitting right on top of you is this much worse than one far off. */
  proximityBonus: 2.5,
  /** Nest strength grows with the ring it stands in. */
  tierPerRing: 1,
  /**
   * The most that torches and towers can ever hold off.
   *
   * There has to be a ceiling below 1. Wards multiply, so fifteen cheap
   * torches took the leak to 99.9% and the balance run showed a late kingdom
   * sitting at 100% wards, zero threat and one raid in five hours — the entire
   * monster system switched off by the cheapest building in the game. Walls
   * should be worth building; they should not be worth building INSTEAD of
   * dealing with the nest.
   */
  maxWard: 0.75,
};

// ---------------------------------------------------------------------------
// Threat and raids
// ---------------------------------------------------------------------------
//
// THE RULE THIS WHOLE FILE SERVES: raids never fire while the player is away.
// Threat still gathers — the nests do not politely wait — but it is capped
// while you are gone, and you get a grace period on return so you are never
// punished for closing the tab. See sim/raids.js.

export const THREAT = {
  /** Raids become possible above this. */
  raidThreshold: 100,
  /** Threat can never exceed this, however long you are away. */
  ceiling: 260,
  /** And never exceeds this specifically because you were away. */
  offlineCeiling: 150,
  /** Seconds of quiet after coming back before anything may attack. */
  graceTicks: 240,
  /** A raid spends this share of the threat that summoned it. */
  spendOnRaid: 0.75,
  /** Monsters are bolder in the dark; the full moon is worse still. */
  nightMultiplier: 1.6,
  fullMoonMultiplier: 3.0,
  /** Chance per tick of a raid at exactly the threshold, at night. */
  baseRaidChance: 0.004,
};

/**
 * What a raid is worth fighting off.
 *
 * Raids in the real game "target the facilities nearest the town centres", so
 * what you choose to put beside your Town Hall is what you are choosing to risk.
 */
export const RAID = {
  /** Facilities considered as targets, nearest the hall first. */
  targets: 3,
  /** A facility that loses is damaged, never deleted — repair is cheap. */
  repairFraction: 0.35,
  /** Monsters in a band, per 100 threat. */
  bandPer100: 3,
  minBand: 2,
  maxBand: 10,
};

// ---------------------------------------------------------------------------
// Caves
// ---------------------------------------------------------------------------
//
// "Caves appear on the night of a full moon" and "entering a cave costs
// Energy". Energy regenerates on its own, which makes caves the one part of
// the game with a natural rhythm the player cannot rush — and the only thing
// Energy has ever been for.

export const CAVE = {
  /** Energy to go in. */
  energyCost: 25,
  /** How long a cave stays open once the moon has raised it, in days. */
  openDays: 3,
  /** Treasure scales with the depth you have earned. */
  rewardPerTier: { copper: 260, bronze: 150, ore: 90, mysticOre: 12, sample: 1 },
  /** Every cave gives at least this, win or lose — nobody comes back empty. */
  consolation: { copper: 60, bronze: 30 },
};

/** The band a cave puts in front of you, given the kingdom's reach. */
export function caveTierFor(highestTier) {
  return Math.max(1, highestTier);
}
