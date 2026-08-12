// Biomes (research: world-and-map.md).
//
// The real game mixes biomes WITHIN a zone — the wiki is explicit that a zone's
// colour label does not mean the whole zone is that terrain. So a zone has a
// dominant biome and coherent patches of others, rather than a flat fill.

export const BIOMES = {
  grass: {
    id: 'grass',
    name: 'Grass',
    icon: '🌿',
    colour: '#4a7c45',
    buildable: true,
    /** Materials gathered here, per gather action. */
    yields: { grass: 1.0, food: 0.5, wood: 0.3 },
    blurb: 'Green and forgiving. Grass, some food, a little wood.',
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    icon: '🏜️',
    colour: '#c2a468',
    buildable: true,
    yields: { ore: 0.8 },
    blurb: 'Hot and bare, but the rock beneath is worth digging.',
  },
  rock: {
    id: 'rock',
    name: 'Rock',
    icon: '⛰️',
    colour: '#7d7f8a',
    buildable: true,
    yields: { ore: 1.0, wood: 0.1 },
    blurb: 'The best ore in the realm sits under stone like this.',
  },
  snow: {
    id: 'snow',
    name: 'Snow',
    icon: '❄️',
    colour: '#cfdbe6',
    buildable: true,
    yields: { mysticOre: 0.6, ore: 0.2 },
    blurb: 'Bitter ground. Mystic ore, and little else.',
  },
  swamp: {
    id: 'swamp',
    name: 'Swamp',
    icon: '🪷',
    colour: '#4d5f43',
    buildable: true,
    yields: { grass: 0.6, wood: 0.6 },
    blurb: 'Slow going, but it grows things.',
  },
  lava: {
    id: 'lava',
    name: 'Lava',
    icon: '🌋',
    colour: '#8c3b2a',
    buildable: false,
    yields: { mysticOre: 1.0 },
    blurb: 'Nothing stands here. What it gives, it gives dearly.',
  },
  soil: {
    id: 'soil',
    name: 'Soil',
    icon: '🟤',
    colour: '#6b5236',
    buildable: true,
    /** Diggable — and digging wakes its own monsters (research). */
    diggable: true,
    yields: { food: 0.8, grass: 0.4 },
    blurb: 'Turned earth. Dig it for food — and for whatever digs back.',
  },
  sea: {
    id: 'sea',
    name: 'Sea',
    icon: '🌊',
    colour: '#2f5a7a',
    buildable: false,
    /** Crossed by bridging; has its own monsters. */
    bridgeable: true,
    yields: { food: 0.7 },
    blurb: 'Bridge it to reach what lies beyond.',
  },
};

export const BIOME_IDS = Object.keys(BIOMES);

/** Biomes a zone can be dominated by. Soil and sea are placed by other rules. */
export const DOMINANT_BIOMES = ['grass', 'desert', 'rock', 'snow', 'swamp', 'lava'];

/**
 * Rough difficulty of a biome, used to bias where the harder terrain sits and
 * later to tier monster spawns. Grass is home; lava is the far edge.
 */
export const BIOME_TIER = {
  grass: 0,
  soil: 0,
  swamp: 1,
  desert: 1,
  rock: 2,
  snow: 3,
  lava: 4,
  sea: 1,
};

export function biomeDef(id) {
  const biome = BIOMES[id];
  if (!biome) throw new Error(`Unknown biome: ${id}`);
  return biome;
}
