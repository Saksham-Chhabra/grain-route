import mongoose from "mongoose";

const predictionSchema = new mongoose.Schema({
    modelVersion: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    regionId: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    horizon: {
        type: Number
    },
    predicted_demand_kg: {
        type: Number
    },
    confidence: {
        type: Number
    },
    featureSummary: {
        type: Object
    },
    rawOutput: {
        type: Object
    }
},{ timestamps: true });


export const Prediction = mongoose.model("Prediction", predictionSchema);