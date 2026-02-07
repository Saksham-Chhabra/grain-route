import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/threeservice";
const client = new MongoClient(uri);

const SNAP_ISO = process.env.SNAPSHOT_ISO || "2026-02-03T00:00:00.000Z";
const snap = new Date(SNAP_ISO);

await client.connect();
const db = client.db();

const batches = db.collection("batches");
const requests = db.collection("requests");

const [requested] = await requests
  .aggregate([
    { $match: { status: "pending" } },
    { $unwind: "$items" },
    {
      $group: {
        _id: null,
        totalRequestedKg: { $sum: "$items.required_kg" },
        requestIds: { $addToSet: "$requestID" },
      },
    },
    {
      $project: {
        _id: 0,
        totalRequestedKg: 1,
        requestCount: { $size: "$requestIds" },
      },
    },
  ])
  .toArray();

const [inventoryAll] = await batches
  .aggregate([
    { $match: { status: { $in: ["stored", "reserved", "in_transit"] } } },
    {
      $group: {
        _id: null,
        totalQtyKg: { $sum: "$quantity_kg" },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, totalQtyKg: 1, count: 1 } },
  ])
  .toArray();

const [inventoryNonExpired] = await batches
  .aggregate([
    {
      $match: {
        status: { $in: ["stored", "reserved", "in_transit"] },
        expiry_iso: { $gte: snap },
      },
    },
    {
      $group: {
        _id: null,
        totalQtyKg: { $sum: "$quantity_kg" },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, totalQtyKg: 1, count: 1 } },
  ])
  .toArray();

const topNonExpiredByFoodType = await batches
  .aggregate([
    {
      $match: {
        status: { $in: ["stored", "reserved", "in_transit"] },
        expiry_iso: { $gte: snap },
      },
    },
    {
      $group: {
        _id: "$foodType",
        qtyKg: { $sum: "$quantity_kg" },
        count: { $sum: 1 },
      },
    },
    { $sort: { qtyKg: -1 } },
    { $limit: 10 },
  ])
  .toArray();

console.log(
  JSON.stringify(
    {
      uri,
      snapISO: snap.toISOString(),
      requested: requested || null,
      inventoryAll: inventoryAll || null,
      inventoryNonExpired: inventoryNonExpired || null,
      topNonExpiredByFoodType,
    },
    null,
    2
  )
);

await client.close();
