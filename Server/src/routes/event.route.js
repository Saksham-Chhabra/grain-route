import { Router } from "express";
import {storeEvent,createNGORequest,newShipment} from "../controllers/events.controller.js";
//import controllers

const router=Router();

router.post("/farm", storeEvent);
router.post("/request", createNGORequest);
router.post("/shipment", newShipment);


export default router;