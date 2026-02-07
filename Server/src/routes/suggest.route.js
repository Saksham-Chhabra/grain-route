import { Router } from "express";
import {
  getSuggestionsForBatch,
  getSuggestionsForRegion,
} from "../controllers/suggest.controller.js";

const router = Router();

// GET /api/suggest/for-batch/:batchId - Get ML suggestions for a batch
router.get("/for-batch/:batchId", getSuggestionsForBatch);

// GET /api/suggest/for-region/:regionId?date= - Get ML suggestions for a region
router.get("/for-region/:regionId", getSuggestionsForRegion);

export default router;
