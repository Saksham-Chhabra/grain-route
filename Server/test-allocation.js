import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  allocateRegular,
  allocateML,
} from "./src/services/simulationService.js";
import { Request } from "./src/models/request.model.js";
import { Batch } from "./src/models/batch.model.js";
import { Node } from "./src/models/node.model.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/food_supply_chain";

async function testAllocation() {
  try {
    await mongoose.connect(MONGODB_URI);

    const targetDate = new Date("2026-01-28T23:59:59.999Z");

    console.log("📊 Testing allocation logic directly...\n");

    const [batches, requests, warehouses, ngos] = await Promise.all([
      Batch.find({
        manufacture_date: { $lte: targetDate },
        status: "stored",
      }).lean(),
      Request.find({
        createdOn: { $lte: targetDate },
        status: "pending",
      }).lean(),
      Node.find({ type: "warehouse" }).lean(),
      Node.find({ type: "ngo" }).lean(),
    ]);

    console.log(`Batches: ${batches.length}`);
    console.log(`Requests: ${requests.length}`);
    console.log(`Warehouses: ${warehouses.length}`);
    console.log(`NGOs: ${ngos.length}\n`);

    if (requests.length > 0) {
      console.log("Sample request:");
      console.log(JSON.stringify(requests[0], null, 2));
      console.log(
        "\nRequest requesterNode:",
        requests[0].requesterNode,
        typeof requests[0].requesterNode
      );
    }

    if (ngos.length > 0) {
      console.log("\nSample NGO:");
      console.log(JSON.stringify(ngos[0], null, 2));
      console.log("NGO _id:", ngos[0]._id, typeof ngos[0]._id);
      console.log("NGO _id.toString():", ngos[0]._id.toString());

      const req0 = requests[0];
      const match = ngos.find(
        (n) => n._id.toString() === req0.requesterNode.toString()
      );
      console.log("\nDoes first request match any NGO?", match ? "YES" : "NO");
      if (!match) {
        console.log("Looking for:", req0.requesterNode.toString());
        console.log("Available NGO IDs:");
        ngos.forEach((n) => console.log("  -", n._id.toString()));
      }
    }

    console.log("\n🔄 Running regular allocation...");
    const regularAllocations = await allocateRegular(
      requests,
      batches,
      warehouses,
      ngos
    );
    console.log(`Result: ${regularAllocations.length} allocations\n`);

    if (regularAllocations.length > 0) {
      console.log("Sample allocation:");
      console.log(JSON.stringify(regularAllocations[0], null, 2));
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testAllocation();
