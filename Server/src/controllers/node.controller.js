import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Node } from "../models/node.model.js";
import { NGO } from "../models/NGO.model.js";
import axios from "axios";

const createNode = asyncHandler(async (req, res) => {
  try {
    const { type, name, regionId, district, location, capacity_kg, contact } =
      req.body;
    if (!type || !name || !regionId || !district || !location) {
      throw new ApiError(
        400,
        "Missing required fields. 'type', 'name', 'regionId', 'district', and 'location' are mandatory."
      );
    }

    const validTypes = ["farm", "warehouse", "ngo", "processing"];
    if (!validTypes.includes(type)) {
      throw new ApiError(
        400,
        `Invalid node type '${type}'. Must be one of ${validTypes.join(", ")}.`
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

    const lonRaw = location.coordinates[0];
    const latRaw = location.coordinates[1];
    const lon = typeof lonRaw === "number" ? lonRaw : Number(lonRaw);
    const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new ApiError(
        400,
        "Invalid coordinates. Longitude/latitude must be numbers.",
        [`Received lon='${lonRaw}' lat='${latRaw}'. Expected numeric values.`]
      );
    }

    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new ApiError(
        400,
        "Invalid coordinates. Longitude/latitude is out of bounds.",
        [
          `Received lon=${lon}, lat=${lat}. Expected lon in [-180, 180] and lat in [-90, 90].`,
          "Coordinates must be in GeoJSON order: [longitude, latitude].",
        ]
      );
    }

    const existingLocation = await Node.findOne({
      "location.coordinates": { $eq: [lon, lat] },
    });
    if (existingLocation) {
      throw new ApiError(
        409,
        `A node already exists at this location (lon: ${lon}, lat: ${lat}).`
      );
    }

    const newNode = await Node.create({
      type,
      name,
      regionId,
      district,
      location: {
        type: "Point",
        coordinates: [lon, lat],
      },
      capacity_kg: capacity_kg || 0,
      contact: contact || null,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, newNode, "Node created successfully."));
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw new ApiError(
        500,
        "Failed to create node.",
        [error.message],
        error.stack
      );
    }
  }
});

const deleteNode = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const node = await Node.findById(id);
    if (!node) {
      throw new ApiError(404, `Node with ID '${id}' not found.`);
    }

    await node.deleteOne();

    return res
      .status(200)
      .json(new ApiResponse(200, { id }, "Node deleted successfully."));
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    } else {
      throw new ApiError(
        500,
        "Failed to delete node.",
        [error.message],
        error.stack
      );
    }
  }
});

const getNodesByRegion = asyncHandler(async (req, res) => {
  try {
    const { district } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    if (!district) {
      throw new ApiError(400, "Please provide a valid 'district'.");
    }

    const totalNodes = await Node.countDocuments({ district });

    if (totalNodes === 0) {
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            nodes: [],
            pagination: {
              totalNodes: 0,
              totalPages: 0,
              currentPage: page,
              limit,
            },
          },
          `No nodes found for district '${district}'.`
        )
      );
    }

    const nodes = await Node.find({ district })
      .sort({ name: 1 }) // optional sorting
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalNodes / limit);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          district,
          count: nodes.length,
          totalNodes,
          pagination: {
            totalPages,
            currentPage: page,
            limit,
          },
          nodes,
        },
        "Nodes fetched successfully."
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to fetch nodes for district.",
        [error.message],
        error.stack
      );
  }
});

const getAllNodes = asyncHandler(async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const totalNodes = await Node.countDocuments();

    if (totalNodes === 0) {
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            nodes: [],
            pagination: {
              totalNodes: 0,
              totalPages: 0,
              currentPage: page,
              limit,
            },
          },
          "No nodes found in database."
        )
      );
    }

    const nodes = await Node.find().sort({ name: 1 }).skip(skip).limit(limit);

    const totalPages = Math.ceil(totalNodes / limit);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          count: nodes.length,
          totalNodes,
          pagination: {
            totalPages,
            currentPage: page,
            limit,
          },
          nodes,
        },
        "All nodes fetched successfully."
      )
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to fetch nodes.",
        [error.message],
        error.stack
      );
  }
});

const getAllDistricts = asyncHandler(async (req, res) => {
  try {
    const districts = await Node.distinct("district");

    if (!districts || districts.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { districts: [] },
            "No districts found in database."
          )
        );
    }

    districts.sort();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { count: districts.length, districts },
          "Unique districts fetched successfully."
        )
      );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    else
      throw new ApiError(
        500,
        "Failed to fetch unique districts.",
        [error.message],
        error.stack
      );
  }
});

const startScenario = asyncHandler(async (req, res) => {
  try {
    const baseURL =
      process.env.SCENARIO_BASE_URL || "http://localhost:5001/api";
    if (!baseURL) {
      throw new ApiError(
        400,
        "Missing 'baseURL'. Please provide the target endpoint base URL."
      );
    }

    const endpoint = `${baseURL}/scenario/start`;

    const nodes = await Node.find();
    if (nodes.length === 0) {
      throw new ApiError(404, "No nodes found in the database to send.");
    }

    const ngos = await NGO.find();
    if (ngos.length === 0) {
      console.warn(
        "⚠️ No NGOs found in the database — continuing without NGOs."
      );
    }

    console.log(nodes[0]);
    const formattedNodes = nodes.map((node) => ({
      nodeId: node._id.toString(),
      name: node.name,
      type: node.type,
      district: node.district,
      state: node.state || "Unknown",
      regionId: node.regionId || "Unknown",
      location: node.location,
    }));

    // Convert NGOs to node format with type 'ngo'
    // Parse address to extract district/state if possible, or use placeholder
    const formattedNGOs = ngos.map((ngo, index) => {
      // Try to extract location from address (format: "address, district, state")
      const addressParts = (ngo.address || "").split(",").map((s) => s.trim());
      const district =
        addressParts.length >= 2
          ? addressParts[addressParts.length - 2]
          : "Delhi";
      const state =
        addressParts.length >= 3
          ? addressParts[addressParts.length - 1]
          : "Delhi";

      // Generate a placeholder location (you may want to geocode these properly)
      // Using a random location in India as placeholder
      const baseLat = 28.6139; // Delhi coordinates as base
      const baseLon = 77.209;
      const randomOffset = () => (Math.random() - 0.5) * 5; // ±2.5 degrees variation

      return {
        nodeId: ngo._id.toString(),
        name: ngo.name,
        type: "ngo",
        district: district,
        state: state,
        location: {
          type: "Point",
          coordinates: [baseLon + randomOffset(), baseLat + randomOffset()],
        },
        contact: ngo.contactInfo || {},
        requestStats: ngo.requestStats,
      };
    });

    // Merge all nodes (farms, warehouses) with NGOs
    const allNodes = [...formattedNodes, ...formattedNGOs];

    const payload = {
      name: "HarvestRun-2",
      seed: "arcanix-2025",
      startDate: "2025-11-01T00:00:00Z",
      batchSize: 20,
      intervalMs: 2000,
      nodes: allNodes,
      durationMinutes: 5,
      probabilities: { farm: 0.67, request: 0.33 },
    };

    const response = await axios.post(endpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          sentNodes: formattedNodes.length,
          sentNGOs: formattedNGOs.length,
          totalNodesSent: allNodes.length,
          payloadSent: payload,
          externalResponse: response.data,
        },
        `Scenario started successfully. Sent ${allNodes.length} nodes (${formattedNodes.length} regular nodes + ${formattedNGOs.length} NGOs).`
      )
    );
  } catch (error) {
    console.log(error);
    if (error.response) {
      throw new ApiError(
        error.response.status,
        "External API error during scenario start.",
        [error.data]
      );
    } else if (error.request) {
      throw new ApiError(
        502,
        "No response from external API. Please check the baseURL or network connection."
      );
    } else if (error instanceof ApiError) {
      throw error;
    } else {
      throw new ApiError(
        500,
        "Failed to start scenario.",
        [error.message],
        error.stack
      );
    }
  }
});

export {
  createNode,
  deleteNode,
  getNodesByRegion,
  getAllNodes,
  getAllDistricts,
  startScenario,
};
