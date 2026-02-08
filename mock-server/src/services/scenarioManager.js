const { createHash } = require('crypto');
const seedrandom = require('seedrandom');
const axios = require('axios');
const Scenario = require('../models/Scenario');
const SimEvent = require('../models/SimEvent');
const CropSeason = require('../models/CropSeason');
const Region = require('../models/Region');
const Warehouse = require('../models/Warehouse');
const { extractCoordinates, haversineDistanceKm } = require('../utils/geo');
const {
  MAIN_API_URL,
  MAIN_API_ROUTES,
  MAIN_API_TIMEOUT_MS,
  MAX_BATCH_SIZE,
  MIN_INTERVAL_MS,
  DEFAULT_PROBABILITIES,
} = require('../config');

const activeScenarios = new Map();

function normalizeBatchSize(value) {
  if (!value || Number.isNaN(Number(value)))
    return Math.min(50, MAX_BATCH_SIZE);
  const numeric = Math.max(1, Math.floor(Number(value)));
  return Math.min(numeric, MAX_BATCH_SIZE);
}

function normalizeInterval(value) {
  if (!value || Number.isNaN(Number(value)))
    return Math.max(1000, MIN_INTERVAL_MS);
  const numeric = Math.max(MIN_INTERVAL_MS, Math.floor(Number(value)));
  return numeric;
}

function normalizeProbabilities(input) {
  const source = { ...DEFAULT_PROBABILITIES, ...(input || {}) };
  const MIN_PROBABILITY = 0.01; // Ensure at least 1% for each type

  let farm = Math.max(0, Number(source.farm) || 0);
  const requestAlias =
    source.request ?? source.ngo ?? source.requests ?? source.aid ?? 0;
  let request = Math.max(0, Number(requestAlias) || 0);

  // If both are zero or negative, use defaults
  if (farm <= 0 && request <= 0) {
    return { ...DEFAULT_PROBABILITIES };
  }

  // Ensure minimum values if one is provided
  if (farm > 0 && request <= 0) {
    request = MIN_PROBABILITY;
  } else if (request > 0 && farm <= 0) {
    farm = MIN_PROBABILITY;
  }

  const total = farm + request;
  return {
    farm: farm / total,
    request: request / total,
  };
}

const DEFAULT_TIME_ADVANCE_MIN_MINUTES = 240;
const DEFAULT_TIME_ADVANCE_MAX_MINUTES = 1440;

function normalizeTimeAdvance(input) {
  const defaults = {
    minMinutes: DEFAULT_TIME_ADVANCE_MIN_MINUTES,
    maxMinutes: DEFAULT_TIME_ADVANCE_MAX_MINUTES,
  };
  if (input === null || input === undefined) {
    return { ...defaults };
  }
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    const minutes = Math.floor(input);
    return { minMinutes: minutes, maxMinutes: minutes };
  }
  if (typeof input === 'object') {
    const minCandidate = Math.floor(
      Number(input.min || input.minMinutes || input.minimumMinutes || 0)
    );
    const maxCandidate = Math.floor(
      Number(input.max || input.maxMinutes || input.maximumMinutes || 0)
    );
    const sanitizedMin =
      Number.isFinite(minCandidate) && minCandidate > 0
        ? minCandidate
        : defaults.minMinutes;
    const sanitizedMax =
      Number.isFinite(maxCandidate) && maxCandidate > 0
        ? maxCandidate
        : defaults.maxMinutes;
    if (sanitizedMin <= sanitizedMax) {
      return { minMinutes: sanitizedMin, maxMinutes: sanitizedMax };
    }
    return { minMinutes: sanitizedMax, maxMinutes: sanitizedMin };
  }
  return { ...defaults };
}

function buildRequestLifecycleUrl(template, ledgerEntry) {
  if (!template) return null;
  const reqId = ledgerEntry?.requestId || '';
  const mongoId = ledgerEntry?.mongoId || '';
  const encodedReqId = encodeURIComponent(reqId);
  const encodedMongoId = encodeURIComponent(mongoId);
  const placeholders = [
    '{requestId}',
    '{REQUEST_ID}',
    '{id}',
    ':requestID',
    ':requestId',
    ':id',
    '{requestObjectId}',
    '{REQUEST_OBJECT_ID}',
  ];
  let route = template;
  let replaced = false;
  for (const token of placeholders) {
    if (route.includes(token)) {
      if (token.toLowerCase().includes('object')) {
        if (mongoId) {
          route = route.replace(token, encodedMongoId);
          replaced = true;
        }
      } else {
        route = route.replace(token, encodedReqId);
        replaced = true;
      }
    }
  }
  if (!replaced) {
    const base = route.endsWith('/') ? route.slice(0, -1) : route;
    route = `${base}/${encodedReqId}`;
  }
  return route;
}

function normalizeNgoProfiles(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((ngo, index) => {
      if (!ngo || typeof ngo !== 'object') return null;
      const name = typeof ngo.name === 'string' ? ngo.name.trim() : '';
      const state = typeof ngo.state === 'string' ? ngo.state.trim() : null;
      const district =
        typeof ngo.district === 'string' ? ngo.district.trim() : null;
      const address =
        typeof ngo.address === 'string' ? ngo.address.trim() : null;
      const contact =
        ngo.contact && typeof ngo.contact === 'object'
          ? {
              person:
                typeof ngo.contact.person === 'string'
                  ? ngo.contact.person.trim()
                  : null,
              email:
                typeof ngo.contact.email === 'string'
                  ? ngo.contact.email.trim()
                  : null,
              phone:
                typeof ngo.contact.phone === 'string'
                  ? ngo.contact.phone.trim()
                  : null,
            }
          : { person: null, email: null, phone: null };
      const externalIdRaw =
        typeof ngo.ngoId === 'string' && ngo.ngoId.trim().length
          ? ngo.ngoId.trim()
          : name || `${state || 'state'}-${district || index}`;
      const mongoId = pseudoObjectId(`ngo:${externalIdRaw}`);
      return {
        raw: ngo,
        externalId: externalIdRaw,
        mongoId,
        name: name || `NGO ${index + 1}`,
        address,
        state,
        district,
        contact,
        stats: {
          pending: Number.isFinite(Number(ngo.pendingRequests))
            ? Number(ngo.pendingRequests)
            : 0,
          total: Number.isFinite(Number(ngo.totalRequests))
            ? Number(ngo.totalRequests)
            : 0,
        },
      };
    })
    .filter(Boolean);
}

function createAdhocRegions(filterList) {
  return filterList.map((value, index) => ({
    name: value,
    state: value,
    district: null,
    code: `filter-${index + 1}`,
    attributes: { synthetic: true, source: 'user-filter' },
  }));
}

async function synthesizeRegions(filterList) {
  const query = {};
  if (filterList.length) {
    query.$or = [
      { state: { $in: filterList } },
      { district: { $in: filterList } },
      { crop: { $in: filterList } },
    ];
  }

  const rows = await CropSeason.find(query)
    .sort({ state: 1, district: 1, crop: 1 })
    .limit(5000)
    .lean();

  const seen = new Set();
  const synthetic = [];
  for (const row of rows) {
    const state = row.state || null;
    const district = row.district || null;
    const key = `${state || ''}:${district || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const baseName = district || state || 'Region';
    const slugBase = [state, district]
      .filter(Boolean)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    const code = slugBase ? `synthetic-${slugBase}`.slice(0, 48) : null;

    synthetic.push({
      name: baseName,
      state,
      district,
      code,
      slug: slugBase || null,
      attributes: { synthetic: true, source: 'crop-season' },
    });

    if (synthetic.length >= 100) break;
  }

  return synthetic;
}

async function loadRegions(regionFilter) {
  const filterList = Array.isArray(regionFilter)
    ? regionFilter.filter(Boolean)
    : [];
  if (filterList.length) {
    const regions = await Region.find({
      $or: [
        { code: { $in: filterList } },
        { slug: { $in: filterList } },
        { name: { $in: filterList } },
      ],
    })
      .sort({ name: 1 })
      .lean();
    if (regions.length) return regions;
    const syntheticFromFilter = await synthesizeRegions(filterList);
    if (syntheticFromFilter.length) return syntheticFromFilter;
    const adhocFromFilter = createAdhocRegions(filterList);
    if (adhocFromFilter.length) return adhocFromFilter;
  }
  const fallback = await Region.find({}).sort({ name: 1 }).lean();
  if (fallback.length) return fallback;
  const syntheticAll = await synthesizeRegions([]);
  if (syntheticAll.length) return syntheticAll;
  const defaultRegions = createAdhocRegions([
    'Andhra Pradesh',
    'Bihar',
    'Gujarat',
    'Karnataka',
    'Maharashtra',
    'Uttar Pradesh',
  ]);
  if (defaultRegions.length) return defaultRegions;
  throw new Error('No regions available for simulation');
}

async function loadWarehouses(regions) {
  const regionCodes = regions.map((r) => r.code).filter(Boolean);
  let warehouses = [];
  if (regionCodes.length) {
    warehouses = await Warehouse.find({ regionCode: { $in: regionCodes } })
      .sort({ name: 1 })
      .lean();
  }
  if (warehouses.length) return warehouses;
  const fallback = await Warehouse.find({}).sort({ name: 1 }).lean();
  return fallback;
}

function createEventId(key) {
  return createHash('sha1').update(key).digest('hex');
}

function pseudoObjectId(seed) {
  return createHash('sha1').update(String(seed)).digest('hex').slice(0, 24);
}

function toPointCoordinates(source) {
  const coords = extractCoordinates(source);
  if (
    coords &&
    typeof coords.lon === 'number' &&
    typeof coords.lat === 'number'
  ) {
    return [Number(coords.lon.toFixed(6)), Number(coords.lat.toFixed(6))];
  }
  return [0, 0];
}

function nodeToEmittedFrom(node) {
  const coords = extractCoordinates(node);
  return {
    nodeId: node.nodeId || null,
    type: node.type || null,
    name: node.name || null,
    state: node.state || null,
    district: node.district || null,
    location: coords
      ? {
          lat: Number(coords.lat.toFixed(6)),
          lon: Number(coords.lon.toFixed(6)),
        }
      : null,
  };
}

function deriveEventTimestamp(runtime, tickTimestamp, _eventIndex, timeRng) {
  const tickTimeMs =
    tickTimestamp instanceof Date && !Number.isNaN(tickTimestamp.getTime())
      ? tickTimestamp.getTime()
      : Date.now();
  const previous =
    runtime.lastEventTimestamp instanceof Date
      ? new Date(runtime.lastEventTimestamp.getTime())
      : null;
  const timeAdvance = runtime.timeAdvance || normalizeTimeAdvance();
  const minMinutes = Math.max(
    Number(timeAdvance.minMinutes) || DEFAULT_TIME_ADVANCE_MIN_MINUTES,
    1
  );
  const maxMinutesCandidate = Math.max(
    Number(timeAdvance.maxMinutes) || minMinutes,
    minMinutes
  );
  const minMs = minMinutes * 60000;
  const maxMs = maxMinutesCandidate * 60000;

  let nextMs;
  if (!previous) {
    const baseMs =
      runtime.simulatedCursor instanceof Date &&
      !Number.isNaN(runtime.simulatedCursor.getTime())
        ? runtime.simulatedCursor.getTime()
        : tickTimeMs;
    nextMs = Math.max(baseMs, tickTimeMs);
  } else {
    const span = Math.max(0, maxMs - minMs);
    const randomOffset =
      span > 0
        ? Math.floor((timeRng ? timeRng() : Math.random()) * (span + 1))
        : 0;
    const candidate = previous.getTime() + minMs + randomOffset;
    nextMs = Math.max(candidate, tickTimeMs);
  }

  const next = new Date(nextMs);
  runtime.previousEventTimestamp = previous;
  runtime.lastEventTimestamp = next;
  return { previous, next };
}

function parseCropYear(sourceFile, fallbackDate) {
  if (typeof sourceFile === 'string') {
    const match = sourceFile.match(/(19|20)\d{2}/);
    if (match) return Number(match[0]);
  }
  return fallbackDate.getUTCFullYear();
}

function isInSeason(entry, month) {
  const sowStart =
    entry.season_sowing_start_month || entry.season_harvest_start_month;
  const harvestEnd =
    entry.season_harvest_end_month || entry.season_harvest_start_month;
  if (!sowStart || !harvestEnd) return true;
  if (sowStart <= harvestEnd) return month >= sowStart && month <= harvestEnd;
  return month >= sowStart || month <= harvestEnd;
}

function resolveRegionForShipment(runtime, rng) {
  const available = runtime.farmInventory.filter(
    (item) => item.availableTonnes > 0
  );
  if (!available.length) return null;
  const index = Math.floor(rng() * available.length);
  return available[index];
}

function resolveWarehouse(runtime, regionEntry, rng) {
  if (!runtime.warehouses.length) return { warehouse: null, distanceKm: null };
  const sourceCoords = extractCoordinates(regionEntry.region || regionEntry);
  let selected = null;
  let minDistance = Number.POSITIVE_INFINITY;
  if (sourceCoords) {
    for (const warehouse of runtime.warehouses) {
      const coords = extractCoordinates(warehouse);
      if (!coords) continue;
      const distance = haversineDistanceKm(sourceCoords, coords);
      if (distance === null) continue;
      if (distance < minDistance) {
        minDistance = distance;
        selected = warehouse;
      }
    }
  }
  if (selected) return { warehouse: selected, distanceKm: minDistance };
  const index = Math.floor(rng() * runtime.warehouses.length);
  return { warehouse: runtime.warehouses[index], distanceKm: null };
}

async function fetchCropEntries(runtime, region) {
  const cacheKey = region._id
    ? region._id.toString()
    : `${region.state || ''}:${region.district || ''}:${region.name || ''}`;
  if (runtime.cropCache.has(cacheKey)) return runtime.cropCache.get(cacheKey);
  const query = {};
  if (region.state) query.state = region.state;
  if (region.district) query.district = region.district;
  const entries = await CropSeason.find(query)
    .sort({ district: 1, crop: 1, source_file: 1 })
    .limit(500)
    .lean();
  runtime.cropCache.set(cacheKey, entries);
  return entries;
}

function buildFarmPayload(
  runtime,
  region,
  cropEntry,
  producedTonnes,
  eventTimestamp,
  eventId,
  previousTimestamp
) {
  const quantityKg = Number((producedTonnes * 1000).toFixed(2));
  const regionCode = region.code || region.slug || region.name || eventId;
  const nodeObjectId = pseudoObjectId(`farm-node:${regionCode}`);
  const cropName = cropEntry
    ? cropEntry.crop || 'Mixed Produce'
    : 'Mixed Produce';
  const point = toPointCoordinates(region);
  const batchId = `batch-${eventId.slice(0, 24)}`;
  const coords = extractCoordinates(region);
  const emittedFrom = {
    nodeId: regionCode,
    type: 'farm',
    name: region.name || region.district || region.state || regionCode,
    state: region.state || null,
    district: region.district || null,
    location:
      coords && typeof coords.lat === 'number' && typeof coords.lon === 'number'
        ? {
            lat: Number(coords.lat.toFixed(6)),
            lon: Number(coords.lon.toFixed(6)),
          }
        : null,
  };
  const eventIso = eventTimestamp.toISOString();
  const previousIso =
    previousTimestamp instanceof Date &&
    !Number.isNaN(previousTimestamp.getTime())
      ? previousTimestamp.toISOString()
      : null;
  const batch = {
    parentBatchId: null,
    foodType: cropName,
    quantity_kg: quantityKg,
    original_quantity_kg: quantityKg,
    originNode: nodeObjectId,
    currentNode: nodeObjectId,
    status: 'stored',
    shelf_life_hours: cropEntry
      ? (cropEntry.season_growth_months || 4) * 30 * 24
      : 90 * 24,
    manufacture_date: eventIso,
    expiry_iso: cropEntry
      ? new Date(
          eventTimestamp.getTime() +
            (cropEntry.season_growth_months || 6) * 30 * 24 * 3600000
        ).toISOString()
      : null,
    initial_temp_c: 18 + Math.random() * 6,
    freshnessPct: 100,
    history: [
      {
        time: eventIso,
        action: 'harvested',
        from: null,
        to: nodeObjectId,
        note: `Harvest batch for ${regionCode}`,
      },
    ],
    metadata: {
      scenarioId: runtime.scenario._id.toString(),
      tickIndex: runtime.tickIndex,
    },
    dateOfCreation_iso: eventIso,
    dateOfCreation: eventIso,
    createdAt_iso: eventIso,
    createdAt: eventIso,
  };
  const payload = {
    eventId,
    scenarioId: runtime.scenario._id.toString(),
    tickIndex: runtime.tickIndex,
    emittedFrom,
    region: {
      id: region._id ? region._id.toString() : null,
      name: region.name || null,
      state: region.state || null,
      district: region.district || null,
      code: region.code || null,
    },
    crop: {
      name: cropName,
      season: cropEntry ? cropEntry.season || null : null,
      year: parseCropYear(
        cropEntry ? cropEntry.source_file : null,
        eventTimestamp
      ),
      sowingWindow: {
        startMonth: cropEntry
          ? cropEntry.season_sowing_start_month || null
          : null,
        endMonth: cropEntry ? cropEntry.season_sowing_end_month || null : null,
      },
      harvestWindow: {
        startMonth: cropEntry
          ? cropEntry.season_harvest_start_month || null
          : null,
        endMonth: cropEntry ? cropEntry.season_harvest_end_month || null : null,
      },
    },
    quantity_kg: quantityKg,
    quantity_tonnes: Number(producedTonnes.toFixed(2)),
    metrics: {
      area_hectare: cropEntry ? cropEntry.area_hectare || null : null,
      yield_tonha: cropEntry ? cropEntry.yield_tonha || null : null,
      production_tonnes: cropEntry ? cropEntry.production_tonnes || null : null,
    },
    generatedAt_iso: eventIso,
    generatedAt: eventIso,
    createdAt_iso: eventIso,
    createdAt: eventIso,
    batch,
  };
  if (previousIso) {
    payload.previousEvent_iso = previousIso;
    payload.previousEvent = previousIso;
  }

  return {
    event: {
      time: eventIso,
      type: 'farm_production',
      location: { type: 'Point', coordinates: point },
      payload,
    },
    batchId,
  };
}

function createRequestItems(rng) {
  const catalog = [
    { foodType: 'cereals', min: 350, max: 1200 },
    { foodType: 'pulses', min: 200, max: 800 },
    { foodType: 'oil', min: 150, max: 600 },
    { foodType: 'vegetables', min: 250, max: 900 },
    { foodType: 'fertilizer', min: 300, max: 900 },
    { foodType: 'seeds', min: 100, max: 400 },
    { foodType: 'logistics', min: 1, max: 3 },
  ];
  const desired = Math.max(1, Math.floor(rng() * 3) + 1);
  const items = [];
  const used = new Set();
  while (items.length < desired && used.size < catalog.length) {
    const index = Math.floor(rng() * catalog.length);
    if (used.has(index)) continue;
    used.add(index);
    const entry = catalog[index];
    const required = entry.min + rng() * (entry.max - entry.min);
    const rounded =
      entry.foodType === 'logistics'
        ? Number(required.toFixed(0))
        : Number(required.toFixed(2));
    items.push({ foodType: entry.foodType, required_kg: rounded });
  }
  return items;
}

function chooseFulfillmentCandidate(runtime, rng) {
  const candidates = [];
  if (runtime.warehouseNodes.length) candidates.push(...runtime.warehouseNodes);
  if (runtime.warehouses.length) candidates.push(...runtime.warehouses);
  if (runtime.farmNodes.length) candidates.push(...runtime.farmNodes);
  if (!candidates.length) return null;
  const index = Math.floor(rng() * candidates.length);
  return candidates[index];
}

async function createFarmEvent(
  runtime,
  rng,
  eventKey,
  eventTimestamp,
  previousTimestamp
) {
  // Node-driven mode (preferred): generate directly from farm nodes
  if (runtime.nodeMode) {
    if (!runtime.farmNodes.length) return null;
    const node =
      runtime.farmNodes[Math.floor(rng() * runtime.farmNodes.length)];
    const quantityTonnes = Number((10 + rng() * 90).toFixed(2));
    const eventId = createEventId(eventKey);
    const quantityKg = Number((quantityTonnes * 1000).toFixed(2));
    const point = toPointCoordinates(node);
    const batchId = `batch-${eventId.slice(0, 24)}`;
    const emittedFrom = nodeToEmittedFrom(node);
    const eventIso = eventTimestamp.toISOString();
    const previousIso =
      previousTimestamp instanceof Date &&
      !Number.isNaN(previousTimestamp.getTime())
        ? previousTimestamp.toISOString()
        : null;
    const batchPayload = {
      parentBatchId: null,
      foodType: 'Mixed Produce',
      quantity_kg: quantityKg,
      original_quantity_kg: quantityKg,
      originNode: node.nodeId || null,
      currentNode: node.nodeId || null,
      status: 'stored',
      shelf_life_hours: 90 * 24,
      manufacture_date: eventIso,
      expiry_iso: null,
      initial_temp_c: 20,
      freshnessPct: 100,
      history: [
        {
          time: eventIso,
          action: 'harvested',
          from: null,
          to: node.nodeId || null,
          note: `Harvest batch for ${node.nodeId || 'farm-node'}`,
        },
      ],
      metadata: {
        scenarioId: runtime.scenario._id.toString(),
        tickIndex: runtime.tickIndex,
      },
      dateOfCreation_iso: eventIso,
      dateOfCreation: eventIso,
      createdAt_iso: eventIso,
      createdAt: eventIso,
    };
    const payload = {
      eventId,
      scenarioId: runtime.scenario._id.toString(),
      tickIndex: runtime.tickIndex,
      emittedFrom,
      node: emittedFrom,
      quantity_kg: quantityKg,
      quantity_tonnes: quantityTonnes,
      generatedAt_iso: eventIso,
      generatedAt: eventIso,
      createdAt_iso: eventIso,
      createdAt: eventIso,
      batch: batchPayload,
    };
    if (previousIso) {
      payload.previousEvent_iso = previousIso;
      payload.previousEvent = previousIso;
    }
    const apiPayload = {
      time: eventIso,
      type: 'farm_production',
      location: { type: 'Point', coordinates: point },
      payload,
    };
    runtime.farmInventory.push({
      eventId,
      node,
      availableTonnes: quantityTonnes,
      batchId,
      timestamp: eventTimestamp,
      speedKmph: 0,
      travelHours: 0,
    });
    return {
      type: 'farm',
      timestamp: eventTimestamp,
      record: {
        scenarioId: runtime.scenario._id,
        type: 'farm',
        payload: apiPayload,
        tickIndex: runtime.tickIndex,
        timestamp: eventTimestamp,
      },
      apiRequest: {
        url: `${MAIN_API_URL}${MAIN_API_ROUTES.farm}`,
        body: apiPayload,
      },
    };
  }

  if (!runtime.regions.length) return null;
  const regionIndex = Math.floor(rng() * runtime.regions.length);
  const region = runtime.regions[regionIndex];
  const entries = await fetchCropEntries(runtime, region);
  const month = eventTimestamp.getUTCMonth() + 1;
  const inSeason = entries.filter((entry) => isInSeason(entry, month));
  const pool = inSeason.length ? inSeason : entries;
  const cropEntry = pool.length ? pool[Math.floor(rng() * pool.length)] : null;
  const baseProduction =
    cropEntry && cropEntry.area_hectare && cropEntry.yield_tonha
      ? cropEntry.area_hectare * cropEntry.yield_tonha
      : 0;
  const scale = 0.85 + rng() * 0.3;
  const fallback = 40 + rng() * 120;
  const producedTonnes = baseProduction > 0 ? baseProduction * scale : fallback;
  const eventId = createEventId(eventKey);
  const { event: farmEvent, batchId } = buildFarmPayload(
    runtime,
    region,
    cropEntry,
    producedTonnes,
    eventTimestamp,
    eventId,
    previousTimestamp
  );
  runtime.farmInventory.push({
    eventId,
    region,
    crop: cropEntry ? cropEntry.crop || null : null,
    season: cropEntry ? cropEntry.season || null : null,
    availableTonnes: Number(producedTonnes.toFixed(2)),
    batchId,
    timestamp: eventTimestamp,
  });
  return {
    type: 'farm',
    timestamp: eventTimestamp,
    record: {
      scenarioId: runtime.scenario._id,
      type: 'farm',
      payload: farmEvent,
      tickIndex: runtime.tickIndex,
      timestamp: eventTimestamp,
    },
    apiRequest: {
      url: `${MAIN_API_URL}${MAIN_API_ROUTES.farm}`,
      body: farmEvent,
    },
  };
}

function regionToRequesterDetails(region) {
  const point = toPointCoordinates(region);
  const [lon, lat] = Array.isArray(point) ? point : [null, null];
  return {
    nodeId: null,
    type: 'region',
    name: region.name || region.district || region.state || 'Region',
    state: region.state || null,
    district: region.district || null,
    location:
      lat !== null && lon !== null
        ? { lat: Number(lat), lon: Number(lon) }
        : null,
  };
}

function createRequestAcceptanceEvent(runtime, ledgerEntry) {
  if (!ledgerEntry) return null;
  const acceptanceTimestamp = ledgerEntry.acceptAt || new Date();
  const daysOpen = Math.max(
    0,
    Math.round(
      (acceptanceTimestamp.getTime() - ledgerEntry.createdOn.getTime()) /
        86400000
    )
  );
  ledgerEntry.approvedOn = acceptanceTimestamp;
  ledgerEntry.status = 'approved';
  ledgerEntry.acceptAt = null;
  ledgerEntry.acceptedAt = acceptanceTimestamp;
  ledgerEntry.history = [
    ...ledgerEntry.history,
    {
      time: acceptanceTimestamp.toISOString(),
      action: 'approved',
      note: `Request approved after ${daysOpen} day(s)`,
    },
  ];
  runtime.requestLedger.set(ledgerEntry.requestId, ledgerEntry);

  const payload = {
    status: 'approved',
    approvedOn: acceptanceTimestamp.toISOString(),
  };

  const metadata = {
    scenarioId: runtime.scenario._id.toString(),
    tickIndex: runtime.tickIndex,
    requester: ledgerEntry.requesterDetails,
    fulfilledBy: ledgerEntry.fulfilledByDetails || null,
    daysOpen,
  };

  const urlPath = buildRequestLifecycleUrl(
    MAIN_API_ROUTES.requestApproveTemplate,
    ledgerEntry
  );
  if (!urlPath) {
    console.warn(
      `[SCENARIO] Failed to build approval URL for requestId ${ledgerEntry.requestId}`
    );
    return null;
  }

  console.log(
    `[SCENARIO] Creating approval event for ${
      ledgerEntry.requestId
    } (mongoId: ${ledgerEntry.mongoId || 'unknown'})`
  );

  const recordPayload = {
    requestId: ledgerEntry.requestId,
    ...payload,
    history: [...ledgerEntry.history],
    metadata,
  };

  return {
    type: 'requestApproved',
    timestamp: acceptanceTimestamp,
    record: {
      scenarioId: runtime.scenario._id,
      type: 'requestApproved',
      payload: recordPayload,
      tickIndex: runtime.tickIndex,
      timestamp: acceptanceTimestamp,
    },
    apiRequest: {
      url: `${MAIN_API_URL}${urlPath}`,
      body: payload,
      method: urlPath.includes('/status') ? 'PATCH' : 'POST',
    },
  };
}

function createRequestFulfilledEvent(runtime, ledgerEntry) {
  if (!ledgerEntry || !ledgerEntry.fulfillAt) return null;
  const fulfillmentTimestamp = ledgerEntry.fulfillAt;
  const hoursOpen = Math.max(
    0,
    Math.round(
      (fulfillmentTimestamp.getTime() - ledgerEntry.createdOn.getTime()) /
        3600000
    )
  );
  ledgerEntry.status = 'fulfilled';
  ledgerEntry.fulfilledOn = fulfillmentTimestamp;
  ledgerEntry.fulfillAt = null;
  ledgerEntry.history = [
    ...ledgerEntry.history,
    {
      time: fulfillmentTimestamp.toISOString(),
      action: 'fulfilled',
      note:
        `Request fulfilled after ${hoursOpen} hour(s)` +
        (ledgerEntry.fulfilledByDetails && ledgerEntry.fulfilledByDetails.name
          ? ` by ${ledgerEntry.fulfilledByDetails.name}`
          : ''),
    },
  ];
  runtime.requestLedger.set(ledgerEntry.requestId, ledgerEntry);

  const payload = {
    status: 'fulfilled',
    fulfilledBy: ledgerEntry.fulfilledBy || null,
    approvedOn: (ledgerEntry.approvedOn || fulfillmentTimestamp).toISOString(),
    fullFilledOn: fulfillmentTimestamp.toISOString(),
  };

  const metadata = {
    scenarioId: runtime.scenario._id.toString(),
    tickIndex: runtime.tickIndex,
    requester: ledgerEntry.requesterDetails,
    fulfilledBy: ledgerEntry.fulfilledByDetails || null,
    approvedOn: ledgerEntry.approvedOn
      ? ledgerEntry.approvedOn.toISOString()
      : null,
    fulfilledOn: fulfillmentTimestamp.toISOString(),
    hoursOpen,
  };

  const urlPath = buildRequestLifecycleUrl(
    MAIN_API_ROUTES.requestFulfillTemplate,
    ledgerEntry
  );
  if (!urlPath) {
    console.warn(
      `[SCENARIO] Failed to build fulfillment URL for requestId ${ledgerEntry.requestId}`
    );
    return null;
  }

  console.log(
    `[SCENARIO] Creating fulfillment event for ${
      ledgerEntry.requestId
    } (mongoId: ${ledgerEntry.mongoId || 'unknown'})`
  );

  const recordPayload = {
    requestId: ledgerEntry.requestId,
    ...payload,
    history: [...ledgerEntry.history],
    metadata,
  };

  return {
    type: 'requestFulfilled',
    timestamp: fulfillmentTimestamp,
    record: {
      scenarioId: runtime.scenario._id,
      type: 'requestFulfilled',
      payload: recordPayload,
      tickIndex: runtime.tickIndex,
      timestamp: fulfillmentTimestamp,
    },
    apiRequest: {
      url: `${MAIN_API_URL}${urlPath}`,
      body: payload,
      method: urlPath.includes('/status') ? 'PATCH' : 'POST',
    },
  };
}

function createRequestEvent(
  runtime,
  rng,
  eventKey,
  eventTimestamp,
  previousTimestamp
) {
  const requestKey = createEventId(`${eventKey}:request`);
  const requestId = `REQ-${requestKey.slice(0, 12).toUpperCase()}`; // stable id reused across approval/fulfilment
  const items = createRequestItems(rng);
  const previousIso =
    previousTimestamp instanceof Date &&
    !Number.isNaN(previousTimestamp.getTime())
      ? previousTimestamp.toISOString()
      : null;

  let requesterNodeId;
  let requesterDetails;

  // Try NGO nodes first if in node mode
  if (runtime.nodeMode && runtime.ngoNodes.length > 0) {
    const node = runtime.ngoNodes[Math.floor(rng() * runtime.ngoNodes.length)];
    requesterDetails = nodeToEmittedFrom(node);
    const candidate =
      (node.mongoId && node.mongoId.toString()) ||
      (node._id && node._id.toString && node._id.toString()) ||
      node.nodeId ||
      requesterDetails.nodeId ||
      requestId;
    const candidateStr = String(candidate);
    const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(candidateStr);
    requesterNodeId = looksLikeObjectId
      ? candidateStr
      : pseudoObjectId(`node:${candidateStr}`);
  }
  // Fall back to regions if no NGO nodes available OR not in node mode
  else if (runtime.regions && runtime.regions.length > 0) {
    const region = runtime.regions[Math.floor(rng() * runtime.regions.length)];
    requesterDetails = regionToRequesterDetails(region);
    requesterNodeId = pseudoObjectId(
      `region:${region.code || region.district || region.name || requestId}`
    );
  }
  // No requesters available at all
  else {
    console.log(
      `[SCENARIO]   └─ ERROR: No requesters available (ngoNodes: ${
        runtime.ngoNodes?.length || 0
      }, regions: ${runtime.regions?.length || 0})`
    );
    return null;
  }

  const createdOn = eventTimestamp;
  const requiredBefore = new Date(
    eventTimestamp.getTime() + (2 + Math.floor(rng() * 5)) * 86400000
  );
  const history = [
    {
      time: createdOn.toISOString(),
      action: 'created',
      note: `Scenario ${runtime.scenario.name} request created`,
    },
  ];

  const apiPayload = {
    requestId,
    requesterNode: requesterNodeId,
    items,
    createdOn: createdOn.toISOString(),
    requiredBefore: requiredBefore.toISOString(),
    status: 'pending',
  };

  const recordPayload = {
    ...apiPayload,
    fulfilledBy: null,
    history,
    metadata: {
      scenarioId: runtime.scenario._id.toString(),
      tickIndex: runtime.tickIndex,
      requester: requesterDetails,
    },
  };
  if (previousIso) {
    recordPayload.metadata.previousEvent_iso = previousIso;
    recordPayload.metadata.previousEvent = previousIso;
  }

  const ledgerEntry = {
    requestId,
    requesterNode: requesterNodeId,
    requesterDetails,
    createdOn,
    requiredBefore,
    items,
    history: [...history],
    status: 'pending',
    acceptAt: null,
    fulfillAt: null,
    fulfilledBy: null,
    fulfilledByDetails: null,
    approvedOn: null,
  };

  const acceptanceChance = 0.65;
  runtime.requestLedger.set(requestId, ledgerEntry);
  runtime.openRequests.set(requestId, ledgerEntry);

  console.log(
    `[SCENARIO] Creating request event: ${requestId} (requester: ${requesterNodeId.slice(
      0,
      8
    )}...)`
  );

  if (rng() < acceptanceChance) {
    const minDays = 1;
    const maxDays = 6;
    const dayOffset = minDays + Math.floor(rng() * (maxDays - minDays + 1));
    const acceptAt = new Date(eventTimestamp.getTime() + dayOffset * 86400000);
    ledgerEntry.acceptAt = acceptAt;
    console.log(
      `[SCENARIO]   └─ Will approve in ${dayOffset} days (at ${acceptAt.toISOString()})`
    );
    const fulfillChance = 0.7;
    if (rng() < fulfillChance) {
      const fulfillCandidate = chooseFulfillmentCandidate(runtime, rng);
      if (fulfillCandidate) {
        const minHours = 4;
        const maxHours = 48;
        const hourOffset = minHours + rng() * (maxHours - minHours);
        const fulfillAt = new Date(acceptAt.getTime() + hourOffset * 3600000);
        const coords = extractCoordinates(fulfillCandidate);
        const hasCoords =
          coords &&
          typeof coords.lat === 'number' &&
          typeof coords.lon === 'number';
        if (fulfillCandidate.nodeId) {
          ledgerEntry.fulfilledBy = pseudoObjectId(
            `node:${fulfillCandidate.nodeId}`
          );
          ledgerEntry.fulfilledByDetails = nodeToEmittedFrom(fulfillCandidate);
        } else {
          ledgerEntry.fulfilledBy = pseudoObjectId(
            `warehouse:${
              fulfillCandidate.code || fulfillCandidate.name || requestId
            }`
          );
          ledgerEntry.fulfilledByDetails = {
            nodeId: fulfillCandidate.code || fulfillCandidate.name || null,
            type: fulfillCandidate.type || 'warehouse',
            name: fulfillCandidate.name || null,
            state: fulfillCandidate.state || null,
            district: fulfillCandidate.district || null,
            location: hasCoords
              ? {
                  lat: Number(coords.lat.toFixed(6)),
                  lon: Number(coords.lon.toFixed(6)),
                }
              : null,
          };
        }
        ledgerEntry.fulfillAt = fulfillAt;
        console.log(
          `[SCENARIO]   └─ Will fulfill ~${Math.round(
            hourOffset
          )} hours after approval (at ${fulfillAt.toISOString()})`
        );
      }
    }
    runtime.pendingApprovals.push(ledgerEntry);
  } else {
    console.log(`[SCENARIO]   └─ Will NOT be approved (random chance)`);
  }

  return {
    type: 'request',
    timestamp: eventTimestamp,
    record: {
      scenarioId: runtime.scenario._id,
      type: 'request',
      payload: recordPayload,
      tickIndex: runtime.tickIndex,
      timestamp: eventTimestamp,
    },
    apiRequest: {
      url: `${MAIN_API_URL}${MAIN_API_ROUTES.requestCreate}`,
      body: apiPayload,
    },
  };
}

function collectRequestLifecycleEvents(runtime, tickTimestamp) {
  const ready = [];

  if (runtime.pendingApprovals.length) {
    console.log(
      `[SCENARIO] Checking ${
        runtime.pendingApprovals.length
      } pending approval(s) at ${tickTimestamp.toISOString()}`
    );
    const waitingApprovals = [];
    for (const entry of runtime.pendingApprovals) {
      if (entry.acceptAt && entry.acceptAt <= tickTimestamp) {
        console.log(
          `[SCENARIO]   ✓ Approval ready for ${
            entry.requestId
          } (scheduled: ${entry.acceptAt.toISOString()})`
        );
        const approvalEvent = createRequestAcceptanceEvent(runtime, entry);
        if (approvalEvent) ready.push(approvalEvent);
        runtime.openRequests.delete(entry.requestId);
        if (entry.fulfillAt) {
          runtime.pendingFulfillments.push(entry);
        }
      } else {
        waitingApprovals.push(entry);
      }
    }
    runtime.pendingApprovals = waitingApprovals;
  }

  if (runtime.pendingFulfillments.length) {
    console.log(
      `[SCENARIO] Checking ${
        runtime.pendingFulfillments.length
      } pending fulfillment(s) at ${tickTimestamp.toISOString()}`
    );
    const waitingFulfillments = [];
    for (const entry of runtime.pendingFulfillments) {
      if (entry.fulfillAt && entry.fulfillAt <= tickTimestamp) {
        console.log(
          `[SCENARIO]   ✓ Fulfillment ready for ${
            entry.requestId
          } (scheduled: ${entry.fulfillAt.toISOString()})`
        );
        const fulfillmentEvent = createRequestFulfilledEvent(runtime, entry);
        if (fulfillmentEvent) ready.push(fulfillmentEvent);
      } else {
        waitingFulfillments.push(entry);
      }
    }
    runtime.pendingFulfillments = waitingFulfillments;
  }

  if (ready.length) {
    console.log(
      `[SCENARIO] Generated ${ready.length} lifecycle event(s): ${ready
        .map((e) => e.type)
        .join(', ')}`
    );
  }

  return ready;
}

async function generateEvents(runtime, tickTimestamp) {
  const events = [];
  const lifecycleEvents = collectRequestLifecycleEvents(runtime, tickTimestamp);
  if (lifecycleEvents.length) events.push(...lifecycleEvents);

  console.log(
    `[SCENARIO] Tick ${runtime.tickIndex}: Generating ${
      runtime.batchSize
    } new event(s) (probabilities: farm=${(
      runtime.probabilities.farm * 100
    ).toFixed(0)}%, request=${(runtime.probabilities.request * 100).toFixed(
      0
    )}%)`
  );

  const baseKey = `${runtime.scenario.seed}:${runtime.scenario._id}:${runtime.tickIndex}`;
  for (let i = 0; i < runtime.batchSize; i += 1) {
    const eventKey = `${baseKey}:${i}`;
    const rng = seedrandom(eventKey);
    const timeRng = seedrandom(`${eventKey}:time`);
    const { previous: previousTimestamp, next: eventTimestamp } =
      deriveEventTimestamp(runtime, tickTimestamp, i, timeRng);
    const roll = rng();
    let event;
    const farmThreshold = runtime.probabilities.farm || 0;
    const requestThreshold =
      farmThreshold + (runtime.probabilities.request || 0);

    console.log(
      `[SCENARIO]   Event ${i + 1}/${runtime.batchSize}: roll=${roll.toFixed(
        3
      )} (farm<${farmThreshold.toFixed(3)}, request<${requestThreshold.toFixed(
        3
      )})`
    );

    if (roll < farmThreshold) {
      console.log(`[SCENARIO]   └─ Generating farm event`);
      event = await createFarmEvent(
        runtime,
        rng,
        eventKey,
        eventTimestamp,
        previousTimestamp
      );
    } else {
      if (roll < requestThreshold) {
        console.log(`[SCENARIO]   └─ Generating request event`);
        event = createRequestEvent(
          runtime,
          rng,
          eventKey,
          eventTimestamp,
          previousTimestamp
        );
      }
      if (!event) {
        console.log(`[SCENARIO]   └─ Fallback to farm event`);
        event = await createFarmEvent(
          runtime,
          rng,
          `${eventKey}:fallback`,
          eventTimestamp,
          previousTimestamp
        );
      }
    }
    if (event) events.push(event);
  }

  const eventTypeCounts = {};
  events.forEach((e) => {
    eventTypeCounts[e.type] = (eventTypeCounts[e.type] || 0) + 1;
  });
  console.log(
    `[SCENARIO] Tick ${runtime.tickIndex} complete: ${
      events.length
    } total event(s) - ${Object.entries(eventTypeCounts)
      .map(([type, count]) => `${type}:${count}`)
      .join(', ')}`
  );

  return events;
}

async function postJson(url, body, method = 'POST') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAIN_API_TIMEOUT_MS);
  try {
    if (typeof fetch === 'function') {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let data = null;
      try {
        data = await response.clone().json();
      } catch (_) {
        try {
          data = await response.text();
        } catch (_) {
          data = null;
        }
      }
      if (!response.ok) {
        console.error('Main API error', response.status, data || '');
      }
      return { ok: response.ok, status: response.status, data };
    }

    const response = await axios({
      url,
      method,
      data: body,
      headers: { 'Content-Type': 'application/json' },
      timeout: MAIN_API_TIMEOUT_MS,
      signal: controller.signal,
      validateStatus: () => true,
    });

    const ok = response.status >= 200 && response.status < 300;
    if (!ok) {
      console.error('Main API error', response.status, response.data || '');
    }
    return { ok, status: response.status, data: response.data };
  } catch (err) {
    const status =
      err.response && err.response.status ? err.response.status : 0;
    const data = err.response && err.response.data ? err.response.data : null;
    const aborted =
      err.name === 'AbortError' ||
      err.code === 'ABORT_ERR' ||
      err.code === 'ERR_CANCELED';
    const message = aborted ? 'Request aborted' : err.message;
    console.error('Main API error', message, status || '');
    return { ok: false, status, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function dispatchEvents(events, runtime) {
  if (!events.length) return;
  for (const event of events) {
    const method = event.apiRequest.method || 'POST';
    console.log(
      `[SCENARIO] ${method} ${event.apiRequest.url} (type: ${event.type})`
    );
    const res = await postJson(
      event.apiRequest.url,
      event.apiRequest.body,
      method
    );
    if (res.ok) {
      console.log(`[SCENARIO] ✓ ${event.type} succeeded (${res.status})`);
    } else {
      console.error(
        `[SCENARIO] ✗ ${event.type} failed (${res.status}):`,
        res.data || ''
      );
    }
    if (event.type === 'request' && res && res.ok) {
      try {
        const body = res.data;
        const created =
          (body && body.data) || (body && body.request) || body || null;
        const mongoId =
          (created && created._id) ||
          (created && created.data && created.data._id) ||
          null;
        const requestId =
          event.apiRequest.body && event.apiRequest.body.requestId;
        if (mongoId && requestId && runtime && runtime.requestLedger) {
          const entry = runtime.requestLedger.get(requestId);
          if (entry) {
            entry.mongoId = String(mongoId);
            console.log(
              `[SCENARIO] Captured mongoId ${mongoId} for requestId ${requestId}`
            );
          }
        } else if (requestId) {
          console.warn(
            `[SCENARIO] Failed to capture mongoId for requestId ${requestId}:`,
            {
              mongoId,
              hasRuntime: !!runtime,
              hasLedger: !!runtime?.requestLedger,
            }
          );
        }
      } catch (err) {
        console.error('[SCENARIO] Error capturing mongoId:', err.message);
      }
    }
  }
}

async function persistEvents(events) {
  if (!events.length) return;
  const docs = events.map((event) => ({
    scenarioId: event.record.scenarioId,
    type: event.record.type,
    payload: event.record.payload,
    tickIndex: event.record.tickIndex,
    timestamp: event.record.timestamp,
  }));
  await SimEvent.insertMany(docs, { ordered: false });
}

function scheduleNext(runtime) {
  if (!runtime.active) return;
  runtime.timer = setTimeout(async () => {
    try {
      if (!runtime.active) return;
      if (
        runtime.durationMs &&
        Date.now() - runtime.startedAt >= runtime.durationMs
      ) {
        await runtime.stop(true);
        return;
      }
      const baseCursor =
        runtime.simulatedCursor instanceof Date &&
        !Number.isNaN(runtime.simulatedCursor.getTime())
          ? runtime.simulatedCursor
          : new Date(
              runtime.scenario.startDate.getTime() +
                runtime.tickIndex * runtime.intervalMs
            );
      const tickTimestamp = new Date(baseCursor.getTime());
      const events = await generateEvents(runtime, tickTimestamp);
      if (events.length) {
        const latestEvent = events.reduce((latest, event) => {
          if (event && event.timestamp instanceof Date) {
            if (!latest || event.timestamp.getTime() > latest.getTime()) {
              return event.timestamp;
            }
          }
          return latest;
        }, null);
        await persistEvents(events);
        await Scenario.updateOne(
          { _id: runtime.scenario._id },
          { $inc: { 'stats.totalEventsSent': events.length } }
        );
        runtime.sentEvents += events.length;
        await dispatchEvents(events, runtime);
        const currentCursorMs = baseCursor.getTime();
        const latestMs = latestEvent
          ? Math.max(latestEvent.getTime(), currentCursorMs)
          : currentCursorMs;
        runtime.simulatedCursor = new Date(latestMs);
      } else {
        const minAdvanceMinutes = Math.max(
          runtime.timeAdvance?.minMinutes || DEFAULT_TIME_ADVANCE_MIN_MINUTES,
          1
        );
        const advanceMs = minAdvanceMinutes * 60000;
        runtime.simulatedCursor = new Date(baseCursor.getTime() + advanceMs);
      }
      runtime.tickIndex += 1;
      scheduleNext(runtime);
    } catch (err) {
      console.error('Scenario tick error', err.message);
      runtime.active = false;
      if (runtime.timer) clearTimeout(runtime.timer);
      await Scenario.updateOne(
        { _id: runtime.scenario._id },
        { status: 'stopped' }
      );
      activeScenarios.delete(runtime.scenario._id.toString());
    }
  }, runtime.intervalMs);
}

function createRuntime(scenario, options) {
  const timeAdvance = options.timeAdvance || normalizeTimeAdvance();
  const runtime = {
    scenario,
    batchSize: options.batchSize,
    intervalMs: options.intervalMs,
    probabilities: options.probabilities,
    durationMs: options.durationMs,
    regionFilter: options.regionFilter,
    nodes: Array.isArray(options.nodes) ? options.nodes : [],
    nodeMode: Array.isArray(options.nodes) && options.nodes.length > 0,
    ngoProfiles: normalizeNgoProfiles(options.ngos),
    timeAdvance,
    active: false,
    timer: null,
    tickIndex: 0,
    startedAt: null,
    simulatedCursor: new Date(scenario.startDate.getTime()),
    lastEventTimestamp: null,
    previousEventTimestamp: null,
    regions: [],
    warehouses: [],
    warehouseNodes: [],
    farmNodes: [],
    ngoNodes: [],
    farmInventory: [],
    pendingApprovals: [],
    pendingFulfillments: [],
    requestLedger: new Map(),
    openRequests: new Map(),
    cropCache: new Map(),
    sentEvents: 0,
    stop: async (updateStatus) => {
      if (runtime.timer) {
        clearTimeout(runtime.timer);
        runtime.timer = null;
      }
      runtime.active = false;
      runtime.pendingApprovals = [];
      runtime.pendingFulfillments = [];
      runtime.requestLedger.clear();
      runtime.openRequests.clear();
      runtime.farmInventory = [];
      runtime.lastEventTimestamp = null;
      runtime.previousEventTimestamp = null;
      runtime.simulatedCursor = new Date(runtime.scenario.startDate.getTime());
      activeScenarios.delete(runtime.scenario._id.toString());
      if (updateStatus) {
        await Scenario.updateOne(
          { _id: runtime.scenario._id },
          { status: 'stopped' }
        );
      }
    },
  };

  runtime.start = async () => {
    console.log(`[SCENARIO] ═══════════════════════════════════════════════`);
    console.log(`[SCENARIO] Starting scenario: ${runtime.scenario.name}`);
    console.log(`[SCENARIO] Seed: ${runtime.scenario.seed}`);
    console.log(
      `[SCENARIO] Mode: ${runtime.nodeMode ? 'node-driven' : 'region-based'}`
    );
    console.log(`[SCENARIO] Batch size: ${runtime.batchSize} events per tick`);
    console.log(`[SCENARIO] Interval: ${runtime.intervalMs}ms between ticks`);
    console.log(
      `[SCENARIO] Probabilities: farm=${(
        runtime.probabilities.farm * 100
      ).toFixed(0)}%, request=${(runtime.probabilities.request * 100).toFixed(
        0
      )}%`
    );
    console.log(
      `[SCENARIO] Duration: ${
        runtime.durationMs
          ? `${runtime.durationMs / 60000} minutes`
          : 'unlimited'
      }`
    );

    if (runtime.nodeMode) {
      // Classify nodes for node-driven simulation
      runtime.farmNodes = runtime.nodes.filter(
        (n) => (n.type || '').toLowerCase() === 'farm'
      );
      runtime.warehouseNodes = runtime.nodes.filter(
        (n) => (n.type || '').toLowerCase() === 'warehouse'
      );
      runtime.ngoNodes = runtime.nodes.filter(
        (n) => (n.type || '').toLowerCase() === 'ngo'
      );
      console.log(
        `[SCENARIO] Loaded ${runtime.nodes.length} node(s): ${runtime.farmNodes.length} farm, ${runtime.warehouseNodes.length} warehouse, ${runtime.ngoNodes.length} ngo`
      );

      // Load regions as fallback for request generation if no NGO nodes
      if (runtime.ngoNodes.length === 0) {
        runtime.regions = await loadRegions(runtime.regionFilter);
        runtime.warehouses = await loadWarehouses(runtime.regions);
        console.log(
          `[SCENARIO] No NGO nodes provided, loaded ${runtime.regions.length} region(s) as fallback for requests`
        );
      }
    } else {
      runtime.regions = await loadRegions(runtime.regionFilter);
      runtime.warehouses = await loadWarehouses(runtime.regions);
      console.log(
        `[SCENARIO] Loaded ${runtime.regions.length} region(s) and ${runtime.warehouses.length} warehouse(s)`
      );
    }
    console.log(`[SCENARIO] ═══════════════════════════════════════════════`);

    runtime.startedAt = Date.now();
    runtime.tickIndex = 0;
    runtime.active = true;
    runtime.pendingApprovals = [];
    runtime.pendingFulfillments = [];
    runtime.requestLedger.clear();
    runtime.openRequests.clear();
    runtime.farmInventory = [];
    runtime.lastEventTimestamp = null;
    runtime.previousEventTimestamp = null;
    runtime.simulatedCursor = new Date(runtime.scenario.startDate.getTime());
    scheduleNext(runtime);
  };

  return runtime;
}

async function startScenario(input) {
  const name = input && input.name ? String(input.name).trim() : '';
  const seed = input && input.seed ? String(input.seed).trim() : '';
  if (!name) throw new Error('Scenario name is required');
  if (!seed) throw new Error('Scenario seed is required');
  const existing = await Scenario.findOne({ name, status: 'running' }).lean();
  if (existing) throw new Error('Scenario with this name is already running');
  const batchSize = normalizeBatchSize(input.batchSize);
  const intervalMs = normalizeInterval(input.intervalMs);
  const probabilities = normalizeProbabilities(input.probabilities);
  const timeAdvance = normalizeTimeAdvance(
    input.timeAdvance ?? input.timeAdvanceMinutes
  );
  const startDateInput = input.startDate
    ? new Date(input.startDate)
    : new Date();
  if (Number.isNaN(startDateInput.getTime()))
    throw new Error('Invalid startDate');
  const durationMs = input.durationMinutes
    ? Math.max(0, Number(input.durationMinutes)) * 60000
    : null;
  const scenario = await Scenario.create({
    name,
    seed,
    startDate: startDateInput,
    config: {
      batchSize,
      intervalMs,
      regionFilter: Array.isArray(input.regions) ? input.regions : [],
      timeAdvance,
    },
    probabilities,
    status: 'running',
    stats: { totalEventsSent: 0 },
  });
  const runtime = createRuntime(scenario, {
    batchSize,
    intervalMs,
    probabilities,
    durationMs,
    regionFilter: Array.isArray(input.regions) ? input.regions : [],
    nodes: Array.isArray(input.nodes) ? input.nodes : [],
    timeAdvance,
    ngos: Array.isArray(input.ngos) ? input.ngos : [],
  });
  activeScenarios.set(scenario._id.toString(), runtime);
  try {
    await runtime.start();
  } catch (err) {
    await runtime.stop(true);
    throw err;
  }
  return scenario;
}

async function stopScenario(scenarioId) {
  if (!scenarioId) throw new Error('scenarioId is required');
  const id = scenarioId.toString();
  const runtime = activeScenarios.get(id);
  if (runtime) await runtime.stop(true);
  const scenario = await Scenario.findById(id);
  if (!scenario) throw new Error('Scenario not found');
  if (scenario.status !== 'stopped') {
    scenario.status = 'stopped';
    await scenario.save();
  }
  return scenario;
}

async function getScenarioStatus(id) {
  if (!id) throw new Error('Scenario id is required');
  const scenario = await Scenario.findById(id).lean();
  if (!scenario) throw new Error('Scenario not found');
  return scenario;
}

async function getScenarioEvents(id, limit) {
  if (!id) throw new Error('Scenario id is required');
  const capped = Math.max(1, Math.min(Number(limit) || 100, 500));
  const events = await SimEvent.find({ scenarioId: id })
    .sort({ timestamp: -1 })
    .limit(capped)
    .lean();
  return events;
}

module.exports = {
  startScenario,
  stopScenario,
  getScenarioStatus,
  getScenarioEvents,
};
