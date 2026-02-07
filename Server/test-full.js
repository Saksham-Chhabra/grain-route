import axios from "axios";

async function fullTest() {
  try {
    console.log("🧪 COMPREHENSIVE TEST OF ML vs REGULAR COMPARISON\n");
    console.log("=".repeat(70));

    // Test 1: Check if server is running
    console.log("\n1️⃣ Checking if server is accessible...");
    try {
      await axios.get("http://localhost:3001/api/batches?limit=1");
      console.log("   ✅ Server is running\n");
    } catch (err) {
      console.error("   ❌ Server not accessible:", err.message);
      return;
    }

    // Test 2: Run comparison
    console.log("2️⃣ Running comparison for 2026-01-28...");
    const response = await axios.get(
      "http://localhost:3001/api/history/compare?date=2026-01-28"
    );

    console.log("   ✅ Comparison endpoint responded\n");
    console.log("=".repeat(70));
    console.log("📊 RESULTS:\n");

    const data = response.data.data;

    console.log(`Date: ${data.date}\n`);

    console.log("🔴 REGULAR (Rule-Based):");
    console.log(`   Strategy: ${data.regular.strategy}`);
    console.log(`   Total Requests: ${data.regular.metrics.totalRequests}`);
    console.log(`   Total Required: ${data.regular.metrics.totalRequired} kg`);
    console.log(
      `   Total Allocated: ${data.regular.metrics.totalAllocated} kg`
    );
    console.log(
      `   Fulfillment Rate: ${data.regular.metrics.fulfillmentRate}%`
    );
    console.log(`   Avg Distance: ${data.regular.metrics.avgDistance} km`);
    console.log(`   Avg Freshness: ${data.regular.metrics.avgFreshness}%`);
    console.log(`   Allocations Count: ${data.regular.allocations.length}\n`);

    console.log("🟢 ML-DRIVEN (Optimized):");
    console.log(`   Strategy: ${data.ml.strategy}`);
    console.log(`   Total Requests: ${data.ml.metrics.totalRequests}`);
    console.log(`   Total Required: ${data.ml.metrics.totalRequired} kg`);
    console.log(`   Total Allocated: ${data.ml.metrics.totalAllocated} kg`);
    console.log(`   Fulfillment Rate: ${data.ml.metrics.fulfillmentRate}%`);
    console.log(`   Avg Distance: ${data.ml.metrics.avgDistance} km`);
    console.log(`   Avg Freshness: ${data.ml.metrics.avgFreshness}%`);
    console.log(`   Allocations Count: ${data.ml.allocations.length}\n`);

    console.log("📈 IMPROVEMENTS:");
    console.log(`   Fulfillment: ${data.improvements.fulfillmentIncrease}`);
    console.log(`   Distance: ${data.improvements.distanceReduction}`);
    console.log(`   Freshness: ${data.improvements.freshnessIncrease}\n`);

    console.log("💬 Summary:");
    console.log(`   ${data.summary}\n`);

    if (data.regular.allocations.length > 0) {
      console.log("=".repeat(70));
      console.log("📦 SAMPLE ALLOCATION (Regular Strategy):\n");
      const sample = data.regular.allocations[0];
      console.log(JSON.stringify(sample, null, 2));
    }

    console.log("=".repeat(70));

    if (
      data.regular.allocations.length === 0 &&
      data.ml.allocations.length === 0
    ) {
      console.log("\n⚠️  WARNING: No allocations were made!");
      console.log("   This suggests an issue with the simulation logic.");
      console.log("   Check server logs for errors.\n");
    } else {
      console.log("\n✅ TEST PASSED: Allocations successfully generated!\n");
    }
  } catch (error) {
    console.error("\n❌ TEST FAILED:");
    console.error("Error:", error.response?.data || error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

fullTest();
