import mongoose from "mongoose";
import dotenv from "dotenv";
import { Request } from "./src/models/request.model.js";
import { Batch } from "./src/models/batch.model.js";
import { Node } from "./src/models/node.model.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/food_supply_chain";

async function checkData() {
  try {
    await mongoose.connect(MONGODB_URI);

    const targetDate = new Date("2026-01-28T23:59:59.999Z");

    console.log("\n📊 DATA CHECK FOR 2026-01-28\n");
    console.log("=".repeat(60));

    // Check batches
    const batches = await Batch.find({
      manufacture_date: { $lte: targetDate },
      status: "stored",
    });
    console.log(`\n✅ Batches found: ${batches.length}`);
    if (batches.length > 0) {
      const sample = batches.slice(0, 3);
      sample.forEach((b) => {
        console.log(
          `   • ${b.foodType}: ${b.quantity_kg}kg at ${b.currentNode}`
        );
      });
    }

    // Check requests
    const requests = await Request.find({
      createdOn: { $lte: targetDate },
      status: "pending",
    });
    console.log(`\n✅ Pending requests found: ${requests.length}`);
    if (requests.length > 0) {
      const sample = requests.slice(0, 3);
      sample.forEach((r) => {
        console.log(
          `   • ${r.requestID}: ${r.items.length} items, created ${r.createdOn.toISOString().split("T")[0]}`
        );
      });
    }

    // Check warehouses
    const warehouses = await Node.find({ type: "warehouse" });
    console.log(`\n✅ Warehouses found: ${warehouses.length}`);
    warehouses.forEach((w) => {
      console.log(`   • ${w.name}`);
    });

    // Check NGOs
    const ngos = await Node.find({ type: "ngo" });
    console.log(`\n✅ NGOs found: ${ngos.length}`);
    ngos.forEach((n) => {
      console.log(`   • ${n.name}`);
    });

    console.log("\n" + "=".repeat(60) + "\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkData();
