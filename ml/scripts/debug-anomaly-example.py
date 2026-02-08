import json
import sys
from pathlib import Path

import joblib
import pandas as pd

# Make ml/src importable as the package name "src"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.feature_engineering import prepare_feature_frame, KEY_COLUMNS

SNAPSHOT_FILE = Path('scripts/_debug_snapshot.json')

if not SNAPSHOT_FILE.exists():
    raise SystemExit(
        f"Missing {SNAPSHOT_FILE}. Run the PowerShell fetch command printed by this script header." 
    )

payload = json.loads(SNAPSHOT_FILE.read_text(encoding='utf-8-sig'))
if not payload.get('success'):
    raise SystemExit('simulate endpoint returned success=false')

ml_snapshot = (payload.get('data') or {}).get('mlSnapshotPayload') or {}

nodes = pd.DataFrame(ml_snapshot.get('nodes') or [])
requests = pd.DataFrame(ml_snapshot.get('requests') or [])
shipments = pd.DataFrame(ml_snapshot.get('shipments') or [])
batches = pd.DataFrame(ml_snapshot.get('batches') or [])

features, meta = prepare_feature_frame(
    nodes_df=nodes,
    requests_df=requests,
    shipments_df=shipments,
    batches_df=batches,
    freq='M',
    festival_csv_path='data/festival_features.csv',
    income_csv_path='data/income_features.csv',
)

print('--- Snapshot → Feature rows ---')
print('feature rows:', len(features))
if len(features) == 0:
    raise SystemExit('No feature rows produced from this snapshot.')

# Pick latest artifacts directory
artifacts_root = Path('artifacts')
run_dirs = sorted([p for p in artifacts_root.iterdir() if p.is_dir()])
if not run_dirs:
    raise SystemExit('No artifacts/* directories found.')
model_dir = run_dirs[-1]
print('model_dir:', model_dir.as_posix())

metadata = json.loads((model_dir / 'metadata.json').read_text(encoding='utf-8'))
feature_columns = metadata['feature_columns']

# Build matrix with expected columns
matrix = features.copy()
for col in feature_columns:
    if col not in matrix.columns:
        matrix[col] = 0.0
X = matrix[feature_columns].apply(pd.to_numeric, errors='coerce').fillna(0.0)

kmeans = joblib.load(model_dir / 'kmeans_model.joblib')
iso_pipeline = joblib.load(model_dir / 'isolation_forest_model.joblib')

clusters = kmeans.predict(X)
scaled = iso_pipeline[:-1].transform(X)
iso_model = iso_pipeline.named_steps['model']
scores = iso_model.decision_function(scaled)
flags = iso_model.predict(scaled)  # -1 anomaly, +1 normal

out = features[KEY_COLUMNS].copy()
out['cluster_id'] = clusters
out['anomaly_score'] = scores
out['is_anomaly'] = (flags == -1).astype(int)

anoms = out[out['is_anomaly'] == 1].sort_values('anomaly_score', ascending=True)

print('\n--- IsolationForest results ---')
print('rows scored:', len(out))
print('anomalies flagged:', int(out['is_anomaly'].sum()))

if len(anoms) == 0:
    print('No anomalies were flagged in this snapshot.')
    raise SystemExit(0)

example = anoms.iloc[0]
state = str(example.get('state', 'Unknown'))
district = str(example.get('district', 'Unknown'))
period = str(example.get('period_start', ''))

print('\n--- Example anomaly (real from snapshot) ---')
print('region:', f"{state}—{district}")
print('period_start:', period)
print('cluster_id:', int(example['cluster_id']))
print('anomaly_score:', float(example['anomaly_score']))

# Pull the feature row back for explanation
joined = features.merge(out, on=KEY_COLUMNS, how='left')
row = joined[
    (joined['state'] == example['state'])
    & (joined['district'] == example['district'])
    & (joined['period_start'] == example['period_start'])
].iloc[0]

interesting = [
    'requested_kg',
    'request_count',
    'unique_food_types',
    'supply_demand_gap_kg',
    'net_flow_kg',
    'production_vs_demand_ratio',
    'request_to_supply_ratio',
]
interesting = [c for c in interesting if c in joined.columns]

print('\nKey features (this region-month):')
for c in interesting:
    v = row[c]
    v = float(v) if pd.notna(v) else None
    print(f"  {c}: {v}")

period_rows = joined[joined['period_start'] == example['period_start']]
print('\nContext (median across regions for same period):')
for c in interesting:
    s = pd.to_numeric(period_rows[c], errors='coerce')
    med = float(s.median()) if s.notna().any() else None
    print(f"  median {c}: {med}")

print('\nWhy IsolationForest flags it (plain English):')
print('  This region-month sits far from the typical pattern in the training distribution,')
print('  so the forest isolates it quickly (few random splits) and labels it as an outlier.')
