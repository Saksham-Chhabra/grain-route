# Scenario Manager Mock Server Usage

## Data Seeding

Reference CSV and Excel data for the mock server is checked into the repository under `mock-server/mock-data/`. Docker builds no longer attempt to download files at runtime.

To refresh the Mongo collections manually (for example, after updating the Excel files), run the bundled scripts from the `mock-server/mock-data/` directory:

```powershell
python excel-to-mongo.py --folder ./crop-generation-data --mongo-uri mongodb://localhost:27017 --db arcanix
python infer-seasons.py --mongo-uri mongodb://localhost:27017 --db arcanix --input_coll crops_history --grouping district --min_coverage 0.75
```

## Configuration

Create a `.env` file in `mock-server/` with environment overrides as needed:

```
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/arcanix
MAIN_API_URL=http://localhost:3001
MAIN_API_FARM_PATH=/api/v1/event/farm
MAIN_API_REQUEST_CREATE_PATH=/api/v1/request/createRequest

# Both approval and fulfillment use the unified status endpoint
MAIN_API_REQUEST_APPROVE_TEMPLATE=/api/v1/request/{requestObjectId}/status
MAIN_API_REQUEST_FULFILL_TEMPLATE=/api/v1/request/{requestObjectId}/status

SCENARIO_MAX_BATCH_SIZE=200
SCENARIO_MIN_INTERVAL_MS=500

# Event probabilities (normalized to sum to 1.0, minimum 1% enforced per type)
SCENARIO_PROB_FARM=0.65
SCENARIO_PROB_REQUEST=0.35
```

Any unset value falls back to the defaults above.

**Probability Notes:**

- Values are automatically normalized to sum to 1.0
- If you set `farm: 0.9, request: 0.3`, they'll normalize to `farm: 0.75, request: 0.25`
- If both are zero or negative, defaults (0.65/0.35) are used
- Minimum 1% probability is enforced for each type to prevent dead scenarios

If your main API uses separate endpoints for approval/fulfillment instead of the unified `/status` route, override the templates:

```
MAIN_API_REQUEST_APPROVE_TEMPLATE=/api/v1/request/{requestObjectId}/approve
MAIN_API_REQUEST_FULFILL_TEMPLATE=/api/v1/request/{requestObjectId}/fulfill
```

The mock-server auto-detects `/status` in URLs and uses `PATCH`; otherwise it defaults to `POST`.

## Request Lifecycle

The mock-server sends request lifecycle events to a **unified status endpoint** on the main API. All three lifecycle stages use the same route with different payloads:

1. **Creation** → `POST /api/v1/request/createRequest`

   - Payload: `{ requestId, requesterNode, items, createdOn, requiredBefore, status: "pending" }`
   - Response captures the Mongo `_id` for later lifecycle calls

2. **Approval** → `PATCH /api/v1/request/:requestID/status` (after 1–6 simulated days)

   - Payload: `{ status: "approved", approvedOn: ISO_STRING }`
   - Uses the captured `_id` from creation response

3. **Fulfillment** → `PATCH /api/v1/request/:requestID/status` (4–48 simulated hours after approval)
   - Payload: `{ status: "fulfilled", fulfilledBy: ObjectId, fullFilledOn: ISO_STRING, approvedOn: ISO_STRING }`
   - Only sent for ~70% of approved requests

The simulator:

- Deterministically generates `requestId` values from the scenario seed
- Captures the Mongo `_id` from the creation response (`body.data._id`)
- Substitutes `{requestObjectId}` placeholder in templates with the captured `_id`
- Auto-detects `/status` in URLs and switches to `PATCH` method
- Persists all three event types in MongoDB: `request`, `requestApproved`, `requestFulfilled`

Requests that are never approved remain tracked internally with `pending` status so the mock server can surface their history via the events collection.

## API Endpoints

### POST `/api/scenario/start`

Start a deterministic simulation.

There are two ways to scope where events are emitted from:

1. Provide `nodes` directly (preferred). Each item should match `Server/src/models/node.model.js` shape (at least `nodeId`, `type`, `district`, optional `state`, and `location.coordinates` as `[lon, lat]`).

```json
{
  "name": "HarvestRun-1",
  "seed": "arcanix-2025",
  "startDate": "2025-11-01T00:00:00Z",
  "batchSize": 20,
  "intervalMs": 2000,
  "nodes": [
    {
      "nodeId": "FARM-001",
      "type": "farm",
      "district": "Pune",
      "state": "Maharashtra",
      "location": { "type": "Point", "coordinates": [73.86, 18.52] }
    },
    {
      "nodeId": "WH-001",
      "type": "warehouse",
      "district": "Pune",
      "state": "Maharashtra",
      "location": { "type": "Point", "coordinates": [73.9, 18.55] }
    }
  ],
  "durationMinutes": 5,
  "probabilities": { "farm": 0.65, "request": 0.35 }
}
```

2. Legacy: provide `regions` and the simulator will resolve regions/warehouses from Mongo.

Returns: `{ "scenarioId": string, "status": "running" }`

### POST `/api/scenario/stop`

Stop a running simulation.

```json
{
  "scenarioId": "<id from start>"
}
```

Returns: `{ "scenarioId": string, "status": "stopped", "stats": { "totalEventsSent": number } }`

### GET `/api/scenario/:id/status`

Retrieve scenario metadata, status, configuration, and stats.

### GET `/api/scenario/:id/events?limit=100`

Fetch recent events persisted in MongoDB (`sim_events`). `limit` defaults to 100 and is capped at 500.

All emitted events now include an `emittedFrom` object inside the payload with the source node details, plus simulated time fields that advance between events:

```json
{
  "type": "farm",
  "payload": {
    "emittedFrom": {
      "nodeId": "FARM-001",
      "type": "farm",
      "district": "Pune",
      "state": "Maharashtra",
      "location": { "lat": 18.52, "lon": 73.86 }
    },
    "quantity_kg": 2500,
    "generatedAt": "2025-11-01T00:05:00.000Z",
    "generatedAt_iso": "2025-11-01T00:05:00.000Z",
    "createdAt": "2025-11-01T00:05:00.000Z",
    "createdAt_iso": "2025-11-01T00:05:00.000Z",
    "previousEvent": "2025-11-01T00:00:00.000Z",
    "previousEvent_iso": "2025-11-01T00:00:00.000Z",
    "batch": {
      "quantity_kg": 2500,
      "dateOfCreation": "2025-11-01T00:05:00.000Z",
      "dateOfCreation_iso": "2025-11-01T00:05:00.000Z"
    }
  }
}
```

Request creation events follow the request schema published by the main API. Each `request` payload includes `requestId`, `requesterNode`, `items`, and lifecycle history. The simulator emits `requestApproved` after a random delay (1–6 days) and `requestFulfilled` 4–48 hours after approval for most requests. Requests that are never approved remain in the simulator ledger and stay in `pending` status.

### Simulated time configuration

You can configure how much simulated time advances between events when starting a scenario:

```json
{
  "name": "HarvestRun-1",
  "seed": "arcanix-2025",
  "startDate": "2025-11-01T00:00:00Z",
  "batchSize": 20,
  "intervalMs": 2000,
  "timeAdvance": { "minMinutes": 60, "maxMinutes": 1440 },
  "nodes": [...]
}
```

Defaults are 60–1440 minutes if omitted. The simulated clock is monotonic and embedded in the event payload via the `generatedAt`/`createdAt` fields.

## Docker

Build and launch the mock server alongside MongoDB with seeded reference data:

1. From the repo root run `docker compose up --build`.
2. Wait for the entrypoint logs to show the Python data prep scripts completing (`excel-to-mongo.py`, `infer-seasons.py`).
3. Interact with the API at `http://localhost:5001` once the "Starting Scenario Manager" log appears.

The compose setup exposes an optional `MONGO_DB` environment variable that defaults to the database parsed from `MONGO_URI`. Setting `SKIP_DATA_SETUP=1` on the `mock-server` service skips the Python loaders if you already have seeded data.

## Generate nodes from Mongo states/districts

The generator now only needs your MongoDB to be running with the `agriculte.crops_history` collection populated:

```powershell
cd "e:/Projects/Complete/Arcanix Hack on Hills/mock-server/mock-data"

# Generate nodes (writes nodes.mongo.json by default when you pass a filename)
node .\generate-nodes.js .\nodes.mongo.json

# Import the generated JSON into the main API database
mongoimport --uri "mongodb://127.0.0.1:27017/arcanix" --collection nodes --jsonArray --file ".\nodes.mongo.json"
```

Environment overrides (optional):

- `MONGO_URI` (default `mongodb://127.0.0.1:27017/agriculte`)
- `MONGO_DB` (default `agriculte`)
- `MONGO_COLLECTION` (default `crops_history`)
