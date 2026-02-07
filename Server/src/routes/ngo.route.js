import { Router } from "express";
import {
  createRequest,
  updateRequestStatus,
  getRequestsByNGO,
  getAllRequests,
  getAllNGOs,
} from "../controllers/ngo.controller.js";

const router = Router();

// NGO routes (when mounted at /api/v1/ngo)
router.get("/", getAllNGOs);

// Request routes (when mounted at /api/v1/request)
router.get("/all", getAllRequests);
router.post("/createRequest", createRequest);
router.patch("/:requestID/status", updateRequestStatus);
router.get("/getAllRequets/:ngoId", getRequestsByNGO);

export default router;
