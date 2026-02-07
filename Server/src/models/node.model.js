import mongoose from "mongoose";

const nodeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["farm", "warehouse", "ngo", "processing"],
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    regionId: {
      type: String,
      required: true,
    },
    district: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    capacity_kg: {
      type: Number,
      default: 0,
    },
    contact: {
      type: String,
    },
  },
  { timestamps: true }
);
nodeSchema.index({ location: "2dsphere" });

export const Node = mongoose.model("Node", nodeSchema);
