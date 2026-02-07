import { Router } from "express";
import {
  createBatch,
  getBatches,
  getBatchById,
  getInventorySummary,
} from "../controllers/batch.controller.js";

const router = Router();

// POST /api/batches - Create new batch
router.post("/", createBatch);

// GET /api/batches - Get all batches with filters
router.get("/", getBatches);

// GET /api/batches/inventory/summary - Get inventory summary
router.get("/inventory/summary", getInventorySummary);

// GET /api/batches/:batchId - Get single batch
router.get("/:batchId", getBatchById);

export default router;
