import mongoose from "mongoose";
import dotenv from "dotenv";
import { Node } from "../src/models/node.model.js";
import { Batch } from "../src/models/batch.model.js";
import { Request } from "../src/models/request.model.js";
import { NGO } from "../src/models/NGO.model.js";
import { Event } from "../src/models/event.model.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/food_supply_chain";

// Demo data for realistic supply chain
const demoNodes = [
  // Farms
  {
    type: "farm",
    name: "Punjab Rice Farm",
    regionId: "REG-NORTH-001",
    district: "Ludhiana",
    state: "Punjab",
    location: { type: "Point", coordinates: [75.8573, 30.901] },
    capacity_kg: 5000,
  },
  {
    type: "farm",
    name: "Maharashtra Wheat Farm",
    regionId: "REG-WEST-001",
    district: "Pune",
    state: "Maharashtra",
    location: { type: "Point", coordinates: [73.8567, 18.5204] },
    capacity_kg: 4000,
  },
  {
    type: "farm",
    name: "Karnataka Vegetable Farm",
    regionId: "REG-SOUTH-001",
    district: "Bangalore Rural",
    state: "Karnataka",
    location: { type: "Point", coordinates: [77.5946, 12.9716] },
    capacity_kg: 3000,
  },
  {
    type: "farm",
    name: "Tamil Nadu Rice Farm",
    regionId: "REG-SOUTH-002",
    district: "Thanjavur",
    state: "Tamil Nadu",
    location: { type: "Point", coordinates: [79.1378, 10.787] },
    capacity_kg: 4500,
  },
  {
    type: "farm",
    name: "West Bengal Rice Farm",
    regionId: "REG-EAST-001",
    district: "Bardhaman",
    state: "West Bengal",
    location: { type: "Point", coordinates: [87.855, 23.2324] },
    capacity_kg: 5000,
  },

  // Warehouses
  {
    type: "warehouse",
    name: "Delhi Central Warehouse",
    regionId: "REG-NORTH-001",
    district: "New Delhi",
    state: "Delhi",
    location: { type: "Point", coordinates: [77.1025, 28.7041] },
    capacity_kg: 15000,
  },
  {
    type: "warehouse",
    name: "Mumbai Warehouse",
    regionId: "REG-WEST-001",
    district: "Mumbai",
    state: "Maharashtra",
    location: { type: "Point", coordinates: [72.8777, 19.076] },
    capacity_kg: 12000,
  },
  {
    type: "warehouse",
    name: "Bangalore Warehouse",
    regionId: "REG-SOUTH-001",
    district: "Bangalore",
    state: "Karnataka",
    location: { type: "Point", coordinates: [77.5946, 12.9716] },
    capacity_kg: 10000,
  },

  // NGOs
  {
    type: "ngo",
    name: "Delhi Relief NGO",
    regionId: "REG-NORTH-001",
    district: "New Delhi",
    state: "Delhi",
    location: { type: "Point", coordinates: [77.209, 28.6139] },
    capacity_kg: 2000,
  },
  {
    type: "ngo",
    name: "Mumbai Aid Center",
    regionId: "REG-WEST-001",
    district: "Mumbai",
    state: "Maharashtra",
    location: { type: "Point", coordinates: [72.8826, 19.0144] },
    capacity_kg: 1500,
  },
];

const foodTypes = ["rice", "wheat", "vegetables", "pulses"];

async function seedDatabase() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Clear existing data
    console.log("🗑️  Clearing existing data...");
    await Node.deleteMany({});
    await Batch.deleteMany({});
    await Request.deleteMany({});
    await NGO.deleteMany({});
    await Event.deleteMany({});
    console.log("✅ Cleared existing data");

    // Create nodes
    console.log("📍 Creating nodes...");
    const createdNodes = await Node.insertMany(demoNodes);
    console.log(`✅ Created ${createdNodes.length} nodes`);

    // Map nodes by type for easier reference
    const farms = createdNodes.filter((n) => n.type === "farm");
    const warehouses = createdNodes.filter((n) => n.type === "warehouse");
    const ngos = createdNodes.filter((n) => n.type === "ngo");

    // Create NGO documents
    console.log("🏢 Creating NGO organizations...");
    const ngoOrgs = await NGO.insertMany([
      {
        name: "Delhi Relief NGO",
        address: "Connaught Place, New Delhi",
        contactInfo: {
          contactPerson: "Rajesh Kumar",
          email: "rajesh@delhirelief.org",
          phone: "+91-11-12345678",
        },
        requestStats: {
          pending: 0,
          completed: 0,
          total: 0,
          cancelled: 0,
          approved: 0,
        },
      },
      {
        name: "Mumbai Aid Center",
        address: "Marine Drive, Mumbai",
        contactInfo: {
          contactPerson: "Priya Sharma",
          email: "priya@mumbaiaid.org",
          phone: "+91-22-87654321",
        },
        requestStats: {
          pending: 0,
          completed: 0,
          total: 0,
          cancelled: 0,
          approved: 0,
        },
      },
    ]);
    console.log(`✅ Created ${ngoOrgs.length} NGO organizations`);

    // Create batches - distribute across warehouses
    console.log("📦 Creating batches...");
    const batches = [];
    const baseDate = new Date("2026-01-20T00:00:00Z");

    for (let i = 0; i < 50; i++) {
      const farm = farms[Math.floor(Math.random() * farms.length)];
      const warehouse =
        warehouses[Math.floor(Math.random() * warehouses.length)];
      const foodType = foodTypes[Math.floor(Math.random() * foodTypes.length)];
      const daysOld = Math.floor(Math.random() * 15); // 0-14 days old
      const manufactureDate = new Date(baseDate);
      manufactureDate.setDate(manufactureDate.getDate() - daysOld);

      batches.push({
        foodType,
        quantity_kg: Math.floor(Math.random() * 400) + 100, // 100-500 kg
        original_quantity_kg: Math.floor(Math.random() * 400) + 100,
        originNode: farm._id,
        currentNode: warehouse._id,
        status: "stored",
        shelf_life_hours: foodType === "vegetables" ? 120 : 720, // 5 days for veg, 30 days for others
        manufacture_date: manufactureDate,
        initial_temp_c: 25,
        freshnessPct: 100,
        history: [
          {
            time: manufactureDate,
            action: "created",
            from: farm._id,
            to: farm._id,
            note: `Batch created at ${farm.name}`,
          },
          {
            time: new Date(manufactureDate.getTime() + 24 * 60 * 60 * 1000),
            action: "transferred",
            from: farm._id,
            to: warehouse._id,
            note: `Transferred to ${warehouse.name}`,
          },
        ],
        metadata: {
          district: farm.district,
          state: farm.state,
        },
      });
    }

    const createdBatches = await Batch.insertMany(batches);
    console.log(`✅ Created ${createdBatches.length} batches`);

    // Create requests - mix of pending and fulfilled
    console.log("📝 Creating NGO requests...");
    const requests = [];

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const requestDate = new Date(baseDate);
      requestDate.setDate(requestDate.getDate() + dayOffset + 5); // Requests from Jan 25-31

      // Normal demand (2 requests per day)
      for (let j = 0; j < 2; j++) {
        const ngoOrg = ngoOrgs[Math.floor(Math.random() * ngoOrgs.length)];
        const ngoNode = ngos.find((n) => n.name === ngoOrg.name);
        const numItems = Math.floor(Math.random() * 2) + 1; // 1-2 items per request
        const items = [];

        for (let k = 0; k < numItems; k++) {
          items.push({
            foodType: foodTypes[Math.floor(Math.random() * foodTypes.length)],
            required_kg: Math.floor(Math.random() * 150) + 50, // 50-200 kg
          });
        }

        const requiredByDate = new Date(requestDate);
        requiredByDate.setDate(requiredByDate.getDate() + 2); // 2 days to fulfill

        requests.push({
          requesterNode: ngoOrg._id,
          requestID: `REQ-2026-${String(requests.length + 1).padStart(4, "0")}`,
          items,
          createdOn: requestDate,
          requiredBefore: requiredByDate,
          status: dayOffset < 3 ? "fulfilled" : "pending", // First 6 fulfilled, rest pending
          fullFilledOn:
            dayOffset < 3
              ? new Date(requestDate.getTime() + 12 * 60 * 60 * 1000)
              : null,
        });
      }
    }

    // Add surge events (high demand scenarios for ML to predict)
    // Surge 1: Day 3 (Jan 28) - Disaster relief in Delhi
    requests.push({
      requesterNode: ngoOrgs[0]._id, // Delhi NGO
      requestID: `REQ-2026-SURGE-001`,
      items: [
        { foodType: "rice", required_kg: 500 },
        { foodType: "pulses", required_kg: 300 },
        { foodType: "wheat", required_kg: 400 },
      ],
      createdOn: new Date("2026-01-28T08:00:00Z"),
      requiredBefore: new Date("2026-01-28T18:00:00Z"), // Urgent: 10 hours
      status: "pending",
    });

    // Surge 2: Day 5 (Jan 30) - Festival distribution in Mumbai
    requests.push({
      requesterNode: ngoOrgs[1]._id, // Mumbai NGO
      requestID: `REQ-2026-SURGE-002`,
      items: [
        { foodType: "rice", required_kg: 400 },
        { foodType: "vegetables", required_kg: 250 },
      ],
      createdOn: new Date("2026-01-30T06:00:00Z"),
      requiredBefore: new Date("2026-01-30T14:00:00Z"), // Urgent: 8 hours
      status: "pending",
    });

    const createdRequests = await Request.insertMany(requests);
    console.log(
      `✅ Created ${createdRequests.length} requests (including 2 surge events)`
    );

    // Create events for the timeline
    console.log("📅 Creating events...");
    const events = [];

    // Farm production events
    for (const batch of createdBatches.slice(0, 20)) {
      // First 20 batches
      const farm = farms.find(
        (f) => f._id.toString() === batch.originNode.toString()
      );
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
            state: farm.state,
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

    // NGO request events
    for (const request of createdRequests) {
      const ngoOrg = ngoOrgs.find(
        (n) => n._id.toString() === request.requesterNode.toString()
      );
      const ngoNode = ngos.find((n) => n.name === ngoOrg.name);

      events.push({
        time: request.createdOn,
        type: "ngo_request",
        location: ngoNode.location,
        payload: {
          requesterNode: ngoOrg.name,
          requestID: request.requestID,
          items: request.items,
          createdOn: request.createdOn,
          requiredBefore: request.requiredBefore,
        },
      });
    }

    const createdEvents = await Event.insertMany(events);
    console.log(`✅ Created ${createdEvents.length} events`);

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 DEMO DATA SEEDING COMPLETE");
    console.log("=".repeat(60));
    console.log(`\n✅ Summary:`);
    console.log(
      `   • ${createdNodes.length} nodes (${farms.length} farms, ${warehouses.length} warehouses, ${ngos.length} NGOs)`
    );
    console.log(`   • ${createdBatches.length} batches across warehouses`);
    console.log(
      `   • ${createdRequests.length} NGO requests (${createdRequests.filter((r) => r.status === "fulfilled").length} fulfilled, ${createdRequests.filter((r) => r.status === "pending").length} pending)`
    );
    console.log(`   • ${createdEvents.length} timeline events`);
    console.log(`   • 2 surge demand scenarios for ML prediction demo\n`);

    console.log("📍 Key Locations:");
    console.log(`   • Delhi Warehouse: ${warehouses[0]._id}`);
    console.log(`   • Mumbai Warehouse: ${warehouses[1]._id}`);
    console.log(`   • Delhi NGO: ${ngoOrgs[0]._id}`);
    console.log(`   • Mumbai NGO: ${ngoOrgs[1]._id}\n`);

    console.log("🎯 Demo Scenarios:");
    console.log(`   1. Normal Operations: Jan 25-26 (fulfilled requests)`);
    console.log(`   2. Pending Requests: Jan 27-31 (compare regular vs ML)`);
    console.log(
      `   3. Surge Event 1: Jan 28 Delhi (500kg rice, 300kg pulses, 400kg wheat)`
    );
    console.log(
      `   4. Surge Event 2: Jan 30 Mumbai (400kg rice, 250kg vegetables)\n`
    );

    console.log("🚀 Next Steps:");
    console.log(`   1. Start all services (Backend-A, B, C)`);
    console.log(
      `   2. Test comparison: curl "http://localhost:3001/api/history/compare?date=2026-01-28"`
    );
    console.log(`   3. Load frontend and visualize the supply chain\n`);

    await mongoose.disconnect();
    console.log("✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedDatabase();
