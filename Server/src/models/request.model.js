import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    requesterNode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: true,
    },
    requestID: {
      type: String,
    },
    items: [
      {
        foodType: { type: String },
        required_kg: { type: Number },
      },
    ],
    createdOn: {
      type: Date,
    },
    requiredBefore: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["fulfilled", "pending", "cancelled", "approved"],
      default: "pending",
    },
    approvedOn: {
      type: Date,
    },
    fullFilledOn: {
      type: Date,
    },
    fulfilledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Node",
    },
  },
  { timestamps: true }
);

export const Request = mongoose.model("Request", requestSchema);
