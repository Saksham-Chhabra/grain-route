/**
 * Deterministic seeding utilities for reproducible simulations
 */

/**
 * Simple deterministic PRNG using string seed
 * Based on Mulberry32 algorithm
 * @param {string} seed - String to seed the generator
 * @returns {function(): number} Random number generator (0-1)
 */
function seedRandom(seed) {
  // Convert string to numeric seed
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }

  // Mulberry32 PRNG
  return function () {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate deterministic random number in range [min, max]
 * @param {string} seed - Seed string
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random number in range
 */
function seededRandomInRange(seed, min, max) {
  const rng = seedRandom(seed);
  return min + rng() * (max - min);
}

/**
 * Generate deterministic integer in range [min, max] inclusive
 * @param {string} seed - Seed string
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer in range
 */
function seededRandomInt(seed, min, max) {
  return Math.floor(seededRandomInRange(seed, min, max + 1));
}

module.exports = {
  seedRandom,
  seededRandomInRange,
  seededRandomInt,
};
