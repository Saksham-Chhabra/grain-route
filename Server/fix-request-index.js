import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/threeservice";

async function fixRequestIndex() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const collection = db.collection("requests");

    // Drop the old requestId index
    try {
      await collection.dropIndex("requestId_1");
      console.log("✅ Dropped old 'requestId_1' index");
    } catch (error) {
      console.log("ℹ️  Index 'requestId_1' doesn't exist or already dropped");
    }

    // Delete any requests with null requestID
    const deleteResult = await collection.deleteMany({ requestID: null });
    console.log(
      `✅ Deleted ${deleteResult.deletedCount} requests with null requestID`
    );

    // Create new unique index on requestID (capital ID)
    await collection.createIndex(
      { requestID: 1 },
      { unique: true, sparse: true }
    );
    console.log("✅ Created new unique index on 'requestID'");

    console.log("\n✨ Database fix completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error fixing database:", error);
    process.exit(1);
  }
}

fixRequestIndex();
