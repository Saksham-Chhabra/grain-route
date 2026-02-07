/**
 * Explain snapshot allocations (Regular vs ML) with concrete examples.
 *
 * Usage:
 *   cd Server
 *   node scripts/explain-snapshot.js --date 2026-02-03 --examples 5 --out reports/snapshot-explain-2026-02-03.md
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { Node } from "../src/models/node.model.js";
import { Batch } from "../src/models/batch.model.js";
import { Request } from "../src/models/request.model.js";
import { NGO } from "../src/models/NGO.model.js";
import { Shipment } from "../src/models/shipment.model.js";

import {
  allocateRegular,
  allocateML,
} from "../src/services/simulationService.js";
import { haversineDistanceKm } from "../src/utils/geoHelpers.js";
import {
  calculateFreshnessPct,
  remainingShelfLifeHours,
} from "../src/utils/freshness.js";

function parseArgs(argv) {
  const args = {
    date: null,
    examples: 5,
    out: null,
    requestLimit: 400,
    batchLimit: 1500,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--date" && next) {
      args.date = next;
      i += 1;
      continue;
    }
    if (token === "--examples" && next) {
      args.examples = Math.max(1, Number(next) || 5);
      i += 1;
      continue;
    }
    if (token === "--out" && next) {
      args.out = next;
      i += 1;
      continue;
    }
    if (token === "--requestLimit" && next) {
      args.requestLimit = Math.max(0, Number(next) || 0);
      i += 1;
      continue;
    }
    if (token === "--batchLimit" && next) {
      args.batchLimit = Math.max(0, Number(next) || 0);
      i += 1;
      continue;
    }
  }

  return args;
}

function fmt(n, digits = 2) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(digits);
}

function fmtInt(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return String(Math.round(num));
}

function estimateTravelHours(distanceKm, avgSpeedKmh = 40) {
  const baseHours = distanceKm / avgSpeedKmh;
  const breaks = Math.floor(baseHours / 4) * 0.5;
  return baseHours + breaks;
}

function safeRemainingShelfLifeHoursLocal(batch, currentDate) {
  const life = Number(batch?.shelf_life_hours);
  const hasLife = Number.isFinite(life) && life > 0;
  const manufacture = batch?.manufacture_date
    ? new Date(batch.manufacture_date)
    : null;
  const hasManufacture =
    manufacture instanceof Date && !Number.isNaN(manufacture.getTime());
  if (!hasLife || !hasManufacture) return Number.POSITIVE_INFINITY;
  const hours = remainingShelfLifeHours(batch, currentDate);
  return Number.isFinite(hours) ? hours : Number.POSITIVE_INFINITY;
}

function mdEscape(text) {
  return String(text ?? "").replaceAll("|", "\\|");
}

function pickExamples({
  regularAllocations,
  mlAllocations,
  batchesById,
  referenceDate,
  maxExamples,
}) {
  const keyOf = (a) => `${a.requestId}::${a.foodType}`;

  const regByKey = new Map();
  for (const a of regularAllocations) regByKey.set(keyOf(a), a);
  const mlByKey = new Map();
  for (const a of mlAllocations) mlByKey.set(keyOf(a), a);

  const candidates = [];

  // Category A: regular allocated 0, ML allocated > 0.
  for (const [key, aReg] of regByKey.entries()) {
    const aMl = mlByKey.get(key);
    if (!aMl) continue;
    if (
      (Number(aReg.allocated_kg) || 0) <= 0 &&
      (Number(aMl.allocated_kg) || 0) > 0
    ) {
      candidates.push({ reason: "Regular=0, ML>0", regular: aReg, ml: aMl });
      if (candidates.length >= maxExamples) break;
    }
  }

  // Category B: both allocated > 0 but different warehouses.
  for (const [key, aMl] of mlByKey.entries()) {
    const aReg = regByKey.get(key);
    if (!aReg) continue;
    if (
      (Number(aReg.allocated_kg) || 0) <= 0 ||
      (Number(aMl.allocated_kg) || 0) <= 0
    )
      continue;
    const regWh = String(aReg.warehouse);
    const mlWh = String(aMl.warehouse);
    if (regWh !== mlWh) {
      candidates.push({
        reason: "Different warehouse",
        regular: aReg,
        ml: aMl,
      });
      if (candidates.length >= maxExamples) break;
    }
  }

  // Category C: regular contains at least one batch spoiled-at-delivery.
  for (const aReg of regularAllocations) {
    if (!Array.isArray(aReg.batches) || aReg.batches.length === 0) continue;
    if ((Number(aReg.allocated_kg) || 0) <= 0) continue;

    const dispatchTime = aReg?.dispatchTime
      ? new Date(aReg.dispatchTime)
      : referenceDate;
    const travelHours = estimateTravelHours(Number(aReg.distance_km) || 0);
    const deliveryTime = new Date(
      dispatchTime.getTime() + travelHours * 3600 * 1000
    );

    let spoiledQty = 0;
    for (const used of aReg.batches) {
      const qty = Number(used.quantity) || 0;
      if (qty <= 0) continue;
      const batch = batchesById.get(String(used.batchId));
      if (!batch) continue;
      const fDel = calculateFreshnessPct(batch, deliveryTime, 25);
      if (fDel <= 0) spoiledQty += qty;
    }

    if (spoiledQty > 0) {
      const key = keyOf(aReg);
      const aMl = mlByKey.get(key);
      if (!aMl) continue;
      candidates.push({
        reason: `Regular spoiled-at-delivery (${fmtInt(spoiledQty)} kg)`,
        regular: aReg,
        ml: aMl,
      });
      if (candidates.length >= maxExamples) break;
    }
  }

  // Deduplicate by key, keep first occurrence.
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const k = keyOf(c.regular);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(c);
    if (unique.length >= maxExamples) break;
  }

  return unique;
}

function buildWarehouseRanking({
  ngoNode,
  warehouses,
  topK = 8,
  hardMaxDistanceKm = 450,
}) {
  const scored = (warehouses || [])
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

  return {
    all: scored,
    top: scored.slice(0, Math.max(1, topK)),
  };
}

function analyzeWarehouseOption({
  warehouse,
  distanceKm,
  foodType,
  unusedBatches,
  dispatchTime,
  preferredMinDeliveredFreshnessPct,
  relaxedMinDeliveredFreshnessPct,
}) {
  const travelHours = estimateTravelHours(distanceKm);
  const deliveryTime = new Date(
    dispatchTime.getTime() + travelHours * 3600 * 1000
  );
  const minRemainingHoursRequired = travelHours + 2;

  const candidateBatches = (unusedBatches || [])
    .filter(
      (b) =>
        b.foodType === foodType &&
        b.currentNode &&
        String(b.currentNode) === String(warehouse._id) &&
        b.status === "stored"
    )
    .map((b) => {
      const remainingHours = safeRemainingShelfLifeHoursLocal(b, dispatchTime);
      const freshnessAtDelivery = calculateFreshnessPct(b, deliveryTime, 25);
      return { batch: b, remainingHours, freshnessAtDelivery };
    })
    .filter((x) => x.remainingHours > minRemainingHoursRequired);

  const strictEligible = candidateBatches.filter(
    (x) => x.freshnessAtDelivery >= preferredMinDeliveredFreshnessPct
  );
  const relaxedEligible = candidateBatches.filter(
    (x) => x.freshnessAtDelivery >= relaxedMinDeliveredFreshnessPct
  );

  const bestStrict =
    strictEligible.sort(
      (a, b) => b.freshnessAtDelivery - a.freshnessAtDelivery
    )[0] || null;
  const bestRelaxed =
    relaxedEligible.sort(
      (a, b) => b.freshnessAtDelivery - a.freshnessAtDelivery
    )[0] || null;

  return {
    distanceKm,
    travelHours,
    deliveryTime,
    strictEligibleCount: strictEligible.length,
    relaxedEligibleCount: relaxedEligible.length,
    bestStrictFreshnessAtDelivery: bestStrict
      ? bestStrict.freshnessAtDelivery
      : null,
    bestRelaxedFreshnessAtDelivery: bestRelaxed
      ? bestRelaxed.freshnessAtDelivery
      : null,
  };
}

async function main() {
  dotenv.config();

  const args = parseArgs(process.argv);

  const MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://localhost:27017/threeservice";
  const outPath = args.out;

  const targetDate = (() => {
    if (!args.date) return null;
    const d = new Date(args.date);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(23, 59, 59, 999);
    return d;
  })();

  await mongoose.connect(MONGODB_URI);

  let effectiveDate = targetDate;
  if (!effectiveDate) {
    const latest = await Request.find({})
      .sort({ createdOn: -1 })
      .limit(1)
      .lean();
    const latestDate = latest?.[0]?.createdOn
      ? new Date(latest[0].createdOn)
      : new Date();
    latestDate.setHours(23, 59, 59, 999);
    effectiveDate = latestDate;
  }

  const requestQuery = Request.find({
    createdOn: { $lte: effectiveDate },
    status: "pending",
  })
    .sort({ createdOn: -1 })
    .lean();
  const batchQuery = Batch.find({
    manufacture_date: { $lte: effectiveDate },
    status: "stored",
  })
    .sort({ manufacture_date: -1 })
    .lean();

  const [requests, batches, warehouses, ngoNodes, ngoOrgs] = await Promise.all([
    args.requestLimit > 0
      ? requestQuery.limit(args.requestLimit)
      : requestQuery,
    args.batchLimit > 0 ? batchQuery.limit(args.batchLimit) : batchQuery,
    Node.find({ type: "warehouse" }).lean(),
    Node.find({ type: "ngo" }).lean(),
    NGO.find().lean(),
  ]);

  const batchesById = new Map((batches || []).map((b) => [String(b._id), b]));

  const regularAllocations = await allocateRegular(
    requests,
    batches,
    warehouses,
    ngoNodes
  );
  const mlAllocations = await allocateML(
    requests,
    batches,
    warehouses,
    ngoNodes,
    { referenceDate: effectiveDate }
  );

  // Ensure both strategies are evaluated as-of the snapshot time.
  const dispatchIso = effectiveDate.toISOString();
  for (const alloc of regularAllocations) {
    if (alloc && typeof alloc === "object") alloc.dispatchTime = dispatchIso;
  }
  for (const alloc of mlAllocations) {
    if (alloc && typeof alloc === "object" && !alloc.dispatchTime)
      alloc.dispatchTime = dispatchIso;
  }

  const keyOf = (a) => `${a.requestId}::${a.foodType}`;
  const mlByKey = new Map();
  for (const a of mlAllocations) mlByKey.set(keyOf(a), a);

  const examples = pickExamples({
    regularAllocations,
    mlAllocations,
    batchesById,
    referenceDate: effectiveDate,
    maxExamples: args.examples,
  });

  const preferredMinDeliveredFreshnessPct = Number(
    process.env.ML_MIN_DELIVERED_FRESHNESS_PCT ?? 55
  );
  const relaxedMinDeliveredFreshnessPct = Number(
    process.env.ML_RELAXED_MIN_DELIVERED_FRESHNESS_PCT ?? 25
  );
  const maxPreferredDistanceKm = Number(process.env.ML_MAX_DISTANCE_KM ?? 250);
  const distanceDecayKm = Number(process.env.ML_DISTANCE_DECAY_KM ?? 35);
  const hardMaxDistanceKm = Number(process.env.ML_HARD_MAX_DISTANCE_KM ?? 450);
  const topKWarehouses = Number(process.env.ML_TOP_K_WAREHOUSES ?? 8);

  const lines = [];
  lines.push(`# Snapshot Allocation Walkthrough (Regular vs ML)`);
  lines.push("");
  lines.push(`- Snapshot date: **${effectiveDate.toISOString()}**`);
  lines.push(`- Mongo: **${mdEscape(MONGODB_URI)}**`);
  lines.push(`- Requests (pending in snapshot): **${requests.length}**`);
  lines.push(`- Stored batches in snapshot: **${batches.length}**`);
  lines.push(
    `- Warehouses: **${warehouses.length}**, NGO nodes: **${ngoNodes.length}**, NGO orgs: **${ngoOrgs.length}**`
  );
  lines.push("");
  lines.push(`## Core formulas used`);
  lines.push("");
  lines.push(`### Transport time (simulation)`);
  lines.push(`- avgSpeedKmh = 40`);
  lines.push(`- baseHours = distanceKm / avgSpeedKmh`);
  lines.push(`- breaks = floor(baseHours / 4) * 0.5`);
  lines.push(`- travelHours = baseHours + breaks`);
  lines.push("");
  lines.push(`### Freshness at time *t* (spoilage proxy)`);
  lines.push(`In [Server/src/utils/freshness.js](../src/utils/freshness.js):`);
  lines.push("");
  lines.push(
    `$freshnessPct = max(0, 100 - (elapsedHours / shelfLifeHours) * 100 * tempFactor)$`
  );
  lines.push(
    `$tempFactor = 1 + max(0, (avgTempC - 20)/10) * 0.5$  (default avgTempC=25)`
  );
  lines.push("");
  lines.push(`### Spoiled / at-risk at delivery (metrics)`);
  lines.push(`- spoiled @ delivery: freshnessAtDelivery <= 0`);
  lines.push(`- at risk @ delivery: 0 < freshnessAtDelivery < 20`);
  lines.push("");

  lines.push(`## ML allocator knobs (env)`);
  lines.push("");
  lines.push(
    `- ML_MIN_DELIVERED_FRESHNESS_PCT = ${fmt(preferredMinDeliveredFreshnessPct, 0)}%`
  );
  lines.push(
    `- ML_RELAXED_MIN_DELIVERED_FRESHNESS_PCT = ${fmt(relaxedMinDeliveredFreshnessPct, 0)}%`
  );
  lines.push(`- ML_TOP_K_WAREHOUSES = ${fmtInt(topKWarehouses)} (by distance)`);
  lines.push(`- ML_HARD_MAX_DISTANCE_KM = ${fmtInt(hardMaxDistanceKm)} km`);
  lines.push(
    `- ML_MAX_DISTANCE_KM (preferred cap) = ${fmtInt(maxPreferredDistanceKm)} km`
  );
  lines.push(
    `- ML_DISTANCE_DECAY_KM = ${fmtInt(distanceDecayKm)} km (distanceScore = exp(-distance/decay))`
  );
  lines.push("");

  const requestById = new Map(
    (requests || []).map((r) => [
      String(r.requestID || r.requestId || r._id),
      r,
    ])
  );
  const ngoOrgById = new Map((ngoOrgs || []).map((o) => [String(o._id), o]));
  const ngoNodeByName = new Map(
    (ngoNodes || []).map((n) => [String(n.name), n])
  );

  let exampleIndex = 0;
  for (const ex of examples) {
    exampleIndex += 1;
    const aReg = ex.regular;
    const aMl = ex.ml;

    const request =
      requestById.get(String(aReg.requestId)) ||
      requestById.get(String(aMl.requestId)) ||
      null;

    const org = request ? ngoOrgById.get(String(request.requesterNode)) : null;
    const ngoNode = org ? ngoNodeByName.get(String(org.name)) : null;

    lines.push(
      `## Example ${exampleIndex}: ${mdEscape(aReg.requestId)} / ${mdEscape(aReg.foodType)}  (${mdEscape(ex.reason)})`
    );
    lines.push("");

    if (request) {
      lines.push(
        `- request.createdOn: ${request.createdOn ? new Date(request.createdOn).toISOString() : "—"}`
      );
      lines.push(
        `- request.requiredBefore: ${request.requiredBefore ? new Date(request.requiredBefore).toISOString() : request.requiredBy_iso || "—"}`
      );
    }
    if (org) {
      lines.push(
        `- NGO org: ${mdEscape(org.name)} (${mdEscape(String(org._id))})`
      );
    }
    if (ngoNode) {
      lines.push(
        `- NGO node: ${mdEscape(ngoNode.name)} | ${mdEscape(ngoNode.state || ngoNode.regionId || "Unknown")} / ${mdEscape(ngoNode.district || "Unknown")}`
      );
      lines.push(
        `- NGO coords: [${fmt(ngoNode.location?.coordinates?.[1], 5)}, ${fmt(ngoNode.location?.coordinates?.[0], 5)}]`
      );
    }
    lines.push("");

    const renderStrategy = async (label, alloc) => {
      const dispatchTime = alloc?.dispatchTime
        ? new Date(alloc.dispatchTime)
        : effectiveDate;
      const distanceKm = Number(alloc.distance_km) || 0;
      const travelHours = estimateTravelHours(distanceKm);
      const deliveryTime = new Date(
        dispatchTime.getTime() + travelHours * 3600 * 1000
      );

      lines.push(`### ${label}`);
      lines.push("");
      lines.push(
        `- warehouse: ${mdEscape(alloc.warehouseName || String(alloc.warehouse))}`
      );
      lines.push(
        `- distanceKm: ${fmt(distanceKm, 2)} km  → travelHours≈${fmt(travelHours, 2)}  → deliveryTime=${deliveryTime.toISOString()}`
      );
      lines.push(
        `- requiredKg: ${fmt(alloc.required_kg, 2)} | allocatedKg: ${fmt(alloc.allocated_kg, 2)}`
      );

      if (!Array.isArray(alloc.batches) || alloc.batches.length === 0) {
        lines.push(`- batches: (none)`);
        lines.push("");
        return;
      }

      const usedBatchIds = alloc.batches.map((b) => String(b.batchId));
      const shipments = usedBatchIds.length
        ? await Shipment.find({ batchIds: { $in: usedBatchIds } })
            .limit(3)
            .lean()
        : [];

      lines.push("");
      lines.push(
        `| batchId | qtyKg | mfg | expiry | shelfLifeH | freshness@dispatch% | freshness@delivery% | spoiled? |`
      );
      lines.push(`|---|---:|---|---|---:|---:|---:|:---:|`);

      for (const used of alloc.batches) {
        const qty = Number(used.quantity) || 0;
        const batch = batchesById.get(String(used.batchId));
        const mfg = batch?.manufacture_date
          ? new Date(batch.manufacture_date).toISOString().slice(0, 10)
          : "—";
        const exp = batch?.expiry_iso
          ? new Date(batch.expiry_iso).toISOString().slice(0, 10)
          : "—";
        const shelf = batch?.shelf_life_hours ?? null;
        const fDispatch = batch
          ? calculateFreshnessPct(batch, dispatchTime, 25)
          : Number(used.freshness) || 100;
        const fDelivery = batch
          ? calculateFreshnessPct(batch, deliveryTime, 25)
          : null;
        const spoiled =
          fDelivery !== null ? (fDelivery <= 0 ? "YES" : "no") : "—";
        lines.push(
          `| ${mdEscape(String(used.batchId))} | ${fmt(qty, 2)} | ${mfg} | ${exp} | ${fmt(shelf, 0)} | ${fmt(fDispatch, 2)} | ${fmt(fDelivery, 2)} | ${spoiled} |`
        );
      }

      if (shipments.length > 0) {
        lines.push("");
        lines.push(`- shipments involving these batchIds (sample up to 3):`);
        for (const s of shipments) {
          lines.push(
            `  - shipment ${mdEscape(s.shipmentID || s.shipmentId || s._id)} start=${s.start_iso ? new Date(s.start_iso).toISOString() : "—"} eta=${s.eta_iso ? new Date(s.eta_iso).toISOString() : "—"}`
          );
        }
      }

      lines.push("");
    };

    await renderStrategy("Regular (nearest + FIFO)", aReg);
    await renderStrategy(
      "ML (top-K warehouses + freshness thresholds + distance score)",
      aMl
    );

    // If we can identify NGO node, show the top-K nearest warehouse list and their eligibility signals.
    if (ngoNode) {
      lines.push(`### ML warehouse search (top-K by distance for this NGO)`);
      lines.push("");

      const ranking = buildWarehouseRanking({
        ngoNode,
        warehouses,
        topK: topKWarehouses,
        hardMaxDistanceKm,
      });
      const dispatchTime = effectiveDate;

      lines.push(
        `| rank | warehouse | distanceKm | strictEligible | relaxedEligible | bestStrictFreshness@delivery | bestRelaxedFreshness@delivery | preferredCap? |`
      );
      lines.push(`|---:|---|---:|---:|---:|---:|---:|:---:|`);

      const top = ranking.top;
      for (let r = 0; r < top.length; r += 1) {
        const { warehouse, distance } = top[r];
        const analysis = analyzeWarehouseOption({
          warehouse,
          distanceKm: distance,
          foodType: aMl.foodType,
          unusedBatches: batches,
          dispatchTime,
          preferredMinDeliveredFreshnessPct,
          relaxedMinDeliveredFreshnessPct,
        });

        lines.push(
          `| ${r + 1} | ${mdEscape(warehouse.name || String(warehouse._id))} | ${fmt(distance, 2)} | ${fmtInt(analysis.strictEligibleCount)} | ${fmtInt(analysis.relaxedEligibleCount)} | ${fmt(analysis.bestStrictFreshnessAtDelivery, 2)} | ${fmt(analysis.bestRelaxedFreshnessAtDelivery, 2)} | ${distance <= maxPreferredDistanceKm ? "YES" : "no"} |`
        );
      }

      lines.push("");
      lines.push(`Notes:`);
      lines.push(
        `- ML only evaluates these top-K warehouses (plus hardMaxDistance filtering).`
      );
      lines.push(
        `- A warehouse can be near but still have 0 eligible batches once we require remainingHours > travelHours + 2.`
      );
      lines.push("");
    }

    // Quick delta summary.
    const regWh = aReg.warehouseName || String(aReg.warehouse);
    const mlWh = aMl.warehouseName || String(aMl.warehouse);
    const regAlloc = Number(aReg.allocated_kg) || 0;
    const mlAlloc = Number(aMl.allocated_kg) || 0;

    lines.push(`### Summary delta`);
    lines.push("");
    lines.push(
      `- warehouse: Regular=${mdEscape(regWh)} | ML=${mdEscape(mlWh)}`
    );
    lines.push(
      `- allocatedKg: Regular=${fmt(regAlloc, 2)} | ML=${fmt(mlAlloc, 2)}`
    );
    lines.push("");
  }

  const markdown = lines.join("\n");

  if (outPath) {
    const fullPath = path.isAbsolute(outPath)
      ? outPath
      : path.join(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, markdown, "utf-8");
    // eslint-disable-next-line no-console
    console.log(`Wrote report to: ${fullPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(markdown);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
