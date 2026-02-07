import { Router } from "express";
import {
  getHistoryDay,
  getHistoryRange,
  compareSimulations,
  simulateAllocations,
} from "../controllers/history.controller.js";

const router = Router();

// GET /api/history/day?date=YYYY-MM-DD - Get single day frame
router.get("/day", getHistoryDay);

// GET /api/history/range?start=YYYY-MM-DD&end=YYYY-MM-DD - Get range of frames
router.get("/range", getHistoryRange);

// GET /api/history/compare?date=YYYY-MM-DD - Compare regular vs ML allocation
router.get("/compare", compareSimulations);

// GET /api/history/simulate?date=YYYY-MM-DD - Get simulation data for visualization
router.get("/simulate", simulateAllocations);

export default router;
