# ML Service (short)

Unsupervised models for supply–demand monitoring:

- KMeans clusters districts; Isolation Forest flags anomalies.

Artifacts live in `ml/artifacts/<timestamp>/` with `metadata.json` and model files.

## Run (Windows PowerShell)

Training:

```powershell
cd "e:/Projects/Complete/Arcanix Hack on Hills/ml"
python -m venv .venv; .\.venv\Scripts\activate; pip install -r requirements.txt
python -m src.train --start-date 2023-01-01 --end-date 2024-10-31 --freq M
```

Node inference gateway:

```powershell
cd "e:/Projects/Complete/Arcanix Hack on Hills/ml"; npm install; npm run start
```

## HTTP API

### GET `/health`

Returns service status, available runs, and configuration.

**Response** (`200`):

```json
{
  "status": "ok",
  "artifactsDir": "artifacts",
  "availableRuns": ["20251101T153949Z"],
  "pythonBin": "/opt/venv/bin/python",
  "routeServiceUrl": "https://router.project-osrm.org"
}
```

---

### GET `/runs`

Lists all trained run directories under `artifacts/`.

**Response** (`200`):

```json
{
  "runs": ["20251101T153949Z", "20240922T101010Z"]
}
```

---

### GET `/runs/:runId/metadata`

Returns training metadata for a specific run.

**Response** (`200`):

```json
{
  "config": {
    "feature_frequency": "M",
    "kmeans_clusters": 6
  },
  "feature_summary": {
    "rows": 128,
    "frequency": "M"
  },
  "feature_columns": ["requested_kg", "incoming_kg"],
  "generated_at": "2025-11-01T15:39:49Z"
}
```

**Response** (`404`): `{ "error": "Run <runId> not found" }` or `{ "error": "metadata.json not found" }`

---

### POST `/predict`

Performs clustering and anomaly detection. Omitting `runId` uses the latest trained run.

**Request Option A** – Pre-computed feature rows:

```json
{
  "runId": "optional",
  "records": [
    {
      "state": "Maharashtra",
      "district": "Pune",
      "period_start": "2024-10-01",
      "requested_kg": 1250,
      "incoming_kg": 980,
      "outgoing_kg": 450,
      "produced_kg": 1100
    }
  ]
}
```

**Request Option B** – Raw Server documents (auto feature engineering):

```json
{
  "runId": "optional",
  "freq": "M",
  "nodes": [
    {
      "nodeId": "WH-001",
      "type": "warehouse",
      "district": "Pune",
      "state": "Maharashtra",
      "location": { "type": "Point", "coordinates": [73.86, 18.52] }
    }
  ],
  "requests": [
    {
      "requesterNode": "NGO-001",
      "items": [{ "foodType": "cereals", "required_kg": 500 }],
      "requiredBy_iso": "2024-10-10",
      "status": "open"
    }
  ],
  "shipments": [
    {
      "shipmentId": "S1",
      "batchIds": [],
      "fromNode": "FARM-001",
      "toNode": "WH-001",
      "start_iso": "2024-10-05",
      "travel_time_minutes": 120
    }
  ],
  "batches": [
    {
      "originNode": "FARM-001",
      "quantity_kg": 1200,
      "manufacture_date": "2024-10-01"
    }
  ]
}
```

**Response** (`200`):

```json
{
  "count": 1,
  "feature_columns": [
    "requested_kg",
    "incoming_kg",
    "outgoing_kg",
    "produced_kg"
  ],
  "missing_feature_columns": [],
  "results": [
    {
      "state": "Maharashtra",
      "district": "Pune",
      "period_start": "2024-10-01",
      "cluster_id": 2,
      "anomaly_score": 0.17,
      "is_anomaly": 0
    }
  ]
}
```

**Response** (`400`): `{ "error": "Provide either 'records' or raw Server data" }`  
**Response** (`404`): `{ "error": "Run <runId> not found" }`

---

### POST `/transfers/plan`

Generates recommended warehouse-to-warehouse and farm-to-warehouse transfers with routing.

**Request**:

```json
{
  "mode": "all",
  "maxPairs": 5,
  "minTransferKg": 200,
  "overstockRatio": 0.8,
  "understockRatio": 0.5,
  "targetRatio": 0.7,
  "intervalKm": 5,
  "nodes": [
    {
      "nodeId": "WH-001",
      "type": "warehouse",
      "capacity_kg": 8000,
      "location": { "lat": 18.52, "lon": 73.86 }
    }
  ],
  "batches": [
    {
      "batchId": "B-01",
      "originNode": "FARM-123",
      "currentNode": "WH-001",
      "current_quantity_kg": 420
    }
  ]
}
```

**Response** (`200`):

```json
{
  "generated_at": "2025-11-02T07:05:48.262Z",
  "mode": "all",
  "counts": {
    "warehouse_to_warehouse": 2,
    "farm_to_warehouse": 3
  },
  "warehouse_to_warehouse": [
    {
      "type": "warehouse_to_warehouse",
      "suggested_quantity_kg": 540,
      "distance_km": 124.6,
      "source": {
        "mongoId": "673c0a123456789abcdef012",
        "inventory_kg": 6800,
        "projected_inventory_kg": 6260
      },
      "target": {
        "mongoId": "673c0a123456789abcdef034",
        "inventory_kg": 3200,
        "projected_inventory_kg": 3740
      },
      "route": {
        "provider": "osrm",
        "distanceKm": 128.9,
        "durationMinutes": 156.7,
        "points": [
          { "lat": 18.52, "lon": 73.86, "cumulativeKm": 0 },
          { "lat": 18.55, "lon": 73.9, "cumulativeKm": 5.2 }
        ]
      }
    }
  ],
  "farm_to_warehouse": [
    {
      "type": "farm_to_warehouse",
      "suggested_quantity_kg": 260,
      "source": {
        "mongoId": "673c0a123456789abcdef056",
        "inventory_kg": 520
      },
      "target": {
        "mongoId": "673c0a123456789abcdef034",
        "inventory_kg": 3100
      }
    }
  ],
  "routing": {
    "intervalKm": 5,
    "baseUrl": "https://router.project-osrm.org"
  }
}
```

---

## Notes

- Any missing numeric feature is treated as `0`.
- When sending raw Server models to `/predict`, `freq` defaults to the training frequency in `metadata.json` if omitted.
- Routing falls back to straight-line interpolation if the OSRM service is unavailable.
