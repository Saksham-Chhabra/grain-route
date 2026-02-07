import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Shipment } from "../models/shipment.model.js";
import { Batch } from "../models/batch.model.js";
import { Node } from "../models/node.model.js";
import { Event } from "../models/event.model.js";
import { extractCoordinates } from "../utils/geoHelpers.js";
import { emitShipmentUpdate } from "../services/frameEmitter.js";
import axios from "axios";
import mongoose from "mongoose";

const BACKEND_C_URL = process.env.BACKEND_C_URL || "http://localhost:5001";

/**
 * Create a new shipment with batch splitting logic
 * POST /api/shipments
 *
 * Request body:
 * {
 *   fromNodeId: ObjectId,
 *   toNodeId: ObjectId,
 *   items: [{ foodType: string, quantity_kg: number }],
 *   startTime: ISO date (optional, defaults to now)
 * }
 *
 * Logic:
 * 1. Query available 'stored' batches at fromNode sorted by perishability (FIFO)
 * 2. Allocate batches (split if partial quantity needed)
 * 3. Call Backend-C transport API for ETA
 * 4. Create shipment document
 * 5. Update batch statuses to 'in_transit'
 * 6. Create shipment_created event
 */
const createShipment = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { fromNodeId, toNodeId, items, startTime, vehicleId } = req.body;

    // Validate inputs
    if (!fromNodeId || !toNodeId || !items || !Array.isArray(items)) {
      throw new ApiError(
        400,
        "Missing required fields: fromNodeId, toNodeId, items"
      );
    }

    if (items.length === 0) {
      throw new ApiError(400, "Items array cannot be empty");
    }

    // Fetch nodes
    const [fromNode, toNode] = await Promise.all([
      Node.findById(fromNodeId).session(session),
      Node.findById(toNodeId).session(session),
    ]);

    if (!fromNode) {
      throw new ApiError(404, `Source node ${fromNodeId} not found`);
    }
    if (!toNode) {
      throw new ApiError(404, `Destination node ${toNodeId} not found`);
    }

    const startDate = startTime ? new Date(startTime) : new Date();
    const allocatedBatches = [];
    const allBatchIds = [];

    // Allocate batches for each requested item
    for (const item of items) {
      const { foodType, quantity_kg } = item;

      if (!foodType || typeof quantity_kg !== "number" || quantity_kg <= 0) {
        throw new ApiError(
          400,
          `Invalid item: ${JSON.stringify(item)}. Must have foodType and positive quantity_kg`
        );
      }

      // Query available stored batches, sorted by manufacture_date (FIFO)
      const availableBatches = await Batch.find({
        currentNode: fromNodeId,
        foodType: foodType,
        status: "stored",
        quantity_kg: { $gt: 0 },
      })
        .sort({ manufacture_date: 1 }) // Oldest first (FIFO)
        .session(session);

      let remainingQty = quantity_kg;

      for (const batch of availableBatches) {
        if (remainingQty <= 0) break;

        if (batch.quantity_kg >= remainingQty) {
          // Sufficient quantity in this batch
          if (batch.quantity_kg === remainingQty) {
            // Use entire batch
            allocatedBatches.push({
              batchId: batch._id,
              quantity: remainingQty,
              isSplit: false,
            });
            allBatchIds.push(batch._id);
            remainingQty = 0;
          } else {
            // Split batch: create child batch with needed quantity
            const childBatch = await Batch.create(
              [
                {
                  parentBatchId: batch._id,
                  foodType: batch.foodType,
                  quantity_kg: remainingQty,
                  original_quantity_kg: batch.original_quantity_kg,
                  originNode: batch.originNode,
                  currentNode: batch.currentNode,
                  status: "stored",
                  shelf_life_hours: batch.shelf_life_hours,
                  manufacture_date: batch.manufacture_date,
                  expiry_iso: batch.expiry_iso,
                  initial_temp_c: batch.initial_temp_c,
                  freshnessPct: batch.freshnessPct,
                  history: [
                    ...batch.history,
                    {
                      time: new Date(),
                      action: "split",
                      from: batch.currentNode,
                      to: batch.currentNode,
                      note: `Split from batch ${batch._id} for shipment`,
                    },
                  ],
                  metadata: batch.metadata,
                },
              ],
              { session }
            );

            // Update parent batch quantity
            batch.quantity_kg -= remainingQty;
            batch.history.push({
              time: new Date(),
              action: "split",
              from: batch.currentNode,
              to: batch.currentNode,
              note: `Reduced by ${remainingQty} kg for shipment (child: ${childBatch[0]._id})`,
            });
            await batch.save({ session });

            allocatedBatches.push({
              batchId: childBatch[0]._id,
              quantity: remainingQty,
              isSplit: true,
              parentBatchId: batch._id,
            });
            allBatchIds.push(childBatch[0]._id);
            remainingQty = 0;
          }
        } else {
          // Use entire batch, continue to next
          allocatedBatches.push({
            batchId: batch._id,
            quantity: batch.quantity_kg,
            isSplit: false,
          });
          allBatchIds.push(batch._id);
          remainingQty -= batch.quantity_kg;
        }
      }

      if (remainingQty > 0) {
        throw new ApiError(
          400,
          `Insufficient inventory for ${foodType}. Requested: ${quantity_kg} kg, Available: ${
            quantity_kg - remainingQty
          } kg`
        );
      }
    }

    // Calculate transport time using Backend-C
    const fromCoords = extractCoordinates(fromNode);
    const toCoords = extractCoordinates(toNode);

    let transportData;
    try {
      const transportResponse = await axios.get(
        `${BACKEND_C_URL}/api/transport/time`,
        {
          params: {
            fromLat: fromCoords.lat,
            fromLon: fromCoords.lon,
            toLat: toCoords.lat,
            toLon: toCoords.lon,
            start_iso: startDate.toISOString(),
          },
        }
      );
      transportData = transportResponse.data;
    } catch (error) {
      console.error("Backend-C transport API error:", error.message);
      // Fallback: estimate 60 km/h average
      const distance = 100; // Fallback distance
      const travelMinutes = distance * 1; // 1 min per km
      transportData = {
        distance_km: distance,
        travel_time_minutes: travelMinutes,
        eta_iso: new Date(
          startDate.getTime() + travelMinutes * 60 * 1000
        ).toISOString(),
      };
    }

    // Generate unique shipment ID
    const shipmentId = `SHP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create shipment document
    const shipment = await Shipment.create(
      [
        {
          shipmentId,
          batchIds: allBatchIds,
          fromNode: fromNodeId,
          toNode: toNodeId,
          start_iso: startDate,
          eta_iso: new Date(transportData.eta_iso),
          status: "in_transit",
          vehicleId: vehicleId || null,
          travel_time_minutes: transportData.travel_time_minutes,
          distance_km: transportData.distance_km,
          metadata: {
            allocatedBatches,
            transportMetadata: transportData.metadata,
            items,
          },
        },
      ],
      { session }
    );

    // Update all allocated batches to 'in_transit'
    for (const batchId of allBatchIds) {
      await Batch.findByIdAndUpdate(
        batchId,
        {
          status: "in_transit",
          $push: {
            history: {
              time: new Date(),
              action: "shipped",
              from: fromNodeId,
              to: toNodeId,
              note: `Shipment ${shipmentId} created`,
            },
          },
        },
        { session }
      );
    }

    // Create shipment_created event
    await Event.create(
      [
        {
          time: startDate,
          type: "shipment_created",
          location: fromNode.location,
          payload: {
            shipmentId,
            fromNode: {
              nodeId: fromNode._id,
              name: fromNode.name,
              type: fromNode.type,
            },
            toNode: {
              nodeId: toNode._id,
              name: toNode.name,
              type: toNode.type,
            },
            batchCount: allBatchIds.length,
            distance_km: transportData.distance_km,
            eta_iso: transportData.eta_iso,
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();

    // Emit Socket.IO update for shipment created
    if (req.app && req.app.get("io")) {
      const io = req.app.get("io");
      emitShipmentUpdate(io, {
        type: "shipment_created",
        shipmentId: shipment[0].shipmentId,
        fromNode: fromNode.name,
        toNode: toNode.name,
        eta: transportData.eta_iso,
      });
    }

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          shipment: shipment[0],
          allocatedBatches,
          transport: transportData,
        },
        "Shipment created successfully"
      )
    );
  } catch (error) {
    await session.abortTransaction();
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Failed to create shipment",
      [error.message],
      error.stack
    );
  } finally {
    session.endSession();
  }
});

/**
 * Mark shipment as arrived
 * PATCH /api/shipments/:id/arrive
 *
 * Updates:
 * - Shipment status to 'arrived'
 * - Shipment arrived_iso to current time
 * - All batches: currentNode to toNode, status to 'delivered'
 * - Creates shipment_arrived event
 */
const markShipmentArrived = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { arrivedTime } = req.body;

    const shipment = await Shipment.findById(id)
      .populate("fromNode toNode")
      .session(session);

    if (!shipment) {
      throw new ApiError(404, "Shipment not found");
    }

    if (shipment.status === "arrived") {
      throw new ApiError(400, "Shipment already marked as arrived");
    }

    const arrivedDate = arrivedTime ? new Date(arrivedTime) : new Date();

    // Update shipment
    shipment.status = "arrived";
    shipment.arrived_iso = arrivedDate;
    await shipment.save({ session });

    // Update all batches
    for (const batchId of shipment.batchIds) {
      await Batch.findByIdAndUpdate(
        batchId,
        {
          currentNode: shipment.toNode._id,
          status: "delivered",
          $push: {
            history: {
              time: arrivedDate,
              action: "arrived",
              from: shipment.fromNode._id,
              to: shipment.toNode._id,
              note: `Shipment ${shipment.shipmentId} arrived`,
            },
          },
        },
        { session }
      );
    }

    // Create shipment_arrived event
    await Event.create(
      [
        {
          time: arrivedDate,
          type: "shipment_arrived",
          location: shipment.toNode.location,
          payload: {
            shipmentId: shipment.shipmentId,
            fromNode: {
              nodeId: shipment.fromNode._id,
              name: shipment.fromNode.name,
            },
            toNode: {
              nodeId: shipment.toNode._id,
              name: shipment.toNode.name,
            },
            batchCount: shipment.batchIds.length,
            plannedEta: shipment.eta_iso,
            actualArrival: arrivedDate,
            delayMinutes: Math.round(
              (arrivedDate - new Date(shipment.eta_iso)) / (1000 * 60)
            ),
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();

    // Emit Socket.IO update for shipment arrived
    if (req.app && req.app.get("io")) {
      const io = req.app.get("io");
      emitShipmentUpdate(io, {
        type: "shipment_arrived",
        shipmentId: shipment.shipmentId,
        toNode: shipment.toNode.name,
        arrivedTime: arrivedDate,
        delayMinutes: Math.round(
          (arrivedDate - new Date(shipment.eta_iso)) / (1000 * 60)
        ),
      });
    }

    return res.json(
      new ApiResponse(200, { shipment }, "Shipment marked as arrived")
    );
  } catch (error) {
    await session.abortTransaction();
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Failed to mark shipment as arrived",
      [error.message],
      error.stack
    );
  } finally {
    session.endSession();
  }
});

/**
 * Get all shipments with filters
 * GET /api/shipments?status=&fromNode=&toNode=&startDate=&endDate=
 */
const getShipments = asyncHandler(async (req, res) => {
  const {
    status,
    fromNode,
    toNode,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (fromNode) filter.fromNode = fromNode;
  if (toNode) filter.toNode = toNode;
  if (startDate || endDate) {
    filter.start_iso = {};
    if (startDate) filter.start_iso.$gte = new Date(startDate);
    if (endDate) filter.start_iso.$lte = new Date(endDate);
  }

  const shipments = await Shipment.find(filter)
    .populate("fromNode toNode batchIds")
    .sort({ start_iso: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Shipment.countDocuments(filter);

  return res.json(
    new ApiResponse(
      200,
      { shipments, total, page: parseInt(page), limit: parseInt(limit) },
      "Shipments retrieved successfully"
    )
  );
});

/**
 * Get single shipment by ID
 * GET /api/shipments/:id
 */
const getShipmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shipment = await Shipment.findById(id).populate(
    "fromNode toNode batchIds"
  );

  if (!shipment) {
    throw new ApiError(404, "Shipment not found");
  }

  return res.json(
    new ApiResponse(200, { shipment }, "Shipment retrieved successfully")
  );
});

export { createShipment, markShipmentArrived, getShipments, getShipmentById };
