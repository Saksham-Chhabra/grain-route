const toRadians = (value) => (value * Math.PI) / 180;

const earthRadiusKm = 6371;

function extractCoordinates(record) {
  if (!record) return null;
  if (
    typeof record.latitude === 'number' &&
    typeof record.longitude === 'number'
  ) {
    return { lat: record.latitude, lon: record.longitude };
  }
  if (
    record.location &&
    Array.isArray(record.location.coordinates) &&
    record.location.coordinates.length >= 2
  ) {
    return {
      lat: record.location.coordinates[1],
      lon: record.location.coordinates[0],
    };
  }
  if (
    record.centroid &&
    Array.isArray(record.centroid.coordinates) &&
    record.centroid.coordinates.length >= 2
  ) {
    return {
      lat: record.centroid.coordinates[1],
      lon: record.centroid.coordinates[0],
    };
  }
  return null;
}

function haversineDistanceKm(a, b) {
  if (!a || !b) return null;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusKm * c;
}

module.exports = { extractCoordinates, haversineDistanceKm };
