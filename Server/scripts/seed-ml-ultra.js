/**
 * ML Ultra Seed
 *
 * Purpose:
 * - Generate MANY state/district-month feature rows with strong heterogeneity so
 *   KMeans yields multiple clusters and IsolationForest flags outliers.
 * - Designed for demo snapshots around: 2026-02-03
 *
 * Notes:
 * - The ML service uses trained artifacts under ml/artifacts. After seeding,
 *   run ML training to refresh artifacts (see bottom of file).
 *
 * Usage:
 *   cd Server
 *   npm run seed:mlultra
 *
 * Recommended next steps:
 *   # Train new ML artifacts from Mongo (creates a new ml/artifacts/<timestamp>/)
 *   cd ..\ml
 *   .\scripts\start-training.ps1 -Freq M
 *
 *   # Then restart ML server so /predict uses latest artifacts
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

import { Node } from "../src/models/node.model.js";
import { Batch } from "../src/models/batch.model.js";
import { Request } from "../src/models/request.model.js";
import { NGO } from "../src/models/NGO.model.js";
import { Shipment } from "../src/models/shipment.model.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/food_supply_chain";

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
    .slice(0, 60);

const foodCatalog = [
  { foodType: "rice", shelfLifeHours: 720 },
  { foodType: "wheat", shelfLifeHours: 720 },
  { foodType: "pulses", shelfLifeHours: 1440 },
  { foodType: "vegetables", shelfLifeHours: 120 },
  { foodType: "fruits", shelfLifeHours: 168 },
  { foodType: "milk", shelfLifeHours: 72 },
];

const stateCenters = [
  { state: "Delhi", lat: 28.6139, lon: 77.209 },
  { state: "Maharashtra", lat: 19.076, lon: 72.8777 },
  { state: "West Bengal", lat: 22.5726, lon: 88.3639 },
  { state: "Tamil Nadu", lat: 13.0827, lon: 80.2707 },
  { state: "Karnataka", lat: 12.9716, lon: 77.5946 },
  { state: "Telangana", lat: 17.385, lon: 78.4867 },
  { state: "Rajasthan", lat: 26.9124, lon: 75.7873 },
  { state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
  { state: "Bihar", lat: 25.5941, lon: 85.1376 },
  { state: "Assam", lat: 26.1445, lon: 91.7362 },
  { state: "Kerala", lat: 9.9312, lon: 76.2673 },
  { state: "Punjab", lat: 30.7333, lon: 76.7794 },
];

function makeNode({ type, name, state, district, lat, lon, capacityKg }) {
  return {
    type,
    name,
    regionId: state,
    district,
    location: {
      type: "Point",
      coordinates: [lon, lat],
    },
    capacity_kg: capacityKg || 0,
  };
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

function randomDateBetween(start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const ms = startMs + Math.floor(rng() * (endMs - startMs));
  return new Date(ms);
}

function hoursFrom(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function seedMlUltra() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

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

  const TARGET_DATE = new Date("2026-02-03T23:59:59.999Z");
  const windowStart = new Date("2025-08-01T00:00:00.000Z");
  const febStart = new Date("2026-02-01T00:00:00.000Z");
  const febEnd = new Date("2026-02-29T23:59:59.999Z");

  // Build synthetic districts per state
  const districts = [];
  const districtsPerState = Number(process.env.SEED_DISTRICTS_PER_STATE ?? 8);

  for (const center of stateCenters) {
    for (let i = 1; i <= districtsPerState; i++) {
      const lat = center.lat + randFloat(-0.9, 0.9);
      const lon = center.lon + randFloat(-0.9, 0.9);
      districts.push({
        state: center.state,
        district: `${center.state} District ${i}`,
        lat,
        lon,
      });
    }
  }

  // Create a few "special" districts to force outliers
  const anomalyDistricts = [
    { state: "Punjab", district: "Surge District", lat: 30.75, lon: 76.78 },
    { state: "Assam", district: "Disrupted District", lat: 26.14, lon: 91.74 },
    { state: "Delhi", district: "Mega-Flow District", lat: 28.62, lon: 77.2 },
  ];
  districts.push(...anomalyDistricts);

  // Warehouses: ~1 per 2 districts, plus dedicated ones for anomaly districts
  const warehousesToCreate = Math.max(18, Math.floor(districts.length / 2));
  const warehouseDistricts = Array.from({ length: warehousesToCreate }, () =>
    pick(districts)
  );
  for (const a of anomalyDistricts) warehouseDistricts.push(a);

  const warehouses = await Node.insertMany(
    warehouseDistricts.map((d, idx) =>
      makeNode({
        type: "warehouse",
        name: `${d.district} Warehouse ${idx + 1}`,
        state: d.state,
        district: d.district,
        lat: d.lat + randFloat(-0.08, 0.08),
        lon: d.lon + randFloat(-0.08, 0.08),
        capacityKg: 12000 + randInt(0, 22000),
      })
    )
  );

  // Farms
  const farms = await Node.insertMany(
    Array.from({ length: 6 }, (_, idx) => {
      const d = pick(districts);
      return makeNode({
        type: "farm",
        name: `${d.state} Farm ${idx + 1}`,
        state: d.state,
        district: d.district,
        lat: d.lat + randFloat(-0.25, 0.25),
        lon: d.lon + randFloat(-0.25, 0.25),
        capacityKg: 25000 + randInt(0, 50000),
      });
    })
  );

  // NGO nodes for every district
  const ngoNodes = await Node.insertMany(
    districts.map((d) =>
      makeNode({
        type: "ngo",
        name: `${d.district} Relief NGO`,
        state: d.state,
        district: d.district,
        lat: d.lat + randFloat(-0.06, 0.06),
        lon: d.lon + randFloat(-0.06, 0.06),
        capacityKg: 600 + randInt(0, 8000),
      })
    )
  );

  // NGO orgs (names must match NGO nodes)
  const ngoOrgs = await NGO.insertMany(
    districts.map((d) => ({
      name: `${d.district} Relief NGO`,
      address: `${d.district}, ${d.state}`,
      contactInfo: {
        contactPerson: `Contact ${d.district}`,
        email: `${d.district.replace(/\s+/g, "").toLowerCase()}@relief.org`,
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
    `✅ Created nodes: farms=${farms.length}, warehouses=${warehouses.length}, ngos=${ngoNodes.length}, ngoOrgs=${ngoOrgs.length}`
  );

  // Batches: lots of variance in age + shelf life + quantity
  const batchesPerWarehouse = Number(
    process.env.SEED_BATCHES_PER_WAREHOUSE ?? 140
  );
  const batches = [];

  const surgeWarehouse = warehouses.find(
    (w) => String(w.district) === "Surge District"
  );
  const disruptedWarehouse = warehouses.find(
    (w) => String(w.district) === "Disrupted District"
  );
  const megaFlowWarehouse = warehouses.find(
    (w) => String(w.district) === "Mega-Flow District"
  );

  for (const warehouse of warehouses) {
    const isDisrupted =
      disruptedWarehouse &&
      warehouse._id.toString() === disruptedWarehouse._id.toString();
    const isMegaFlow =
      megaFlowWarehouse &&
      warehouse._id.toString() === megaFlowWarehouse._id.toString();

    for (let i = 0; i < batchesPerWarehouse; i++) {
      const food = pick(foodCatalog);

      // Goal: majority of inventory should still be usable at TARGET_DATE.
      // We control expiry first, then derive manufacture date from shelf life.
      const shelf_life_hours = food.shelfLifeHours;

      // Default distribution: 80% fresh, 15% expiring soon, 5% expired.
      // Disrupted hub: older stock (more expiring/expired). Mega-flow: fresher.
      const r = rng();
      const freshCut = isDisrupted ? 0.45 : isMegaFlow ? 0.9 : 0.8;
      const expSoonCut = isDisrupted ? 0.85 : isMegaFlow ? 0.98 : 0.95;

      let expiry_iso;
      if (r < freshCut) {
        // Expiry comfortably after the snapshot to keep most inventory usable.
        // 1–45 days after snapshot.
        expiry_iso = hoursFrom(TARGET_DATE, randInt(24, 24 * 45));
      } else if (r < expSoonCut) {
        // Expiring within 72h after snapshot.
        expiry_iso = hoursFrom(TARGET_DATE, randInt(0, 72));
      } else {
        // Already expired before snapshot (small minority).
        expiry_iso = hoursFrom(TARGET_DATE, -randInt(1, 24 * 10));
      }

      const manufacture_date = hoursFrom(expiry_iso, -shelf_life_hours);

      // Disrupted hub holds older/near-expiry inventory
      const baseQty = isDisrupted ? randInt(30, 220) : randInt(80, 900);
      const original_quantity_kg = baseQty + randInt(0, 250);
      const quantity_kg = Math.max(
        0,
        Math.round(original_quantity_kg * randFloat(0.15, 1.0))
      );

      // Approximate freshness: 100 at manufacture -> 0 at expiry
      const ageHours = Math.max(
        0,
        (TARGET_DATE.getTime() - manufacture_date.getTime()) / 36e5
      );
      const freshnessPct = Math.max(
        0,
        Math.min(100, 100 - (ageHours / shelf_life_hours) * 100)
      );

      batches.push({
        foodType: food.foodType,
        quantity_kg,
        original_quantity_kg,
        originNode: warehouse._id,
        currentNode: warehouse._id,
        status: "stored",
        shelf_life_hours,
        manufacture_date,
        expiry_iso,
        freshnessPct,
        metadata: {
          seeded: "ml-ultra",
        },
      });
    }
  }

  // Make the "Surge" district have lots of short-shelf-life stock pressure
  if (surgeWarehouse) {
    for (let i = 0; i < 220; i++) {
      const food = pick([
        { foodType: "milk", shelfLifeHours: 72 },
        { foodType: "vegetables", shelfLifeHours: 120 },
        { foodType: "fruits", shelfLifeHours: 168 },
      ]);

      // Keep "surge" as near-expiry pressure, but still not mostly expired.
      // 60% expiring within 72h, 30% fresh (1–7 days), 10% expired.
      const shelf_life_hours = food.shelfLifeHours;
      const r = rng();
      let expiry_iso;
      if (r < 0.6) expiry_iso = hoursFrom(TARGET_DATE, randInt(0, 72));
      else if (r < 0.9)
        expiry_iso = hoursFrom(TARGET_DATE, randInt(24, 24 * 7));
      else expiry_iso = hoursFrom(TARGET_DATE, -randInt(1, 24 * 3));

      const manufacture_date = hoursFrom(expiry_iso, -shelf_life_hours);
      const original_quantity_kg = randInt(25, 160);
      const quantity_kg = Math.max(
        0,
        Math.round(original_quantity_kg * randFloat(0.25, 1.0))
      );
      const ageHours = Math.max(
        0,
        (TARGET_DATE.getTime() - manufacture_date.getTime()) / 36e5
      );
      const freshnessPct = Math.max(
        0,
        Math.min(100, 100 - (ageHours / shelf_life_hours) * 100)
      );
      batches.push({
        foodType: food.foodType,
        quantity_kg,
        original_quantity_kg,
        originNode: surgeWarehouse._id,
        currentNode: surgeWarehouse._id,
        status: "stored",
        shelf_life_hours,
        manufacture_date,
        expiry_iso,
        freshnessPct,
        metadata: { seeded: "ml-ultra", hotspot: "surge" },
      });
    }
  }

  const insertedBatches = await Batch.insertMany(batches, { ordered: false });
  console.log(`✅ Created batches: ${insertedBatches.length}`);

  // Shipments: create diverse flows and travel times.
  // Keep batchIds referencing inserted batches so snapshot queries can include them.
  const batchesByWarehouse = new Map();
  for (const b of insertedBatches) {
    const wid = b.currentNode?.toString?.() ?? String(b.currentNode);
    if (!batchesByWarehouse.has(wid)) batchesByWarehouse.set(wid, []);
    batchesByWarehouse.get(wid).push(b);
  }

  const shipments = [];
  const shipmentsCount = Number(process.env.SEED_SHIPMENTS ?? 900);

  for (let i = 0; i < shipmentsCount; i++) {
    // Bias: Mega-Flow warehouse exports a lot.
    const fromWarehouse =
      megaFlowWarehouse && rng() < 0.28 ? megaFlowWarehouse : pick(warehouses);

    const isToNgo = rng() < 0.55;
    const toNode = isToNgo ? pick(ngoNodes) : pick(warehouses);

    const fromLoc = {
      lat: fromWarehouse.location.coordinates[1],
      lon: fromWarehouse.location.coordinates[0],
    };
    const toLoc = {
      lat: toNode.location.coordinates[1],
      lon: toNode.location.coordinates[0],
    };

    const distance_km = haversineKm(fromLoc, toLoc);

    // Make some lanes intentionally slow (to create avg_travel_time variance)
    const speedKmh = rng() < 0.12 ? randFloat(10, 22) : randFloat(30, 55);
    const travel_time_minutes = Math.max(
      15,
      Math.round((distance_km / speedKmh) * 60)
    );

    const start_iso = randomDateBetween(
      new Date("2025-11-01T00:00:00.000Z"),
      TARGET_DATE
    );
    const eta_iso = new Date(
      start_iso.getTime() + travel_time_minutes * 60 * 1000
    );

    const available =
      batchesByWarehouse.get(fromWarehouse._id.toString()) || [];
    const k = Math.min(5, Math.max(1, randInt(1, 4)));
    const picked = [];
    for (let j = 0; j < k; j++) {
      if (available.length === 0) break;
      picked.push(pick(available));
    }

    shipments.push({
      shipmentId: `ULTRA-S${String(i + 1).padStart(6, "0")}`,
      batchIds: picked.map((b) => b._id),
      fromNode: fromWarehouse._id,
      toNode: toNode._id,
      start_iso,
      eta_iso,
      status: rng() < 0.85 ? "arrived" : "in_transit",
      travel_time_minutes,
      distance_km,
      metadata: { seeded: "ml-ultra" },
    });
  }

  const insertedShipments = await Shipment.insertMany(shipments, {
    ordered: false,
  });
  console.log(`✅ Created shipments: ${insertedShipments.length}`);

  // Requests: create heterogeneity + explicit surges.
  const requests = [];

  const orgByDistrict = new Map(
    ngoOrgs.map((o) => {
      const district = String(o.name).replace(/\s+Relief NGO$/, "");
      return [district, o];
    })
  );

  const baseRequestsPerDistrict = Number(
    process.env.SEED_BASE_REQUESTS_PER_DISTRICT ?? 6
  );

  for (const d of districts) {
    const org = orgByDistrict.get(d.district);
    if (!org) continue;

    const isSurge = d.district === "Surge District";
    const isDisrupted = d.district === "Disrupted District";

    const n = isSurge
      ? baseRequestsPerDistrict * 14
      : isDisrupted
        ? baseRequestsPerDistrict * 10
        : baseRequestsPerDistrict;

    for (let i = 0; i < n; i++) {
      const createdOn = randomDateBetween(
        new Date("2025-12-01T00:00:00.000Z"),
        TARGET_DATE
      );
      const requiredBefore = randomDateBetween(febStart, febEnd);

      // Outliers: surge district has very large kg; disrupted has odd food mix and mid-large kg
      const itemCount = isDisrupted ? randInt(3, 6) : randInt(1, 4);
      const items = Array.from({ length: itemCount }, () => {
        const food = pick(foodCatalog);
        const baseKg = isSurge
          ? randInt(900, 4500)
          : isDisrupted
            ? randInt(250, 1800)
            : randInt(20, 650);
        return {
          foodType: food.foodType,
          required_kg: baseKg + randInt(0, 120),
        };
      });

      requests.push({
        requesterNode: org._id,
        requestID: `ULTRA-R-${slugify(d.state)}-${slugify(d.district)}-${String(i + 1).padStart(4, "0")}`,
        items,
        createdOn,
        requiredBefore,
        status: "pending",
      });
    }
  }

  // Extra micro-outliers: a few districts with extremely high request_count but low kg (many tiny requests)
  const tinyOutlierDistricts = districts
    .filter((d) => !anomalyDistricts.some((a) => a.district === d.district))
    .sort(() => rng() - 0.5)
    .slice(0, 4);

  for (const d of tinyOutlierDistricts) {
    const org = orgByDistrict.get(d.district);
    if (!org) continue;
    for (let i = 0; i < 90; i++) {
      const createdOn = randomDateBetween(
        new Date("2026-01-05T00:00:00.000Z"),
        TARGET_DATE
      );
      const requiredBefore = randomDateBetween(febStart, febEnd);
      requests.push({
        requesterNode: org._id,
        requestID: `ULTRA-TINY-${slugify(d.state)}-${slugify(d.district)}-${String(i + 1).padStart(4, "0")}`,
        items: [
          { foodType: pick(foodCatalog).foodType, required_kg: randInt(3, 18) },
        ],
        createdOn,
        requiredBefore,
        status: "pending",
      });
    }
  }

  const insertedRequests = await Request.insertMany(requests, {
    ordered: false,
  });
  console.log(`✅ Created pending requests: ${insertedRequests.length}`);

  console.log("\nNext steps to see new clusters/anomalies:");
  console.log("1) Train ML artifacts (creates new ml/artifacts/<timestamp>/):");
  console.log("   cd ..\\ml");
  console.log("   .\\scripts\\start-training.ps1 -Freq M");
  console.log("2) Restart ML server (so /predict uses latest run)");
  console.log("3) Open Admin UI: /admin/timeline-comparison (date 2026-02-03)");
  console.log("\nRecommended compare/simulate date: 2026-02-03");

  await mongoose.disconnect();
  console.log("✅ Disconnected");
}

seedMlUltra().catch(async (err) => {
  console.error("❌ Seed failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
