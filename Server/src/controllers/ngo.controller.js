import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { NGO } from "../models/NGO.model.js";
import { Request } from "../models/request.model.js";
import { Node } from "../models/node.model.js";

const createRequest = asyncHandler(async (req, res) => {
  try {
    const { requesterNode, requestId, createdOn, requiredBefore, items } =
      req.body;

    if (!requesterNode || !createdOn || !requiredBefore || !requestId) {
      throw new ApiError(
        400,
        "Missing required fields: 'requesterNode', 'createdOn', and 'requiredBefore' are mandatory."
      );
    }

    // Check if NGO exists
    const ngoExists = await NGO.findById(requesterNode);
    if (!ngoExists) {
      throw new ApiError(404, `NGO with ID '${requesterNode}' not found.`);
    }

    let validatedItems = [];
    if (items && Array.isArray(items)) {
      validatedItems = items
        .filter(
          (item) =>
            item.foodType &&
            typeof item.foodType === "string" &&
            item.required_kg > 0
        )
        .map((item) => ({
          foodType: item.foodType.trim(),
          required_kg: Number(item.required_kg),
        }));

      if (validatedItems.length === 0) {
        throw new ApiError(
          400,
          "If 'items' is provided, it must contain valid objects with 'foodType' and 'required_kg'."
        );
      }
    }

    const newRequest = await Request.create({
      requesterNode,
      requestID: requestId, // Map requestId to requestID (capital ID)
      items: validatedItems,
      createdOn: new Date(createdOn),
      requiredBefore: new Date(requiredBefore),
      status: "pending",
      fullFilledOn: null,
      fulfilledBy: null,
    });

    // Update NGO stats - increment pending and total count
    await NGO.findByIdAndUpdate(requesterNode, {
      $inc: { "requestStats.pending": 1, "requestStats.total": 1 },
    });

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          newRequest,
          "New NGO request created successfully."
        )
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to create NGO request.",
        [error.message],
        error.stack
      );
  }
});

const updateRequestStatus = asyncHandler(async (req, res) => {
  try {
    const { requestID } = req.params;
    const { status, fulfilledBy, fullFilledOn, approvedOn } = req.body;

    if (!status) {
      throw new ApiError(400, "Missing 'status' field in request body.");
    }

    const request = await Request.findById(requestID);
    if (!request) {
      throw new ApiError(404, `Request with ID '${requestID}' not found.`);
    }

    switch (status) {
      case "fulfilled": {
        if (!fulfilledBy) {
          throw new ApiError(
            400,
            "'fulfilledBy' is required when marking a request as fulfilled."
          );
        }

        const fulfillerNode = await Node.findById(fulfilledBy);
        if (!fulfillerNode) {
          throw new ApiError(
            404,
            `Node with ID '${fulfilledBy}' (fulfiller) not found.`
          );
        }

        request.status = "fulfilled";
        request.fulfilledBy = fulfilledBy;
        request.fullFilledOn = fullFilledOn
          ? new Date(fullFilledOn)
          : new Date(); // default to now
        request.approvedOn = approvedOn ? new Date(approvedOn) : null;

        // Update NGO stats - increment completed count
        await NGO.findByIdAndUpdate(request.requesterNode, {
          $inc: {
            "requestStats.completed": 1,
            "requestStats.pending": -1,
            "requestStats.approved": -1,
          },
        });
        break;
      }

      case "approved": {
        request.status = "approved";
        request.approvedOn = approvedOn ? new Date(approvedOn) : new Date();

        // Update NGO stats - increment approved count
        await NGO.findByIdAndUpdate(request.requesterNode, {
          $inc: { "requestStats.approved": 1, "requestStats.pending": -1 },
        });
        break;
      }

      case "cancelled": {
        request.status = "cancelled";
        request.fulfilledBy = null;
        request.fullFilledOn = null;
        request.approvedOn = null;

        // Update NGO stats - increment cancelled count
        await NGO.findByIdAndUpdate(request.requesterNode, {
          $inc: { "requestStats.cancelled": 1, "requestStats.pending": -1 },
        });
        break;
      }

      case "pending": {
        request.status = "pending";
        request.fulfilledBy = null;
        request.fullFilledOn = null;
        request.approvedOn = null;
        break;
      }

      default:
        throw new ApiError(400, `Invalid status value: '${status}'.`);
    }

    await request.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          request,
          `Request status updated successfully to '${status}'.`
        )
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to update request status.",
        [error.message],
        error.stack
      );
  }
});

const getRequestsByNGO = asyncHandler(async (req, res) => {
  try {
    const { ngoId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    if (!ngoId) {
      throw new ApiError(400, "Missing NGO ID in request parameters.");
    }

    const filter = { requesterNode: ngoId };
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [requests, totalRequests] = await Promise.all([
      Request.find(filter)
        .populate("requesterNode", "name type district regionId")
        .populate("fulfilledBy", "name type district regionId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Request.countDocuments(filter),
    ]);

    if (requests.length === 0) {
      throw new ApiError(
        404,
        `No requests found for NGO '${ngoId}'${
          status ? ` with status '${status}'` : ""
        }.`
      );
    }

    const totalPages = Math.ceil(totalRequests / limitNum);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          currentPage: pageNum,
          totalPages,
          totalRequests,
          requestsOnPage: requests.length,
          requests,
        },
        `Fetched ${requests.length} requests for NGO '${ngoId}' (page ${pageNum}/${totalPages}).`
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to fetch NGO requests.",
        [error.message],
        error.stack
      );
  }
});

const getAllRequests = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 100, status } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    const [requests, totalRequests] = await Promise.all([
      Request.find(filter)
        .populate("requesterNode", "name address contactInfo")
        .populate("fulfilledBy", "name type district regionId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Request.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalRequests / limitNum);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          currentPage: pageNum,
          totalPages,
          totalRequests,
          requestsOnPage: requests.length,
          requests,
        },
        `Fetched ${requests.length} requests (page ${pageNum}/${totalPages}).`
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to fetch all requests.",
        [error.message],
        error.stack
      );
  }
});

const getAllNGOs = asyncHandler(async (req, res) => {
  try {
    const ngos = await NGO.find({}).sort({ createdAt: -1 });

    return res
      .status(200)
      .json(
        new ApiResponse(200, ngos, `Fetched ${ngos.length} NGOs successfully.`)
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to fetch NGOs.",
        [error.message],
        error.stack
      );
  }
});

export {
  createRequest,
  updateRequestStatus,
  getRequestsByNGO,
  getAllRequests,
  getAllNGOs,
};
