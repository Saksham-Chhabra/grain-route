/**
 * Transport API routes
 */

const express = require("express");
const {
  calculateTransportTime,
} = require("../controllers/transportController");

const router = express.Router();

// GET /api/transport/time - Calculate travel time and ETA
router.get("/time", calculateTransportTime);

module.exports = router;
