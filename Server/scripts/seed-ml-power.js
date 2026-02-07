/**
 * ML Power Seed
 *
 * Seeds a richer, more varied dataset designed to produce:
 * - Multiple KMeans clusters (diverse regional feature profiles)
 * - Clear IsolationForest anomalies (demand surge / disrupted flows)
 *
 * Usage:
 *   npm run seed:mlpower
 *
 * Then test:
 *   http://localhost:3001/api/history/compare?date=2026-02-03
 *   Admin UI: /admin/timeline-comparison (select 2026-02-03)
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
const pick = (arr) => arr[randInt(0, arr.length - 1)];

const locations = [
  {
    city: "New Delhi",
    district: "New Delhi",
    state: "Delhi",
    lat: 28.6139,
    lon: 77.209,
  },
  {
    city: "Mumbai",
    district: "Mumbai",
    state: "Maharashtra",
    lat: 19.076,
    lon: 72.8777,
  },
  {
    city: "Kolkata",
    district: "Kolkata",
    state: "West Bengal",
    lat: 22.5726,
    lon: 88.3639,
  },
  {
    city: "Chennai",
    district: "Chennai",
    state: "Tamil Nadu",
    lat: 13.0827,
    lon: 80.2707,
  },
  {
    city: "Bengaluru",
    district: "Bengaluru Urban",
    state: "Karnataka",
    lat: 12.9716,
    lon: 77.5946,
  },
  {
    city: "Hyderabad",
    district: "Hyderabad",
    state: "Telangana",
    lat: 17.385,
    lon: 78.4867,
  },
  {
    city: "Jaipur",
    district: "Jaipur",
    state: "Rajasthan",
    lat: 26.9124,
    lon: 75.7873,
  },
  {
    city: "Lucknow",
    district: "Lucknow",
    state: "Uttar Pradesh",
    lat: 26.8467,
    lon: 80.9462,
  },
  {
    city: "Patna",
    district: "Patna",
    state: "Bihar",
    lat: 25.5941,
    lon: 85.1376,
  },
  {
    city: "Chandigarh",
    district: "Chandigarh",
    state: "Chandigarh",
    lat: 30.7333,
    lon: 76.7794,
  },
  {
    city: "Guwahati",
    district: "Kamrup Metropolitan",
    state: "Assam",
    lat: 26.1445,
    lon: 91.7362,
  },
  {
    city: "Kochi",
    district: "Ernakulam",
    state: "Kerala",
    lat: 9.9312,
    lon: 76.2673,
  },
];

const foodCatalog = [
  { foodType: "rice", shelfLifeHours: 720 },
  { foodType: "wheat", shelfLifeHours: 720 },
  { foodType: "pulses", shelfLifeHours: 1440 },
  { foodType: "vegetables", shelfLifeHours: 120 },
  { foodType: "fruits", shelfLifeHours: 168 },
  { foodType: "milk", shelfLifeHours: 72 },
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

function estimateDistanceKm(a, b) {
  // Approximate; good enough for seed travel_time.
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

async function seedMlPower() {
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

  // Nodes
  const farmLocs = [pick(locations), pick(locations)];
  const farms = await Node.insertMany(
    farmLocs.map((loc, idx) =>
      makeNode({
        type: "farm",
        name: `${loc.city} Farm ${idx + 1}`,
        state: loc.state,
        district: loc.district,
        lat: loc.lat + (rng() * 0.2 - 0.1),
        lon: loc.lon + (rng() * 0.2 - 0.1),
        capacityKg: 15000,
      })
    )
  );

  // Warehouses in a subset of cities (so routing choices exist).
  const warehouseCities = [
    "New Delhi",
    "Mumbai",
    "Kolkata",
    "Chennai",
    "Bengaluru",
    "Hyderabad",
    "Jaipur",
  ];

  const warehouses = await Node.insertMany(
    locations
      .filter((l) => warehouseCities.includes(l.city))
      .map((l) =>
        makeNode({
          type: "warehouse",
          name: `${l.city} Central Warehouse`,
          state: l.state,
          district: l.district,
          lat: l.lat + (rng() * 0.05 - 0.025),
          lon: l.lon + (rng() * 0.05 - 0.025),
          capacityKg: 8000 + randInt(0, 9000),
        })
      )
  );

  // NGO nodes for all locations
  const ngoNodes = await Node.insertMany(
    locations.map((l) =>
      makeNode({
        type: "ngo",
        name: `${l.city} Relief NGO`,
        state: l.state,
        district: l.district,
        lat: l.lat + (rng() * 0.06 - 0.03),
        lon: l.lon + (rng() * 0.06 - 0.03),
        capacityKg: 500 + randInt(0, 2500),
      })
    )
  );

  // NGO orgs that match NGO nodes by name (required by allocation logic)
  const ngoOrgs = await NGO.insertMany(
    locations.map((l) => ({
      name: `${l.city} Relief NGO`,
      address: `${l.city}, ${l.state}`,
      contactInfo: {
        contactPerson: `Contact ${l.city}`,
        email: `${l.city.replace(/\s+/g, "").toLowerCase()}@relief.org`,
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
    `✅ Created nodes: ${farms.length} farms, ${warehouses.length} warehouses, ${ngoNodes.length} NGO nodes, ${ngoOrgs.length} NGO orgs`
  );

  const baseDate = new Date("2026-02-03T00:00:00Z");

  // Batches: plenty of variety across warehouses.
  // - Most warehouses: balanced
  // - Delhi: slightly limited perishables
  // - Jaipur: lots of perishables (creates a tradeoff)
  const batches = [];
  for (const wh of warehouses) {
    const whName = String(wh.name || "");
    const isDelhi = /delhi/i.test(whName);
    const isJaipur = /jaipur/i.test(whName);

    const batchCount = isDelhi ? 22 : isJaipur ? 55 : 35;

    for (let i = 0; i < batchCount; i++) {
      const food = pick(foodCatalog);

      // Older stock in some warehouses to create expiry-pressure differences.
      const daysOldBase = isJaipur ? randInt(0, 8) : randInt(0, 20);
      const daysOld =
        food.shelfLifeHours <= 120 ? Math.min(daysOldBase, 5) : daysOldBase;

      const manufactureDate = new Date(baseDate);
      manufactureDate.setUTCDate(manufactureDate.getUTCDate() - daysOld);

      const qty =
        food.shelfLifeHours <= 120 ? randInt(40, 140) : randInt(80, 320);

      // Freshness trend: older -> lower; add noise.
      const freshness = Math.max(
        10,
        Math.min(
          100,
          100 - daysOld * (food.shelfLifeHours <= 120 ? 14 : 3) + randInt(-8, 8)
        )
      );

      batches.push({
        foodType: food.foodType,
        quantity_kg: qty,
        original_quantity_kg: qty,
        originNode: pick(farms)._id,
        currentNode: wh._id,
        status: "stored",
        shelf_life_hours: food.shelfLifeHours,
        manufacture_date: manufactureDate,
        freshnessPct: freshness,
        history: [],
        metadata: { district: wh.district, state: wh.regionId },
      });
    }
  }

  const createdBatches = await Batch.insertMany(batches);
  console.log(`✅ Created ${createdBatches.length} batches`);

  // Shipments: create flow features for a subset of districts.
  // We ship from warehouses -> NGOs using batches from the warehouse.
  const batchesByWarehouse = new Map();
  for (const b of createdBatches) {
    const key = b.currentNode?.toString?.() ?? String(b.currentNode);
    const arr = batchesByWarehouse.get(key) || [];
    arr.push(b);
    batchesByWarehouse.set(key, arr);
  }

  const shipmentDocs = [];
  const shipmentsToCreate = 90;
  for (let i = 0; i < shipmentsToCreate; i++) {
    const wh = pick(warehouses);
    const whLoc =
      locations.find((l) => `${l.city} Central Warehouse` === wh.name) ||
      pick(locations);
    const ngo = pick(ngoNodes);
    const ngoLoc =
      locations.find((l) => `${l.city} Relief NGO` === ngo.name) ||
      pick(locations);

    const distKm = estimateDistanceKm(whLoc, ngoLoc);
    const travelMins = Math.round(
      (distKm / 40) * 60 + Math.floor(distKm / 160) * 30
    );

    const start = new Date(baseDate);
    start.setUTCDate(start.getUTCDate() - randInt(0, 12));
    start.setUTCHours(randInt(1, 22), randInt(0, 59), 0, 0);

    const eta = new Date(start.getTime() + travelMins * 60 * 1000);
    const arrived =
      rng() < 0.7
        ? new Date(eta.getTime() + randInt(-30, 180) * 60 * 1000)
        : null;

    const whBatches = batchesByWarehouse.get(wh._id.toString()) || [];
    const batchIds = whBatches
      .slice(0)
      .sort(() => rng() - 0.5)
      .slice(0, randInt(1, 3))
      .map((b) => b._id);

    shipmentDocs.push({
      shipmentID: `SHP-MLPWR-${String(i + 1).padStart(4, "0")}`,
      batchIds,
      fromNode: wh._id,
      toNode: ngo._id,
      start_iso: start,
      eta_iso: eta,
      arrived_iso: arrived,
      status: arrived ? "arrived" : "in_transit",
      travel_time_minutes: travelMins,
      distance_km: distKm,
      metadata: { scenario: "ml-power" },
    });
  }

  const createdShipments = await Shipment.insertMany(shipmentDocs);
  console.log(`✅ Created ${createdShipments.length} shipments`);

  // Requests: create many pending requests across districts.
  // We want a rich slice in simulateAllocations (limit=100 pending, most recent).
  const requests = [];

  const orgByName = new Map(ngoOrgs.map((o) => [o.name, o]));

  function addRequest({
    orgName,
    createdOn,
    requiredBefore,
    items,
    requestID,
  }) {
    const org = orgByName.get(orgName);
    if (!org) throw new Error(`NGO org not found for ${orgName}`);
    requests.push({
      requesterNode: org._id,
      requestID,
      items,
      createdOn,
      requiredBefore,
      status: "pending",
    });
  }

  let reqCounter = 1;
  const normalOrgNames = locations.map((l) => `${l.city} Relief NGO`);

  // Baseline: 6-10 requests per org (keeps variety in latest 100)
  for (const orgName of normalOrgNames) {
    const count = randInt(6, 10);
    for (let i = 0; i < count; i++) {
      const createdOn = new Date(baseDate);
      createdOn.setUTCHours(randInt(6, 20), randInt(0, 59), 0, 0);
      createdOn.setUTCDate(createdOn.getUTCDate() - randInt(0, 1));

      const requiredBefore = new Date(
        createdOn.getTime() + randInt(6, 48) * 3600 * 1000
      );

      const itemCount = randInt(1, 3);
      const items = [];
      const used = new Set();
      for (let k = 0; k < itemCount; k++) {
        const food = pick(foodCatalog);
        if (used.has(food.foodType)) continue;
        used.add(food.foodType);
        const kg =
          food.shelfLifeHours <= 120 ? randInt(20, 120) : randInt(60, 260);
        items.push({ foodType: food.foodType, required_kg: kg });
      }

      addRequest({
        orgName,
        createdOn,
        requiredBefore,
        items,
        requestID: `REQ-MLPWR-${String(reqCounter++).padStart(5, "0")}`,
      });
    }
  }

  // Anomaly 1: Demand surge in Chandigarh (outlier requested_kg + request_count)
  for (let i = 0; i < 28; i++) {
    const createdOn = new Date("2026-02-03T18:00:00Z");
    createdOn.setUTCMinutes(randInt(0, 59));
    const requiredBefore = new Date(
      createdOn.getTime() + randInt(4, 18) * 3600 * 1000
    );

    addRequest({
      orgName: "Chandigarh Relief NGO",
      createdOn,
      requiredBefore,
      items: [
        { foodType: "rice", required_kg: randInt(700, 1400) },
        { foodType: "milk", required_kg: randInt(120, 260) },
        { foodType: "vegetables", required_kg: randInt(200, 520) },
      ],
      requestID: `REQ-MLPWR-SURGE-${String(i + 1).padStart(3, "0")}`,
    });
  }

  // Anomaly 2: Flow disruption in Guwahati (many requests, but shipments are random so often low incoming)
  for (let i = 0; i < 18; i++) {
    const createdOn = new Date("2026-02-03T17:30:00Z");
    createdOn.setUTCMinutes(randInt(0, 59));
    const requiredBefore = new Date(
      createdOn.getTime() + randInt(8, 30) * 3600 * 1000
    );

    addRequest({
      orgName: "Guwahati Relief NGO",
      createdOn,
      requiredBefore,
      items: [
        { foodType: "pulses", required_kg: randInt(450, 850) },
        { foodType: "wheat", required_kg: randInt(350, 700) },
      ],
      requestID: `REQ-MLPWR-DISRUPT-${String(i + 1).padStart(3, "0")}`,
    });
  }

  const createdRequests = await Request.insertMany(requests);
  console.log(`✅ Created ${createdRequests.length} pending requests`);

  console.log("\n🎯 Seed complete (ml-power)");
  console.log("   Recommended compare date: 2026-02-03");
  console.log("   API: /api/history/compare?date=2026-02-03");
  console.log("   UI: /admin/timeline-comparison (select 2026-02-03)");

  await mongoose.disconnect();
  console.log("✅ Disconnected");
}

seedMlPower().catch((err) => {
  console.error("❌ seed-ml-power failed:", err);
  process.exit(1);
});
