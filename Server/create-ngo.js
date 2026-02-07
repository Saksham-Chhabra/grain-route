import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// NGO Schema
const ngoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    requestStats: {
      pending: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      approved: { type: Number, default: 0 },
    },
    contactInfo: {
      contactPerson: { type: String, required: true },
      email: { type: String },
      phone: { type: String },
    },
  },
  { timestamps: true }
);

const NGO = mongoose.model("NGO", ngoSchema);

async function createNGO() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/threeservice"
    );
    console.log("✅ Connected to MongoDB");

    // Create NGO with the specific ID
    const ngo = new NGO({
      _id: new mongoose.Types.ObjectId("67269fa0c4d26edff3ddb08a"),
      name: "Food For All Mumbai",
      address: "Andheri West, Mumbai, Maharashtra 400058",
      contactInfo: {
        contactPerson: "Rajesh Kumar",
        email: "contact@foodforall-mumbai.org",
        phone: "+91 98765 43210",
      },
      requestStats: {
        pending: 0,
        completed: 0,
        total: 0,
        cancelled: 0,
        approved: 0,
      },
    });

    await ngo.save();
    console.log("✅ NGO created successfully!");
    console.log("NGO ID:", ngo._id.toString());
    console.log("NGO Name:", ngo.name);
    console.log("Contact Person:", ngo.contactInfo.contactPerson);
  } catch (error) {
    if (error.code === 11000) {
      console.log("ℹ️  NGO with this ID already exists!");
    } else {
      console.error("❌ Error creating NGO:", error.message);
    }
  } finally {
    await mongoose.connection.close();
    console.log("Disconnected from MongoDB");
  }
}

createNGO();
