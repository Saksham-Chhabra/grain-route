#!/bin/bash
# Test script to verify request lifecycle integration
# Prerequisites: Server running on port 3001, mock-server on port 5001, MongoDB running

set -e

echo "=== Testing Request Lifecycle Integration ==="
echo ""

# Step 1: Create an NGO first
echo "1. Creating test NGO..."
NGO_RESPONSE=$(curl -s -X POST http://localhost:3001/api/v1/ngo \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test NGO",
    "address": "123 Test St, Mumbai",
    "contactInfo": {
      "contactPerson": "John Doe",
      "email": "test@ngo.org",
      "phone": "1234567890"
    }
  }')

NGO_ID=$(echo $NGO_RESPONSE | jq -r '.data._id')
echo "   NGO created with ID: $NGO_ID"
echo ""

# Step 2: Start a minimal scenario with just one request
echo "2. Starting scenario..."
SCENARIO_RESPONSE=$(curl -s -X POST http://localhost:5001/api/scenario/start \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"LifecycleTest-$(date +%s)\",
    \"seed\": \"test-seed-123\",
    \"startDate\": \"2025-11-01T00:00:00Z\",
    \"batchSize\": 1,
    \"intervalMs\": 2000,
    \"durationMinutes\": 1,
    \"probabilities\": { \"farm\": 0, \"request\": 1 },
    \"regions\": [\"Maharashtra\"]
  }")

SCENARIO_ID=$(echo $SCENARIO_RESPONSE | jq -r '.scenarioId')
echo "   Scenario started with ID: $SCENARIO_ID"
echo ""

# Step 3: Wait for scenario to complete
echo "3. Waiting 65 seconds for scenario to run..."
sleep 65

echo ""
echo "4. Stopping scenario..."
curl -s -X POST http://localhost:5001/api/scenario/stop \
  -H "Content-Type: application/json" \
  -d "{\"scenarioId\": \"$SCENARIO_ID\"}" | jq

echo ""
echo "5. Fetching scenario events..."
curl -s "http://localhost:5001/api/scenario/$SCENARIO_ID/events?limit=20" | jq '.[] | {type, timestamp, requestId: .payload.requestId, status: .payload.status}'

echo ""
echo "6. Fetching requests from Server..."
curl -s "http://localhost:3001/api/v1/request/all" | jq '.data[] | {requestID, status, createdOn, approvedOn, fullFilledOn}'

echo ""
echo "=== Test Complete ==="
