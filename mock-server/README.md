# Mock Server (Scenario Manager)

Generates deterministic food supply chain simulation events and sends them to the main API.

## Quick Start

```powershell
cd "e:/Projects/Complete/Arcanix Hack on Hills/mock-server"
npm install
npm run dev
```

Server starts on `http://localhost:5001` (configurable via `PORT` env variable).

## Features

- **Deterministic event generation** using seeded RNG
- **Request lifecycle management** (create → approve → fulfill)
- **Unified status endpoint** support (single PATCH route for approval/fulfillment)
- **Automatic mongoId capture** from creation responses
- **Simulated time advancement** between events
- **Probability normalization** with minimum thresholds
- **Node-based or region-based** event sourcing
- **MongoDB persistence** of all events

## Configuration

Create `.env` in `mock-server/` directory:

```bash
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

### Probability Handling

- Values are normalized to sum to 1.0 (e.g., `0.9 + 0.3` → `0.75 + 0.25`)
- Minimum 1% enforced per type to prevent dead scenarios
- If both are ≤0, defaults to `0.65/0.35`
- If only one is >0, the other gets 1% minimum

## API Endpoints

### POST `/api/scenario/start`

Start a deterministic simulation.

**Request:**

```json
{
  "name": "HarvestRun-1",
  "seed": "arcanix-2025",
  "startDate": "2025-11-01T00:00:00Z",
  "batchSize": 20,
  "intervalMs": 2000,
  "durationMinutes": 5,
  "probabilities": { "farm": 0.65, "request": 0.35 },
  "timeAdvance": { "minMinutes": 60, "maxMinutes": 1440 },
  "regions": ["Maharashtra", "Bihar"],
  "nodes": [
    {
      "nodeId": "FARM-001",
      "type": "farm",
      "district": "Pune",
      "state": "Maharashtra",
      "location": { "type": "Point", "coordinates": [73.86, 18.52] }
    }
  ]
}
```

**Response:**

```json
{
  "scenarioId": "673abc...",
  "status": "running"
}
```

### POST `/api/scenario/stop`

Stop a running scenario.

**Request:**

```json
{
  "scenarioId": "673abc..."
}
```

**Response:**

```json
{
  "scenarioId": "673abc...",
  "status": "stopped",
  "stats": { "totalEventsSent": 150 }
}
```

### GET `/api/scenario/:id/status`

Get scenario metadata and current status.

### GET `/api/scenario/:id/events?limit=100`

Fetch recent events (default 100, max 500).

## Request Lifecycle

The mock-server implements a three-stage request lifecycle:

1. **Create** (`POST /createRequest`)

   - Sends: `{ requestId, requesterNode, items, createdOn, requiredBefore, status: "pending" }`
   - Captures `_id` from response for later stages

2. **Approve** (`PATCH /:requestID/status`, 1-6 simulated days later)

   - Sends: `{ status: "approved", approvedOn: ISO_STRING }`
   - Uses captured mongoId

3. **Fulfill** (`PATCH /:requestID/status`, 4-48 simulated hours after approval)
   - Sends: `{ status: "fulfilled", fulfilledBy: ObjectId, fullFilledOn: ISO_STRING, approvedOn: ISO_STRING }`
   - Only ~70% of approved requests get fulfilled

## Event Types

- `farm` - Food production events with batches
- `request` - NGO/region requests for food aid
- `requestApproved` - Request approval updates
- `requestFulfilled` - Request fulfillment confirmations

## Debugging

The service provides comprehensive logging for all operations. See **[LOGGING.md](./LOGGING.md)** for detailed log interpretation.

Key log patterns:

```
[SCENARIO] ═══════════════════════════════════════════════
[SCENARIO] Starting scenario: HarvestRun-1
[SCENARIO] Probabilities: farm=65%, request=35%
[SCENARIO] ═══════════════════════════════════════════════

[SCENARIO] Tick 0: Generating 20 new event(s)
[SCENARIO]   Event 1/20: roll=0.234 (farm<0.650, request<1.000)
[SCENARIO]   └─ Generating farm event
[SCENARIO]   Event 2/20: roll=0.789
[SCENARIO]   └─ Generating request event
[SCENARIO] Creating request event: REQ-A3F2D8... (requester: 5b4a2c1d...)
[SCENARIO]   └─ Will approve in 3 days (at 2025-11-04T12:00:00.000Z)

[SCENARIO] POST http://localhost:3001/api/v1/request/createRequest (type: request)
[SCENARIO] ✓ request succeeded (201)
[SCENARIO] Captured mongoId 673abc... for requestId REQ-...

[SCENARIO] Checking 3 pending approval(s) at 2025-11-04T12:00:00.000Z
[SCENARIO]   ✓ Approval ready for REQ-A3F2D8...
[SCENARIO] PATCH http://localhost:3001/api/v1/request/673abc.../status (type: requestApproved)
[SCENARIO] ✓ requestApproved succeeded (200)

[SCENARIO] Tick 0 complete: 21 total event(s) - farm:15, request:5, requestApproved:1
```

**Quick diagnostics:**

- ✓ = success, ✗ = failure
- Event roll determines type (farm vs request)
- Lifecycle events use simulated time (60-1440 min advances per event)
- mongoId capture required for approval/fulfillment

## Testing

Use the included test script:

```powershell
.\test-request-lifecycle.ps1
```

This creates a test NGO, runs a 1-minute scenario, and verifies all lifecycle stages.

## Docker

Build and run with docker-compose:

```powershell
docker compose up --build
```

The entrypoint automatically seeds MongoDB with crop/region data.

## Troubleshooting

**Issue:** "fetch unavailable" errors

- **Fix:** Upgrade to Node 18+ or ensure `axios` is installed

**Issue:** Approval/fulfillment events not sent

- **Fix:** Verify `.env` templates point to `/status` endpoint
- Check logs for mongoId capture failures

**Issue:** No events generated

- **Fix:** Check probability values (both must be >0 or will use defaults)

**Issue:** 404 errors on lifecycle calls

- **Fix:** Ensure Server route is `PATCH /:requestID/status`
- Verify mongoId was captured from create response

## See Also

- Full documentation: `docs/usage.md`
- Example scenarios: `scripts/scenario-curl-examples.sh`
- Node generation: `mock-data/generate-nodes.js`
