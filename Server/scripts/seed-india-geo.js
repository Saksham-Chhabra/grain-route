/**
 * Seed: India Geography Demo
 *
 * Creates a reasonably sized India-wide dataset (nodes + NGOs + batches + requests + events)
 * so you can test map visualizations and Regular vs ML simulations.
 *
 * Run:
 *   - node scripts/seed-india-geo.js
 *   - or: npm run seed:india
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

import { Node } from "../src/models/node.model.js";
import { Batch } from "../src/models/batch.model.js";
import { Request } from "../src/models/request.model.js";
import { NGO } from "../src/models/NGO.model.js";
import { Shipment } from "../src/models/shipment.model.js";
import { Event } from "../src/models/event.model.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/food_supply_chain";

// Deterministic PRNG for repeatable seeding
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

const rng = mulberry32(20260202);
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const now = new Date();

const foodCatalog = [
  // Non-perishables / long shelf
  { foodType: "rice", shelfLifeHours: 720, tempC: 25 },
  { foodType: "wheat", shelfLifeHours: 720, tempC: 25 },
  { foodType: "pulses", shelfLifeHours: 1440, tempC: 25 },
  // Perishables
  { foodType: "vegetables", shelfLifeHours: 120, tempC: 28 },
  { foodType: "fruits", shelfLifeHours: 168, tempC: 28 },
  { foodType: "milk", shelfLifeHours: 72, tempC: 26 },
];

// Warehouses + NGOs across India. Coordinates are approximate city centers.
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
    city: "Ahmedabad",
    district: "Ahmedabad",
    state: "Gujarat",
    lat: 23.0225,
    lon: 72.5714,
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
    city: "Bhopal",
    district: "Bhopal",
    state: "Madhya Pradesh",
    lat: 23.2599,
    lon: 77.4126,
  },
  {
    city: "Patna",
    district: "Patna",
    state: "Bihar",
    lat: 25.5941,
    lon: 85.1376,
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
  {
    city: "Chandigarh",
    district: "Chandigarh",
    state: "Chandigarh",
    lat: 30.7333,
    lon: 76.7794,
  },
  {
    city: "Bhubaneswar",
    district: "Khordha",
    state: "Odisha",
    lat: 20.2961,
    lon: 85.8245,
  },
  {
    city: "Indore",
    district: "Indore",
    state: "Madhya Pradesh",
    lat: 22.7196,
    lon: 75.8577,
  },
  {
    city: "Nagpur",
    district: "Nagpur",
    state: "Maharashtra",
    lat: 21.1458,
    lon: 79.0882,
  },
  {
    city: "Surat",
    district: "Surat",
    state: "Gujarat",
    lat: 21.1702,
    lon: 72.8311,
  },
  {
    city: "Varanasi",
    district: "Varanasi",
    state: "Uttar Pradesh",
    lat: 25.3176,
    lon: 82.9739,
  },
  {
    city: "Visakhapatnam",
    district: "Visakhapatnam",
    state: "Andhra Pradesh",
    lat: 17.6868,
    lon: 83.2185,
  },
  {
    city: "Ranchi",
    district: "Ranchi",
    state: "Jharkhand",
    lat: 23.3441,
    lon: 85.3096,
  },
  {
    city: "Raipur",
    district: "Raipur",
    state: "Chhattisgarh",
    lat: 21.2514,
    lon: 81.6296,
  },
  {
    city: "Srinagar",
    district: "Srinagar",
    state: "Jammu and Kashmir",
    lat: 34.0837,
    lon: 74.7973,
  },
  {
    city: "Pune",
    district: "Pune",
    state: "Maharashtra",
    lat: 18.5204,
    lon: 73.8567,
  },
  {
    city: "Coimbatore",
    district: "Coimbatore",
    state: "Tamil Nadu",
    lat: 11.0168,
    lon: 76.9558,
  },
];

function jitterCoord(value, maxDelta) {
  // jitter in degrees (small)
  const delta = (rng() * 2 - 1) * maxDelta;
  return value + delta;
}

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

function makeNgoOrg({ name, addressCity, state }) {
  const contactId = randInt(1000, 9999);
  return {
    name,
    address: `${addressCity}, ${state}, India`,
    contactInfo: {
      contactPerson: `Coordinator ${contactId}`,
      email: `coord${contactId}@${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")}\.org`,
      phone: `+91-${randInt(7000000000, 9999999999)}`,
    },
    requestStats: {
      pending: 0,
      completed: 0,
      total: 0,
      cancelled: 0,
      approved: 0,
    },
  };
}

function randomManufactureDateFor(foodType) {
  // Keep perishables mostly recent; keep some older batches for "spoilage saved" demos.
  if (foodType === "milk")
    return new Date(now.getTime() - randInt(6, 72) * 3600 * 1000);
  if (foodType === "vegetables" || foodType === "fruits")
    return new Date(now.getTime() - randInt(6, 144) * 3600 * 1000);
  // Non-perishables: up to 20 days old
  return new Date(now.getTime() - randInt(6, 20 * 24) * 3600 * 1000);
}

function computeFreshnessApprox({ shelfLifeHours, manufactureDate, tempC }) {
  // Roughly aligns with utils/freshness.js (temp factor) but keeps it simple.
  const elapsedHours =
    (now.getTime() - manufactureDate.getTime()) / (3600 * 1000);
  const tempFactor = 1 + Math.max(0, (tempC - 20) / 10) * 0.5;
  const freshness = 100 - (elapsedHours / shelfLifeHours) * 100 * tempFactor;
  return Math.round(clamp(freshness, 0, 100) * 100) / 100;
}

async function seedIndiaGeo() {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected");

  console.log("🗑️  Clearing existing data...");
  await Promise.all([
    Node.deleteMany({}),
    Batch.deleteMany({}),
    Request.deleteMany({}),
    NGO.deleteMany({}),
    Shipment.deleteMany({}),
    Event.deleteMany({}),
  ]);
  console.log("✅ Cleared");

  // Build nodes
  const warehouseLocations = locations.slice(0, 14); // 14 warehouses
  const ngoLocations = locations.slice(0, 18); // 18 NGOs

  const farmsLocations = [
    {
      name: "Punjab Rice Farm",
      state: "Punjab",
      district: "Ludhiana",
      lat: 30.901,
      lon: 75.8573,
    },
    {
      name: "Haryana Wheat Farm",
      state: "Haryana",
      district: "Karnal",
      lat: 29.6857,
      lon: 76.9905,
    },
    {
      name: "UP Pulses Farm",
      state: "Uttar Pradesh",
      district: "Kanpur Nagar",
      lat: 26.4499,
      lon: 80.3319,
    },
    {
      name: "WB Rice Farm",
      state: "West Bengal",
      district: "Bardhaman",
      lat: 23.2324,
      lon: 87.855,
    },
    {
      name: "AP Coastal Farm",
      state: "Andhra Pradesh",
      district: "Krishna",
      lat: 16.516,
      lon: 80.63,
    },
    {
      name: "TN Vegetable Farm",
      state: "Tamil Nadu",
      district: "Thanjavur",
      lat: 10.787,
      lon: 79.1378,
    },
    {
      name: "MP Mixed Farm",
      state: "Madhya Pradesh",
      district: "Sehore",
      lat: 23.2,
      lon: 77.08,
    },
    {
      name: "Assam Rice Farm",
      state: "Assam",
      district: "Nagaon",
      lat: 26.3464,
      lon: 92.684,
    },
  ];

  const demoNodes = [];

  for (const f of farmsLocations) {
    demoNodes.push(
      makeNode({
        type: "farm",
        name: f.name,
        state: f.state,
        district: f.district,
        lat: f.lat,
        lon: f.lon,
        capacityKg: randInt(3000, 8000),
      })
    );
  }

  for (const loc of warehouseLocations) {
    demoNodes.push(
      makeNode({
        type: "warehouse",
        name: `${loc.city} Central Warehouse`,
        state: loc.state,
        district: loc.district,
        lat: jitterCoord(loc.lat, 0.04),
        lon: jitterCoord(loc.lon, 0.04),
        capacityKg: randInt(6000, 20000),
      })
    );
  }

  for (const loc of ngoLocations) {
    demoNodes.push(
      makeNode({
        type: "ngo",
        // IMPORTANT: must match NGO.name for allocation mapping
        name: `${loc.city} Relief NGO`,
        state: loc.state,
        district: loc.district,
        lat: jitterCoord(loc.lat, 0.03),
        lon: jitterCoord(loc.lon, 0.03),
        capacityKg: randInt(800, 4000),
      })
    );
  }

  console.log("📍 Creating nodes...");
  const createdNodes = await Node.insertMany(demoNodes);

  const farms = createdNodes.filter((n) => n.type === "farm");
  const warehouses = createdNodes.filter((n) => n.type === "warehouse");
  const ngoNodesCreated = createdNodes.filter((n) => n.type === "ngo");

  console.log(
    `✅ Created ${createdNodes.length} nodes (${farms.length} farms, ${warehouses.length} warehouses, ${ngoNodesCreated.length} NGOs)`
  );

  // Create NGO orgs that match ngo nodes by name
  console.log("🏢 Creating NGO organizations...");
  const ngoOrgsPayload = ngoNodesCreated.map((ngoNode) => {
    const city = ngoNode.name.replace(/\s+Relief\s+NGO$/, "");
    return makeNgoOrg({
      name: ngoNode.name,
      addressCity: city,
      state: ngoNode.regionId,
    });
  });
  const ngoOrgs = await NGO.insertMany(ngoOrgsPayload);
  console.log(`✅ Created ${ngoOrgs.length} NGO orgs`);

  // Create batches distributed across warehouses.
  console.log("📦 Creating batches...");
  const batches = [];

  for (const warehouse of warehouses) {
    const batchesPerWarehouse = randInt(10, 16);
    for (let i = 0; i < batchesPerWarehouse; i++) {
      const food = pick(foodCatalog);
      const manufactureDate = randomManufactureDateFor(food.foodType);
      const shelfLifeHours = food.shelfLifeHours;

      const qty =
        food.foodType === "milk"
          ? randInt(20, 80)
          : food.foodType === "vegetables" || food.foodType === "fruits"
            ? randInt(60, 220)
            : randInt(150, 600);

      const originFarm = pick(farms);

      batches.push({
        foodType: food.foodType,
        quantity_kg: qty,
        original_quantity_kg: qty,
        originNode: originFarm._id,
        currentNode: warehouse._id,
        status: "stored",
        shelf_life_hours: shelfLifeHours,
        manufacture_date: manufactureDate,
        initial_temp_c: food.tempC,
        freshnessPct: computeFreshnessApprox({
          shelfLifeHours,
          manufactureDate,
          tempC: food.tempC,
        }),
        history: [
          {
            time: manufactureDate,
            action: "created",
            from: originFarm._id,
            to: originFarm._id,
            note: `Batch created at ${originFarm.name}`,
          },
          {
            time: new Date(
              manufactureDate.getTime() + randInt(3, 18) * 3600 * 1000
            ),
            action: "transferred",
            from: originFarm._id,
            to: warehouse._id,
            note: `Transferred to ${warehouse.name}`,
          },
        ],
        metadata: {
          state: warehouse.regionId,
          district: warehouse.district,
        },
      });
    }
  }

  const createdBatches = await Batch.insertMany(batches);
  console.log(`✅ Created ${createdBatches.length} batches`);

  // Create requests for NGOs, with some urgent perishable needs.
  console.log("📝 Creating requests...");
  const requests = [];

  const foodTypes = foodCatalog.map((f) => f.foodType);

  for (let i = 0; i < ngoOrgs.length; i++) {
    const ngoOrg = ngoOrgs[i];

    const requestCount = randInt(2, 4);
    for (let j = 0; j < requestCount; j++) {
      const createdOn = new Date(now.getTime() - randInt(1, 72) * 3600 * 1000);
      const isUrgent = rng() < 0.35;
      const requiredBefore = new Date(
        createdOn.getTime() +
          (isUrgent ? randInt(6, 14) : randInt(24, 72)) * 3600 * 1000
      );

      const itemsCount = randInt(1, 3);
      const items = [];
      for (let k = 0; k < itemsCount; k++) {
        const ft = pick(foodTypes);
        const qty =
          ft === "milk"
            ? randInt(40, 140)
            : ft === "vegetables" || ft === "fruits"
              ? randInt(80, 260)
              : randInt(120, 500);
        items.push({ foodType: ft, required_kg: qty });
      }

      requests.push({
        requesterNode: ngoOrg._id,
        requestID: `REQ-IND-${String(requests.length + 1).padStart(5, "0")}`,
        items,
        createdOn,
        requiredBefore,
        status: "pending",
      });
    }
  }

  // Add a couple of "festival-like" surges in major metros
  const delhiNgo = ngoOrgs.find((o) => o.name.startsWith("New Delhi"));
  if (delhiNgo) {
    requests.push({
      requesterNode: delhiNgo._id,
      requestID: `REQ-IND-SURGE-DELHI`,
      items: [
        { foodType: "rice", required_kg: 900 },
        { foodType: "pulses", required_kg: 600 },
        { foodType: "vegetables", required_kg: 350 },
      ],
      createdOn: new Date(now.getTime() - 6 * 3600 * 1000),
      requiredBefore: new Date(now.getTime() + 10 * 3600 * 1000),
      status: "pending",
    });
  }

  const mumbaiNgo = ngoOrgs.find((o) => o.name.startsWith("Mumbai"));
  if (mumbaiNgo) {
    requests.push({
      requesterNode: mumbaiNgo._id,
      requestID: `REQ-IND-SURGE-MUMBAI`,
      items: [
        { foodType: "milk", required_kg: 250 },
        { foodType: "fruits", required_kg: 300 },
      ],
      createdOn: new Date(now.getTime() - 8 * 3600 * 1000),
      requiredBefore: new Date(now.getTime() + 8 * 3600 * 1000),
      status: "pending",
    });
  }

  const createdRequests = await Request.insertMany(requests);
  console.log(`✅ Created ${createdRequests.length} requests`);

  // Events: farm production + ngo_request (useful for history/day)
  console.log("📅 Creating events...");
  const events = [];

  for (const batch of createdBatches.slice(
    0,
    Math.min(60, createdBatches.length)
  )) {
    const farm = farms.find(
      (f) => f._id.toString() === batch.originNode.toString()
    );
    if (!farm) continue;
    events.push({
      time: batch.manufacture_date,
      type: "farm_production",
      location: farm.location,
      payload: {
        node: {
          nodeId: farm._id,
          name: farm.name,
          type: farm.type,
          district: farm.district,
          state: farm.regionId,
        },
        quantity_kg: batch.quantity_kg,
        batch: {
          batchId: batch._id,
          foodType: batch.foodType,
          dateOfCreation: batch.manufacture_date,
        },
      },
    });
  }

  for (const req of createdRequests.slice(
    0,
    Math.min(80, createdRequests.length)
  )) {
    const org = ngoOrgs.find(
      (o) => o._id.toString() === req.requesterNode.toString()
    );
    const node = org ? ngoNodesCreated.find((n) => n.name === org.name) : null;
    const coords = node?.location?.coordinates || [78.9629, 20.5937];

    events.push({
      time: req.createdOn || now,
      type: "ngo_request",
      location: { type: "Point", coordinates: coords },
      payload: {
        requesterNode: org?.name || "Unknown NGO",
        requestID: req.requestID,
        items: req.items,
        createdOn: req.createdOn,
        requiredBefore: req.requiredBefore,
      },
    });
  }

  await Event.insertMany(events);
  console.log(`✅ Created ${events.length} events`);

  console.log("\n" + "=".repeat(64));
  console.log("🇮🇳 INDIA GEO SEED COMPLETE");
  console.log("=".repeat(64));
  console.log(
    `Nodes: ${createdNodes.length} (Warehouses: ${warehouses.length}, NGOs: ${ngoNodesCreated.length}, Farms: ${farms.length})`
  );
  console.log(`Batches: ${createdBatches.length}`);
  console.log(`Requests: ${createdRequests.length}`);
  console.log("\nTry:");
  console.log("  - http://localhost:3001/api/history/simulate");
  console.log("  - http://localhost:3001/api/history/compare?date=2026-02-02");

  await mongoose.disconnect();
  console.log("✅ Disconnected");
}

seedIndiaGeo().catch(async (err) => {
  console.error("❌ Seeding failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
