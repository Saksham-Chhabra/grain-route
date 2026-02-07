/**
 * Batch freshness and perishability calculations
 * Per architecture doc formula
 */

/**
 * Calculate freshness percentage at a given timestamp
 * Formula: freshnessPct = max(0, 100 - (elapsed_hours / shelf_life_hours) * 100 * temp_factor)
 * temp_factor = 1 + max(0, (avg_temp_c - 20) / 10) * 0.5
 *
 * @param {Object} batch - Batch document with manufacture_date, shelf_life_hours, initial_temp_c
 * @param {Date} currentDate - Timestamp to calculate freshness at
 * @param {number} avgTemp - Average ambient temperature in Celsius (default: 25)
 * @returns {number} Freshness percentage (0-100)
 */
function calculateFreshnessPct(batch, currentDate, avgTemp = 25) {
  if (!batch.manufacture_date) {
    // No manufacture date, assume fresh
    return 100;
  }

  if (!batch.shelf_life_hours || batch.shelf_life_hours <= 0) {
    // No shelf life defined, assume non-perishable
    return 100;
  }

  const manufactureDate = new Date(batch.manufacture_date);
  const elapsedMs = currentDate - manufactureDate;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  // Temperature factor: higher temps accelerate spoilage
  const tempFactor = 1 + Math.max(0, (avgTemp - 20) / 10) * 0.5;

  // Calculate freshness with temperature adjustment
  const freshnessPct = Math.max(
    0,
    100 - (elapsedHours / batch.shelf_life_hours) * 100 * tempFactor
  );

  return Math.round(freshnessPct * 100) / 100; // Round to 2 decimals
}

/**
 * Determine if batch is spoiled at given timestamp
 * @param {Object} batch - Batch document
 * @param {Date} currentDate - Timestamp to check
 * @param {number} avgTemp - Average ambient temperature
 * @returns {boolean} True if spoiled (freshness <= 0)
 */
function isSpoiled(batch, currentDate, avgTemp = 25) {
  return calculateFreshnessPct(batch, currentDate, avgTemp) <= 0;
}

/**
 * Calculate remaining shelf life in hours
 * @param {Object} batch - Batch document
 * @param {Date} currentDate - Current timestamp
 * @param {number} avgTemp - Average ambient temperature
 * @returns {number} Hours remaining before spoilage
 */
function remainingShelfLifeHours(batch, currentDate, avgTemp = 25) {
  const freshness = calculateFreshnessPct(batch, currentDate, avgTemp);
  if (freshness <= 0) return 0;

  const tempFactor = 1 + Math.max(0, (avgTemp - 20) / 10) * 0.5;
  const manufactureDate = new Date(batch.manufacture_date);
  const elapsedMs = currentDate - manufactureDate;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  const totalLifeWithTemp = batch.shelf_life_hours / tempFactor;
  return Math.max(0, totalLifeWithTemp - elapsedHours);
}

export { calculateFreshnessPct, isSpoiled, remainingShelfLifeHours };
