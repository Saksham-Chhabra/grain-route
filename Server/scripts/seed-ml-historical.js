/**
 * ML Historical Seed
 *
 * Seeds MongoDB using the historical CSVs already present in this repo (ml/data/*):
 * - income_features.csv (state/district + income)
 * - festival_features.csv (state/district + dates + celebration intensity)
 * - census2011.csv (district/state + population)
 *
 * Goal:
 * - Produce many (state,district,month) feature rows with real heterogeneity
 * - Add a few controlled "shock" districts/months so IsolationForest flags anomalies
 * - Keep schemas aligned with Backend A (Server) collections
 *
 * Usage:
 *   cd Server
 *   npm run seed:mlhistorical
 *
 * After seeding, retrain ML artifacts on the same DB (threeservice):
 *   cd ..\ml
 *   .\scripts\start-training.ps1 -Freq M -SkipDeps
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";

import { Node } from "../src/models/node.model.js";
import { Batch } from "../src/models/batch.model.js";
import { Request } from "../src/models/request.model.js";
import { NGO } from "../src/models/NGO.model.js";
import { Shipment } from "../src/models/shipment.model.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/threeservice";

// Defaults target ~3 years of history for training. Override with SEED_HIST_START/SEED_HIST_END.
const START_DATE = process.env.SEED_HIST_START || "2023-01-01";
const END_DATE = process.env.SEED_HIST_END || "2026-02-03";
const ROOT = path.resolve(process.cwd(), "..");
const ML_DATA_DIR = path.join(ROOT, "ml", "data");

const FILES = {
  income: path.join(ML_DATA_DIR, "income_features.csv"),
  festivals: path.join(ML_DATA_DIR, "festival_features.csv"),
  census: path.join(ML_DATA_DIR, "census2011.csv"),
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260203);
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const randFloat = (min, max) => rng() * (max - min) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

function parseCsv(text) {
  // Minimal CSV parser with quoted-field support.
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (c === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.length >= header.length)
    .map((r) => {
      const obj = {};
      for (let j = 0; j < header.length; j++)
        obj[header[j]] = (r[j] ?? "").trim();
      return obj;
    });
}

function normKey(state, district) {
  return `${String(state || "")
    .trim()
    .toLowerCase()}::${String(district || "")
    .trim()
    .toLowerCase()}`;
}

const foodCatalog = [
  { foodType: "rice", shelfLifeHours: 720 },
  { foodType: "wheat", shelfLifeHours: 720 },
  { foodType: "pulses", shelfLifeHours: 1440 },
  { foodType: "vegetables", shelfLifeHours: 120 },
  { foodType: "fruits", shelfLifeHours: 168 },
  { foodType: "milk", shelfLifeHours: 72 },
];

const stateCenters = [
  { state: "Andhra Pradesh", lat: 15.9129, lon: 79.74 },
  { state: "Assam", lat: 26.2006, lon: 92.9376 },
  { state: "Bihar", lat: 25.0961, lon: 85.3131 },
  { state: "Chhattisgarh", lat: 21.2787, lon: 81.8661 },
  { state: "Delhi", lat: 28.6139, lon: 77.209 },
  { state: "Gujarat", lat: 22.2587, lon: 71.1924 },
  { state: "Haryana", lat: 29.0588, lon: 76.0856 },
  { state: "Karnataka", lat: 15.3173, lon: 75.7139 },
  { state: "Kerala", lat: 10.8505, lon: 76.2711 },
  { state: "Maharashtra", lat: 19.7515, lon: 75.7139 },
  { state: "Rajasthan", lat: 27.0238, lon: 74.2179 },
  { state: "Tamil Nadu", lat: 11.1271, lon: 78.6569 },
  { state: "Telangana", lat: 18.1124, lon: 79.0193 },
  { state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
  { state: "West Bengal", lat: 22.9868, lon: 87.855 },
];

function getStateCenter(state) {
  const found = stateCenters.find(
    (s) => s.state.toLowerCase() === String(state).toLowerCase()
  );
  if (found) return found;
  return { state, lat: 22.5 + randFloat(-4, 4), lon: 79 + randFloat(-6, 6) };
}

function jitteredLatLon(state, district) {
  // deterministic-ish based on strings
  const base = getStateCenter(state);
  const hash = Array.from(`${state}|${district}`).reduce(
    (a, c) => a + c.charCodeAt(0),
    0
  );
  const localRng = mulberry32(hash);
  const lat = base.lat + (localRng() * 1.4 - 0.7);
  const lon = base.lon + (localRng() * 1.6 - 0.8);
  return { lat, lon };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function monthStartsBetween(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const out = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  );
  const endMonth = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
  );
  while (cursor <= endMonth) {
    out.push(new Date(cursor.getTime()));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function randomDateInMonth(monthStartUtc) {
  const y = monthStartUtc.getUTCFullYear();
  const m = monthStartUtc.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  const ms =
    start.getTime() + Math.floor(rng() * (end.getTime() - start.getTime()));
  return new Date(ms);
}

function hoursFrom(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function seedMlHistorical() {
  for (const fp of Object.values(FILES)) {
    if (!fs.existsSync(fp)) {
      throw new Error(`Missing required data file: ${fp}`);
    }
  }

  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB", MONGODB_URI);

  const shouldClear = process.env.SEED_CLEAR !== "0";
  if (shouldClear) {
    await Promise.all([
      Node.deleteMany({}),
      Batch.deleteMany({}),
      Request.deleteMany({}),
      NGO.deleteMany({}),
      Shipment.deleteMany({}),
    ]);
    console.log("🗑️  Cleared Node/Batch/Request/NGO/Shipment collections");
  }

  const incomeRows = parseCsv(fs.readFileSync(FILES.income, "utf-8"));
  const festivalRows = parseCsv(fs.readFileSync(FILES.festivals, "utf-8"));
  const censusRows = parseCsv(fs.readFileSync(FILES.census, "utf-8"));

  // Build population lookup (best-effort)
  const popByKey = new Map();
  for (const r of censusRows) {
    const state = r.State || r.state;
    const district = r.District || r.district;
    let popRaw = r.Population || r.population;
    if (!state || !district || !popRaw) continue;
    popRaw = String(popRaw).replace(/,/g, "");
    const pop = Number(popRaw);
    if (!Number.isFinite(pop)) continue;
    popByKey.set(normKey(state, district), pop);
  }

  // Select districts from income file (ensures we also have per_capita_income)
  const districtsAll = incomeRows
    .filter((r) => r.state && r.district)
    .map((r) => ({
      state: r.state,
      district: r.district,
      perCapitaIncome: Number(r.per_capita_income) || null,
    }));

  // Dedup
  const dedup = new Map();
  for (const d of districtsAll) {
    const k = normKey(d.state, d.district);
    if (!dedup.has(k)) dedup.set(k, d);
  }

  const uniqueDistricts = Array.from(dedup.values());

  // Sort by population (if we can match), else by income desc
  uniqueDistricts.sort((a, b) => {
    const pa = popByKey.get(normKey(a.state, a.district)) || 0;
    const pb = popByKey.get(normKey(b.state, b.district)) || 0;
    if (pb !== pa) return pb - pa;
    return (b.perCapitaIncome || 0) - (a.perCapitaIncome || 0);
  });

  const maxDistricts = Number(process.env.SEED_HIST_DISTRICTS ?? 90);
  const selectedDistricts = uniqueDistricts.slice(
    0,
    Math.max(15, maxDistricts)
  );

  // Festival intensity by (state,district,monthIndex)
  // festival_features.csv is 2022-*; we reuse month-of-year pattern for 2025/2026.
  const festivalIntensity = new Map();
  for (const r of festivalRows) {
    if (!r.state || !r.district || !r.period_start) continue;
    const dt = new Date(r.period_start);
    if (Number.isNaN(dt.getTime())) continue;
    const month = dt.getUTCMonth() + 1;
    const k = `${normKey(r.state, r.district)}::${month}`;
    const pct = Number(r.celebration_pct) || 0;
    const prev = festivalIntensity.get(k) || 0;
    festivalIntensity.set(k, Math.max(prev, pct));
  }

  // Create nodes + NGO orgs
  const warehouses = [];
  const ngoNodes = [];
  const farms = [];

  // Create 1 NGO per district
  for (const d of selectedDistricts) {
    const { lat, lon } = jitteredLatLon(d.state, d.district);
    ngoNodes.push({
      type: "ngo",
      name: `${d.district} Relief NGO`,
      regionId: d.state,
      district: d.district,
      location: { type: "Point", coordinates: [lon, lat] },
      capacity_kg: 800 + randInt(0, 9000),
    });
  }

  // Warehouses: 2 per state among selected districts
  const districtsByState = new Map();
  for (const d of selectedDistricts) {
    if (!districtsByState.has(d.state)) districtsByState.set(d.state, []);
    districtsByState.get(d.state).push(d);
  }
  for (const [state, list] of districtsByState.entries()) {
    const picks = list.slice(0, Math.min(2, list.length));
    for (const d of picks) {
      const { lat, lon } = jitteredLatLon(d.state, d.district);
      warehouses.push({
        type: "warehouse",
        name: `${d.district} Central Warehouse`,
        regionId: d.state,
        district: d.district,
        location: {
          type: "Point",
          coordinates: [
            lon + randFloat(-0.06, 0.06),
            lat + randFloat(-0.06, 0.06),
          ],
        },
        capacity_kg: 12000 + randInt(0, 25000),
      });
    }
  }

  // Farms: a few, distributed
  const farmCount = Number(process.env.SEED_HIST_FARMS ?? 10);
  for (let i = 0; i < farmCount; i++) {
    const d = pick(selectedDistricts);
    const { lat, lon } = jitteredLatLon(d.state, d.district);
    farms.push({
      type: "farm",
      name: `${d.state} Farm ${i + 1}`,
      regionId: d.state,
      district: d.district,
      location: {
        type: "Point",
        coordinates: [lon + randFloat(-0.2, 0.2), lat + randFloat(-0.2, 0.2)],
      },
      capacity_kg: 40000 + randInt(0, 80000),
    });
  }

  const insertedNodes = await Node.insertMany([
    ...farms,
    ...warehouses,
    ...ngoNodes,
  ]);

  // Split inserted nodes back out
  const insertedFarms = insertedNodes.filter((n) => n.type === "farm");
  const insertedWarehouses = insertedNodes.filter(
    (n) => n.type === "warehouse"
  );
  const insertedNgoNodes = insertedNodes.filter((n) => n.type === "ngo");

  // NGO orgs matching NGO nodes by name (required by backend allocation)
  const ngoOrgs = await NGO.insertMany(
    insertedNgoNodes.map((n) => ({
      name: n.name,
      address: `${n.district}, ${n.regionId}`,
      contactInfo: {
        contactPerson: `Contact ${n.district}`,
        email: `${slugify(n.district)}@relief.org`,
        phone: "+91-0000000000",
      },
      requestStats: {
        pending: 0,
        completed: 0,
        total: 0,
        cancelled: 0,
        approved: 0,
      },
    }))
  );

  console.log(
    `✅ Created nodes: farms=${insertedFarms.length}, warehouses=${insertedWarehouses.length}, ngos=${insertedNgoNodes.length}, ngoOrgs=${ngoOrgs.length}`
  );

  // Choose anomaly districts (surge) and disruption districts
  const sortedByPop = [...selectedDistricts].sort((a, b) => {
    const pa = popByKey.get(normKey(a.state, a.district)) || 0;
    const pb = popByKey.get(normKey(b.state, b.district)) || 0;
    return pb - pa;
  });

  const surgeDistricts = sortedByPop.slice(0, 3);
  const disruptionDistricts = selectedDistricts
    .filter(
      (d) =>
        !surgeDistricts.some(
          (s) => normKey(s.state, s.district) === normKey(d.state, d.district)
        )
    )
    .sort(() => rng() - 0.5)
    .slice(0, 2);

  console.log(
    `⚡ Surge districts: ${surgeDistricts.map((d) => `${d.district},${d.state}`).join(" | ")}`
  );
  console.log(
    `🧯 Disruption districts: ${disruptionDistricts.map((d) => `${d.district},${d.state}`).join(" | ")}`
  );

  const months = monthStartsBetween(
    process.env.SEED_HIST_START ?? "2025-08-01T00:00:00.000Z",
    process.env.SEED_HIST_END ?? "2026-02-03T23:59:59.999Z"
  );

  const ngoOrgByName = new Map(ngoOrgs.map((o) => [o.name, o]));

  // Helper to pick nearest warehouse in same state (fallback to any)
  const warehousesByState = new Map();
  for (const w of insertedWarehouses) {
    const s = w.regionId;
    if (!warehousesByState.has(s)) warehousesByState.set(s, []);
    warehousesByState.get(s).push(w);
  }

  function pickWarehouseForDistrict(state, district) {
    const list = warehousesByState.get(state) || insertedWarehouses;
    const { lat, lon } = jitteredLatLon(state, district);
    const here = { lat, lon };
    let best = null;
    let bestD = Infinity;
    for (const w of list) {
      const dKm = haversineKm(here, {
        lat: w.location.coordinates[1],
        lon: w.location.coordinates[0],
      });
      if (dKm < bestD) {
        bestD = dKm;
        best = w;
      }
    }
    return best || pick(insertedWarehouses);
  }

  // Create Batches + Shipments + Requests
  const batches = [];
  const shipments = [];
  const requests = [];

  const batchesPerWarehousePerMonth = Number(
    process.env.SEED_HIST_BATCHES_PER_WAREHOUSE_PER_MONTH ?? 10
  );

  // Precompute income min/max to scale demand
  const incomes = selectedDistricts
    .map((d) => d.perCapitaIncome)
    .filter((x) => Number.isFinite(x));
  const minIncome = incomes.length ? Math.min(...incomes) : 20000;
  const maxIncome = incomes.length ? Math.max(...incomes) : 150000;

  const popVals = selectedDistricts
    .map((d) => popByKey.get(normKey(d.state, d.district)) || 0)
    .filter((x) => x > 0);
  const minPop = popVals.length ? Math.min(...popVals) : 200000;
  const maxPop = popVals.length ? Math.max(...popVals) : 12000000;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  for (const monthStart of months) {
    const monthIndex = monthStart.getUTCMonth() + 1;
    const year = monthStart.getUTCFullYear();

    // Batches: each warehouse produces monthly
    for (const w of insertedWarehouses) {
      for (let i = 0; i < batchesPerWarehousePerMonth; i++) {
        const food = pick(foodCatalog);
        const manufacture_date = randomDateInMonth(monthStart);
        const shelf_life_hours = food.shelfLifeHours;
        const expiry_iso = hoursFrom(manufacture_date, shelf_life_hours);

        // quantities vary per food
        const baseQty =
          food.foodType === "milk"
            ? randInt(40, 140)
            : food.foodType === "vegetables"
              ? randInt(60, 220)
              : food.foodType === "fruits"
                ? randInt(60, 260)
                : randInt(120, 700);

        const original_quantity_kg = baseQty + randInt(0, 200);
        const quantity_kg = Math.max(
          0,
          Math.round(original_quantity_kg * randFloat(0.2, 1.0))
        );

        batches.push({
          foodType: food.foodType,
          quantity_kg,
          original_quantity_kg,
          originNode: w._id,
          currentNode: w._id,
          status: "stored",
          shelf_life_hours,
          manufacture_date,
          expiry_iso,
          freshnessPct: 100,
          metadata: { seeded: "ml-historical", year, month: monthIndex },
        });
      }
    }

    // Requests: per district-month demand shaped by population + income + festivals
    for (const d of selectedDistricts) {
      const pop =
        popByKey.get(normKey(d.state, d.district)) ||
        minPop + randInt(0, 900000);
      const popNorm = clamp((pop - minPop) / (maxPop - minPop + 1), 0, 1);
      const popFactor = 0.7 + popNorm * 1.8;

      const income = Number.isFinite(d.perCapitaIncome)
        ? d.perCapitaIncome
        : maxIncome;
      const incomeNorm = clamp(
        (income - minIncome) / (maxIncome - minIncome + 1),
        0,
        1
      );
      // Lower income -> higher baseline demand (demo assumption)
      const incomeFactor = 1.25 - incomeNorm * 0.5;

      const fest =
        festivalIntensity.get(
          `${normKey(d.state, d.district)}::${monthIndex}`
        ) || 0;
      const festivalFactor = 1 + fest * 0.9;

      const isSurge =
        surgeDistricts.some(
          (s) => normKey(s.state, s.district) === normKey(d.state, d.district)
        ) &&
        year === 2026 &&
        monthIndex === 2;

      const baseRequests = 3 + Math.round(popFactor * 3 + fest * 6);
      const nRequests = isSurge ? baseRequests * 10 : baseRequests;

      const orgName = `${d.district} Relief NGO`;
      const org = ngoOrgByName.get(orgName);
      if (!org) continue;

      for (let i = 0; i < nRequests; i++) {
        const createdOn = randomDateInMonth(monthStart);
        const requiredBefore = new Date(
          createdOn.getTime() + randInt(12, 72) * 3600 * 1000
        );

        const itemCount = randInt(1, 4);
        const items = [];
        for (let k = 0; k < itemCount; k++) {
          const food = pick(foodCatalog);
          const baseKg =
            food.foodType === "milk"
              ? randInt(30, 120)
              : food.foodType === "vegetables"
                ? randInt(40, 160)
                : food.foodType === "fruits"
                  ? randInt(40, 180)
                  : randInt(80, 420);

          const kg = Math.round(
            baseKg *
              popFactor *
              incomeFactor *
              festivalFactor *
              (isSurge ? 7.5 : 1)
          );
          items.push({ foodType: food.foodType, required_kg: Math.max(5, kg) });
        }

        requests.push({
          requesterNode: org._id,
          requestID: `HIST-${slugify(d.state)}-${slugify(d.district)}-${year}${String(monthIndex).padStart(2, "0")}-${String(i + 1).padStart(4, "0")}`,
          items,
          createdOn,
          requiredBefore,
          status: "pending",
        });
      }
    }

    // Shipments: create flows (suppressed for disruption districts in Jan-Feb 2026)
    const shipCountPerMonth = Number(
      process.env.SEED_HIST_SHIPMENTS_PER_MONTH ?? 140
    );
    for (let i = 0; i < shipCountPerMonth; i++) {
      const from = pick(insertedWarehouses);

      // choose a destination district (NGO) with bias toward same state
      const candidates = selectedDistricts.filter(
        (d) => d.state === from.regionId
      );
      const destDistrict = candidates.length
        ? pick(candidates)
        : pick(selectedDistricts);

      const isDisrupted =
        disruptionDistricts.some(
          (x) =>
            normKey(x.state, x.district) ===
            normKey(destDistrict.state, destDistrict.district)
        ) &&
        year === 2026 &&
        (monthIndex === 1 || monthIndex === 2);

      if (isDisrupted && rng() < 0.92) continue; // almost no shipments into disrupted area

      const ngoNode = insertedNgoNodes.find(
        (n) => n.name === `${destDistrict.district} Relief NGO`
      );
      if (!ngoNode) continue;

      const fromLoc = {
        lat: from.location.coordinates[1],
        lon: from.location.coordinates[0],
      };
      const toLoc = {
        lat: ngoNode.location.coordinates[1],
        lon: ngoNode.location.coordinates[0],
      };
      const distance_km = haversineKm(fromLoc, toLoc);
      const speedKmh = isDisrupted ? randFloat(12, 25) : randFloat(28, 55);
      const travel_time_minutes = Math.max(
        25,
        Math.round((distance_km / speedKmh) * 60)
      );
      const start_iso = randomDateInMonth(monthStart);
      const eta_iso = new Date(
        start_iso.getTime() + travel_time_minutes * 60 * 1000
      );

      shipments.push({
        shipmentId: `HIST-S-${year}${String(monthIndex).padStart(2, "0")}-${String(i + 1).padStart(4, "0")}`,
        // batchIds filled after batches insert
        batchIds: [],
        fromNode: from._id,
        toNode: ngoNode._id,
        start_iso,
        eta_iso,
        status: "arrived",
        travel_time_minutes,
        distance_km,
        metadata: { seeded: "ml-historical", year, month: monthIndex },
      });
    }
  }

  const insertedBatches = await Batch.insertMany(batches, { ordered: false });
  console.log(`✅ Created batches: ${insertedBatches.length}`);

  // Attach batch IDs to shipments (pick 1-4 batches from the fromNode)
  const batchesByWarehouse = new Map();
  for (const b of insertedBatches) {
    const wid = b.currentNode?.toString?.() ?? String(b.currentNode);
    if (!batchesByWarehouse.has(wid)) batchesByWarehouse.set(wid, []);
    batchesByWarehouse.get(wid).push(b);
  }

  for (const s of shipments) {
    const available = batchesByWarehouse.get(s.fromNode.toString()) || [];
    const k = Math.min(4, Math.max(1, randInt(1, 3)));
    const picked = [];
    for (let i = 0; i < k; i++) {
      if (available.length === 0) break;
      picked.push(pick(available));
    }
    s.batchIds = picked.map((b) => b._id);
  }

  const insertedShipments = await Shipment.insertMany(shipments, {
    ordered: false,
  });
  console.log(`✅ Created shipments: ${insertedShipments.length}`);

  const insertedRequests = await Request.insertMany(requests, {
    ordered: false,
  });
  console.log(`✅ Created pending requests: ${insertedRequests.length}`);

  console.log("\nNext:");
  console.log("- Retrain ML artifacts on threeservice DB:");
  console.log("  cd ..\\ml");
  console.log("  .\\scripts\\start-training.ps1 -Freq M -SkipDeps");
  console.log(
    "- Then restart ML server + Backend A, open /admin/timeline-comparison (date 2026-02-03)"
  );

  await mongoose.disconnect();
  console.log("✅ Disconnected");
}

seedMlHistorical().catch(async (err) => {
  console.error("❌ Seed failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
