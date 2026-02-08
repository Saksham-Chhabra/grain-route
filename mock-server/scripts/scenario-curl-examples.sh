# Start scenario
curl -X POST http://localhost:5001/api/scenario/start \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestScenario1",
    "seed": "arcanix2025",
    "startDate": "2025-11-01T00:00:00Z",
    "batchSize": 10,
    "intervalMs": 2000,
    "regions": ["Andhra Pradesh"],
    "durationMinutes": 1
  }'

# Stop scenario
curl -X POST http://localhost:5001/api/scenario/stop \
  -H "Content-Type: application/json" \
  -d '{ "scenarioId": "<SCENARIO_ID>" }'

# Get scenario status
curl http://localhost:5001/api/scenario/<SCENARIO_ID>/status

# Get scenario events
curl http://localhost:5001/api/scenario/<SCENARIO_ID>/events?limit=20
