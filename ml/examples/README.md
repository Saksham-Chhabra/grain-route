# ML Examples (Dry Runs)

These are **small, synthetic payloads** you can run end-to-end to understand the ML service behavior.

## 1) Inference — Format A (already-featured records)

This uses `records: [...]` directly (no feature engineering step).

Command (Windows PowerShell):

```powershell
Push-Location "C:\Users\schha\ThreeService\ml"
Get-Content .\examples\predict_records_example.json | \
  C:/Users/schha/ThreeService/.venv/Scripts/python.exe -m src.infer --model-dir artifacts/20251101T153949Z
Pop-Location
```

## 2) Inference — Format B (raw Server snapshot)

This exercises the on-the-fly feature engineering path from `nodes/requests/shipments/batches`.

```powershell
Push-Location "C:\Users\schha\ThreeService\ml"
Get-Content .\examples\predict_server_snapshot_example.json | \
  C:/Users/schha/ThreeService/.venv/Scripts/python.exe -m src.infer --model-dir artifacts/20251101T153949Z
Pop-Location
```

## 3) Transfer planner (separate from /predict)

This exercises both:

- **warehouse_to_warehouse** balancing
- **farm_to_warehouse** routing

```powershell
Push-Location "C:\Users\schha\ThreeService\ml"
Get-Content .\examples\transfer_planner_example.json | \
  C:/Users/schha/ThreeService/.venv/Scripts/python.exe -m src.transfer_planner --mode all --max-pairs 5 --min-transfer-kg 200 --overstock-ratio 0.8 --understock-ratio 0.4 --target-ratio 0.6
Pop-Location
```

## Note on warnings

If you see scikit-learn "InconsistentVersionWarning", it means the model artifacts were trained with a different sklearn version than your current environment.
It may still run, but the clean fix is to retrain the run using the same environment/version you’ll use for inference.
