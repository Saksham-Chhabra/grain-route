const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const MAIN_API_URL = process.env.MAIN_API_URL || 'http://localhost:3001';
const MAIN_API_ROUTES = {
  farm: process.env.MAIN_API_FARM_PATH || '/api/v1/event/farm',
  requestCreate:
    process.env.MAIN_API_REQUEST_CREATE_PATH ||
    process.env.MAIN_API_REQUESTS_PATH ||
    '/api/v1/request/createRequest',
  requestApproveTemplate:
    process.env.MAIN_API_REQUEST_APPROVE_TEMPLATE ||
    '/api/v1/request/{requestId}/approved',
  requestFulfillTemplate:
    process.env.MAIN_API_REQUEST_FULFILL_TEMPLATE ||
    '/api/v1/request/{requestId}/fulfilled',
};
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/arcanix';
const MAX_BATCH_SIZE = Number(process.env.SCENARIO_MAX_BATCH_SIZE || 200);
const MIN_INTERVAL_MS = Number(process.env.SCENARIO_MIN_INTERVAL_MS || 500);
const DEFAULT_PROBABILITIES = {
  farm: Number(process.env.SCENARIO_PROB_FARM ?? 0.7),
  request: Number(
    process.env.SCENARIO_PROB_REQUEST ?? process.env.SCENARIO_PROB_NGO ?? 0.3
  ),
};
const MAIN_API_TIMEOUT_MS = Number(process.env.MAIN_API_TIMEOUT_MS || 10000);

module.exports = {
  MAIN_API_URL,
  MAIN_API_ROUTES,
  MAIN_API_TIMEOUT_MS,
  MONGO_URI,
  MAX_BATCH_SIZE,
  MIN_INTERVAL_MS,
  DEFAULT_PROBABILITIES,
};
