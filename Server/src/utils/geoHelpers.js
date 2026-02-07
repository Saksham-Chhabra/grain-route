/**
 * Geographic calculation utilities
 * Adapted from mock-server for Backend-A use
 */

/**
 * Extract coordinates from various MongoDB/GeoJSON formats
 * @param {Object} record - Document with location data
 * @returns {{lat: number, lon: number}} Normalized coordinates
 */
function extractCoordinates(record) {
  // Case 1: Direct lat/lon or latitude/longitude fields
  if (record.lat !== undefined && record.lon !== undefined) {
    return { lat: record.lat, lon: record.lon };
  }
  if (record.latitude !== undefined && record.longitude !== undefined) {
    return { lat: record.latitude, lon: record.longitude };
  }

  // Case 2: GeoJSON location.coordinates [lon, lat]
  if (
    record.location &&
    record.location.type === "Point" &&
    Array.isArray(record.location.coordinates) &&
    record.location.coordinates.length === 2
  ) {
    return {
      lat: record.location.coordinates[1],
      lon: record.location.coordinates[0],
    };
  }

  // Case 3: GeoJSON centroid.coordinates [lon, lat]
  if (
    record.centroid &&
    record.centroid.type === "Point" &&
    Array.isArray(record.centroid.coordinates) &&
    record.centroid.coordinates.length === 2
  ) {
    return {
      lat: record.centroid.coordinates[1],
      lon: record.centroid.coordinates[0],
    };
  }

  throw new Error("Unable to extract coordinates from record");
}

/**
 * Calculate great-circle distance between two points using Haversine formula
 * @param {{lat: number, lon: number}} a - First point
 * @param {{lat: number, lon: number}} b - Second point
 * @returns {number} Distance in kilometers
 */
function haversineDistanceKm(a, b) {
  const R = 6371; // Earth radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

export { extractCoordinates, haversineDistanceKm };
