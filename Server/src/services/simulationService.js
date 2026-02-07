import { Node } from "../models/node.model.js";
import { Batch } from "../models/batch.model.js";
import { Request } from "../models/request.model.js";
import { NGO } from "../models/NGO.model.js";
import { haversineDistanceKm } from "../utils/geoHelpers.js";
import {
  calculateFreshnessPct,
  remainingShelfLifeHours,
} from "../utils/freshness.js";
import axios from "axios";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5050";
const TRANSPORT_SERVICE_URL =
  process.env.TRANSPORT_SERVICE_URL || "http://localhost:5001";

const debugAlloc = (...args) => {
  if (process.env.ALLOC_DEBUG === "1") {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};

const safeRemainingShelfLifeHours = (batch, currentDate) => {
  const life = Number(batch?.shelf_life_hours);
  const hasLife = Number.isFinite(life) && life > 0;
  const manufacture = batch?.manufacture_date
    ? new Date(batch.manufacture_date)
    : null;
  const hasManufacture =
    manufacture instanceof Date && !Number.isNaN(manufacture.getTime());

  // If we don't have perishability metadata, treat as non-perishable.
  if (!hasLife || !hasManufacture) return Number.POSITIVE_INFINITY;

  const hours = remainingShelfLifeHours(batch, currentDate);
  return Number.isFinite(hours) ? hours : Number.POSITIVE_INFINITY;
};

const coercePositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const buildTransferPlannerRequest = ({ warehouses, batches }) => {
  const nodes = (warehouses || []).map((n) => ({
    _id: n._id?.toString?.() ?? String(n._id),
    type: n.type,
    district: n.district || null,
    state: n.state || n.regionId || "Unknown",
    regionId: n.regionId || null,
    capacity_kg:
      typeof n.capacity_kg === "number"
        ? n.capacity_kg
        : Number(n.capacity_kg) || 0,
    location: n.location || null,
    nodeId: n.nodeId || (n._id?.toString?.() ?? String(n._id)),
    name: n.name || null,
  }));

  const plannerBatches = (batches || []).map((b) => ({
    _id: b._id?.toString?.() ?? String(b._id),
    originNode: b.originNode?.toString?.() ?? String(b.originNode),
    currentNode: b.currentNode?.toString?.() ?? String(b.currentNode),
    quantity_kg:
      typeof b.quantity_kg === "number"
        ? b.quantity_kg
        : Number(b.quantity_kg) || 0,
    status: b.status || "stored",
    manufacture_date: b.manufacture_date || null,
    expiry_iso: b.expiry_iso || null,
    shelf_life_hours:
      typeof b.shelf_life_hours === "number"
        ? b.shelf_life_hours
        : Number(b.shelf_life_hours) || null,
    freshnessPct:
      typeof b.freshnessPct === "number"
        ? b.freshnessPct
        : Number(b.freshnessPct) || null,
    foodType: b.foodType,
  }));

  return {
    nodes,
    batches: plannerBatches,
  };
};

const applyWarehouseTransfersToBatches = ({
  batches,
  transfers,
  currentDate,
}) => {
  if (!Array.isArray(transfers) || transfers.length === 0) {
    return { batches, appliedTransfers: [] };
  }

  const working = Array.isArray(batches) ? batches.map((b) => ({ ...b })) : [];
  const appliedTransfers = [];
  let splitSeq = 0;

  const takeFromSource = ({ sourceId, qtyNeeded }) => {
    if (!qtyNeeded || qtyNeeded <= 0) return [];
    const candidates = working
      .filter(
        (b) =>
          b &&
          b.status === "stored" &&
          b.currentNode &&
          b.currentNode.toString() === sourceId &&
          (Number(b.quantity_kg) || 0) > 0
      )
      .sort((a, b) => {
        const when =
          currentDate instanceof Date && !Number.isNaN(currentDate.getTime())
            ? currentDate
            : new Date();
        const aLife = safeRemainingShelfLifeHours(a, when);
        const bLife = safeRemainingShelfLifeHours(b, when);

        // Prefer moving inventory that is closer to expiry first.
        if (aLife !== bLife) return aLife - bLife;

        // Tie-breaker: move larger lots first to reduce splitting.
        return (Number(b.quantity_kg) || 0) - (Number(a.quantity_kg) || 0);
      });

    const picked = [];
    let remaining = qtyNeeded;
    for (const batch of candidates) {
      if (remaining <= 0) break;
      const available = Number(batch.quantity_kg) || 0;
      if (available <= 0) continue;
      const takeQty = Math.min(available, remaining);
      picked.push({ batch, takeQty });
      remaining -= takeQty;
    }
    return picked;
  };

  for (const suggestion of transfers) {
    const sourceId = suggestion?.source?.mongoId?.toString?.() ?? null;
    const targetId = suggestion?.target?.mongoId?.toString?.() ?? null;
    const suggestedQty = coercePositiveNumber(
      suggestion?.suggested_quantity_kg
    );

    if (!sourceId || !targetId || !suggestedQty) continue;
    if (sourceId === targetId) continue;

    const picked = takeFromSource({ sourceId, qtyNeeded: suggestedQty });
    const totalTaken = picked.reduce((sum, p) => sum + (p.takeQty || 0), 0);
    if (totalTaken <= 0) continue;

    for (const { batch, takeQty } of picked) {
      const available = Number(batch.quantity_kg) || 0;
      if (takeQty <= 0 || available <= 0) continue;

      if (takeQty >= available - 1e-9) {
        // Move entire batch.
        batch.currentNode = targetId;
      } else {
        // Split batch and move part.
        batch.quantity_kg = available - takeQty;
        splitSeq += 1;
        working.push({
          ...batch,
          _id: `${batch._id?.toString?.() ?? String(batch._id)}-xfer-${splitSeq}`,
          currentNode: targetId,
          quantity_kg: takeQty,
        });
      }
    }

    appliedTransfers.push({
      type: suggestion?.type || "warehouse_to_warehouse",
      sourceWarehouseId: sourceId,
      targetWarehouseId: targetId,
      suggested_quantity_kg: suggestedQty,
      applied_quantity_kg: Math.round(totalTaken * 100) / 100,
      distance_km:
        typeof suggestion?.distance_km === "number"
          ? suggestion.distance_km
          : null,
    });
  }

  return { batches: working, appliedTransfers };
};

/**
 * REGULAR ALLOCATION (Rule-Based Baseline)
 * - Nearest warehouse to NGO
 * - FIFO batch selection (oldest first)
 * - Reactive: only responds to existing requests
 */
export async function allocateRegular(
  requests,
  batches,
  warehouses,
  ngos,
  options = {}
) {
  const allocations = [];
  const unusedBatches = [...batches];

  const dispatchTimeFloorRaw = options?.dispatchTimeFloor;
  const dispatchTimeFloor = dispatchTimeFloorRaw
    ? new Date(dispatchTimeFloorRaw)
    : null;
  const hasDispatchFloor =
    dispatchTimeFloor instanceof Date &&
    !Number.isNaN(dispatchTimeFloor.getTime());

  const dispatchTimeCeilRaw = options?.dispatchTimeCeil;
  const dispatchTimeCeil = dispatchTimeCeilRaw
    ? new Date(dispatchTimeCeilRaw)
    : null;
  const hasDispatchCeil =
    dispatchTimeCeil instanceof Date &&
    !Number.isNaN(dispatchTimeCeil.getTime());

  // Fetch NGO organizations to map request.requesterNode (NGO ID) to Node
  const ngoOrgs = await NGO.find().lean();

  // Build lookup to map NGO org id -> NGO node id for ML feature engineering joins.
  // The ML feature engineering expects requests.requesterNode to match nodes._id.
  const ngoOrgNameById = new Map(
    (ngoOrgs || []).map((org) => [
      org?._id?.toString?.() ?? String(org._id),
      org?.name,
    ])
  );
  const ngoNodeIdByName = new Map(
    (ngos || []).map((node) => [
      node?.name,
      node?._id?.toString?.() ?? String(node._id),
    ])
  );

  debugAlloc(
    `[allocateRegular] Starting with ${requests.length} requests, ${ngoOrgs.length} NGO orgs, ${ngos.length} NGO nodes`
  );

  const estimateTravelHours = (distanceKm) => {
    const avgSpeedKmh = 40;
    const baseHours = (Number(distanceKm) || 0) / avgSpeedKmh;
    const breaks = Math.floor(baseHours / 4) * 0.5;
    return baseHours + breaks;
  };

  for (const request of requests) {
    let dispatchTime = request?.dispatchTime
      ? new Date(request.dispatchTime)
      : request?.createdOn
        ? new Date(request.createdOn)
        : new Date();
    if (
      hasDispatchFloor &&
      dispatchTime.getTime() < dispatchTimeFloor.getTime()
    ) {
      dispatchTime = dispatchTimeFloor;
    }
    if (
      hasDispatchCeil &&
      dispatchTime.getTime() > dispatchTimeCeil.getTime()
    ) {
      dispatchTime = dispatchTimeCeil;
    }

    // Find NGO organization
    const ngoOrg = ngoOrgs.find(
      (org) => org._id.toString() === request.requesterNode.toString()
    );
    if (!ngoOrg) {
      debugAlloc(
        `[allocateRegular] No NGO org found for request ${request.requestID}, requesterNode: ${request.requesterNode}`
      );
      continue;
    }

    // Find corresponding NGO node by name
    const ngoNode = ngos.find((n) => n.name === ngoOrg.name);
    if (!ngoNode) {
      debugAlloc(
        `[allocateRegular] No NGO node found for org name: ${ngoOrg.name}`
      );
      continue;
    }

    debugAlloc(
      `[allocateRegular] Processing request ${request.requestID} for NGO ${ngoNode.name}`
    );

    debugAlloc(
      `[allocateRegular]  NGO location: [${ngoNode.location.coordinates.join(", ")}], warehouses: ${warehouses.length}`
    );

    // Precompute warehouse distances once per request.
    const warehousesByDistance = (warehouses || [])
      .map((warehouse) => {
        const distance = haversineDistanceKm(
          {
            lat: ngoNode.location.coordinates[1],
            lon: ngoNode.location.coordinates[0],
          },
          {
            lat: warehouse.location.coordinates[1],
            lon: warehouse.location.coordinates[0],
          }
        );
        return { warehouse, distance };
      })
      .sort((a, b) => a.distance - b.distance);

    if (warehousesByDistance.length === 0) {
      debugAlloc(`[allocateRegular] No warehouses available for request`);
      continue;
    }

    // FIFO allocation for each item
    for (const item of request.items) {
      // Pick the nearest warehouse that has at least one eligible batch for this foodType.
      let sourceWarehouse = null;
      let sourceDistanceKm = Infinity;

      for (const { warehouse, distance } of warehousesByDistance) {
        const hasEligible = unusedBatches.some((b) => {
          if (b.foodType !== item.foodType) return false;
          if (b.status !== "stored") return false;
          if (b.currentNode.toString() !== warehouse._id.toString())
            return false;

          // Availability: manufacture_date is the real-world timestamp; createdAt is DB insertion time
          // (often much later for imported datasets), so only use createdAt if manufacture_date is missing.
          const availRaw = b.manufacture_date || b.createdAt || null;
          if (availRaw) {
            const availMs = new Date(availRaw).getTime();
            if (Number.isFinite(availMs) && availMs > dispatchTime.getTime()) {
              return false;
            }
          }

          const remainingHours = safeRemainingShelfLifeHours(b, dispatchTime);
          if (!(remainingHours > 0)) return false;
          const freshnessAtDispatch = calculateFreshnessPct(b, dispatchTime);
          return (
            Number.isFinite(freshnessAtDispatch) && freshnessAtDispatch > 0
          );
        });

        if (hasEligible) {
          sourceWarehouse = warehouse;
          sourceDistanceKm = distance;
          break;
        }
      }

      if (!sourceWarehouse) {
        debugAlloc(
          `[allocateRegular]   Item: ${item.foodType}, need ${item.required_kg}kg - no eligible batches in any warehouse`
        );
        continue;
      }

      debugAlloc(
        `[allocateRegular]   Item: ${item.foodType}, need ${item.required_kg}kg from warehouse ${sourceWarehouse.name} (${sourceDistanceKm.toFixed(2)} km)`
      );

      const availableBatches = unusedBatches
        .filter(
          (b) =>
            b.foodType === item.foodType &&
            b.currentNode.toString() === sourceWarehouse._id.toString() &&
            b.status === "stored" &&
            (() => {
              const availRaw = b.manufacture_date || b.createdAt || null;
              if (!availRaw) return true;
              const availMs = new Date(availRaw).getTime();
              return (
                !Number.isFinite(availMs) || availMs <= dispatchTime.getTime()
              );
            })()
        )
        .map((b) => ({
          batch: b,
          remainingHours: safeRemainingShelfLifeHours(b, dispatchTime),
          freshnessAtDispatch: calculateFreshnessPct(b, dispatchTime),
        }))
        // Baseline: only require not spoiled at dispatch; it may expire during transport.
        .filter(
          (x) =>
            x.remainingHours > 0 &&
            Number.isFinite(x.freshnessAtDispatch) &&
            x.freshnessAtDispatch > 0
        )
        // Baseline behavior: dispatch the most time-critical batches first (FEFO-ish).
        // This makes Regular more realistic (and typically more wasteful) vs. ML.
        .sort((a, b) => {
          const ra = Number(a.remainingHours);
          const rb = Number(b.remainingHours);
          if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) {
            return ra - rb;
          }

          const ta = a.batch.manufacture_date
            ? new Date(a.batch.manufacture_date).getTime()
            : a.batch.createdAt
              ? new Date(a.batch.createdAt).getTime()
              : 0;
          const tb = b.batch.manufacture_date
            ? new Date(b.batch.manufacture_date).getTime()
            : b.batch.createdAt
              ? new Date(b.batch.createdAt).getTime()
              : 0;

          return ta - tb;
        })
        .map((x) => x.batch);

      debugAlloc(
        `[allocateRegular]   Found ${availableBatches.length} matching batches`
      );

      let remaining = item.required_kg;
      const usedBatches = [];

      for (const batch of availableBatches) {
        if (remaining <= 0) break;

        const allocatedQty = Math.min(batch.quantity_kg, remaining);
        usedBatches.push({
          batchId: batch._id,
          quantity: allocatedQty,
          freshness: batch.freshnessPct || 100,
        });

        remaining -= allocatedQty;

        // Remove or reduce batch
        const idx = unusedBatches.findIndex(
          (b) => b._id.toString() === batch._id.toString()
        );
        if (allocatedQty >= batch.quantity_kg) {
          unusedBatches.splice(idx, 1);
        } else {
          unusedBatches[idx].quantity_kg -= allocatedQty;
        }
      }

      const allocatedKg = item.required_kg - remaining;
      if (allocatedKg > 0) {
        allocations.push({
          requestId: request.requestID,
          foodType: item.foodType,
          required_kg: item.required_kg,
          allocated_kg: allocatedKg,
          warehouse: sourceWarehouse._id,
          warehouseName: sourceWarehouse.name,
          distance_km: sourceDistanceKm,
          batches: usedBatches,
          strategy: "regular",
          dispatchTime: dispatchTime.toISOString(),
        });
      }
    }
  }

  return allocations;
}

/**
 * ML ALLOCATION (Predictive Optimization)
 * - Calls ML service for demand prediction
 * - Pre-positions inventory based on forecasted hotspots
 * - Optimizes for freshness (60%) + distance (40%)
 */
export async function allocateML(
  requests,
  batches,
  warehouses,
  ngos,
  options = {}
) {
  const allocations = [];
  let unusedBatches = [...batches];

  const simulationOnly = options?.simulationOnly === true;

  const transferPlannerDebug = {
    enabled: false,
    simulationOnly,
    cronHours: null,
    attemptedRuns: 0,
    runs: 0,
    skippedRuns: 0,
    errorRuns: 0,
    lastError: null,
    suggestedTransfers: 0,
    appliedTransfers: 0,
    lastApplied: [],
    lastSuggestedCount: 0,
    imbalance: null,
    timeline: [],
  };

  const referenceDateRaw = options?.referenceDate;
  const referenceDate = referenceDateRaw ? new Date(referenceDateRaw) : null;
  const hasReferenceDate =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime());

  const dispatchTimeFloorRaw = options?.dispatchTimeFloor;
  const dispatchTimeFloor = dispatchTimeFloorRaw
    ? new Date(dispatchTimeFloorRaw)
    : null;
  const hasDispatchFloor =
    dispatchTimeFloor instanceof Date &&
    !Number.isNaN(dispatchTimeFloor.getTime());

  const dispatchTimeCeilRaw = options?.dispatchTimeCeil;
  const dispatchTimeCeil = dispatchTimeCeilRaw
    ? new Date(dispatchTimeCeilRaw)
    : null;
  const hasDispatchCeil =
    dispatchTimeCeil instanceof Date &&
    !Number.isNaN(dispatchTimeCeil.getTime());

  const preferredMinDeliveredFreshnessPct = Number(
    process.env.ML_MIN_DELIVERED_FRESHNESS_PCT ?? 55
  );
  const relaxedMinDeliveredFreshnessPct = Number(
    process.env.ML_RELAXED_MIN_DELIVERED_FRESHNESS_PCT ?? 25
  );

  // Strongly prefer nearby allocations to keep routes realistic.
  // If nothing is feasible within the cap (e.g., no eligible batches nearby), we fall back to the best overall option.
  const maxPreferredDistanceKm = Number(process.env.ML_MAX_DISTANCE_KM ?? 250);
  const distanceDecayKm = Number(process.env.ML_DISTANCE_DECAY_KM ?? 70);

  // Hard limits to prevent pathological long-haul allocations.
  const hardMaxDistanceKm = Number(process.env.ML_HARD_MAX_DISTANCE_KM ?? 450);
  const topKWarehouses = Number(process.env.ML_TOP_K_WAREHOUSES ?? 12);

  // Fetch NGO organizations to map request.requesterNode (NGO ID) to Node
  const ngoOrgs = await NGO.find().lean();

  // Build lookup to map NGO org id -> NGO node id for ML feature engineering joins.
  // The ML feature engineering expects requests.requesterNode to match nodes._id.
  const ngoOrgNameById = new Map(
    (ngoOrgs || []).map((org) => [
      org?._id?.toString?.() ?? String(org._id),
      org?.name,
    ])
  );
  const ngoNodeIdByName = new Map(
    (ngos || []).map((node) => [
      node?.name,
      node?._id?.toString?.() ?? String(node._id),
    ])
  );

  // Optional ML context (anomaly/demand signals). Allocation still works without this.
  let regionalSignals = new Map();
  try {
    const payload = {
      freq: "M",
      nodes: (warehouses || []).concat(ngos || []).map((n) => ({
        _id: n._id?.toString?.() ?? String(n._id),
        nodeId: n._id?.toString?.() ?? String(n._id),
        type: n.type,
        district: n.district || null,
        state: n.state || n.regionId || "Unknown",
        location: n.location || null,
      })),
      requests: (requests || []).map((r) => ({
        requestId: r.requestID || r.requestId,
        // Convert NGO org id to NGO node id when possible so ML joins can recover state/district.
        requesterNode: (() => {
          const orgId =
            r.requesterNode?.toString?.() ?? String(r.requesterNode);
          const orgName = ngoOrgNameById.get(orgId);
          const nodeId = orgName ? ngoNodeIdByName.get(orgName) : null;
          return nodeId || orgId;
        })(),
        items: r.items,
        requiredBy_iso: r.requiredBefore || r.requiredBy_iso || null,
        status: r.status || "pending",
      })),
      shipments: [],
      batches: (batches || []).map((b) => ({
        _id: b._id?.toString?.() ?? String(b._id),
        batchId: b._id?.toString?.() ?? String(b._id),
        originNode: b.originNode?.toString?.() ?? String(b.originNode),
        currentNode: b.currentNode?.toString?.() ?? String(b.currentNode),
        manufacture_date: b.manufacture_date,
        expiry_iso: b.expiry_iso,
        quantity_kg:
          typeof b.quantity_kg === "number"
            ? b.quantity_kg
            : Number(b.quantity_kg) || 0,
        original_quantity_kg:
          typeof b.original_quantity_kg === "number"
            ? b.original_quantity_kg
            : Number(b.original_quantity_kg) || null,
        shelf_life_hours:
          typeof b.shelf_life_hours === "number"
            ? b.shelf_life_hours
            : Number(b.shelf_life_hours) || null,
        freshnessPct:
          typeof b.freshnessPct === "number"
            ? b.freshnessPct
            : Number(b.freshnessPct) || null,
        foodType: b.foodType,
      })),
    };

    const mlResp = await axios.post(`${ML_SERVICE_URL}/predict`, payload, {
      timeout: 8000,
      headers: { "Content-Type": "application/json" },
    });

    const results = mlResp?.data?.results;
    if (Array.isArray(results)) {
      regionalSignals = new Map(
        results
          .filter((r) => r && (r.state || r.district))
          .map((r) => [
            `${r.state || "Unknown"}-${r.district || "Unknown"}`,
            {
              anomalyScore:
                typeof r.anomaly_score === "number" ? r.anomaly_score : 0,
              isAnomaly: r.is_anomaly === 1,
            },
          ])
      );
    }
  } catch (_err) {
    // ML signals are optional; allocation proceeds without them.
  }

  // Optional: run transfer planner to rebalance warehouse inventory *before* allocation.
  // This is simulation-only: it mutates the in-memory batch snapshot and does not write to MongoDB.
  const enableTransferPlanner =
    options?.enableTransferPlanner === true ||
    String(process.env.ML_ENABLE_TRANSFER_PLANNER ?? "0") === "1";

  const plannerTuning = {
    maxPairs: Number(
      options?.transferPlannerMaxPairs ?? process.env.ML_TRANSFER_MAX_PAIRS ?? 5
    ),
    minTransferKg: Number(
      options?.transferPlannerMinTransferKg ??
        process.env.ML_TRANSFER_MIN_TRANSFER_KG ??
        200
    ),
    overstockRatio: Number(
      options?.transferPlannerOverstockRatio ??
        process.env.ML_TRANSFER_OVERSTOCK_RATIO ??
        0.8
    ),
    understockRatio: Number(
      options?.transferPlannerUnderstockRatio ??
        process.env.ML_TRANSFER_UNDERSTOCK_RATIO ??
        0.4
    ),
    targetRatio: Number(
      options?.transferPlannerTargetRatio ??
        process.env.ML_TRANSFER_TARGET_RATIO ??
        0.6
    ),
  };

  const shouldRunTransferPlanner = () => {
    const whList = Array.isArray(warehouses) ? warehouses : [];
    const whIdSet = new Set(
      whList.map((w) => w?._id?.toString?.() ?? String(w._id))
    );

    // Mirror python defaults: warehouses with missing/invalid capacity assume 10,000kg.
    const defaultWarehouseCapacityKg = 10000;
    const capacityById = new Map(
      whList.map((w) => {
        const id = w?._id?.toString?.() ?? String(w._id);
        const capRaw =
          typeof w?.capacity_kg === "number"
            ? w.capacity_kg
            : Number(w?.capacity_kg);
        const cap =
          Number.isFinite(capRaw) && capRaw > 0
            ? capRaw
            : defaultWarehouseCapacityKg;
        return [id, cap];
      })
    );

    const inventoryById = new Map();
    for (const b of unusedBatches || []) {
      if (!b || b.status !== "stored") continue;
      const nodeId = b.currentNode?.toString?.() ?? String(b.currentNode);
      if (!whIdSet.has(nodeId)) continue;
      const qty = Number(b.quantity_kg) || 0;
      if (qty <= 0) continue;
      inventoryById.set(nodeId, (inventoryById.get(nodeId) || 0) + qty);
    }

    let overCount = 0;
    let underCount = 0;
    let maxUtil = -Infinity;
    let minUtil = Infinity;
    const utils = [];

    for (const id of whIdSet) {
      const inv = inventoryById.get(id) || 0;
      const cap = capacityById.get(id) || defaultWarehouseCapacityKg;
      const util = cap > 0 ? inv / cap : 0;
      if (Number.isFinite(util)) {
        maxUtil = Math.max(maxUtil, util);
        minUtil = Math.min(minUtil, util);
        utils.push(util);
      }
      if (util >= plannerTuning.overstockRatio) overCount += 1;
      if (util <= plannerTuning.understockRatio) underCount += 1;
    }

    const percentile = (sorted, p) => {
      if (!Array.isArray(sorted) || sorted.length === 0) return null;
      const clamped = Math.min(1, Math.max(0, p));
      const idx = Math.floor(clamped * (sorted.length - 1));
      const v = sorted[idx];
      return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
    };

    utils.sort((a, b) => a - b);
    const utilP50 = percentile(utils, 0.5);
    const utilP90 = percentile(utils, 0.9);
    const utilP95 = percentile(utils, 0.95);

    transferPlannerDebug.imbalance = {
      overstockRatio: plannerTuning.overstockRatio,
      understockRatio: plannerTuning.understockRatio,
      targetRatio: plannerTuning.targetRatio,
      minTransferKg: plannerTuning.minTransferKg,
      warehouses: whIdSet.size,
      overCount,
      underCount,
      maxUtil: Number.isFinite(maxUtil)
        ? Math.round(maxUtil * 1000) / 1000
        : null,
      minUtil: Number.isFinite(minUtil)
        ? Math.round(minUtil * 1000) / 1000
        : null,
      utilP50,
      utilP90,
      utilP95,
    };

    // Need at least one overstock and one understock for meaningful balancing.
    if (overCount === 0 || underCount === 0) return false;
    if (!(plannerTuning.minTransferKg > 0)) return true;
    return true;
  };

  const runTransferPlannerOnce = async ({ reason, now } = {}) => {
    try {
      const startedAtMs = Date.now();
      transferPlannerDebug.attemptedRuns += 1;
      const plannerMode = String(
        options?.transferPlannerMode ??
          process.env.ML_TRANSFER_PLANNER_MODE ??
          "warehouse_to_warehouse"
      ).toLowerCase();

      const requestPayload = buildTransferPlannerRequest({
        warehouses,
        batches: unusedBatches,
      });

      const plannerReq = {
        mode: plannerMode,
        includeRoutes: false,
        maxPairs: plannerTuning.maxPairs,
        minTransferKg: plannerTuning.minTransferKg,
        overstockRatio: plannerTuning.overstockRatio,
        understockRatio: plannerTuning.understockRatio,
        targetRatio: plannerTuning.targetRatio,
        ...requestPayload,
      };

      const plannerResp = await axios.post(
        `${ML_SERVICE_URL}/transfers/plan`,
        plannerReq,
        {
          timeout: 8000,
          headers: { "Content-Type": "application/json" },
        }
      );

      const transfers = plannerResp?.data?.warehouse_to_warehouse;
      const suggestedCount = Array.isArray(transfers) ? transfers.length : 0;
      transferPlannerDebug.suggestedTransfers += suggestedCount;
      transferPlannerDebug.lastSuggestedCount = suggestedCount;
      const applied = applyWarehouseTransfersToBatches({
        batches: unusedBatches,
        transfers,
        currentDate:
          now instanceof Date && !Number.isNaN(now.getTime())
            ? now
            : hasReferenceDate
              ? referenceDate
              : new Date(),
      });
      unusedBatches = applied.batches;

      transferPlannerDebug.runs += 1;
      transferPlannerDebug.appliedTransfers += applied.appliedTransfers.length;
      transferPlannerDebug.lastApplied = applied.appliedTransfers;

      const whenIso =
        now instanceof Date && !Number.isNaN(now.getTime())
          ? now.toISOString()
          : null;

      transferPlannerDebug.timeline.push({
        at: whenIso,
        reason: reason || null,
        skipped: false,
        attempted: true,
        suggestedCount,
        appliedCount: applied.appliedTransfers.length,
        appliedKg:
          Math.round(
            (applied.appliedTransfers || []).reduce(
              (sum, t) => sum + (Number(t?.applied_quantity_kg) || 0),
              0
            ) * 100
          ) / 100,
        elapsedMs: Math.max(0, Date.now() - startedAtMs),
      });

      debugAlloc(
        `[allocateML] Transfer planner applied ${applied.appliedTransfers.length} transfers` +
          (reason ? ` (${reason})` : "") +
          (whenIso ? ` at ${whenIso}` : "")
      );

      return applied.appliedTransfers;
    } catch (_err) {
      // Transfer planner is optional; allocation proceeds without it.
      transferPlannerDebug.errorRuns += 1;
      transferPlannerDebug.lastError = {
        message:
          _err?.response?.data?.error ||
          _err?.response?.data?.message ||
          _err?.message ||
          "transfer planner error",
        status:
          typeof _err?.response?.status === "number"
            ? _err.response.status
            : null,
      };

      const whenIso =
        now instanceof Date && !Number.isNaN(now.getTime())
          ? now.toISOString()
          : null;
      transferPlannerDebug.timeline.push({
        at: whenIso,
        reason: reason || null,
        skipped: false,
        attempted: true,
        suggestedCount: 0,
        appliedCount: 0,
        appliedKg: 0,
        error: transferPlannerDebug.lastError,
      });

      return [];
    }
  };

  // Cron-like transfer planning: re-run the planner periodically as simulated time advances.
  // This never writes to MongoDB; it only mutates `unusedBatches` in memory.
  const transferPlannerCronHours = (() => {
    const raw =
      options?.transferPlannerCronHours ??
      process.env.ML_TRANSFER_CRON_HOURS ??
      null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  transferPlannerDebug.cronHours = transferPlannerCronHours;

  const canUseTransferPlanner =
    enableTransferPlanner && (!options?.simulationOnly || simulationOnly);
  transferPlannerDebug.enabled = canUseTransferPlanner;
  const useTransferPlannerCron =
    canUseTransferPlanner && transferPlannerCronHours !== null;

  // One-time planning (existing behavior) if cron is not enabled.
  if (canUseTransferPlanner && !useTransferPlannerCron) {
    if (shouldRunTransferPlanner()) {
      await runTransferPlannerOnce({ reason: "one-shot" });
    } else {
      transferPlannerDebug.skippedRuns += 1;
      transferPlannerDebug.timeline.push({
        at: hasReferenceDate ? referenceDate.toISOString() : null,
        reason: "one-shot",
        skipped: true,
        attempted: false,
        imbalance: transferPlannerDebug.imbalance,
      });
      debugAlloc(
        `[allocateML] Transfer planner skipped (no imbalance; one-shot)`
      );
    }
  }

  const estimateTravelHours = (distanceKm) => {
    const avgSpeedKmh = 40;
    const baseHours = distanceKm / avgSpeedKmh;
    const breaks = Math.floor(baseHours / 4) * 0.5;
    return baseHours + breaks;
  };

  // Allocate each request to nearest warehouse with best freshness
  const maxCronRuns = Number(process.env.ML_TRANSFER_CRON_MAX_RUNS ?? 250);
  let cronRuns = 0;
  let nextCronRunAt = null;

  // For cron-style planning, process requests in simulated-time order.
  const requestsToProcess = useTransferPlannerCron
    ? [...(requests || [])].sort((a, b) => {
        const ta = a?.dispatchTime
          ? new Date(a.dispatchTime).getTime()
          : a?.createdOn
            ? new Date(a.createdOn).getTime()
            : 0;
        const tb = b?.dispatchTime
          ? new Date(b.dispatchTime).getTime()
          : b?.createdOn
            ? new Date(b.createdOn).getTime()
            : 0;
        return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
      })
    : requests;

  for (const request of requestsToProcess) {
    // Find NGO organization
    const ngoOrg = ngoOrgs.find(
      (org) => org._id.toString() === request.requesterNode.toString()
    );
    if (!ngoOrg) continue;

    // Node schema has no org reference; match by name (seed scripts align these)
    const ngoNode = ngos.find((n) => n.name === ngoOrg.name);
    if (!ngoNode) continue;

    // IMPORTANT:
    // Simulations and metrics treat dispatch as-of the snapshot reference date.
    // If we plan using historical request.createdOn timestamps, ML can select batches
    // that are "fresh enough" then, but are spoiled by the snapshot dispatch time.
    let dispatchTime = request?.dispatchTime
      ? new Date(request.dispatchTime)
      : request.createdOn
        ? new Date(request.createdOn)
        : new Date();
    // Back-compat: if a fixed referenceDate is provided and no clamping window is set,
    // treat dispatch as-of the snapshot time.
    if (hasReferenceDate && !hasDispatchFloor && !hasDispatchCeil) {
      dispatchTime = referenceDate;
    }
    if (
      hasDispatchFloor &&
      dispatchTime.getTime() < dispatchTimeFloor.getTime()
    ) {
      dispatchTime = dispatchTimeFloor;
    }
    if (
      hasDispatchCeil &&
      dispatchTime.getTime() > dispatchTimeCeil.getTime()
    ) {
      dispatchTime = dispatchTimeCeil;
    }

    if (useTransferPlannerCron) {
      // Initialize the cron schedule anchor.
      if (!nextCronRunAt) {
        const anchor = hasReferenceDate
          ? referenceDate
          : hasDispatchFloor
            ? dispatchTimeFloor
            : dispatchTime;
        nextCronRunAt = new Date(anchor.getTime());

        // Run once immediately at the anchor time so the first bucket is balanced.
        if (cronRuns < maxCronRuns) {
          cronRuns += 1;
          if (shouldRunTransferPlanner()) {
            await runTransferPlannerOnce({
              reason: `cron init (${transferPlannerCronHours}h)`,
              now: nextCronRunAt,
            });
          } else {
            transferPlannerDebug.skippedRuns += 1;
            transferPlannerDebug.timeline.push({
              at: nextCronRunAt.toISOString(),
              reason: `cron init (${transferPlannerCronHours}h)`,
              skipped: true,
              attempted: false,
              imbalance: transferPlannerDebug.imbalance,
            });
          }
        }
      }

      const intervalMs = transferPlannerCronHours * 3600 * 1000;
      while (
        cronRuns < maxCronRuns &&
        nextCronRunAt &&
        dispatchTime.getTime() >= nextCronRunAt.getTime() + intervalMs
      ) {
        nextCronRunAt = new Date(nextCronRunAt.getTime() + intervalMs);
        cronRuns += 1;
        if (shouldRunTransferPlanner()) {
          await runTransferPlannerOnce({
            reason: `cron tick (${transferPlannerCronHours}h)`,
            now: nextCronRunAt,
          });
        } else {
          transferPlannerDebug.skippedRuns += 1;
          transferPlannerDebug.timeline.push({
            at: nextCronRunAt.toISOString(),
            reason: `cron tick (${transferPlannerCronHours}h)`,
            skipped: true,
            attempted: false,
            imbalance: transferPlannerDebug.imbalance,
          });
        }
      }
    }

    const regionKey = `${ngoNode.state || ngoNode.regionId || "Unknown"}-${ngoNode.district || "Unknown"}`;
    const signal = regionalSignals.get(regionKey);
    const urgencyBoost = signal?.isAnomaly ? 1.1 : 1.0;

    for (const item of request.items) {
      let bestScoreOverall = -Infinity;
      let bestWarehouseOverall = null;
      let bestBatchesOverall = [];
      let bestFulfillmentOverall = 0;

      let bestScoreInCap = -Infinity;
      let bestWarehouseInCap = null;
      let bestBatchesInCap = [];
      let bestFulfillmentInCap = 0;

      // Evaluate nearby warehouses (top-K by distance) first.
      // If that yields nothing feasible (e.g., stock exists but outside top-K), expand to all within the hard cap.
      const allWarehouseCandidates = (warehouses || [])
        .map((warehouse) => {
          const distance = haversineDistanceKm(
            {
              lat: ngoNode.location.coordinates[1],
              lon: ngoNode.location.coordinates[0],
            },
            {
              lat: warehouse.location.coordinates[1],
              lon: warehouse.location.coordinates[0],
            }
          );
          return { warehouse, distance };
        })
        .filter(
          (x) =>
            x.warehouse &&
            Number.isFinite(x.distance) &&
            x.distance >= 0 &&
            x.distance <= hardMaxDistanceKm
        )
        .sort((a, b) => a.distance - b.distance);

      const primaryCandidates = allWarehouseCandidates.slice(
        0,
        Math.max(1, topKWarehouses)
      );

      const evaluateCandidates = (warehouseCandidates) => {
        for (const { warehouse, distance } of warehouseCandidates) {
          const travelHours = estimateTravelHours(distance);
          const minRemainingHoursRequired = travelHours + 2; // buffer for delays

          const deliveryTime = new Date(
            dispatchTime.getTime() + travelHours * 3600 * 1000
          );

          // Get batches for this food type at this warehouse
          const candidateBatches = unusedBatches
            .filter(
              (b) =>
                b.foodType === item.foodType &&
                b.currentNode &&
                b.currentNode.toString() === warehouse._id.toString() &&
                b.status === "stored" &&
                (() => {
                  const availRaw = b.manufacture_date || b.createdAt || null;
                  if (!availRaw) return true;
                  const availMs = new Date(availRaw).getTime();
                  return (
                    !Number.isFinite(availMs) ||
                    availMs <= dispatchTime.getTime()
                  );
                })()
            )
            .map((b) => ({
              batch: b,
              remainingHours: safeRemainingShelfLifeHours(b, dispatchTime),
              freshnessAtDelivery: calculateFreshnessPct(b, deliveryTime),
            }))
            // Must exist and not be expired at dispatch; avoid intentionally spoiled-at-arrival.
            .filter(
              (x) =>
                x.remainingHours > 0 &&
                Number.isFinite(x.freshnessAtDelivery) &&
                x.freshnessAtDelivery > 0
            );

          const strictEligible = candidateBatches
            .filter(
              (x) => x.freshnessAtDelivery >= preferredMinDeliveredFreshnessPct
            )
            // Prefer higher freshness at delivery; use FEFO only as a tie-breaker.
            .sort(
              (a, b) =>
                b.freshnessAtDelivery - a.freshnessAtDelivery ||
                a.remainingHours - b.remainingHours
            );

          const relaxedEligible = candidateBatches
            .filter(
              (x) => x.freshnessAtDelivery >= relaxedMinDeliveredFreshnessPct
            )
            .sort(
              (a, b) =>
                b.freshnessAtDelivery - a.freshnessAtDelivery ||
                a.remainingHours - b.remainingHours
            );

          const fallbackEligible = candidateBatches
            // Never intentionally ship already-spoiled-at-arrival food.
            .filter((x) => x.freshnessAtDelivery > 0)
            .sort(
              (a, b) =>
                b.freshnessAtDelivery - a.freshnessAtDelivery ||
                a.remainingHours - b.remainingHours
            );

          let usingRelaxed = false;
          let usingFallback = false;
          let availableBatches = strictEligible;
          if (availableBatches.length === 0 && relaxedEligible.length > 0) {
            usingRelaxed = true;
            availableBatches = relaxedEligible;
          }
          if (availableBatches.length === 0 && fallbackEligible.length > 0) {
            usingRelaxed = true;
            usingFallback = true;
            availableBatches = fallbackEligible;
          }

          if (availableBatches.length === 0) continue;

          const totalAvailable = availableBatches.reduce(
            (sum, x) => sum + (x.batch.quantity_kg || 0),
            0
          );

          // Calculate weighted freshness
          let cumulativeQty = 0;
          let weightedDeliveredFreshness = 0;
          let weightedExpiryPressure = 0;
          for (const {
            batch,
            remainingHours,
            freshnessAtDelivery,
          } of availableBatches) {
            const usableQty = Math.min(
              batch.quantity_kg,
              item.required_kg - cumulativeQty
            );

            weightedDeliveredFreshness +=
              freshnessAtDelivery * (usableQty / item.required_kg);

            // Higher when remaining time is low (but safe), promoting waste avoidance.
            const expiryPressure = 1 / (1 + remainingHours / 24);
            weightedExpiryPressure +=
              expiryPressure * (usableQty / item.required_kg);

            cumulativeQty += usableQty;
            if (cumulativeQty >= item.required_kg) break;
          }

          const fulfillmentRatio = Math.min(
            1,
            totalAvailable / item.required_kg
          );

          // Exponential distance penalty (very strong) to keep travel realistic.
          // Smaller decay => harsher penalty for long routes.
          const distanceScore = Math.exp(-distance / distanceDecayKm);

          // Composite: distance + delivered freshness + waste-avoidance + fulfillment.
          // Prioritize delivered freshness and fulfillment; keep distance realistic via exponential penalty.
          let score =
            (distanceScore * 0.1 +
              (weightedDeliveredFreshness / 100) * 0.45 +
              weightedExpiryPressure * 0.05 +
              fulfillmentRatio * 0.4) *
            urgencyBoost;

          // If we had to relax freshness constraints, discourage this choice unless it materially helps.
          if (usingFallback) score *= 0.95;
          else if (usingRelaxed) score *= 0.98;

          if (score > bestScoreOverall) {
            bestScoreOverall = score;
            bestWarehouseOverall = warehouse;
            bestBatchesOverall = availableBatches;
            bestFulfillmentOverall = fulfillmentRatio;
          }

          if (distance <= maxPreferredDistanceKm && score > bestScoreInCap) {
            bestScoreInCap = score;
            bestWarehouseInCap = warehouse;
            bestBatchesInCap = availableBatches;
            bestFulfillmentInCap = fulfillmentRatio;
          }
        }
      };

      evaluateCandidates(primaryCandidates);
      // If top-K didn't find a good/full plan, widen the search.
      if (
        allWarehouseCandidates.length > primaryCandidates.length &&
        (!bestWarehouseOverall || bestFulfillmentOverall < 0.95)
      ) {
        evaluateCandidates(allWarehouseCandidates);
      }

      // Prefer in-cap only when it can fulfill a meaningful share; otherwise allow a farther warehouse.
      const minInCapFulfillment = Number(
        process.env.ML_MIN_INCAP_FULFILLMENT_RATIO ?? 0.6
      );
      const useInCap =
        bestWarehouseInCap &&
        Number.isFinite(bestFulfillmentInCap) &&
        bestFulfillmentInCap >= minInCapFulfillment;

      const bestWarehouse = useInCap
        ? bestWarehouseInCap
        : bestWarehouseOverall;
      const bestBatches = useInCap ? bestBatchesInCap : bestBatchesOverall;

      if (!bestWarehouse) continue;

      // Allocate from best warehouse
      let remaining = item.required_kg;
      const usedBatches = [];

      for (const { batch } of bestBatches) {
        if (remaining <= 0) break;

        const allocatedQty = Math.min(batch.quantity_kg, remaining);
        usedBatches.push({
          batchId: batch._id,
          quantity: allocatedQty,
          freshness: calculateFreshnessPct(batch, dispatchTime),
        });

        remaining -= allocatedQty;

        const idx = unusedBatches.findIndex(
          (b) => b._id.toString() === batch._id.toString()
        );
        if (allocatedQty >= batch.quantity_kg) {
          unusedBatches.splice(idx, 1);
        } else {
          unusedBatches[idx].quantity_kg -= allocatedQty;
        }
      }

      const distance = haversineDistanceKm(
        {
          lat: ngoNode.location.coordinates[1],
          lon: ngoNode.location.coordinates[0],
        },
        {
          lat: bestWarehouse.location.coordinates[1],
          lon: bestWarehouse.location.coordinates[0],
        }
      );

      allocations.push({
        requestId: request.requestID,
        foodType: item.foodType,
        required_kg: item.required_kg,
        allocated_kg: item.required_kg - remaining,
        warehouse: bestWarehouse._id,
        warehouseName: bestWarehouse.name,
        distance_km: distance,
        batches: usedBatches,
        strategy: "ml",
        dispatchTime: dispatchTime.toISOString(),
      });
    }
  }

  if (options && typeof options === "object") {
    options._transferPlannerDebug = transferPlannerDebug;
  }

  return allocations;
}
