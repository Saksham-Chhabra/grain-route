# Snapshot Allocation Walkthrough (Regular vs ML)

- Snapshot date: **2026-02-03T18:29:59.999Z**
- Mongo: **mongodb://localhost:27017/threeservice**
- Requests (pending in snapshot): **400**
- Stored batches in snapshot: **1500**
- Warehouses: **52**, NGO nodes: **99**, NGO orgs: **99**

## Core formulas used

### Transport time (simulation)
- avgSpeedKmh = 40
- baseHours = distanceKm / avgSpeedKmh
- breaks = floor(baseHours / 4) * 0.5
- travelHours = baseHours + breaks

### Freshness at time *t* (spoilage proxy)
In [Server/src/utils/freshness.js](../src/utils/freshness.js):

$freshnessPct = max(0, 100 - (elapsedHours / shelfLifeHours) * 100 * tempFactor)$
$tempFactor = 1 + max(0, (avgTempC - 20)/10) * 0.5$  (default avgTempC=25)

### Spoiled / at-risk at delivery (metrics)
- spoiled @ delivery: freshnessAtDelivery <= 0
- at risk @ delivery: 0 < freshnessAtDelivery < 20

## ML allocator knobs (env)

- ML_MIN_DELIVERED_FRESHNESS_PCT = 55%
- ML_RELAXED_MIN_DELIVERED_FRESHNESS_PCT = 25%
- ML_TOP_K_WAREHOUSES = 8 (by distance)
- ML_HARD_MAX_DISTANCE_KM = 450 km
- ML_MAX_DISTANCE_KM (preferred cap) = 250 km
- ML_DISTANCE_DECAY_KM = 35 km (distanceScore = exp(-distance/decay))

## Example 1: ULTRA-R-assam-disrupted-district-0022 / rice  (Regular=0, ML>0)

- request.createdOn: 2026-02-03T17:10:01.591Z
- request.requiredBefore: 2026-02-27T23:26:24.532Z
- NGO org: Disrupted District Relief NGO (6982e7b7fbb843dc8fe081dc)
- NGO node: Disrupted District Relief NGO | Assam / Disrupted District
- NGO coords: [26.18498, 91.70726]

### Regular (nearest + FIFO)

- warehouse: Disrupted District Warehouse 51
- distanceKm: 8.19 km  → travelHours≈0.20  → deliveryTime=2026-02-03T18:42:16.883Z
- requiredKg: 698.00 | allocatedKg: 0.00
- batches: (none)

### ML (top-K warehouses + freshness thresholds + distance score)

- warehouse: Assam District 5 Warehouse 20
- distanceKm: 76.60 km  → travelHours≈1.91  → deliveryTime=2026-02-03T20:24:53.863Z
- requiredKg: 698.00 | allocatedKg: 698.00

| batchId | qtyKg | mfg | expiry | shelfLifeH | freshness@dispatch% | freshness@delivery% | spoiled? |
|---|---:|---|---|---:|---:|---:|:---:|
| 6982e7b7fbb843dc8fe08cb6 | 280.00 | 2026-02-02 | 2026-03-04 | 720 | 93.84 | 93.50 | no |
| 6982e7b7fbb843dc8fe08c5b | 223.00 | 2026-02-01 | 2026-03-03 | 720 | 92.62 | 92.29 | no |
| 6982e7b7fbb843dc8fe08cc0 | 195.00 | 2026-01-28 | 2026-02-27 | 720 | 75.43 | 75.10 | no |

### ML warehouse search (top-K by distance for this NGO)

| rank | warehouse | distanceKm | strictEligible | relaxedEligible | bestStrictFreshness@delivery | bestRelaxedFreshness@delivery | preferredCap? |
|---:|---|---:|---:|---:|---:|---:|:---:|
| 1 | Disrupted District Warehouse 51 | 8.19 | 1 | 1 | 90.85 | 90.85 | YES |
| 2 | Assam District 2 Warehouse 43 | 63.05 | 7 | 7 | 88.70 | 88.70 | YES |
| 3 | Assam District 5 Warehouse 20 | 76.60 | 10 | 10 | 98.89 | 98.89 | YES |
| 4 | Assam District 8 Warehouse 2 | 101.00 | 3 | 3 | 78.99 | 78.99 | YES |

Notes:
- ML only evaluates these top-K warehouses (plus hardMaxDistance filtering).
- A warehouse can be near but still have 0 eligible batches once we require remainingHours > travelHours + 2.

### Summary delta

- warehouse: Regular=Disrupted District Warehouse 51 | ML=Assam District 5 Warehouse 20
- allocatedKg: Regular=0.00 | ML=698.00

## Example 2: ULTRA-R-assam-disrupted-district-0022 / wheat  (Regular=0, ML>0)

- request.createdOn: 2026-02-03T17:10:01.591Z
- request.requiredBefore: 2026-02-27T23:26:24.532Z
- NGO org: Disrupted District Relief NGO (6982e7b7fbb843dc8fe081dc)
- NGO node: Disrupted District Relief NGO | Assam / Disrupted District
- NGO coords: [26.18498, 91.70726]

### Regular (nearest + FIFO)

- warehouse: Disrupted District Warehouse 51
- distanceKm: 8.19 km  → travelHours≈0.20  → deliveryTime=2026-02-03T18:42:16.883Z
- requiredKg: 531.00 | allocatedKg: 0.00
- batches: (none)

### ML (top-K warehouses + freshness thresholds + distance score)

- warehouse: Assam District 2 Warehouse 43
- distanceKm: 63.05 km  → travelHours≈1.58  → deliveryTime=2026-02-03T20:04:34.057Z
- requiredKg: 531.00 | allocatedKg: 531.00

| batchId | qtyKg | mfg | expiry | shelfLifeH | freshness@dispatch% | freshness@delivery% | spoiled? |
|---|---:|---|---|---:|---:|---:|:---:|
| 6982e7b7fbb843dc8fe09936 | 298.00 | 2026-02-02 | 2026-03-04 | 720 | 95.75 | 95.47 | no |
| 6982e7b7fbb843dc8fe09904 | 233.00 | 2026-02-01 | 2026-03-03 | 720 | 90.36 | 90.09 | no |

- shipments involving these batchIds (sample up to 3):
  - shipment ULTRA-S000578 start=2025-12-26T02:33:24.009Z eta=2025-12-26T11:01:24.009Z

### ML warehouse search (top-K by distance for this NGO)

| rank | warehouse | distanceKm | strictEligible | relaxedEligible | bestStrictFreshness@delivery | bestRelaxedFreshness@delivery | preferredCap? |
|---:|---|---:|---:|---:|---:|---:|:---:|
| 1 | Disrupted District Warehouse 51 | 8.19 | 2 | 2 | 92.76 | 92.76 | YES |
| 2 | Assam District 2 Warehouse 43 | 63.05 | 3 | 3 | 95.47 | 95.47 | YES |
| 3 | Assam District 5 Warehouse 20 | 76.60 | 4 | 4 | 90.90 | 90.90 | YES |
| 4 | Assam District 8 Warehouse 2 | 101.00 | 2 | 2 | 88.19 | 88.19 | YES |

Notes:
- ML only evaluates these top-K warehouses (plus hardMaxDistance filtering).
- A warehouse can be near but still have 0 eligible batches once we require remainingHours > travelHours + 2.

### Summary delta

- warehouse: Regular=Disrupted District Warehouse 51 | ML=Assam District 2 Warehouse 43
- allocatedKg: Regular=0.00 | ML=531.00

## Example 3: ULTRA-TINY-maharashtra-maharashtra-district-1-0037 / wheat  (Regular=0, ML>0)

- request.createdOn: 2026-02-03T15:18:16.806Z
- request.requiredBefore: 2026-02-21T00:41:20.107Z
- NGO org: Maharashtra District 1 Relief NGO (6982e7b7fbb843dc8fe08183)
- NGO node: Maharashtra District 1 Relief NGO | Maharashtra / Maharashtra District 1
- NGO coords: [18.33534, 72.72720]

### Regular (nearest + FIFO)

- warehouse: Maharashtra District 2 Warehouse 35
- distanceKm: 73.62 km  → travelHours≈1.84  → deliveryTime=2026-02-03T20:20:26.143Z
- requiredKg: 10.00 | allocatedKg: 0.00
- batches: (none)

### ML (top-K warehouses + freshness thresholds + distance score)

- warehouse: Maharashtra District 2 Warehouse 40
- distanceKm: 82.71 km  → travelHours≈2.07  → deliveryTime=2026-02-03T20:34:04.228Z
- requiredKg: 10.00 | allocatedKg: 10.00

| batchId | qtyKg | mfg | expiry | shelfLifeH | freshness@dispatch% | freshness@delivery% | spoiled? |
|---|---:|---|---|---:|---:|---:|:---:|
| 6982e7b7fbb843dc8fe0976f | 10.00 | 2026-02-02 | 2026-03-04 | 720 | 96.61 | 96.26 | no |

### ML warehouse search (top-K by distance for this NGO)

| rank | warehouse | distanceKm | strictEligible | relaxedEligible | bestStrictFreshness@delivery | bestRelaxedFreshness@delivery | preferredCap? |
|---:|---|---:|---:|---:|---:|---:|:---:|
| 1 | Maharashtra District 2 Warehouse 35 | 73.62 | 0 | 0 | — | — | YES |
| 2 | Maharashtra District 2 Warehouse 40 | 82.71 | 5 | 5 | 96.26 | 96.26 | YES |
| 3 | Maharashtra District 8 Warehouse 24 | 141.82 | 5 | 5 | 96.69 | 96.69 | YES |
| 4 | Maharashtra District 6 Warehouse 9 | 174.27 | 7 | 7 | 93.17 | 93.17 | YES |

Notes:
- ML only evaluates these top-K warehouses (plus hardMaxDistance filtering).
- A warehouse can be near but still have 0 eligible batches once we require remainingHours > travelHours + 2.

### Summary delta

- warehouse: Regular=Maharashtra District 2 Warehouse 35 | ML=Maharashtra District 2 Warehouse 40
- allocatedKg: Regular=0.00 | ML=10.00

## Example 4: ULTRA-TINY-maharashtra-maharashtra-district-1-0031 / wheat  (Regular=0, ML>0)

- request.createdOn: 2026-02-03T08:02:25.775Z
- request.requiredBefore: 2026-02-16T10:49:05.610Z
- NGO org: Maharashtra District 1 Relief NGO (6982e7b7fbb843dc8fe08183)
- NGO node: Maharashtra District 1 Relief NGO | Maharashtra / Maharashtra District 1
- NGO coords: [18.33534, 72.72720]

### Regular (nearest + FIFO)

- warehouse: Maharashtra District 2 Warehouse 35
- distanceKm: 73.62 km  → travelHours≈1.84  → deliveryTime=2026-02-03T20:20:26.143Z
- requiredKg: 12.00 | allocatedKg: 0.00
- batches: (none)

### ML (top-K warehouses + freshness thresholds + distance score)

- warehouse: Maharashtra District 2 Warehouse 40
- distanceKm: 82.71 km  → travelHours≈2.07  → deliveryTime=2026-02-03T20:34:04.228Z
- requiredKg: 12.00 | allocatedKg: 12.00

| batchId | qtyKg | mfg | expiry | shelfLifeH | freshness@dispatch% | freshness@delivery% | spoiled? |
|---|---:|---|---|---:|---:|---:|:---:|
| 6982e7b7fbb843dc8fe0976f | 12.00 | 2026-02-02 | 2026-03-04 | 720 | 96.61 | 96.26 | no |

### ML warehouse search (top-K by distance for this NGO)

| rank | warehouse | distanceKm | strictEligible | relaxedEligible | bestStrictFreshness@delivery | bestRelaxedFreshness@delivery | preferredCap? |
|---:|---|---:|---:|---:|---:|---:|:---:|
| 1 | Maharashtra District 2 Warehouse 35 | 73.62 | 0 | 0 | — | — | YES |
| 2 | Maharashtra District 2 Warehouse 40 | 82.71 | 5 | 5 | 96.26 | 96.26 | YES |
| 3 | Maharashtra District 8 Warehouse 24 | 141.82 | 5 | 5 | 96.69 | 96.69 | YES |
| 4 | Maharashtra District 6 Warehouse 9 | 174.27 | 7 | 7 | 93.17 | 93.17 | YES |

Notes:
- ML only evaluates these top-K warehouses (plus hardMaxDistance filtering).
- A warehouse can be near but still have 0 eligible batches once we require remainingHours > travelHours + 2.

### Summary delta

- warehouse: Regular=Maharashtra District 2 Warehouse 35 | ML=Maharashtra District 2 Warehouse 40
- allocatedKg: Regular=0.00 | ML=12.00

## Example 5: ULTRA-R-assam-disrupted-district-0023 / milk  (Regular=0, ML>0)

- request.createdOn: 2026-02-03T06:31:01.192Z
- request.requiredBefore: 2026-02-22T14:24:29.186Z
- NGO org: Disrupted District Relief NGO (6982e7b7fbb843dc8fe081dc)
- NGO node: Disrupted District Relief NGO | Assam / Disrupted District
- NGO coords: [26.18498, 91.70726]

### Regular (nearest + FIFO)

- warehouse: Disrupted District Warehouse 51
- distanceKm: 8.19 km  → travelHours≈0.20  → deliveryTime=2026-02-03T18:42:16.883Z
- requiredKg: 1413.00 | allocatedKg: 0.00
- batches: (none)

### ML (top-K warehouses + freshness thresholds + distance score)

- warehouse: Assam District 2 Warehouse 43
- distanceKm: 63.05 km  → travelHours≈1.58  → deliveryTime=2026-02-03T20:04:34.057Z
- requiredKg: 1413.00 | allocatedKg: 481.00

| batchId | qtyKg | mfg | expiry | shelfLifeH | freshness@dispatch% | freshness@delivery% | spoiled? |
|---|---:|---|---|---:|---:|---:|:---:|
| 6982e7b7fbb843dc8fe098de | 102.00 | 2026-02-03 | 2026-02-06 | 72 | 92.19 | 89.45 | no |
| 6982e7b7fbb843dc8fe09917 | 257.00 | 2026-02-03 | 2026-02-06 | 72 | 69.62 | 66.88 | no |
| 6982e7b7fbb843dc8fe098e6 | 122.00 | 2026-02-02 | 2026-02-05 | 72 | 66.15 | 63.41 | no |

- shipments involving these batchIds (sample up to 3):
  - shipment ULTRA-S000716 start=2025-12-27T17:52:46.957Z eta=2025-12-29T17:16:46.957Z
  - shipment ULTRA-S000806 start=2025-11-21T17:13:49.535Z eta=2025-11-23T11:09:49.535Z

### ML warehouse search (top-K by distance for this NGO)

| rank | warehouse | distanceKm | strictEligible | relaxedEligible | bestStrictFreshness@delivery | bestRelaxedFreshness@delivery | preferredCap? |
|---:|---|---:|---:|---:|---:|---:|:---:|
| 1 | Disrupted District Warehouse 51 | 8.19 | 4 | 7 | 88.36 | 88.36 | YES |
| 2 | Assam District 2 Warehouse 43 | 63.05 | 3 | 8 | 89.45 | 89.45 | YES |
| 3 | Assam District 5 Warehouse 20 | 76.60 | 0 | 2 | — | 38.52 | YES |
| 4 | Assam District 8 Warehouse 2 | 101.00 | 1 | 1 | 63.50 | 63.50 | YES |

Notes:
- ML only evaluates these top-K warehouses (plus hardMaxDistance filtering).
- A warehouse can be near but still have 0 eligible batches once we require remainingHours > travelHours + 2.

### Summary delta

- warehouse: Regular=Disrupted District Warehouse 51 | ML=Assam District 2 Warehouse 43
- allocatedKg: Regular=0.00 | ML=481.00
