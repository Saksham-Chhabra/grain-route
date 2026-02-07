import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Batch } from "../models/batch.model.js";
import { buildMLSnapshot } from "../utils/snapshotBuilder.js";
import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:3002";

/**
 * Get ML suggestions for a specific batch
 * GET /api/suggest/for-batch/:batchId
 *
 * Builds snapshot, calls Backend-B /api/predict, returns allocation suggestions
 */
const getSuggestionsForBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const batch = await Batch.findById(batchId).populate(
    "originNode currentNode"
  );
  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  // Build snapshot for ML prediction
  const snapshot = await buildMLSnapshot(new Date());

  try {
    // Call Backend-B predict endpoint
    const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict`, snapshot);

    const predictions = mlResponse.data.results || [];

    // Simple allocation logic: match batch's current district to predictions
    const currentNode = batch.currentNode;
    const currentDistrict = currentNode?.district || "Unknown";

    // Find high-demand districts from predictions
    const allocations = predictions
      .filter((p) => p.cluster_id !== undefined)
      .sort((a, b) => (b.anomaly_score || 0) - (a.anomaly_score || 0))
      .slice(0, 5)
      .map((pred, index) => ({
        regionId: `${pred.state}-${pred.district}`,
        district: pred.district,
        state: pred.state,
        predicted_demand_kg: pred.predicted_demand_kg || 0,
        confidence: Math.abs(pred.anomaly_score || 0),
        score: 100 - index * 15,
        reason:
          pred.is_anomaly === 1
            ? "High anomaly score - potential surge demand"
            : "Normal demand pattern",
      }));

    return res.json(
      new ApiResponse(
        200,
        {
          batchId,
          currentLocation: {
            nodeId: currentNode._id,
            district: currentDistrict,
          },
          allocations,
          predictionCount: predictions.length,
        },
        "Suggestions retrieved successfully"
      )
    );
  } catch (error) {
    console.error("ML service error:", error.message);
    throw new ApiError(
      503,
      "ML service unavailable. Unable to generate suggestions.",
      [error.message]
    );
  }
});

/**
 * Get ML suggestions for a region on a specific date
 * GET /api/suggest/for-region/:regionId?date=YYYY-MM-DD
 *
 * Returns demand predictions and suggested warehouse allocations for the region
 */
const getSuggestionsForRegion = asyncHandler(async (req, res) => {
  const { regionId } = req.params;
  const { date } = req.query;

  const targetDate = date ? new Date(date) : new Date();
  if (isNaN(targetDate.getTime())) {
    throw new ApiError(400, "Invalid date format");
  }

  // Build snapshot filtered by region
  const [state, district] = regionId.split("-");
  const snapshot = await buildMLSnapshot(targetDate, {
    districts: district ? [district] : undefined,
    states: state ? [state] : undefined,
  });

  try {
    // Call Backend-B predict endpoint
    const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict`, snapshot);

    const predictions = mlResponse.data.results || [];

    // Filter predictions for this region
    const regionPredictions = predictions.filter(
      (p) => `${p.state}-${p.district}` === regionId
    );

    return res.json(
      new ApiResponse(
        200,
        {
          regionId,
          state,
          district,
          date: targetDate.toISOString().split("T")[0],
          predictions: regionPredictions,
        },
        "Regional suggestions retrieved successfully"
      )
    );
  } catch (error) {
    console.error("ML service error:", error.message);
    throw new ApiError(
      503,
      "ML service unavailable. Unable to generate suggestions.",
      [error.message]
    );
  }
});

export { getSuggestionsForBatch, getSuggestionsForRegion };
