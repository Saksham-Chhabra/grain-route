# Mock Server Logging Guide

## Log Interpretation

The mock-server now provides comprehensive logging to help diagnose event generation and API calls.

### Scenario Start Logs

```
[SCENARIO] ═══════════════════════════════════════════════
[SCENARIO] Starting scenario: HarvestRun-1
[SCENARIO] Seed: arcanix-2025
[SCENARIO] Mode: region-based
[SCENARIO] Batch size: 20 events per tick
[SCENARIO] Interval: 2000ms between ticks
[SCENARIO] Probabilities: farm=65%, request=35%
[SCENARIO] Duration: 5 minutes
[SCENARIO] Loaded 6 region(s) and 12 warehouse(s)
[SCENARIO] ═══════════════════════════════════════════════
```

**What to check:**

- Probabilities should sum to 100%
- Both should be >0% (minimum 1% enforced)
- Node count or region count should be >0

---

### Event Generation Logs

```
[SCENARIO] Tick 0: Generating 20 new event(s) (probabilities: farm=65%, request=35%)
[SCENARIO]   Event 1/20: roll=0.234 (farm<0.650, request<1.000)
[SCENARIO]   └─ Generating farm event
[SCENARIO]   Event 2/20: roll=0.789 (farm<0.650, request<1.000)
[SCENARIO]   └─ Generating request event
[SCENARIO] Creating request event: REQ-A3F2D8... (requester: 5b4a2c1d...)
[SCENARIO]   └─ Will approve in 3 days (at 2025-11-04T12:00:00.000Z)
[SCENARIO]   └─ Will fulfill ~24 hours after approval (at 2025-11-05T12:00:00.000Z)
```

**What to check:**

- `roll` value determines event type
- If `roll < farm threshold`, creates farm event
- If `roll > farm threshold` but `< request threshold`, creates request event
- Request events show scheduled approval/fulfillment times

**Common issues:**

- If you only see farm events, check probabilities (request might be 0%)
- If roll is always less than farm threshold, probabilities might be wrong

---

### Request Creation Details

```
[SCENARIO] Creating request event: REQ-A3F2D8... (requester: 5b4a2c1d...)
[SCENARIO]   └─ Will approve in 3 days (at 2025-11-04T12:00:00.000Z)
[SCENARIO]   └─ Will fulfill ~24 hours after approval (at 2025-11-05T12:00:00.000Z)
```

**OR**

```
[SCENARIO] Creating request event: REQ-B7E9F2... (requester: 6c8d4e2f...)
[SCENARIO]   └─ Will NOT be approved (random chance)
```

**What to check:**

- ~65% of requests will be approved (random chance)
- ~70% of approved requests will be fulfilled
- Approval happens 1-6 simulated days after creation
- Fulfillment happens 4-48 simulated hours after approval

---

### Lifecycle Event Processing

```
[SCENARIO] Checking 3 pending approval(s) at 2025-11-04T12:00:00.000Z
[SCENARIO]   ✓ Approval ready for REQ-A3F2D8... (scheduled: 2025-11-04T12:00:00.000Z)
[SCENARIO] Generated 1 lifecycle event(s): requestApproved
```

```
[SCENARIO] Checking 2 pending fulfillment(s) at 2025-11-05T12:00:00.000Z
[SCENARIO]   ✓ Fulfillment ready for REQ-A3F2D8... (scheduled: 2025-11-05T12:00:00.000Z)
[SCENARIO] Generated 1 lifecycle event(s): requestFulfilled
```

**What to check:**

- Approval events only trigger when simulated time reaches scheduled date
- Fulfillment events only trigger after approval
- If you don't see lifecycle events, check if enough simulated time has passed

**Common issues:**

- Lifecycle events use **simulated time**, not real time
- Default time advance is 60-1440 minutes per event
- Short duration scenarios might not reach approval dates

---

### API Call Logs

```
[SCENARIO] POST http://localhost:3001/api/v1/request/createRequest (type: request)
[SCENARIO] ✓ request succeeded (201)
[SCENARIO] Captured mongoId 673abc123456789def012345 for requestId REQ-A3F2D8...
```

```
[SCENARIO] PATCH http://localhost:3001/api/v1/request/673abc123456789def012345/status (type: requestApproved)
[SCENARIO] ✓ requestApproved succeeded (200)
```

```
[SCENARIO] PATCH http://localhost:3001/api/v1/request/673abc123456789def012345/status (type: requestFulfilled)
[SCENARIO] ✓ requestFulfilled succeeded (200)
```

**What to check:**

- ✓ indicates success
- ✗ indicates failure (check error details below)
- mongoId capture is required for approval/fulfillment to work
- Lifecycle calls use the captured mongoId in the URL

**Common issues:**

1. **"failed (404)" on lifecycle calls**

   - mongoId wasn't captured from creation response
   - Check Server response format: should be `{ data: { _id: "..." } }`

2. **"failed (400)" errors**

   - Missing required fields in payload
   - Check Server logs for validation errors

3. **"fetch unavailable" or timeout errors**

   - Server not running on configured URL
   - Network connectivity issues
   - Check `MAIN_API_URL` in `.env`

4. **No mongoId captured**
   - Creation request failed
   - Server response doesn't match expected format
   - Check Server logs for the creation endpoint

---

### Tick Summary

```
[SCENARIO] Tick 0 complete: 21 total event(s) - farm:15, request:5, requestApproved:1
```

**What to check:**

- Event counts match expectations
- Mix of event types reflects configured probabilities
- Lifecycle events appear after simulated time passes

---

## Troubleshooting Checklist

### No Request Events Generated

1. Check probabilities in start payload or `.env`:

   ```
   [SCENARIO] Probabilities: farm=65%, request=35%
   ```

   Both should be >0%

2. Check event roll logs:

   ```
   [SCENARIO]   Event 1/20: roll=0.234 (farm<0.650, request<1.000)
   ```

   If roll always < farm threshold, increase request probability

3. Check for node/region availability:
   ```
   [SCENARIO] Loaded 0 region(s) and 0 warehouse(s)
   ```
   If no regions/nodes, request generation may fail

### No Request Lifecycle Events

1. Check if requests were marked for approval:

   ```
   [SCENARIO]   └─ Will approve in 3 days (at 2025-11-04T12:00:00.000Z)
   ```

   vs

   ```
   [SCENARIO]   └─ Will NOT be approved (random chance)
   ```

2. Check if enough simulated time has passed:

   - Default: 60-1440 minutes advance per event
   - Approval: 1-6 simulated days after creation
   - Need multiple ticks to reach approval dates

3. Increase scenario duration:

   ```json
   { "durationMinutes": 10 } // Run longer to see lifecycle events
   ```

4. Adjust time advancement for faster lifecycle:
   ```json
   {
     "timeAdvance": {
       "minMinutes": 1440, // 1 day per event
       "maxMinutes": 1440
     }
   }
   ```

### Request Created But No Approval/Fulfillment

1. Check mongoId capture:

   ```
   [SCENARIO] Captured mongoId 673abc... for requestId REQ-...
   ```

   If missing, check Server response format

2. Check pending queues:

   ```
   [SCENARIO] Checking 0 pending approval(s) at ...
   ```

   If always 0, requests weren't queued for approval

3. Check lifecycle event generation:
   ```
   [SCENARIO] Generated 1 lifecycle event(s): requestApproved
   ```
   If missing, check simulated time vs scheduled dates

---

## Example: Full Request Lifecycle

```
# Tick 0: Request created
[SCENARIO] Tick 0: Generating 1 new event(s) (probabilities: farm=0%, request=100%)
[SCENARIO]   Event 1/1: roll=0.500 (farm<0.010, request<1.000)
[SCENARIO]   └─ Generating request event
[SCENARIO] Creating request event: REQ-A3F2D8... (requester: 5b4a2c1d...)
[SCENARIO]   └─ Will approve in 2 days (at 2025-11-04T00:00:00.000Z)
[SCENARIO]   └─ Will fulfill ~12 hours after approval (at 2025-11-04T12:00:00.000Z)
[SCENARIO] Tick 0 complete: 1 total event(s) - request:1
[SCENARIO] POST http://localhost:3001/api/v1/request/createRequest (type: request)
[SCENARIO] ✓ request succeeded (201)
[SCENARIO] Captured mongoId 673abc123456789def012345 for requestId REQ-A3F2D8...

# Tick 15: Approval ready (simulated time advanced)
[SCENARIO] Tick 15: Generating 1 new event(s) (probabilities: farm=0%, request=100%)
[SCENARIO] Checking 1 pending approval(s) at 2025-11-04T00:00:00.000Z
[SCENARIO]   ✓ Approval ready for REQ-A3F2D8... (scheduled: 2025-11-04T00:00:00.000Z)
[SCENARIO] Generated 1 lifecycle event(s): requestApproved
[SCENARIO] Tick 15 complete: 2 total event(s) - request:1, requestApproved:1
[SCENARIO] PATCH http://localhost:3001/api/v1/request/673abc123456789def012345/status (type: requestApproved)
[SCENARIO] ✓ requestApproved succeeded (200)

# Tick 16: Fulfillment ready
[SCENARIO] Tick 16: Generating 1 new event(s) (probabilities: farm=0%, request=100%)
[SCENARIO] Checking 1 pending fulfillment(s) at 2025-11-04T12:00:00.000Z
[SCENARIO]   ✓ Fulfillment ready for REQ-A3F2D8... (scheduled: 2025-11-04T12:00:00.000Z)
[SCENARIO] Generated 1 lifecycle event(s): requestFulfilled
[SCENARIO] Tick 16 complete: 2 total event(s) - request:1, requestFulfilled:1
[SCENARIO] PATCH http://localhost:3001/api/v1/request/673abc123456789def012345/status (type: requestFulfilled)
[SCENARIO] ✓ requestFulfilled succeeded (200)
```

---

## Quick Commands

### Check if requests are being created

```bash
# Look for these logs:
grep "Creating request event" mock-server.log
```

### Check if lifecycle events are queued

```bash
grep "Will approve in" mock-server.log
grep "Will fulfill" mock-server.log
```

### Check if lifecycle events are triggered

```bash
grep "Approval ready" mock-server.log
grep "Fulfillment ready" mock-server.log
```

### Check API call success/failure

```bash
grep "✓.*succeeded" mock-server.log
grep "✗.*failed" mock-server.log
```

### Monitor live events

```powershell
# Windows PowerShell
Get-Content mock-server.log -Wait | Select-String "SCENARIO"
```
