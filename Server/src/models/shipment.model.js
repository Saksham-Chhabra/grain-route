import mongoose from "mongoose";

const shipmentSchema = new mongoose.Schema(
  {
    shipmentID: {
      type: String,
      index: true,
    },
    shipmentId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    batchIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
      },
    ],
    fromNode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Node",
    },
    toNode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Node",
    },
    start_iso: {
      type: Date,
    },
    eta_iso: {
      type: Date,
    },
    arrived_iso: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "in_transit", "arrived", "delayed", "cancelled"],
      default: "pending",
    },
    vehicleId: {
      type: String,
    },
    travel_time_minutes: {
      type: Number,
    },
    distance_km: {
      type: Number,
    },
    breaks: [
      {
        start_iso: { type: Date },
        end_iso: { type: Date },
        reason: { type: String },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    metadata: {
      type: Object,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
shipmentSchema.index({ status: 1, start_iso: 1 });
shipmentSchema.index({ fromNode: 1, toNode: 1 });

export const Shipment = mongoose.model("Shipment", shipmentSchema);
