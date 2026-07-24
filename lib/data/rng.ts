/**
 * Deterministic pseudo-random number generator (mulberry32).
 * All data generation in the app uses this module — never Math.random —
 * so that the same seed always produces the same sequence.
 */

/** Generator function: each call returns a number in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 implementation: a 32-bit PRNG, fast and with good distribution
 * for synthetic data. Returns a function that advances the state on each call.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a deterministic generator from an integer seed. */
export function createRng(seed: number): Rng {
  return mulberry32(seed);
}

/** Uniform integer in the range [min, max], inclusive on both ends. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Picks a uniform element from the array (which must not be empty). */
export function pick<T>(rng: Rng, array: readonly T[]): T {
  return array[intBetween(rng, 0, array.length - 1)];
}

/** Returns true with probability p (0 to 1). */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
