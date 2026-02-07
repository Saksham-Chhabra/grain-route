/**
 * ML Demonstration Seed - Creates challenging scenarios to show ML benefits
 *
 * Key differences from normal seed:
 * 1. Mixed freshness batches (30-100%) - shows freshness optimization
 * 2. Limited inventory - forces prioritization decisions
 * 3. Varied distances - shows distance vs freshness tradeoff
 * 4. High demand surge - tests predictive pre-positioning
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Node } from "../src/models/node.model.js";
import { Batch } from "../src/models/batch.model.js";
import { Request } from "../src/models/request.model.js";
import { NGO } from "../src/models/NGO.model.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/food_supply_chain";

async function seedMLDemo() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Clear existing data
    await Promise.all([
      Node.deleteMany({}),
      Batch.deleteMany({}),
      Request.deleteMany({}),
      NGO.deleteMany({}),
    ]);
    console.log("🗑️  Cleared existing data");

    // Create nodes with strategic positioning
    const farms = await Node.insertMany([
      {
        nodeId: "FARM-NORTH-001",
        type: "farm",
        name: "Punjab Rice Farm",
        regionId: "REG-NORTH",
        district: "Amritsar",
        location: { type: "Point", coordinates: [74.8723, 31.634] }, // Punjab
        capacity_kg: 5000,
      },
      {
        nodeId: "FARM-SOUTH-001",
        type: "farm",
        name: "Kerala Rice Farm",
        regionId: "REG-SOUTH",
        district: "Kochi",
        location: { type: "Point", coordinates: [76.2673, 9.9312] }, // Kerala
        capacity_kg: 5000,
      },
    ]);

    const warehouses = await Node.insertMany([
      {
        nodeId: "WH-DELHI-001",
        type: "warehouse",
        name: "Delhi Central Warehouse",
        regionId: "REG-NORTH",
        district: "Delhi",
        location: { type: "Point", coordinates: [77.209, 28.6139] }, // Delhi
        capacity_kg: 3000, // Limited capacity
      },
      {
        nodeId: "WH-MUMBAI-001",
        type: "warehouse",
        name: "Mumbai Warehouse",
        regionId: "REG-WEST",
        district: "Mumbai",
        location: { type: "Point", coordinates: [72.8777, 19.076] }, // Mumbai
        capacity_kg: 2500, // Limited capacity
      },
      {
        nodeId: "WH-KOLKATA-001",
        type: "warehouse",
        name: "Kolkata Warehouse",
        regionId: "REG-EAST",
        district: "Kolkata",
        location: { type: "Point", coordinates: [88.3639, 22.5726] }, // Kolkata - Far from others
        capacity_kg: 2000,
      },
    ]);

    const ngos = await Node.insertMany([
      {
        nodeId: "NGO-DELHI-001",
        type: "ngo",
        name: "Delhi Relief NGO",
        regionId: "REG-NORTH",
        district: "Delhi",
        location: { type: "Point", coordinates: [77.2167, 28.6448] }, // Near Delhi WH
      },
      {
        nodeId: "NGO-MUMBAI-001",
        type: "ngo",
        name: "Mumbai Relief NGO",
        regionId: "REG-WEST",
        district: "Mumbai",
        location: { type: "Point", coordinates: [72.8479, 19.0176] }, // Near Mumbai WH
      },
      {
        nodeId: "NGO-KOLKATA-001",
        type: "ngo",
        name: "Kolkata Relief NGO",
        regionId: "REG-EAST",
        district: "Kolkata",
        location: { type: "Point", coordinates: [88.3476, 22.5726] }, // Near Kolkata WH
      },
    ]);

    // Create NGO organizations
    const ngoOrgs = await NGO.insertMany([
      {
        name: "Delhi Relief NGO",
        address: "Central Delhi",
        contactInfo: {
          contactPerson: "Raj Kumar",
          email: "raj@delhirelief.org",
          phone: "+91-9876543210",
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
        name: "Mumbai Relief NGO",
        address: "South Mumbai",
        contactInfo: {
          contactPerson: "Priya Sharma",
          email: "priya@mumbairelief.org",
          phone: "+91-9876543211",
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
        name: "Kolkata Relief NGO",
        address: "Central Kolkata",
        contactInfo: {
          contactPerson: "Amit Das",
          email: "amit@kolkatarelief.org",
          phone: "+91-9876543212",
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

    console.log(
      `✅ Created ${farms.length} farms, ${warehouses.length} warehouses, ${ngos.length} NGOs`
    );

    // Create batches with MIXED FRESHNESS (30-100%) and LIMITED QUANTITY
    const batches = [];
    const baseDate = new Date("2026-01-20T00:00:00Z");
    const foodTypes = ["rice", "wheat", "pulses"];

    // Old batches (30-60% fresh) in Kolkata warehouse - far away
    for (let i = 0; i < 8; i++) {
      const daysOld = 20 + Math.floor(Math.random() * 10); // 20-30 days old
      const manufactureDate = new Date(baseDate);
      manufactureDate.setDate(manufactureDate.getDate() - daysOld);

      batches.push({
        foodType: foodTypes[i % 3],
        quantity_kg: 100 + Math.floor(Math.random() * 150), // 100-250 kg
        original_quantity_kg: 300,
        originNode: farms[1]._id,
        currentNode: warehouses[2]._id, // Kolkata - FAR
        status: "stored",
        shelf_life_hours: 720,
        manufacture_date: manufactureDate,
        freshnessPct: 30 + Math.floor(Math.random() * 30), // 30-60% fresh (OLD)
        history: [],
        metadata: { district: "Kolkata" },
      });
    }

    // Medium fresh batches (60-85%) in Mumbai warehouse - medium distance
    for (let i = 0; i < 6; i++) {
      const daysOld = 8 + Math.floor(Math.random() * 7); // 8-15 days old
      const manufactureDate = new Date(baseDate);
      manufactureDate.setDate(manufactureDate.getDate() - daysOld);

      batches.push({
        foodType: foodTypes[i % 3],
        quantity_kg: 120 + Math.floor(Math.random() * 130), // 120-250 kg
        original_quantity_kg: 300,
        originNode: farms[0]._id,
        currentNode: warehouses[1]._id, // Mumbai - MEDIUM
        status: "stored",
        shelf_life_hours: 720,
        manufacture_date: manufactureDate,
        freshnessPct: 60 + Math.floor(Math.random() * 25), // 60-85% fresh (MEDIUM)
        history: [],
        metadata: { district: "Mumbai" },
      });
    }

    // Fresh batches (85-100%) in Delhi warehouse - closest
    for (let i = 0; i < 5; i++) {
      const daysOld = Math.floor(Math.random() * 5); // 0-5 days old
      const manufactureDate = new Date(baseDate);
      manufactureDate.setDate(manufactureDate.getDate() - daysOld);

      batches.push({
        foodType: foodTypes[i % 3],
        quantity_kg: 80 + Math.floor(Math.random() * 120), // 80-200 kg (LIMITED)
        original_quantity_kg: 300,
        originNode: farms[0]._id,
        currentNode: warehouses[0]._id, // Delhi - CLOSE
        status: "stored",
        shelf_life_hours: 720,
        manufacture_date: manufactureDate,
        freshnessPct: 85 + Math.floor(Math.random() * 15), // 85-100% fresh (VERY FRESH)
        history: [],
        metadata: { district: "Delhi" },
      });
    }

    const createdBatches = await Batch.insertMany(batches);
    console.log(
      `✅ Created ${createdBatches.length} batches with mixed freshness (30-100%)`
    );

    // Create HIGH DEMAND REQUESTS - more demand than supply
    const requests = [];

    // Delhi NGO - Large urgent request (close to fresh Delhi warehouse)
    requests.push({
      requesterNode: ngoOrgs[0]._id,
      requestID: "REQ-ML-DEMO-001",
      items: [
        { foodType: "rice", required_kg: 600 }, // High demand
        { foodType: "wheat", required_kg: 500 },
      ],
      createdOn: new Date("2026-01-28T08:00:00Z"),
      requiredBefore: new Date("2026-01-28T20:00:00Z"),
      status: "pending",
    });

    // Mumbai NGO - Medium request (medium distance, medium freshness available)
    requests.push({
      requesterNode: ngoOrgs[1]._id,
      requestID: "REQ-ML-DEMO-002",
      items: [
        { foodType: "rice", required_kg: 400 },
        { foodType: "pulses", required_kg: 350 },
      ],
      createdOn: new Date("2026-01-28T09:00:00Z"),
      requiredBefore: new Date("2026-01-29T18:00:00Z"),
      status: "pending",
    });

    // Kolkata NGO - Large request (far, but old batches available locally)
    requests.push({
      requesterNode: ngoOrgs[2]._id,
      requestID: "REQ-ML-DEMO-003",
      items: [
        { foodType: "pulses", required_kg: 450 },
        { foodType: "wheat", required_kg: 400 },
      ],
      createdOn: new Date("2026-01-28T10:00:00Z"),
      requiredBefore: new Date("2026-01-29T12:00:00Z"),
      status: "pending",
    });

    const createdRequests = await Request.insertMany(requests);
    console.log(`✅ Created ${createdRequests.length} high-demand requests`);

    console.log("\n🎯 ML Demo Scenario Created:");
    console.log("   📦 Total inventory: ~2400 kg");
    console.log("   📝 Total demand: ~2700 kg (SHORTAGE!)");
    console.log("   🏭 Freshness range: 30-100%");
    console.log("   📍 Distance range: 0-1500 km");
    console.log("\n💡 Expected Results:");
    console.log(
      "   🔴 Regular: Uses nearest warehouse (Kolkata old batches for Kolkata NGO)"
    );
    console.log(
      "   🟢 ML: Optimizes freshness (60%) + distance (40%), better allocation"
    );
    console.log(
      "\n🧪 Test with: http://localhost:3001/api/history/compare?date=2026-01-28"
    );

    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
    console.log("🎉 ML demonstration data seeded successfully!");
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  }
}

seedMLDemo();
