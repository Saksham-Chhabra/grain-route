import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    time: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "farm_production",
        "ngo_request",
        "shipment_created",
        "shipment_arrived",
        "shipment_location_update",
        "batch_spoiled",
        "prediction_made",
      ],
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
    payload: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

eventSchema.index({ location: "2dsphere" });
eventSchema.index({ time: 1 });

export const Event = mongoose.model("Event", eventSchema);
