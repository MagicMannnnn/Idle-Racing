/**
 * Seeded random number generator utilities
 * Uses mulberry32 algorithm for deterministic random number generation
 */

/**
 * Mulberry32 PRNG - fast, deterministic seeded random number generator
 * Returns a function that generates random numbers in [0, 1)
 * Same seed always produces same sequence of random numbers
 */
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Create a seeded RNG from a string
 * Converts string to number hash for use with mulberry32
 */
export function seedFromString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0 // Convert to 32-bit integer
  }
  return hash >>> 0 // Ensure positive
}

/**
 * Shuffle array using seeded random number generator
 */
export function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Generate a random integer in [min, max) using seeded RNG
 */
export function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min)) + min
}

/**
 * Generate a random float in [min, max) using seeded RNG
 */
export function randFloat(rand: () => number, min: number, max: number): number {
  return rand() * (max - min) + min
}

/**
 * Generate normally distributed random number (Box-Muller transform)
 * mean: center of distribution
 * stdDev: standard deviation
 */
export function randNormal(rand: () => number, mean = 0, stdDev = 1): number {
  const u1 = rand()
  const u2 = rand()
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return z0 * stdDev + mean
}
