const fetch = require('node-fetch');

const EARTH_RADIUS_M = 6371000;
const DEFAULT_INTERVAL_M = 5000;
const EPSILON = 1e-6;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const aa =
    sinLat * sinLat + Math.cos(radLat1) * Math.cos(radLat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return EARTH_RADIUS_M * c;
}

function round(value, decimals = 3) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function downsampleCoordinates(coordinates, intervalMeters) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return { points: [], totalMeters: 0 };
  }

  const points = [];
  let totalMeters = 0;
  let nextThreshold = intervalMeters;

  const start = coordinates[0];
  points.push({
    lat: round(start[1], 6),
    lon: round(start[0], 6),
    cumulativeKm: 0,
  });

  for (let index = 1; index < coordinates.length; index += 1) {
    const prev = coordinates[index - 1];
    const current = coordinates[index];
    const segmentMeters = haversineMeters(prev, current);

    if (segmentMeters <= 0) {
      continue;
    }

    while (totalMeters + segmentMeters >= nextThreshold) {
      const distanceFromSegmentStart = nextThreshold - totalMeters;
      const ratio = distanceFromSegmentStart / segmentMeters;
      const lon = prev[0] + (current[0] - prev[0]) * ratio;
      const lat = prev[1] + (current[1] - prev[1]) * ratio;
      points.push({
        lat: round(lat, 6),
        lon: round(lon, 6),
        cumulativeKm: round(nextThreshold / 1000, 3),
      });
      nextThreshold += intervalMeters;
    }

    totalMeters += segmentMeters;
  }

  const endCoordinate = coordinates[coordinates.length - 1];
  const finalPoint = {
    lat: round(endCoordinate[1], 6),
    lon: round(endCoordinate[0], 6),
    cumulativeKm: round(totalMeters / 1000, 3),
  };
  const lastPoint = points[points.length - 1];
  if (
    !lastPoint ||
    Math.abs(lastPoint.lat - finalPoint.lat) > EPSILON ||
    Math.abs(lastPoint.lon - finalPoint.lon) > EPSILON
  ) {
    points.push(finalPoint);
  } else {
    points[points.length - 1] = finalPoint;
  }

  return { points, totalMeters };
}

function buildStraightLine(start, end, intervalMeters) {
  const startLonLat = [start.lon, start.lat];
  const endLonLat = [end.lon, end.lat];
  const totalMeters = haversineMeters(startLonLat, endLonLat);
  const points = [
    { lat: round(start.lat, 6), lon: round(start.lon, 6), cumulativeKm: 0 },
  ];

  if (totalMeters <= 0) {
    return {
      provider: 'straight-line',
      distanceKm: 0,
      durationMinutes: null,
      points,
      note: 'Origin and destination share the same coordinates.',
    };
  }

  const interval = intervalMeters > 0 ? intervalMeters : DEFAULT_INTERVAL_M;
  const steps = Math.floor(totalMeters / interval);

  for (let index = 1; index <= steps; index += 1) {
    const ratio = (interval * index) / totalMeters;
    if (ratio >= 1) {
      break;
    }
    const lat = start.lat + (end.lat - start.lat) * ratio;
    const lon = start.lon + (end.lon - start.lon) * ratio;
    points.push({
      lat: round(lat, 6),
      lon: round(lon, 6),
      cumulativeKm: round(ratio * (totalMeters / 1000), 3),
    });
  }

  points.push({
    lat: round(end.lat, 6),
    lon: round(end.lon, 6),
    cumulativeKm: round(totalMeters / 1000, 3),
  });

  return {
    provider: 'straight-line',
    distanceKm: round(totalMeters / 1000, 3),
    durationMinutes: null,
    points,
    note: 'Routing fallback: straight-line interpolation used.',
  };
}

function buildRouteUrl(baseUrl, start, end) {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const hasRoutePrefix = trimmed.includes('/route/');
  const prefix = hasRoutePrefix ? trimmed : `${trimmed}/route/v1`;
  return `${prefix}/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
}

async function fetchRouteGeoJSON(baseUrl, start, end) {
  const url = buildRouteUrl(baseUrl, start, end);
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(
      `Routing service returned status ${response.status}`
    );
    error.status = response.status;
    error.url = url;
    throw error;
  }
  const payload = await response.json();
  if (
    !payload ||
    payload.code !== 'Ok' ||
    !Array.isArray(payload.routes) ||
    !payload.routes.length
  ) {
    const error = new Error('Routing service did not return a valid route.');
    error.payload = payload;
    error.url = url;
    throw error;
  }
  return payload.routes[0];
}

async function buildRouteBetween({ baseUrl, start, end, intervalKm }) {
  const intervalMeters = Math.max(1000, Math.round((intervalKm || 5) * 1000));
  try {
    const route = await fetchRouteGeoJSON(baseUrl, start, end);
    const { points } = downsampleCoordinates(
      route.geometry.coordinates,
      intervalMeters
    );
    return {
      provider: 'osrm',
      baseUrl,
      distanceKm: round(route.distance / 1000, 3),
      durationMinutes: round(route.duration / 60, 2),
      points,
    };
  } catch (error) {
    const fallback = buildStraightLine(start, end, intervalMeters);
    return {
      ...fallback,
      error: error.message,
    };
  }
}

module.exports = {
  buildRouteBetween,
};
