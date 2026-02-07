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

async function testComparison() {
  try {
    await mongoose.connect(MONGODB_URI);

    const targetDate = new Date("2026-01-28T23:59:59.999Z");

    console.log("\n🧪 STANDALONE COMPARISON TEST (Without HTTP Server)\n");
    console.log("=".repeat(70));

    // Fetch data
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

    console.log("\n📊 Data Summary:");
    console.log(`   • Batches: ${batches.length}`);
    console.log(`   • Pending Requests: ${requests.length}`);
    console.log(`   • Warehouses: ${warehouses.length}`);
    console.log(`   • NGO Nodes: ${ngos.length}\n`);

    if (requests.length === 0) {
      console.log("❌ No pending requests found. Cannot run comparison.\n");
      await mongoose.disconnect();
      process.exit(1);
    }

    // Run allocations
    console.log("🔄 Running allocations...\n");

    const [regularAllocations, mlAllocations] = await Promise.all([
      allocateRegular(requests, batches, warehouses, ngos),
      allocateML(requests, batches, warehouses, ngos),
    ]);

    console.log("=".repeat(70));
    console.log("\n📦 ALLOCATION RESULTS:\n");
    console.log(`🔴 Regular: ${regularAllocations.length} allocations`);
    console.log(`🟢 ML: ${mlAllocations.length} allocations\n`);

    if (regularAllocations.length > 0) {
      console.log("Sample Regular Allocation:");
      console.log(JSON.stringify(regularAllocations[0], null, 2));
      console.log();
    }

    if (mlAllocations.length > 0) {
      console.log("Sample ML Allocation:");
      console.log(JSON.stringify(mlAllocations[0], null, 2));
      console.log();
    }

    // Calculate metrics
    const calcMetrics = (allocations) => {
      if (allocations.length === 0) return { total: 0 };
      const totalRequired = allocations.reduce(
        (sum, a) => sum + a.required_kg,
        0
      );
      const totalAllocated = allocations.reduce(
        (sum, a) => sum + a.allocated_kg,
        0
      );
      const avgDistance =
        allocations.reduce((sum, a) => sum + a.distance_km, 0) /
        allocations.length;
      return {
        totalRequired,
        totalAllocated,
        fulfillmentRate: (totalAllocated / totalRequired) * 100,
        avgDistance,
      };
    };

    const regularMetrics = calcMetrics(regularAllocations);
    const mlMetrics = calcMetrics(mlAllocations);

    console.log("=".repeat(70));
    console.log("\n📊 METRICS COMPARISON:\n");
    console.log("🔴 Regular:");
    console.log(`   • Total Required: ${regularMetrics.totalRequired || 0} kg`);
    console.log(
      `   • Total Allocated: ${regularMetrics.totalAllocated || 0} kg`
    );
    console.log(
      `   • Fulfillment: ${(regularMetrics.fulfillmentRate || 0).toFixed(2)}%`
    );
    console.log(
      `   • Avg Distance: ${(regularMetrics.avgDistance || 0).toFixed(2)} km\n`
    );

    console.log("🟢 ML:");
    console.log(`   • Total Required: ${mlMetrics.totalRequired || 0} kg`);
    console.log(`   • Total Allocated: ${mlMetrics.totalAllocated || 0} kg`);
    console.log(
      `   • Fulfillment: ${(mlMetrics.fulfillmentRate || 0).toFixed(2)}%`
    );
    console.log(
      `   • Avg Distance: ${(mlMetrics.avgDistance || 0).toFixed(2)} km\n`
    );

    if (mlMetrics.fulfillmentRate && regularMetrics.fulfillmentRate) {
      const improvement =
        mlMetrics.fulfillmentRate - regularMetrics.fulfillmentRate;
      const distReduction =
        ((regularMetrics.avgDistance - mlMetrics.avgDistance) /
          regularMetrics.avgDistance) *
        100;
      console.log("📈 Improvements:");
      console.log(
        `   • Fulfillment: ${improvement >= 0 ? "+" : ""}${improvement.toFixed(2)}%`
      );
      console.log(`   • Distance Reduction: ${distReduction.toFixed(2)}%\n`);
    }

    console.log("=".repeat(70));

    if (regularAllocations.length > 0 || mlAllocations.length > 0) {
      console.log("\n✅ SUCCESS: Comparison test completed!\n");
    } else {
      console.log(
        "\n⚠️  WARNING: No allocations generated. Check simulation logic.\n"
      );
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testComparison();
