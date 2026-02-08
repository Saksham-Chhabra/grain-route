/**
 * Weather service controller
 * Provides deterministic temperature data for freshness calculations
 */

const { seededRandomInRange } = require("../utils/seeding");

/**
 * Get deterministic weather data for a region and date
 * GET /api/weather?regionId=&date=
 *
 * Returns deterministic temperature based on:
 * - Region (via hash)
 * - Day of year (seasonal variation)
 * - Seeded randomness for consistency
 */
async function getWeather(req, res) {
  try {
    const { regionId, date } = req.query;

    if (!regionId) {
      return res.status(400).json({
        error: "Missing required parameter: regionId",
      });
    }

    // Parse date (default to today)
    const targetDate = date ? new Date(date) : new Date();
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        error: "Invalid date format. Use ISO 8601 date string.",
      });
    }

    // Calculate day of year for seasonal variation
    const startOfYear = new Date(targetDate.getFullYear(), 0, 1);
    const dayOfYear = Math.floor(
      (targetDate - startOfYear) / (1000 * 60 * 60 * 24),
    );

    // Base temperature varies by season (India climate)
    // Peak summer: ~35-40°C (day 120-180), Winter: ~15-20°C (day 330-30)
    const seasonalTemp =
      27 + 8 * Math.sin(((dayOfYear - 80) * 2 * Math.PI) / 365);

    // Regional variation: deterministic based on regionId
    const seed = `${regionId}-${targetDate.toISOString().split("T")[0]}`;
    const regionalVariation = seededRandomInRange(seed, -5, 5);

    const avgTempC = Math.round((seasonalTemp + regionalVariation) * 10) / 10;

    // Daily high/low variation
    const dailyHighC = Math.round((avgTempC + 5) * 10) / 10;
    const dailyLowC = Math.round((avgTempC - 5) * 10) / 10;

    return res.json({
      regionId,
      date: targetDate.toISOString().split("T")[0],
      avg_temp_c: avgTempC,
      high_temp_c: dailyHighC,
      low_temp_c: dailyLowC,
      conditions: avgTempC > 30 ? "hot" : avgTempC > 20 ? "warm" : "cool",
    });
  } catch (error) {
    console.error("Weather fetch error:", error);
    return res.status(500).json({
      error: "Failed to fetch weather data",
      message: error.message,
    });
  }
}

module.exports = {
  getWeather,
};
