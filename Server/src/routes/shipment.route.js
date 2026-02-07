import { Router } from "express";
import {
  createShipment,
  markShipmentArrived,
  getShipments,
  getShipmentById,
} from "../controllers/shipment.controller.js";

const router = Router();

// POST /api/shipments - Create new shipment with batch allocation
router.post("/", createShipment);

// GET /api/shipments - Get all shipments with filters
router.get("/", getShipments);

// GET /api/shipments/:id - Get single shipment
router.get("/:id", getShipmentById);

// PATCH /api/shipments/:id/arrive - Mark shipment as arrived
router.patch("/:id/arrive", markShipmentArrived);

export default router;
