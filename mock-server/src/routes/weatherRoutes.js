/**
 * Weather API routes
 */

const express = require("express");
const { getWeather } = require("../controllers/weatherController");

const router = express.Router();

// GET /api/weather - Get weather data for region and date
router.get("/", getWeather);

module.exports = router;
