import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Event } from "../models/event.model.js";
import { Request } from "../models/request.model.js";
import { Node } from "../models/node.model.js";
import { Batch } from "../models/batch.model.js";
import { NGO } from "../models/NGO.model.js";
import mongoose from "mongoose";

const storeEvent = asyncHandler(async (req, res) => {
  try {
    const { time, type, location, payload } = req.body;

    if (!time || !type || !location || !payload) {
      throw new ApiError(
        400,
        "Missing required fields. 'time', 'type', 'location', and 'payload' are mandatory."
      );
    }

    if (
      !location.type ||
      location.type !== "Point" ||
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      throw new ApiError(
        400,
        "Invalid 'location' format. Must include type: 'Point' and [longitude, latitude] coordinates."
      );
    }

    // store event in DB
    const newEvent = await Event.create({
      time: new Date(time),
      type,
      location,
      payload,
    });

    let createdBatch = null;
    let createdRequest = null;

    // 🟩 FARM PRODUCTION EVENT
    if (type === "farm_production") {
      const { node, quantity_kg, batch } = payload;

      if (!node || !node.nodeId) {
        console.log(payload);

        throw new ApiError(
          400,
          "Missing 'emittedFrom.nodeId' in payload for 'farm_production'."
        );
      }

      const nodeDoc = await Node.findOne({ _id: node.nodeId });
      if (!nodeDoc) {
        throw new ApiError(
          404,
          `No Node found for node.nodeId '${node.nodeId}'.`
        );
      }

      const batchQty = quantity_kg || 0;
      if (batchQty <= 0) {
        throw new ApiError(
          400,
          "Invalid batch quantity. 'quantity_kg' must be a positive number."
        );
      }

      createdBatch = await Batch.create({
        parentBatchId: null,
        quantity_kg: batchQty,
        original_quantity_kg: batchQty,
        originNode: nodeDoc._id,
        currentNode: nodeDoc._id,
        shelf_life_hours: null,
        manufacture_date: new Date(batch.dateOfCreation),
        expiry_iso: null,
        initial_temp_c: null,
        freshnessPct: 100,
        history: [
          {
            time: new Date(time),
            action: "created",
            from: nodeDoc._id,
            to: nodeDoc._id,
            note: `Batch created from ${node.nodeId} (${node.type}).`,
          },
        ],
        metadata: {
          district: node.district,
          state: node.state,
          coordinates: node.location || {},
        },
        status: "stored",
      });
    }

    // 🟦 NGO REQUEST EVENT
    else if (type === "ngo_request") {
      const { requesterNode, requestID, items, createdOn, requiredBefore } =
        payload;

      if (!requesterNode || !requestID) {
        throw new ApiError(
          400,
          "Missing required fields in payload for 'ngo_request'. 'requesterNode' and 'requestID' are required."
        );
      }

      // Find NGO by name or ID
      const ngoDoc =
        (await NGO.findOne({ name: requesterNode })) ||
        (mongoose.isValidObjectId(requesterNode)
          ? await NGO.findById(requesterNode)
          : null);

      if (!ngoDoc) {
        throw new ApiError(
          404,
          `NGO '${requesterNode}' not found in database.`
        );
      }

      // Create the request entry
      createdRequest = await Request.create({
        requesterNode: ngoDoc._id,
        requestID,
        items: items || [],
        createdOn: createdOn ? new Date(createdOn) : new Date(time),
        requiredBefore: requiredBefore ? new Date(requiredBefore) : null,
        status: "pending",
      });
    }

    // ✅ RESPONSE
    return res.status(201).json(
      new ApiResponse(
        201,
        {
          event: newEvent,
          batchCreated: !!createdBatch,
          batch: createdBatch || null,
          requestCreated: !!createdRequest,
          request: createdRequest || null,
        },
        createdBatch
          ? "Event stored and new batch created successfully."
          : createdRequest
            ? "Event stored and new NGO request created successfully."
            : "Event stored successfully."
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to store event data.",
        [error.message],
        error.stack
      );
  }
});

const createNGORequest = asyncHandler(async (req, res) => {
  try {
    const {
      requestId,
      requesterNode,
      items,
      requiredBy_iso,
      status,
      fulfilledBy,
      history,
    } = req.body;

    if (
      !requestId ||
      !requesterNode ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      throw new ApiError(
        400,
        "Missing required fields. 'requestId', 'requesterNode', and 'items' (non-empty array) are mandatory."
      );
    }

    const existingRequest = await Request.findOne({ requestId });
    if (existingRequest) {
      throw new ApiError(409, `Request with ID '${requestId}' already exists.`);
    }

    for (const item of items) {
      if (!item.foodType || typeof item.required_kg !== "number") {
        throw new ApiError(
          400,
          "Each item must include a valid 'foodType' and numeric 'required_kg'."
        );
      }
    }

    const newRequest = await Request.create({
      requestId,
      requesterNode,
      items,
      requiredBy_iso: requiredBy_iso ? new Date(requiredBy_iso) : null,
      status: status || "open",
      fulfilledBy: fulfilledBy || null,
      history: history || [
        {
          time: new Date(),
          action: "created",
          note: "Request created successfully.",
        },
      ],
    });

    return res
      .status(201)
      .json(
        new ApiResponse(201, newRequest, "NGO request stored successfully.")
      );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw new ApiError(
        500,
        "Failed to store NGO request.",
        [error.message],
        error.stack
      );
    }
  }
});

const newShipment = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(500, {}, "No need for Shipment data"));
});

const shipmentUpdate = asyncHandler(async (req, res) => {
  //using web sockets , get data from dummy server on live location tracking and logs it in the events + shipmentLocation.model;;
});

export { storeEvent, createNGORequest, newShipment };
