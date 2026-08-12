// Seeded pseudo-random number generation.
//
// Every random decision in the simulation flows through here. Nothing in sim/
// may call Math.random() — determinism is what makes the offline-parity test
// (spec 4.5) and the combat-determinism test (spec 11.6) possible at all.

/**
 * mulberry32: a small, fast, well-distributed 32-bit PRNG.
 * Returns a function producing floats in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A resumable RNG. The internal state is a single integer, so it can be
 * saved to and restored from the game save without losing the stream position.
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return {
    /** Next float in [0, 1). */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    /** Float in [min, max). */
    float(min, max) {
      return min + this.next() * (max - min);
    },
    /** Uniformly pick one element. */
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
    /** Fisher-Yates, returns a new array; does not mutate the input. */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    getState() {
      return state;
    },
    setState(s) {
      state = s >>> 0;
    },
  };
}

/**
 * Derive an independent stream from a seed. Used so that map generation does
 * not consume the gameplay RNG stream (and vice versa) — otherwise generating
 * a map would shift every later combat roll.
 */
export function deriveSeed(seed, salt) {
  let h = (seed >>> 0) ^ (salt >>> 0);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Salts for the independent streams. Keep them distinct and stable. */
export const SEED_SALT = {
  MAP: 0x9e3779b9,
  COMBAT: 0x85ebca6b,
  RECRUITS: 0xc2b2ae35,
  EVENTS: 0x27d4eb2f,
};
