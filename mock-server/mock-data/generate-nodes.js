#!/usr/bin/env node
/*
  Quick node generator for mock data.

  - Reads distinct (state, district) pairs from MongoDB collection `crops_history` in the
    `agriculture` database.
  - For each district fetches a bounding box using the Photon (Komoot) geocoder (cached locally),
    falls back to a deterministic India-wide bounding box if geocoding fails.
  - Emits 6-10 random nodes per district with at least 3 farms and 3 warehouses.
  - Writes separate JSON files for farm/warehouse nodes and NGO profiles.

  Usage:
    node generate-nodes.js [optional-output-file]

  Environment overrides (optional):
    MONGO_URI        default mongodb://127.0.0.1:27017/agriculture
    MONGO_DB         default agriculture
    MONGO_COLLECTION default crops_history

  Example import:
    mongoimport --uri "mongodb://127.0.0.1:27017/arcanix" --collection nodes --jsonArray --file nodes.generated.json
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const OUTPUT_ARG = process.argv[2];
const { nodes: NODES_OUTPUT_FILE, ngos: NGOS_OUTPUT_FILE } =
  deriveOutputPaths(OUTPUT_ARG);
const CACHE_FILE = path.join(__dirname, 'geocode-cache.json');

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/agriculture';
const MONGO_DB = process.env.MONGO_DB || 'agriculture';
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'crops_history';

const MIN_PER_DISTRICT = 6; // guarantees >=3 farms and >=3 warehouses
const MAX_PER_DISTRICT = 10;
const MIN_NGO_PER_DISTRICT = 0;
const MAX_NGO_PER_DISTRICT = 2;

function deriveOutputPaths(inputPath) {
  if (!inputPath) {
    return {
      nodes: path.join(__dirname, 'nodes.generated.json'),
      ngos: path.join(__dirname, 'ngos.generated.json'),
    };
  }

  const resolved = path.resolve(process.cwd(), inputPath);
  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return {
        nodes: path.join(resolved, 'nodes.generated.json'),
        ngos: path.join(resolved, 'ngos.generated.json'),
      };
    }
  } catch (error) {
    // Path does not exist yet; continue to derive filenames.
  }

  const ext = path.extname(resolved);
  if (ext.toLowerCase() === '.json') {
    const base = resolved.slice(0, -ext.length) || resolved;
    return {
      nodes: resolved,
      ngos: `${base}.ngos${ext}`,
    };
  }

  return {
    nodes: `${resolved}.nodes.json`,
    ngos: `${resolved}.ngos.json`,
  };
}

function log(step, message) {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] [${step}] ${message}`);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function seededRng(seed) {
  const hash = crypto.createHash('sha1').update(String(seed)).digest();
  let index = 0;
  return () => {
    const value =
      (hash[index % hash.length] ^
        hash[(index + 7) % hash.length] ^
        hash[(index + 13) % hash.length]) /
      255;
    index += 1;
    return value;
  };
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function fetchJson(url) {
  let nativeFetch = typeof fetch === 'function' ? fetch : null;
  if (!nativeFetch) {
    try {
      nativeFetch = (await import('node-fetch')).default;
    } catch (error) {
      throw new Error(
        'Install "node-fetch" or run on Node >=18 for built-in fetch support.'
      );
    }
  }
  const response = await nativeFetch(url, {
    headers: {
      'User-Agent': 'arcanix-mock-node-generator/1.0 (+https://github.com/)',
    },
  });
  if (!response.ok) {
    throw new Error(`Geocode HTTP ${response.status}`);
  }
  return response.json();
}

function buildBBoxFromExtent(extent, coords) {
  if (Array.isArray(extent) && extent.length === 4) {
    const [west, south, east, north] = extent.map((value) => Number(value));
    if ([west, south, east, north].every((value) => Number.isFinite(value))) {
      return { south, north, west, east };
    }
  }
  if (coords && Number.isFinite(coords.lon) && Number.isFinite(coords.lat)) {
    const deltaLat = 0.35;
    const deltaLon = 0.35;
    return {
      south: coords.lat - deltaLat,
      north: coords.lat + deltaLat,
      west: coords.lon - deltaLon,
      east: coords.lon + deltaLon,
    };
  }
  return null;
}

async function geocodeDistrict(cache, state, district) {
  const key = `${state}|${district}`;
  if (cache[key]) {
    return { data: cache[key], source: 'cache' };
  }

  const query = encodeURIComponent(`${district}, ${state}, India`);
  const url = `https://photon.komoot.io/api/?q=${query}&limit=1`;
  try {
    const payload = await fetchJson(url);
    if (payload && Array.isArray(payload.features) && payload.features.length) {
      const feature = payload.features[0];
      const coordsArray =
        feature &&
        feature.geometry &&
        Array.isArray(feature.geometry.coordinates)
          ? feature.geometry.coordinates
          : null;
      const coordinates = coordsArray
        ? { lon: Number(coordsArray[0]), lat: Number(coordsArray[1]) }
        : null;
      const extent =
        feature && Array.isArray(feature.bbox)
          ? feature.bbox
          : feature &&
            feature.properties &&
            Array.isArray(feature.properties.extent)
          ? feature.properties.extent
          : null;
      const bbox = buildBBoxFromExtent(extent, coordinates);
      const data = {
        bbox,
        center: coordinates,
      };
      cache[key] = data;
      return { data, source: 'photon' };
    }
  } catch (error) {
    log('GEO', `Geocoding failed for ${district}, ${state}: ${error.message}`);
  }
  return { data: null, source: 'fallback' };
}

function indiaFallbackBBox(state, district) {
  const INDIA = { south: 6.5, north: 35.5, west: 68.0, east: 97.5 };
  const rng = seededRng(`${state}|${district}|bbox`);
  const latMargin = 2 + rng() * 4;
  const lonMargin = 2 + rng() * 4;
  const south = INDIA.south + latMargin * rng();
  const north = INDIA.north - latMargin * rng();
  const west = INDIA.west + lonMargin * rng();
  const east = INDIA.east - lonMargin * rng();
  return { south, north, west, east };
}

function samplePoint(bbox, rng) {
  const lon = bbox.west + (bbox.east - bbox.west) * rng();
  const lat = bbox.south + (bbox.north - bbox.south) * rng();
  return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}

function buildNode(point, state, district, type, index) {
  const idSeed = `${state}-${district}-${type}-${index}-${Date.now()}-${Math.random()}`;
  const short = crypto
    .createHash('sha1')
    .update(idSeed)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();

  let prefix, name, capacity;
  if (type === 'warehouse') {
    prefix = 'WH';
    name = `Warehouse ${district} ${index + 1}`;
    capacity = Math.round(10000 + 40000 * Math.random());
  } else if (type === 'ngo') {
    prefix = 'NGO';
    name = `NGO ${district} ${index + 1}`;
    capacity = Math.round(500 + 2000 * Math.random());
  } else {
    prefix = 'FARM';
    name = `Farm ${district} ${index + 1}`;
    capacity = Math.round(1000 + 4000 * Math.random());
  }

  const nodeId = `${prefix}-${slugify(district).toUpperCase()}-${short}`;
  const regionId = `${slugify(state)}:${slugify(district)}`;

  return {
    nodeId,
    type,
    name,
    regionId,
    state,
    district,
    location: { type: 'Point', coordinates: [point.lon, point.lat] },
    capacity_kg: capacity,
  };
}

async function fetchDistricts() {
  log(
    'MONGO',
    `Connecting to ${MONGO_URI} (db: ${MONGO_DB}, collection: ${MONGO_COLLECTION})`
  );
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const coll = client.db(MONGO_DB).collection(MONGO_COLLECTION);
    const pipeline = [
      { $match: { state: { $ne: null }, district: { $ne: null } } },
      { $group: { _id: { state: '$state', district: '$district' } } },
      { $project: { _id: 0, state: '$_id.state', district: '$_id.district' } },
      { $sort: { state: 1, district: 1 } },
    ];
    const rows = await coll
      .aggregate(pipeline, { allowDiskUse: true })
      .toArray();
    const deduped = rows
      .map((row) => ({
        state: String(row.state || '').trim(),
        district: String(row.district || '').trim(),
      }))
      .filter((row) => row.state && row.district);
    log('MONGO', `Fetched ${deduped.length} distinct district entries.`);
    return deduped;
  } finally {
    await client.close().catch(() => {});
  }
}

async function generate() {
  const districts = await fetchDistricts();
  if (!districts.length) {
    throw new Error('No districts returned from MongoDB.');
  }

  const cache = loadCache();
  const farmWarehouseNodes = [];
  const ngoNodes = [];

  for (let index = 0; index < districts.length; index += 1) {
    const { state, district } = districts[index];
    log('DISTRICT', `(${index + 1}/${districts.length}) ${district}, ${state}`);

    const { data, source } = await geocodeDistrict(cache, state, district);
    const bbox =
      data && data.bbox ? data.bbox : indiaFallbackBBox(state, district);
    log(
      'GEO',
      `${district}, ${state} -> ${source}${
        !data || !data.bbox ? ' (using fallback bbox)' : ''
      }`
    );

    const rng = seededRng(`${state}|${district}`);
    const total =
      MIN_PER_DISTRICT +
      Math.floor(rng() * (MAX_PER_DISTRICT - MIN_PER_DISTRICT + 1));

    // Determine farm and warehouse counts (preserving original logic)
    const farmCount = Math.max(3, Math.floor(total / 2));
    const warehouseCount = Math.max(3, total - farmCount);

    // Determine NGO count (0-2 per district)
    const ngoCount =
      MIN_NGO_PER_DISTRICT +
      Math.floor(rng() * (MAX_NGO_PER_DISTRICT - MIN_NGO_PER_DISTRICT + 1));

    // Build type array
    const types = [];
    for (let i = 0; i < farmCount; i += 1) types.push('farm');
    for (let i = 0; i < warehouseCount; i += 1) types.push('warehouse');
    for (let i = 0; i < ngoCount; i += 1) types.push('ngo');

    // Fill any remaining slots with farm/warehouse
    while (types.length < total) types.push(rng() < 0.5 ? 'farm' : 'warehouse');

    // Shuffle types
    for (let i = types.length - 1; i > 0; i -= 1) {
      const swap = Math.floor(rng() * (i + 1));
      [types[i], types[swap]] = [types[swap], types[i]];
    }

    const totalNodes = types.length;
    const points = Array.from({ length: totalNodes }, () =>
      samplePoint(bbox, rng)
    );
    points.forEach((point, idx) => {
      const node = buildNode(point, state, district, types[idx], idx);
      if (node.type === 'ngo') {
        ngoNodes.push(node);
      } else {
        farmWarehouseNodes.push(node);
      }
    });
    log(
      'NODES',
      `Created ${totalNodes} nodes (${
        types.filter((t) => t === 'farm').length
      } farms, ${types.filter((t) => t === 'warehouse').length} warehouses, ${
        types.filter((t) => t === 'ngo').length
      } NGOs)`
    );
  }

  saveCache(cache);
  return { nodes: farmWarehouseNodes, ngos: ngoNodes };
}

async function main() {
  try {
    log('START', 'Generating nodes from MongoDB state/district data.');
    const { nodes, ngos } = await generate();
    fs.writeFileSync(NODES_OUTPUT_FILE, JSON.stringify(nodes, null, 2));
    fs.writeFileSync(NGOS_OUTPUT_FILE, JSON.stringify(ngos, null, 2));
    log('WRITE', `Nodes (${nodes.length}) -> ${NODES_OUTPUT_FILE}`);
    log('WRITE', `NGOs (${ngos.length}) -> ${NGOS_OUTPUT_FILE}`);
    log(
      'DONE',
      'Import with: mongoimport --uri "mongodb://127.0.0.1:27017/arcanix" --collection nodes --jsonArray --file "' +
        NODES_OUTPUT_FILE +
        '"'
    );
    log(
      'DONE',
      'Import NGOs with: mongoimport --uri "mongodb://127.0.0.1:27017/arcanix" --collection ngos --jsonArray --file "' +
        NGOS_OUTPUT_FILE +
        '"'
    );
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
