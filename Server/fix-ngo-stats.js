import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// NGO Schema
const ngoSchema = new mongoose.Schema(
  {
    name: String,
    address: String,
    requestStats: {
      pending: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      approved: { type: Number, default: 0 },
    },
    contactInfo: {
      contactPerson: String,
      email: String,
      phone: String,
    },
  },
  { timestamps: true }
);

// Request Schema
const requestSchema = new mongoose.Schema(
  {
    requestID: String,
    requesterNode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "fulfilled", "cancelled"],
    },
    items: [
      {
        foodType: String,
        required_kg: Number,
      },
    ],
    createdOn: Date,
    requiredBefore: Date,
    approvedOn: Date,
    fullFilledOn: Date,
  },
  { timestamps: true }
);

const NGO = mongoose.model("NGO", ngoSchema);
const Request = mongoose.model("Request", requestSchema);

async function fixNGOStats() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/threeservice"
    );
    console.log("✅ Connected to MongoDB");

    const ngoId = "67269fa0c4d26edff3ddb08a";

    // Get all requests for this NGO
    const requests = await Request.find({ requesterNode: ngoId });

    console.log(`\n📊 Found ${requests.length} requests for this NGO`);

    // Calculate stats
    const stats = {
      total: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      completed: requests.filter((r) => r.status === "fulfilled").length,
      cancelled: requests.filter((r) => r.status === "cancelled").length,
    };

    console.log("\n📈 Calculated Stats:");
    console.log(`   Total: ${stats.total}`);
    console.log(`   Pending: ${stats.pending}`);
    console.log(`   Approved: ${stats.approved}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Cancelled: ${stats.cancelled}`);

    // Update NGO stats
    const result = await NGO.findByIdAndUpdate(
      ngoId,
      { requestStats: stats },
      { new: true }
    );

    console.log("\n✅ NGO stats updated successfully!");
    console.log("\n📋 Updated NGO:");
    console.log(JSON.stringify(result, null, 2));

    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixNGOStats();
