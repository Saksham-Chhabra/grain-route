import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Node } from "../models/node.model.js";
import { Batch } from "../models/batch.model.js";
import { Shipment } from "../models/shipment.model.js";
import { Event } from "../models/event.model.js";
import { Request } from "../models/request.model.js";
import { NGO } from "../models/NGO.model.js";
import { extractCoordinates } from "../utils/geoHelpers.js";
import { calculateFreshnessPct } from "../utils/freshness.js";
import { allocateRegular, allocateML } from "../services/simulationService.js";

// Controller-only toggles (no query params):
// Flip these booleans/numbers to enable/disable simulation-only balancing.
const SIM_ENABLE_TRANSFER_PLANNER = true;
// Set to 6 to rebalance every 6 simulated hours. Set to 0/null for one-shot only.
const SIM_TRANSFER_CRON_HOURS = 6;

// Controller-only transfer planner tuning (simulation-only).
// If you see `appliedTransfers: 0`, your dataset likely has very low utilization
// (capacity >> inventory). In that case, reduce the ratios + target ratio.
const SIM_TRANSFER_MAX_PAIRS = 5;
const SIM_TRANSFER_MIN_TRANSFER_KG = 25;
const SIM_TRANSFER_OVERSTOCK_RATIO = 0.25;
const SIM_TRANSFER_UNDERSTOCK_RATIO = 0.08;
const SIM_TRANSFER_TARGET_RATIO = 0.16;

/**
 * Helper function to calculate metrics from allocations
 */
const calcMetrics = (allocations, requests, context = {}) => {
  const {
    batchesById = new Map(),
    avgTempC = 25,
    avgSpeedKmh = 40,
    referenceDate = new Date(),
  } = context;

  const estimateTravelHours = (distanceKm) => {
    const baseHours = distanceKm / avgSpeedKmh;
    const breaks = Math.floor(baseHours / 4) * 0.5;
    return baseHours + breaks;
  };

  if (allocations.length === 0) {
    return {
      totalRequests: 0,
      fulfilledRequests: 0,
      totalRequired: 0,
      totalAllocated: 0,
      fulfillmentRate: 0,
      totalDistanceKm: 0,
      avgDistance: 0,
      avgFreshness: 0,
      deliveredAvgFreshness: 0,
      deliveredKg: 0,
      deliveredSpoiledKg: 0,
      deliveredAtRiskKg: 0,
    };
  }

  const totalRequired = allocations.reduce((sum, a) => sum + a.required_kg, 0);
  const totalAllocated = allocations.reduce(
    (sum, a) => sum + a.allocated_kg,
    0
  );
  const fulfillmentRate =
    totalRequired > 0 ? (totalAllocated / totalRequired) * 100 : 0;

  // Count unique requests that received at least some allocation
  const uniqueRequestIds = [...new Set(allocations.map((a) => a.requestId))];
  const fulfilledRequests = uniqueRequestIds.filter((reqId) => {
    const reqAllocations = allocations.filter((a) => a.requestId === reqId);
    const totalAllocatedForReq = reqAllocations.reduce(
      (sum, a) => sum + a.allocated_kg,
      0
    );
    return totalAllocatedForReq > 0;
  }).length;

  const totalDistanceKm = allocations.reduce(
    (sum, a) => sum + (Number(a.distance_km) || 0),
    0
  );
  const avgDistance =
    allocations.length > 0 ? totalDistanceKm / allocations.length : 0;

  const avgFreshness =
    allocations.reduce((sum, a) => {
      if (a.batches.length === 0) return sum;
      const batchAvg =
        a.batches.reduce((s, b) => s + b.freshness, 0) / a.batches.length;
      return sum + batchAvg;
    }, 0) / allocations.length || 0;

  // Delivery-time freshness/spoilage approximation
  let deliveredKg = 0;
  let deliveredFreshnessWeighted = 0;
  let deliveredSpoiledKg = 0;
  let deliveredAtRiskKg = 0;

  for (const alloc of allocations) {
    // For snapshot simulations, treat dispatch as-of the snapshot date.
    // Using historical request.createdOn can make items appear deliverable
    // even when they are expired at the snapshot time, which confuses the UI.
    const dispatchTime = alloc?.dispatchTime
      ? new Date(alloc.dispatchTime)
      : referenceDate;

    const travelHours = estimateTravelHours(alloc.distance_km || 0);
    const deliveryTime = new Date(
      dispatchTime.getTime() + travelHours * 3600 * 1000
    );

    for (const used of alloc.batches || []) {
      const qty = Number(used.quantity) || 0;
      if (qty <= 0) continue;
      deliveredKg += qty;

      const batchIdStr = used.batchId?.toString?.() ?? String(used.batchId);
      const batch = batchesById.get(batchIdStr);

      const freshnessAtDelivery = batch
        ? calculateFreshnessPct(batch, deliveryTime, avgTempC)
        : Number(used.freshness) || 100;

      deliveredFreshnessWeighted += freshnessAtDelivery * qty;

      if (freshnessAtDelivery <= 0) {
        deliveredSpoiledKg += qty;
      } else if (freshnessAtDelivery < 20) {
        deliveredAtRiskKg += qty;
      }
    }
  }

  const deliveredAvgFreshness =
    deliveredKg > 0 ? deliveredFreshnessWeighted / deliveredKg : 0;

  return {
    totalRequests: requests.length,
    fulfilledRequests,
    totalRequired: Math.round(totalRequired * 100) / 100,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    fulfillmentRate: Math.round(fulfillmentRate * 100) / 100,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    avgDistance: Math.round(avgDistance * 100) / 100,
    avgFreshness: Math.round(avgFreshness * 100) / 100,
    deliveredKg: Math.round(deliveredKg * 100) / 100,
    deliveredAvgFreshness: Math.round(deliveredAvgFreshness * 100) / 100,
    deliveredSpoiledKg: Math.round(deliveredSpoiledKg * 100) / 100,
    deliveredAtRiskKg: Math.round(deliveredAtRiskKg * 100) / 100,
  };
};

const annotateAllocationsWithFreshnessAtDelivery = (
  allocations,
  { batchesById = new Map(), referenceDate = new Date(), avgTempC = 25 } = {}
) => {
  const estimateTravelHours = (distanceKm) => {
    const avgSpeedKmh = 40;
    const baseHours = (Number(distanceKm) || 0) / avgSpeedKmh;
    const breaks = Math.floor(baseHours / 4) * 0.5;
    return baseHours + breaks;
  };

  return (allocations || []).map((alloc) => {
    const dispatchTime = alloc?.dispatchTime
      ? new Date(alloc.dispatchTime)
      : referenceDate;
    const travelHours = estimateTravelHours(alloc?.distance_km || 0);
    const deliveryTime = new Date(
      dispatchTime.getTime() + travelHours * 3600 * 1000
    );

    const batches = (alloc?.batches || []).map((used) => {
      const batchIdStr = used?.batchId?.toString?.() ?? String(used.batchId);
      const batch = batchesById.get(batchIdStr);

      const freshnessAtDelivery = batch
        ? calculateFreshnessPct(batch, deliveryTime, avgTempC)
        : Number(used.freshness) || 100;

      return {
        ...used,
        freshness_at_delivery: Math.round(freshnessAtDelivery * 100) / 100,
      };
    });

    return { ...alloc, batches };
  });
};

/**
 * Get history frame for a specific day
 * GET /api/history/day?date=YYYY-MM-DD
 *
 * Returns a complete snapshot of the supply chain state at the end of the specified day:
 * - Nodes with current inventory levels
 * - Batches (with computed freshness at target date)
 * - Shipments (active or completed by that date)
 * - Events that occurred on or before that date
 * - KPIs (fulfilled requests, spoilage, etc.)
 */
const getHistoryDay = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    throw new ApiError(400, "Missing required parameter: date (YYYY-MM-DD)");
  }

  // Parse target date and set to end of day
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }

  // Set to end of day
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);

  // Fetch all nodes
  const nodes = await Node.find().lean();

  // Fetch batches that existed on or before target date
  const batches = await Batch.find({
    createdAt: { $lte: dayEnd },
  })
    .populate("originNode currentNode")
    .lean();

  // Fetch shipments that were started on or before target date
  const shipments = await Shipment.find({
    start_iso: { $lte: dayEnd },
  })
    .populate("fromNode toNode")
    .lean();

  // Fetch events up to target date
  const events = await Event.find({
    time: { $lte: dayEnd },
  }).lean();

  // Fetch requests up to target date
  const requests = await Request.find({
    createdOn: { $lte: dayEnd },
  }).lean();

  // Calculate inventory per node
  const nodeInventory = {};
  for (const node of nodes) {
    nodeInventory[node._id.toString()] = {
      total_kg: 0,
      by_food_type: {},
      batch_count: 0,
    };
  }

  // Compute freshness and aggregate inventory
  const batchesWithFreshness = batches.map((batch) => {
    const batchCopy = { ...batch };

    // Calculate freshness at target date
    if (batch.shelf_life_hours && batch.manufacture_date) {
      batchCopy.freshnessPct = calculateFreshnessPct(
        batch,
        dayEnd,
        25 // Default avg temp
      );
    }

    // Update inventory if batch is stored at this node
    if (batch.status === "stored" && batch.currentNode) {
      const nodeId =
        batch.currentNode._id?.toString() || batch.currentNode.toString();
      if (nodeInventory[nodeId]) {
        nodeInventory[nodeId].total_kg += batch.quantity_kg || 0;
        nodeInventory[nodeId].batch_count += 1;

        const foodType = batch.foodType || "unknown";
        if (!nodeInventory[nodeId].by_food_type[foodType]) {
          nodeInventory[nodeId].by_food_type[foodType] = 0;
        }
        nodeInventory[nodeId].by_food_type[foodType] += batch.quantity_kg || 0;
      }
    }

    return batchCopy;
  });

  // Transform nodes to frontend format with inventory
  const nodesFormatted = nodes.map((node) => {
    const coords = extractCoordinates(node);
    const inventory = nodeInventory[node._id.toString()];

    return {
      id: node._id.toString(),
      nodeId: node._id.toString(),
      name: node.name,
      type: node.type,
      lat: coords.lat,
      lng: coords.lon,
      district: node.district,
      capacity_kg: node.capacity_kg,
      stored_kg: inventory.total_kg,
      batch_count: inventory.batch_count,
      inventory_by_type: inventory.by_food_type,
    };
  });

  // Transform shipments to frontend format
  const shipmentsFormatted = shipments.map((shipment) => {
    const fromNode = shipment.fromNode;
    const toNode = shipment.toNode;
    const fromCoords = extractCoordinates(fromNode);
    const toCoords = extractCoordinates(toNode);

    // Determine status at target date
    let status = shipment.status;
    if (shipment.arrived_iso && shipment.arrived_iso <= dayEnd) {
      status = "arrived";
    } else if (
      shipment.start_iso <= dayEnd &&
      (!shipment.arrived_iso || shipment.arrived_iso > dayEnd)
    ) {
      status = "in_transit";
    }

    return {
      id: shipment._id.toString(),
      shipmentId: shipment.shipmentID || shipment.shipmentId,
      fromNodeId: fromNode._id.toString(),
      toNodeId: toNode._id.toString(),
      startTime: shipment.start_iso,
      etaTime: shipment.eta_iso,
      arrivedTime: shipment.arrived_iso,
      status,
      fromLat: fromCoords.lat,
      fromLng: fromCoords.lon,
      toLat: toCoords.lat,
      toLng: toCoords.lon,
      foodItem: shipment.metadata?.items?.[0]?.foodType || "food",
      value:
        shipment.metadata?.items?.reduce(
          (sum, item) => sum + (item.quantity_kg || 0),
          0
        ) || 0,
    };
  });

  // Transform events to frontend format
  const eventsFormatted = events.map((event) => {
    const coords = event.location?.coordinates
      ? {
          lat: event.location.coordinates[1],
          lon: event.location.coordinates[0],
        }
      : { lat: 20.5937, lon: 78.9629 }; // Default India center

    return {
      id: event._id.toString(),
      eventId: event._id.toString(),
      time: event.time,
      type: event.type,
      lat: coords.lat,
      lng: coords.lon,
      payload: event.payload,
    };
  });

  // Calculate KPIs
  const fulfilledRequests = requests.filter(
    (r) =>
      r.status === "fulfilled" && r.fullFilledOn && r.fullFilledOn <= dayEnd
  ).length;
  const totalRequests = requests.length;
  const spoiledBatches = batchesWithFreshness.filter(
    (b) =>
      b.status === "spoiled" ||
      (b.freshnessPct !== undefined && b.freshnessPct <= 0)
  );
  const spoiledKg = spoiledBatches.reduce(
    (sum, b) => sum + (b.quantity_kg || 0),
    0
  );

  // Calculate average delivery time for arrived shipments
  const arrivedShipments = shipments.filter(
    (s) => s.arrived_iso && s.arrived_iso <= dayEnd
  );
  const avgDeliveryMinutes =
    arrivedShipments.length > 0
      ? arrivedShipments.reduce((sum, s) => {
          const deliveryTime =
            (new Date(s.arrived_iso) - new Date(s.start_iso)) / (1000 * 60);
          return sum + deliveryTime;
        }, 0) / arrivedShipments.length
      : 0;

  const kpis = {
    fulfilled_requests: fulfilledRequests,
    total_requests: totalRequests,
    fulfillment_rate:
      totalRequests > 0 ? (fulfilledRequests / totalRequests) * 100 : 0,
    spoiled_kg: spoiledKg,
    spoiled_batch_count: spoiledBatches.length,
    avg_delivery_time_minutes: Math.round(avgDeliveryMinutes),
    total_shipments: shipments.length,
    active_shipments: shipmentsFormatted.filter(
      (s) => s.status === "in_transit"
    ).length,
  };

  return res.json(
    new ApiResponse(
      200,
      {
        date: targetDate.toISOString().split("T")[0],
        timestamp: dayEnd.toISOString(),
        nodes: nodesFormatted,
        batches: batchesWithFreshness,
        shipments: shipmentsFormatted,
        events: eventsFormatted,
        kpis,
      },
      "History frame retrieved successfully"
    )
  );
});

/**
 * Get history frames for a date range
 * GET /api/history/range?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns an array of daily frames for animation/playback
 */
const getHistoryRange = asyncHandler(async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    throw new ApiError(
      400,
      "Missing required parameters: start, end (YYYY-MM-DD)"
    );
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }

  if (endDate < startDate) {
    throw new ApiError(400, "End date must be after start date");
  }

  // Limit range to prevent performance issues
  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  if (daysDiff > 90) {
    throw new ApiError(400, "Date range too large. Maximum 90 days allowed.");
  }

  const frames = [];
  const currentDate = new Date(startDate);

  // Generate frame for each day
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split("T")[0];

    // Call getHistoryDay logic for each date
    // For efficiency, we'll return a simplified version
    // In production, this could be cached or pre-computed

    frames.push({
      date: dateStr,
      // Placeholder: full implementation would call getHistoryDay logic
      message: `Frame for ${dateStr} - implement full logic or use cached data`,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return res.json(
    new ApiResponse(
      200,
      {
        start: start,
        end: end,
        frame_count: frames.length,
        frames,
      },
      "History range retrieved successfully"
    )
  );
});

/**
 * Compare regular vs ML-driven allocation strategies
 * GET /api/history/compare?date=YYYY-MM-DD
 *
 * Runs two simulations on the same dataset:
 * 1. Regular: Nearest warehouse + FIFO batches (reactive)
 * 2. ML: Demand prediction + freshness/distance optimization (proactive)
 *
 * Returns side-by-side metrics showing ML improvements
 */
const compareSimulations = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    throw new ApiError(400, "Missing date parameter (format: YYYY-MM-DD)");
  }

  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }

  targetDate.setHours(23, 59, 59, 999);

  // Fetch entities at target date
  const [batches, requests, warehouses, ngos] = await Promise.all([
    Batch.find({
      manufacture_date: { $lte: targetDate },
      status: "stored",
    }).lean(),
    Request.find({
      createdOn: { $lte: targetDate },
      status: "pending",
    }).lean(),
    Node.find({ type: "warehouse" }).lean(),
    Node.find({ type: "ngo" }).lean(),
  ]);

  if (requests.length === 0) {
    throw new ApiError(404, `No pending requests found on or before ${date}`);
  }

  // Run both strategies in parallel
  const mlOptions = {
    referenceDate: targetDate,
    enableTransferPlanner: SIM_ENABLE_TRANSFER_PLANNER,
    simulationOnly: true,
    ...(SIM_ENABLE_TRANSFER_PLANNER
      ? {
          transferPlannerMaxPairs: SIM_TRANSFER_MAX_PAIRS,
          transferPlannerMinTransferKg: SIM_TRANSFER_MIN_TRANSFER_KG,
          transferPlannerOverstockRatio: SIM_TRANSFER_OVERSTOCK_RATIO,
          transferPlannerUnderstockRatio: SIM_TRANSFER_UNDERSTOCK_RATIO,
          transferPlannerTargetRatio: SIM_TRANSFER_TARGET_RATIO,
        }
      : {}),
    ...(SIM_ENABLE_TRANSFER_PLANNER &&
    Number.isFinite(Number(SIM_TRANSFER_CRON_HOURS)) &&
    Number(SIM_TRANSFER_CRON_HOURS) > 0
      ? { transferPlannerCronHours: Number(SIM_TRANSFER_CRON_HOURS) }
      : {}),
  };

  const [regularAllocations, mlAllocations] = await Promise.all([
    allocateRegular(requests, batches, warehouses, ngos),
    allocateML(requests, batches, warehouses, ngos, mlOptions),
  ]);

  // Calculate metrics using shared helper function
  const batchesById = new Map(batches.map((b) => [b._id.toString(), b]));
  const regularMetrics = calcMetrics(regularAllocations, requests, {
    batchesById,
    referenceDate: targetDate,
  });
  const mlMetrics = calcMetrics(mlAllocations, requests, {
    batchesById,
    referenceDate: targetDate,
  });

  // Calculate improvements
  const improvements = {
    fulfillmentIncrease:
      mlMetrics.fulfillmentRate - regularMetrics.fulfillmentRate,
    distanceReduction:
      regularMetrics.avgDistance > 0
        ? ((regularMetrics.avgDistance - mlMetrics.avgDistance) /
            regularMetrics.avgDistance) *
          100
        : 0,
    freshnessIncrease: mlMetrics.avgFreshness - regularMetrics.avgFreshness,
    spoilageReduction:
      regularMetrics.deliveredSpoiledKg > 0
        ? ((regularMetrics.deliveredSpoiledKg - mlMetrics.deliveredSpoiledKg) /
            regularMetrics.deliveredSpoiledKg) *
          100
        : 0,
    foodSavedKg:
      regularMetrics.deliveredSpoiledKg - mlMetrics.deliveredSpoiledKg,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        date,
        regular: {
          strategy: "Rule-Based (Nearest + FIFO)",
          metrics: regularMetrics,
          allocations: regularAllocations.slice(0, 10), // Sample for brevity
        },
        ml: {
          strategy: "ML-Driven (Predictive + Optimized)",
          metrics: mlMetrics,
          allocations: mlAllocations.slice(0, 10),
          transferPlannerDebug: mlOptions?._transferPlannerDebug || null,
        },
        improvements: {
          fulfillmentIncrease: `${improvements.fulfillmentIncrease >= 0 ? "+" : ""}${Math.round(improvements.fulfillmentIncrease * 100) / 100}%`,
          distanceReduction: `${Math.round(improvements.distanceReduction * 100) / 100}%`,
          freshnessIncrease: `${improvements.freshnessIncrease >= 0 ? "+" : ""}${Math.round(improvements.freshnessIncrease * 100) / 100}%`,
          spoilageReduction: `${Math.round(improvements.spoilageReduction * 100) / 100}%`,
          foodSavedKg: `${Math.round(improvements.foodSavedKg * 100) / 100} kg`,
        },
        summary: `ML-driven approach shows ${Math.round(Math.abs(improvements.fulfillmentIncrease))}% ${improvements.fulfillmentIncrease >= 0 ? "better" : "worse"} fulfillment, ${Math.round(Math.abs(improvements.distanceReduction))}% ${improvements.distanceReduction >= 0 ? "less" : "more"} distance, ${Math.round(Math.abs(improvements.freshnessIncrease))}% ${improvements.freshnessIncrease >= 0 ? "fresher" : "less fresh"} inventory at dispatch, and ${Math.round(Math.abs(improvements.spoilageReduction))}% ${improvements.spoilageReduction >= 0 ? "less" : "more"} spoilage at delivery (≈ ${Math.round(improvements.foodSavedKg * 100) / 100} kg saved).`,
      },
      "Simulation comparison completed successfully"
    )
  );
});

/**
 * Simulate supply chain allocations for visualization
 * GET /api/history/simulate?date=YYYY-MM-DD
 *
 * Returns detailed simulation data with node coordinates for map visualization
 */
const simulateAllocations = asyncHandler(async (req, res) => {
  const { date, days, backlog } = req.query;

  // When a date is provided, simulate the world "as-of" end-of-day.
  // Otherwise, use the current timestamp.
  const targetDate = date ? new Date(String(date)) : new Date();
  if (date && isNaN(targetDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }
  if (date) targetDate.setHours(23, 59, 59, 999);

  const windowDaysRaw = Number(days ?? process.env.SIM_WINDOW_DAYS ?? 7);
  const windowDays =
    Number.isFinite(windowDaysRaw) && windowDaysRaw > 0
      ? Math.min(Math.max(Math.floor(windowDaysRaw), 7), 31)
      : 7;

  const backlogLimitRaw = Number(
    backlog ?? process.env.SIM_BACKLOG_REQUEST_LIMIT ?? 10
  );
  const backlogLimit =
    Number.isFinite(backlogLimitRaw) && backlogLimitRaw >= 0
      ? Math.min(Math.max(Math.floor(backlogLimitRaw), 0), 200)
      : 10;

  const windowEnd = new Date(targetDate);
  const windowStart = new Date(targetDate);
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));

  // Fetch snapshot data from database.
  // IMPORTANT: Snapshot size materially affects ML feature variance.
  // Use env overrides to widen/narrow the slice without code changes.
  // Defaults are sized for interactive UI use.
  // Override via env when you want full-fidelity snapshots.
  const requestLimit = Number(process.env.SIM_SNAPSHOT_REQUEST_LIMIT ?? 400);
  const batchLimit = Number(process.env.SIM_SNAPSHOT_BATCH_LIMIT ?? 1500);

  const inWindowQuery = Request.find({
    createdOn: { $gte: windowStart, $lte: windowEnd },
    status: "pending",
  })
    .sort({ createdOn: 1 })
    .lean();

  const backlogQuery = backlogLimit
    ? Request.find({
        createdOn: { $lt: windowStart },
        status: "pending",
      })
        .sort({ createdOn: -1 })
        .limit(backlogLimit)
        .lean()
    : null;

  // Fetch requests for the simulation window, plus a small backlog from before it.
  const inWindowRequests =
    requestLimit > 0
      ? await inWindowQuery.limit(requestLimit)
      : await inWindowQuery;

  const backlogRequests = backlogQuery ? await backlogQuery : [];

  // Order: backlog first (oldest unmet), then current window.
  const requests = [...backlogRequests.reverse(), ...inWindowRequests];

  if (requests.length === 0) {
    throw new ApiError(404, "No requests found in database");
  }

  // Simulation window is the requested date window.
  const simulationStartTime = new Date(windowStart);
  const simulationEndTime = new Date(windowEnd);

  // Query batches that exist by the end of the simulation window.
  // IMPORTANT: Use manufacture_date as the "availability" timestamp; createdAt is DB insertion time
  // and can make Day 1 inventory appear as 0 if the dataset was imported later.
  const batchQuery = Batch.find({
    manufacture_date: { $lte: simulationEndTime },
    status: "stored",
    // Exclude batches that were already expired by the start of the window.
    $or: [
      { expiry_iso: { $gt: simulationStartTime } },
      { expiry_iso: { $exists: false } },
      { expiry_iso: null },
    ],
  })
    .sort({ manufacture_date: -1 })
    .lean();

  const [batches, warehouses, ngoNodes, ngoOrgs, allNodes] = await Promise.all([
    batchLimit > 0 ? batchQuery.limit(batchLimit) : batchQuery,
    Node.find({ type: "warehouse" }).lean(),
    Node.find({ type: "ngo" }).lean(),
    NGO.find().lean(),
    Node.find().lean(),
  ]);

  const batchIds = batches.map((b) => b._id);
  const shipments = batchIds.length
    ? await Shipment.find({
        start_iso: { $lte: simulationStartTime },
        batchIds: { $in: batchIds },
      }).lean()
    : [];

  if (batches.length === 0) {
    throw new ApiError(404, "No batches found in database");
  }

  // Run both allocations against independent copies of the same batch snapshot.
  // This prevents one strategy from mutating batch quantities and affecting the other.
  const cloneBatches = (arr) =>
    Array.isArray(arr) ? arr.map((b) => ({ ...b })) : [];
  const regularBatches = cloneBatches(batches);
  const mlBatches = cloneBatches(batches);

  // Dispatch scheduling
  // Default: spread dispatch across the simulation window so playback evolves day-by-day.
  // Use `dispatchMode=createdOn` (or env `SIM_DISPATCH_MODE=createdOn`) to anchor dispatch to request.createdOn.
  const dispatchMode = String(
    req.query.dispatchMode ?? process.env.SIM_DISPATCH_MODE ?? "spread"
  ).toLowerCase();

  const clampMs = (ms) => {
    const lo = simulationStartTime.getTime();
    const hi = simulationEndTime.getTime();
    if (!Number.isFinite(ms)) return lo;
    return Math.min(Math.max(ms, lo), hi);
  };

  // Optional: leave headroom so late-window dispatches arrive within the window.
  // Default is 0h because some datasets only have inventory available late in the day.
  const latestDispatchCeilMs = (() => {
    const hi = simulationEndTime.getTime();
    const lo = simulationStartTime.getTime();
    const headroomHoursRaw = Number(
      process.env.SIM_DISPATCH_HEADROOM_HOURS ?? 0
    );
    const headroomHours =
      Number.isFinite(headroomHoursRaw) && headroomHoursRaw > 0
        ? Math.min(headroomHoursRaw, 48)
        : 0;
    const headroomMs = headroomHours * 3600 * 1000;
    return Math.max(lo, hi - headroomMs);
  })();

  const requestsForAllocation = (requests || []).map((r) => ({ ...r }));
  if (dispatchMode === "createdon") {
    for (const r of requestsForAllocation) {
      const rawMs = r?.createdOn ? new Date(r.createdOn).getTime() : NaN;
      const ms = clampMs(rawMs);
      r.dispatchTime = new Date(
        Math.min(ms, latestDispatchCeilMs)
      ).toISOString();
    }
  } else {
    // Plan allocations at the latest dispatch time (end-of-window) so batch selection
    // is done under worst-case freshness/expiry constraints.
    // Then we spread *allocations* across the window for playback.
    const planIso = new Date(latestDispatchCeilMs).toISOString();
    for (const r of requestsForAllocation) {
      r.dispatchTime = planIso;
    }
  }

  const regularAllocations = await allocateRegular(
    requestsForAllocation,
    regularBatches,
    warehouses,
    ngoNodes,
    {
      dispatchTimeFloor: simulationStartTime,
      dispatchTimeCeil: simulationEndTime,
    }
  );

  const mlOptions = {
    dispatchTimeFloor: simulationStartTime,
    dispatchTimeCeil: simulationEndTime,
    enableTransferPlanner: SIM_ENABLE_TRANSFER_PLANNER,
    simulationOnly: true,
    ...(SIM_ENABLE_TRANSFER_PLANNER
      ? {
          transferPlannerMaxPairs: SIM_TRANSFER_MAX_PAIRS,
          transferPlannerMinTransferKg: SIM_TRANSFER_MIN_TRANSFER_KG,
          transferPlannerOverstockRatio: SIM_TRANSFER_OVERSTOCK_RATIO,
          transferPlannerUnderstockRatio: SIM_TRANSFER_UNDERSTOCK_RATIO,
          transferPlannerTargetRatio: SIM_TRANSFER_TARGET_RATIO,
        }
      : {}),
    ...(SIM_ENABLE_TRANSFER_PLANNER &&
    Number.isFinite(Number(SIM_TRANSFER_CRON_HOURS)) &&
    Number(SIM_TRANSFER_CRON_HOURS) > 0
      ? { transferPlannerCronHours: Number(SIM_TRANSFER_CRON_HOURS) }
      : {}),
  };
  const mlAllocations = await allocateML(
    requestsForAllocation,
    mlBatches,
    warehouses,
    ngoNodes,
    mlOptions
  );

  const batchesById = new Map(batches.map((b) => [b._id.toString(), b]));

  // For playback: spread dispatch times across the selected window.
  // This makes shipments appear from day 1 through day N even if requests were created late.
  if (dispatchMode !== "createdon") {
    const spreadAllocationsAcrossWindow = (allocations) => {
      const lo = simulationStartTime.getTime();
      const hi = simulationEndTime.getTime();
      const span = Math.max(0, hi - lo);
      const nonZero = (allocations || []).filter(
        (a) => (Number(a?.allocated_kg) || 0) > 0
      );
      const denom = Math.max(1, nonZero.length - 1);
      nonZero.forEach((alloc, idx) => {
        const scheduledMs0 = lo + Math.round((span * idx) / denom);

        // Ensure we never "dispatch" before the allocated batches exist.
        // (We plan allocations at end-of-window for feasibility, then spread for playback;
        // this clamp prevents impossible early dispatch that would artificially boost freshness.)
        let minDispatchMs = scheduledMs0;
        for (const used of alloc?.batches || []) {
          const id = used?.batchId?.toString?.() ?? String(used.batchId);
          const b = batchesById.get(id);
          if (!b) continue;

          const availRaw = b.manufacture_date || b.createdAt || null;
          const availMs = availRaw ? new Date(availRaw).getTime() : NaN;
          if (Number.isFinite(availMs)) {
            minDispatchMs = Math.max(minDispatchMs, availMs);
          }
        }

        alloc.dispatchTime = new Date(clampMs(minDispatchMs)).toISOString();
      });
    };

    spreadAllocationsAcrossWindow(regularAllocations);
    spreadAllocationsAcrossWindow(mlAllocations);
  }

  // Regular baseline should never ship batches that are already expired at dispatch
  // or that would arrive expired.
  const estimateTravelHours = (distanceKm) => {
    const avgSpeedKmh = 40;
    const baseHours = (Number(distanceKm) || 0) / avgSpeedKmh;
    const breaks = Math.floor(baseHours / 4) * 0.5;
    return baseHours + breaks;
  };

  const filterExpiredForRegular = (allocations) =>
    (allocations || []).map((alloc) => {
      const dispatchTime = alloc?.dispatchTime
        ? new Date(alloc.dispatchTime)
        : simulationStartTime;

      let keptKg = 0;
      const keptBatches = [];
      for (const used of alloc?.batches || []) {
        const qty = Number(used?.quantity) || 0;
        if (qty <= 0) continue;

        const batchIdStr = used?.batchId?.toString?.() ?? String(used.batchId);
        const batch = batchesById.get(batchIdStr);
        if (!batch) continue;

        const freshnessAtDispatch = calculateFreshnessPct(batch, dispatchTime);
        if (!Number.isFinite(freshnessAtDispatch) || freshnessAtDispatch <= 0) {
          continue;
        }

        keptKg += qty;
        keptBatches.push(used);
      }

      return {
        ...alloc,
        allocated_kg: Math.round(keptKg * 100) / 100,
        batches: keptBatches,
      };
    });

  const allowSpoiledRegular = process.env.REGULAR_ALLOW_SPOILED === "1";

  const simAvgTempC = (() => {
    const raw = Number(process.env.SIM_AVG_TEMP_C);
    return Number.isFinite(raw) ? raw : 25;
  })();

  // Regular supply chain is less optimized / weaker cold-chain.
  // Model that as a higher effective ambient temperature during handling + transport.
  const regularTempPenaltyC = (() => {
    const raw = Number(process.env.REGULAR_TEMP_PENALTY_C);
    return Number.isFinite(raw) ? raw : 5;
  })();
  const regularAvgTempC = simAvgTempC + regularTempPenaltyC;

  const regularAllocationsFiltered = allowSpoiledRegular
    ? regularAllocations
    : filterExpiredForRegular(regularAllocations);

  // Calculate metrics
  const regularMetrics = calcMetrics(regularAllocationsFiltered, requests, {
    batchesById,
    referenceDate: simulationStartTime,
    avgTempC: regularAvgTempC,
  });
  const mlMetrics = calcMetrics(mlAllocations, requests, {
    batchesById,
    referenceDate: simulationStartTime,
    avgTempC: simAvgTempC,
  });

  const regularAllocationsAnnotated =
    annotateAllocationsWithFreshnessAtDelivery(regularAllocationsFiltered, {
      batchesById,
      referenceDate: simulationStartTime,
      avgTempC: regularAvgTempC,
    });
  const mlAllocationsAnnotated = annotateAllocationsWithFreshnessAtDelivery(
    mlAllocations,
    { batchesById, referenceDate: simulationStartTime, avgTempC: simAvgTempC }
  );

  // Build an ML snapshot payload from the exact same DB slice used for simulation.
  // The ML gateway supports raw server snapshots (nodes/requests/shipments/batches).
  const ngoNodeIdByOrgId = new Map(
    (ngoOrgs || [])
      .map((org) => {
        const orgId = org?._id?.toString?.() ?? String(org._id);
        const node = (ngoNodes || []).find((n) => n?.name === org?.name);
        const nodeId = node?._id?.toString?.() ?? null;
        return [orgId, nodeId];
      })
      .filter((pair) => pair[0])
  );

  const mlSnapshotPayload = {
    freq: "M",
    nodes: (allNodes || []).map((node) => ({
      _id: node._id?.toString?.() ?? String(node._id),
      nodeId: node._id?.toString?.() ?? String(node._id),
      type: node.type,
      name: node.name || null,
      district: node.district || null,
      state: node.state || node.regionId || "Unknown",
      regionId: node.regionId || null,
      location: node.location || null,
      capacity_kg: Number(node.capacity_kg) || 0,
    })),
    requests: (requests || []).map((r) => ({
      _id: r._id?.toString?.() ?? String(r._id),
      requestId:
        r.requestID || r.requestId || (r._id?.toString?.() ?? String(r._id)),
      createdOn_iso: (() => {
        const raw =
          r.createdOn ?? r.createdAt ?? r.created_at ?? r.created_on ?? null;
        if (raw instanceof Date) return raw.toISOString();
        if (typeof raw === "string" && raw) return raw;
        return null;
      })(),
      requesterNode: (() => {
        const orgId = r.requesterNode?.toString?.() ?? String(r.requesterNode);
        const nodeId = orgId ? ngoNodeIdByOrgId.get(orgId) : null;
        return nodeId || orgId || null;
      })(),
      items: Array.isArray(r.items) ? r.items : [],
      requiredBy_iso:
        r.requiredBefore instanceof Date
          ? r.requiredBefore.toISOString()
          : r.requiredBefore || null,
      status: r.status || "pending",
    })),
    shipments: (shipments || []).map((s) => ({
      _id: s._id?.toString?.() ?? String(s._id),
      shipmentId:
        s.shipmentID?.toString?.() ||
        s.shipmentId?.toString?.() ||
        (s._id?.toString?.() ?? String(s._id)),
      batchIds: Array.isArray(s.batchIds)
        ? s.batchIds.map((id) => id?.toString?.() ?? String(id))
        : [],
      fromNode: s.fromNode?.toString?.() ?? (s.fromNode || null),
      toNode: s.toNode?.toString?.() ?? (s.toNode || null),
      start_iso:
        s.start_iso instanceof Date
          ? s.start_iso.toISOString()
          : s.start_iso || null,
      eta_iso:
        s.eta_iso instanceof Date ? s.eta_iso.toISOString() : s.eta_iso || null,
      arrived_iso:
        s.arrived_iso instanceof Date
          ? s.arrived_iso.toISOString()
          : s.arrived_iso || null,
      travel_time_minutes: Number(s.travel_time_minutes) || null,
      distance_km:
        typeof s.distance_km === "number"
          ? s.distance_km
          : Number(s.distance_km) || null,
      status: s.status || null,
    })),
    batches: (batches || []).map((b) => ({
      _id: b._id?.toString?.() ?? String(b._id),
      batchId: b._id?.toString?.() ?? String(b._id),
      originNode: b.originNode?.toString?.() ?? (b.originNode || null),
      currentNode:
        b.currentNode?.toString?.() ?? (b.currentNode || b.originNode || null),
      quantity_kg:
        typeof b.quantity_kg === "number"
          ? b.quantity_kg
          : Number(b.quantity_kg) || 0,
      original_quantity_kg:
        typeof b.original_quantity_kg === "number"
          ? b.original_quantity_kg
          : Number(b.original_quantity_kg) || null,
      foodType: b.foodType || null,
      shelf_life_hours:
        typeof b.shelf_life_hours === "number"
          ? b.shelf_life_hours
          : Number(b.shelf_life_hours) || null,
      freshnessPct:
        typeof b.freshnessPct === "number"
          ? b.freshnessPct
          : Number(b.freshnessPct) || null,
      manufacture_date:
        b.manufacture_date instanceof Date
          ? b.manufacture_date.toISOString()
          : b.manufacture_date || null,
      createdAt:
        b.createdAt instanceof Date
          ? b.createdAt.toISOString()
          : b.createdAt || null,
      expiry_iso:
        b.expiry_iso instanceof Date
          ? b.expiry_iso.toISOString()
          : b.expiry_iso || null,
      status: b.status || "stored",
    })),
    meta: {
      targetDate_iso: targetDate.toISOString(),
      simulationStartTime_iso: simulationStartTime.toISOString(),
      requestCount: requests.length,
      batchCount: batches.length,
      shipmentCount: shipments.length,
    },
  };

  // Convert to visualization format with coordinates
  const convertToVisualization = (allocations, strategyName, metrics) => {
    return {
      strategy: strategyName,
      metrics: metrics,
      allocations: allocations.map((alloc) => {
        const warehouse = warehouses.find(
          (w) => w._id.toString() === alloc.warehouse.toString()
        );
        const request = requests.find((r) => r.requestID === alloc.requestId);

        // Look up NGO organization first, then find matching Node
        const ngoOrg = request
          ? ngoOrgs.find(
              (org) => org._id.toString() === request.requesterNode.toString()
            )
          : null;

        const ngo = ngoOrg
          ? ngoNodes.find((n) => n.name === ngoOrg.name)
          : null;

        return {
          ...alloc,
          warehouseCoords: warehouse ? warehouse.location.coordinates : [0, 0],
          ngoCoords: ngo ? ngo.location.coordinates : [0, 0],
          ngoName: ngoOrg ? ngoOrg.name : "Unknown NGO",
          warehouseName: warehouse ? warehouse.name : "Unknown Warehouse",
        };
      }),
    };
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        startTime: simulationStartTime,
        endTime: simulationEndTime,
        totalRequests: requests.length,
        totalBatches: batches.length,
        snapshotDate: targetDate.toISOString(),
        mlSnapshotPayload,
        transferPlannerDebug: mlOptions?._transferPlannerDebug || null,
        regular: convertToVisualization(
          regularAllocationsAnnotated,
          "Regular",
          regularMetrics
        ),
        ml: convertToVisualization(mlAllocationsAnnotated, "ML", mlMetrics),
      },
      "Simulation data generated successfully"
    )
  );
});

export {
  getHistoryDay,
  getHistoryRange,
  compareSimulations,
  simulateAllocations,
};
