import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Batch } from "../models/batch.model.js";
import { Node } from "../models/node.model.js";
import { calculateFreshnessPct } from "../utils/freshness.js";

/**
 * Create a new batch
 * POST /api/batches
 */
const createBatch = asyncHandler(async (req, res) => {
  const {
    foodType,
    quantity_kg,
    originNodeId,
    currentNodeId,
    shelf_life_hours,
    manufacture_date,
    initial_temp_c,
  } = req.body;

  if (!foodType || !quantity_kg || !originNodeId) {
    throw new ApiError(
      400,
      "Missing required fields: foodType, quantity_kg, originNodeId"
    );
  }

  const originNode = await Node.findById(originNodeId);
  if (!originNode) {
    throw new ApiError(404, `Origin node ${originNodeId} not found`);
  }

  const currentNode = currentNodeId
    ? await Node.findById(currentNodeId)
    : originNode;
  if (currentNodeId && !currentNode) {
    throw new ApiError(404, `Current node ${currentNodeId} not found`);
  }

  const batch = await Batch.create({
    foodType,
    quantity_kg,
    original_quantity_kg: quantity_kg,
    originNode: originNode._id,
    currentNode: currentNode._id,
    status: "stored",
    shelf_life_hours: shelf_life_hours || null,
    manufacture_date: manufacture_date
      ? new Date(manufacture_date)
      : new Date(),
    initial_temp_c: initial_temp_c || 25,
    freshnessPct: 100,
    history: [
      {
        time: new Date(),
        action: "created",
        from: originNode._id,
        to: currentNode._id,
        note: "Batch created",
      },
    ],
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { batch }, "Batch created successfully"));
});

/**
 * Get all batches with filters
 * GET /api/batches?status=&currentNode=&foodType=&page=&limit=
 */
const getBatches = asyncHandler(async (req, res) => {
  const {
    status,
    currentNode,
    foodType,
    originNode,
    page = 1,
    limit = 50,
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (currentNode) filter.currentNode = currentNode;
  if (foodType) filter.foodType = foodType;
  if (originNode) filter.originNode = originNode;

  const batches = await Batch.find(filter)
    .populate("originNode currentNode")
    .sort({ manufacture_date: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Batch.countDocuments(filter);

  // Calculate current freshness for each batch
  const batchesWithFreshness = batches.map((batch) => {
    const batchObj = batch.toObject();
    if (batch.shelf_life_hours && batch.manufacture_date) {
      batchObj.currentFreshnessPct = calculateFreshnessPct(
        batch,
        new Date(),
        25
      );
    }
    return batchObj;
  });

  return res.json(
    new ApiResponse(
      200,
      {
        batches: batchesWithFreshness,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
      "Batches retrieved successfully"
    )
  );
});

/**
 * Get single batch by ID with freshness calculation
 * GET /api/batches/:batchId
 */
const getBatchById = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  const batch = await Batch.findById(batchId).populate(
    "originNode currentNode parentBatchId"
  );

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  const batchObj = batch.toObject();
  if (batch.shelf_life_hours && batch.manufacture_date) {
    batchObj.currentFreshnessPct = calculateFreshnessPct(batch, new Date(), 25);
  }

  return res.json(
    new ApiResponse(200, { batch: batchObj }, "Batch retrieved successfully")
  );
});

/**
 * Get inventory summary by node
 * GET /api/batches/inventory/summary?nodeId=
 */
const getInventorySummary = asyncHandler(async (req, res) => {
  const { nodeId } = req.query;

  const filter = { status: "stored" };
  if (nodeId) filter.currentNode = nodeId;

  const summary = await Batch.aggregate([
    { $match: filter },
    {
      $group: {
        _id: {
          currentNode: "$currentNode",
          foodType: "$foodType",
        },
        total_kg: { $sum: "$quantity_kg" },
        batch_count: { $sum: 1 },
        avg_freshness: { $avg: "$freshnessPct" },
      },
    },
    {
      $lookup: {
        from: "nodes",
        localField: "_id.currentNode",
        foreignField: "_id",
        as: "node",
      },
    },
    { $unwind: "$node" },
    {
      $project: {
        _id: 0,
        nodeId: "$_id.currentNode",
        nodeName: "$node.name",
        nodeType: "$node.type",
        foodType: "$_id.foodType",
        total_kg: 1,
        batch_count: 1,
        avg_freshness: 1,
      },
    },
  ]);

  return res.json(
    new ApiResponse(200, { summary }, "Inventory summary retrieved")
  );
});

export { createBatch, getBatches, getBatchById, getInventorySummary };
