import { Router } from "express";
import { sendSimulationData, getData } from "../controllers/ml.controller.js";

const router = Router();

router.post("/sendData", sendSimulationData);
router.post("/transfers/plan", getData);
router.post("/:requestID/status", getData);

export default router;
