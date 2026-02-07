import axios from "axios";

async function testComparison() {
  try {
    console.log("Testing ML vs Regular comparison endpoint...\n");

    const response = await axios.get(
      "http://localhost:3001/api/history/compare?date=2026-01-28"
    );

    console.log("✅ SUCCESS!\n");
    console.log("=".repeat(60));
    console.log("📊 COMPARISON RESULTS");
    console.log("=".repeat(60));

    const data = response.data.data;

    console.log(`\nDate: ${data.date}`);
    console.log(`\n🔴 ${data.regular.strategy}:`);
    console.log(
      `   • Fulfillment Rate: ${data.regular.metrics.fulfillmentRate}%`
    );
    console.log(`   • Avg Distance: ${data.regular.metrics.avgDistance} km`);
    console.log(`   • Avg Freshness: ${data.regular.metrics.avgFreshness}%`);
    console.log(
      `   • Total Required: ${data.regular.metrics.totalRequired} kg`
    );
    console.log(
      `   • Total Allocated: ${data.regular.metrics.totalAllocated} kg`
    );

    console.log(`\n🟢 ${data.ml.strategy}:`);
    console.log(`   • Fulfillment Rate: ${data.ml.metrics.fulfillmentRate}%`);
    console.log(`   • Avg Distance: ${data.ml.metrics.avgDistance} km`);
    console.log(`   • Avg Freshness: ${data.ml.metrics.avgFreshness}%`);
    console.log(`   • Total Required: ${data.ml.metrics.totalRequired} kg`);
    console.log(`   • Total Allocated: ${data.ml.metrics.totalAllocated} kg`);

    console.log(`\n📈 IMPROVEMENTS:`);
    console.log(`   • Fulfillment: ${data.improvements.fulfillmentIncrease}`);
    console.log(
      `   • Distance Reduction: ${data.improvements.distanceReduction}`
    );
    console.log(
      `   • Freshness Increase: ${data.improvements.freshnessIncrease}`
    );

    console.log(`\n💡 ${data.summary}\n`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ ERROR:", error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.log("\n💡 Tip: Make sure demo data is seeded first:");
      console.log("   node scripts/seed-demo-data.js");
    }
  }
}

testComparison();
