/**
 * Build ML prediction snapshot from MongoDB data
 * Used to call Backend-B /api/predict endpoint
 */

import { Node } from "../models/node.model.js";
import { Batch } from "../models/batch.model.js";
import { Request } from "../models/request.model.js";
import { Shipment } from "../models/shipment.model.js";
import { Event } from "../models/event.model.js";

/**
 * Build snapshot for ML prediction
 * @param {Date} targetDate - Date to build snapshot for
 * @param {Object} filters - Optional filters (states, districts, nodeIds)
 * @returns {Object} Snapshot in Backend-B expected format
 */
async function buildMLSnapshot(targetDate, filters = {}) {
  const { states, districts, nodeIds } = filters;

  // Query all nodes
  const nodeFilter = {};
  if (states && states.length) nodeFilter.state = { $in: states };
  if (districts && districts.length) nodeFilter.district = { $in: districts };
  if (nodeIds && nodeIds.length) nodeFilter._id = { $in: nodeIds };

  const nodes = await Node.find(nodeFilter).lean();

  // Query batches created on or before targetDate
  const batches = await Batch.find({
    createdAt: { $lte: targetDate },
    ...(nodeIds && nodeIds.length ? { currentNode: { $in: nodeIds } } : {}),
  }).lean();

  // Query requests created on or before targetDate
  const requests = await Request.find({
    createdOn: { $lte: targetDate },
  }).lean();

  // Query shipments started on or before targetDate
  const shipments = await Shipment.find({
    start_iso: { $lte: targetDate },
  }).lean();

  // Query recent events (last 30 days before targetDate)
  const recentEventsStart = new Date(targetDate);
  recentEventsStart.setDate(recentEventsStart.getDate() - 30);
  const recentEvents = await Event.find({
    time: { $gte: recentEventsStart, $lte: targetDate },
  }).lean();

  // Build inventory snapshot per region
  const inventoryByRegion = {};
  for (const batch of batches) {
    if (batch.status === "stored" || batch.status === "in_transit") {
      const node = nodes.find(
        (n) => n._id.toString() === batch.currentNode?.toString()
      );
      if (node) {
        const regionKey = `${node.state}-${node.district}`;
        if (!inventoryByRegion[regionKey]) {
          inventoryByRegion[regionKey] = {
            state: node.state,
            district: node.district,
            stored_kg: 0,
            batch_count: 0,
            food_types: new Set(),
          };
        }
        inventoryByRegion[regionKey].stored_kg += batch.quantity_kg || 0;
        inventoryByRegion[regionKey].batch_count += 1;
        if (batch.foodType) {
          inventoryByRegion[regionKey].food_types.add(batch.foodType);
        }
      }
    }
  }

  // Convert inventory to array format
  const inventorySnapshot = Object.values(inventoryByRegion).map((inv) => ({
    state: inv.state,
    district: inv.district,
    stored_kg: inv.stored_kg,
    batch_count: inv.batch_count,
    unique_food_types: inv.food_types.size,
  }));

  // Format for Backend-B
  return {
    freq: "D", // Daily frequency
    nodes: nodes.map((n) => ({
      _id: n._id,
      nodeId: n._id,
      type: n.type,
      district: n.district,
      state: n.state || "Unknown",
      location: n.location,
      capacity_kg: n.capacity_kg,
    })),
    requests: requests.map((r) => ({
      _id: r._id,
      requestId: r.requestID || r.requestId,
      requesterNode: r.requesterNode,
      items: r.items,
      requiredBy_iso: r.requiredBefore || r.requiredBy_iso,
      status: r.status,
    })),
    shipments: shipments.map((s) => ({
      _id: s._id,
      shipmentId: s.shipmentID || s.shipmentId,
      batchIds: s.batchIds,
      fromNode: s.fromNode,
      toNode: s.toNode,
      start_iso: s.start_iso,
      travel_time_minutes: s.travel_time_minutes,
    })),
    batches: batches.map((b) => ({
      _id: b._id,
      batchId: b._id,
      originNode: b.originNode,
      currentNode: b.currentNode,
      quantity_kg: b.quantity_kg,
      foodType: b.foodType,
      manufacture_date: b.manufacture_date,
      status: b.status,
    })),
    inventorySnapshot,
    recentEvents: recentEvents.map((e) => ({
      time: e.time,
      type: e.type,
      payload: e.payload,
    })),
  };
}

export { buildMLSnapshot };
