import mongoose from "mongoose";

const ngoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    address: {
      type: String,
      required: true,
      trim: true
    },

    requestStats: {
      pending: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      cancelled: {type:Number,default:0},
      approved:{type:Number,default:0}
    },

    
    contactInfo: {
      contactPerson: { type: String, required: true },
      email: {
        type: String,
      },
      phone: {
        type: String,
      }
    }
  },
  { timestamps: true }
);

export const NGO = mongoose.model("NGO", ngoSchema);
