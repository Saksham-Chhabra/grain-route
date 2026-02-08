/**
 * Transport ETA calculation controller
 * Provides deterministic travel time estimates for Backend-A
 */

const { haversineDistanceKm } = require("../utils/geo");
const { seededRandomInRange } = require("../utils/seeding");

/**
 * Calculate transport time and ETA
 * GET /api/transport/time?fromLat=&fromLon=&toLat=&toLon=&start_iso=
 *
 * Algorithm per architecture doc:
 * - distance_km = haversine(from, to)
 * - base_hours = distance_km / avg_speed_kmh
 * - breaks = floor(base_hours / 4) * break_duration_hours (e.g., 0.5h)
 * - night_slow_factor = 1.0 if daytime start, >1.0 if night starts
 * - travel_hours = base_hours * night_slow_factor + breaks
 * - eta = start_iso + travel_hours
 *
 * Returns: {distance_km, travel_time_minutes, eta_iso}
 * Deterministic via seed for reproducible demos
 */
async function calculateTransportTime(req, res) {
  try {
    const { fromLat, fromLon, toLat, toLon, start_iso } = req.query;

    // Validate inputs
    if (!fromLat || !fromLon || !toLat || !toLon) {
      return res.status(400).json({
        error: "Missing required parameters: fromLat, fromLon, toLat, toLon",
      });
    }

    const from = {
      lat: parseFloat(fromLat),
      lon: parseFloat(fromLon),
    };
    const to = {
      lat: parseFloat(toLat),
      lon: parseFloat(toLon),
    };

    if (isNaN(from.lat) || isNaN(from.lon) || isNaN(to.lat) || isNaN(to.lon)) {
      return res.status(400).json({
        error: "Invalid coordinate values",
      });
    }

    // Parse start time (default to now if not provided)
    const startTime = start_iso ? new Date(start_iso) : new Date();
    if (isNaN(startTime.getTime())) {
      return res.status(400).json({
        error: "Invalid start_iso format. Use ISO 8601 date string.",
      });
    }

    // Calculate distance
    const distanceKm = haversineDistanceKm(from, to);

    // Transport parameters (can be made configurable)
    const avgSpeedKmh = 60; // Average truck speed
    const breakDurationHours = 0.5; // 30 min break per 4 hours
    const breakIntervalHours = 4;

    // Base travel time
    const baseHours = distanceKm / avgSpeedKmh;

    // Calculate breaks needed
    const breaksCount = Math.floor(baseHours / breakIntervalHours);
    const totalBreakHours = breaksCount * breakDurationHours;

    // Night slow factor: deterministic based on start hour
    // If starting between 8pm - 6am, add 20-40% delay
    const startHour = startTime.getHours();
    let nightSlowFactor = 1.0;
    if (startHour >= 20 || startHour < 6) {
      // Use deterministic seed based on coordinates + start time
      const seed = `${from.lat},${from.lon}-${to.lat},${to.lon}-${startTime.toISOString()}`;
      nightSlowFactor = seededRandomInRange(seed, 1.2, 1.4);
    }

    // Total travel time
    const travelHours = baseHours * nightSlowFactor + totalBreakHours;
    const travelMinutes = Math.round(travelHours * 60);

    // Calculate ETA
    const etaDate = new Date(
      startTime.getTime() + travelHours * 60 * 60 * 1000,
    );

    return res.json({
      distance_km: Math.round(distanceKm * 100) / 100,
      travel_time_minutes: travelMinutes,
      eta_iso: etaDate.toISOString(),
      metadata: {
        base_hours: Math.round(baseHours * 100) / 100,
        breaks_count: breaksCount,
        break_hours: totalBreakHours,
        night_slow_factor: Math.round(nightSlowFactor * 100) / 100,
        avg_speed_kmh: avgSpeedKmh,
      },
    });
  } catch (error) {
    console.error("Transport time calculation error:", error);
    return res.status(500).json({
      error: "Failed to calculate transport time",
      message: error.message,
    });
  }
}

module.exports = {
  calculateTransportTime,
};
