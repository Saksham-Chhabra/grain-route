from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional

import joblib
import numpy as np
import pandas as pd

def _json_safe(obj):
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    return obj


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run inference with previously trained clustering and anomaly models."
    )
    parser.add_argument("--model-dir", required=True, help="Directory containing trained artifacts.")
    parser.add_argument(
        "--input-file",
        help="JSON file with records; when omitted the payload is read from STDIN.",
    )
    parser.add_argument(
        "--output-file",
        help="Optional path to write JSON predictions; prints to STDOUT when omitted.",
    )
    parser.add_argument(
        "--metadata-file",
        help="Optional metadata path; defaults to <model-dir>/metadata.json.",
    )
    return parser.parse_args()


def load_records(args: argparse.Namespace) -> List[Dict[str, Any]]:
    if args.input_file:
        payload_text = Path(args.input_file).read_text(encoding="utf-8")
    else:
        payload_text = sys.stdin.read()
    if not payload_text.strip():
        raise ValueError("No inference payload supplied.")

    payload = json.loads(payload_text)
    if isinstance(payload, dict) and "records" in payload:
        records = payload["records"]
    elif isinstance(payload, list):
        records = payload
    else:
        raise ValueError("Payload must be an object with 'records' or a list of feature dicts.")

    if not isinstance(records, list) or not records:
        raise ValueError("Provide a non-empty list of records for inference.")

    return records


def maybe_build_records_from_server_payload(
    raw_payload: Dict[str, Any],
    default_freq: str,
    festival_csv_path: Optional[str] = None,
    income_csv_path: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
    """
    When the input is raw Server-model data (nodes/requests/shipments/batches),
    build aggregated feature rows using the same feature engineering used at training time.
    Returns a list of feature dicts (including key columns) or None when the payload
    is not in the expected server format.
    """
    from .feature_engineering import prepare_feature_frame, KEY_COLUMNS  # lazy import
    import pandas as pd

    if not isinstance(raw_payload, dict):
        return None

    has_server_keys = any(
        key in raw_payload for key in ("nodes", "requests", "shipments", "batches")
    )
    if not has_server_keys:
        return None

    freq = str(raw_payload.get("freq") or default_freq or "M")

    def to_frame(name: str) -> pd.DataFrame:
        seq = raw_payload.get(name)
        if isinstance(seq, list) and len(seq) > 0:
            return pd.DataFrame(seq)
        return pd.DataFrame()

    nodes_df = to_frame("nodes")
    requests_df = to_frame("requests")
    shipments_df = to_frame("shipments")
    batches_df = to_frame("batches")

    features, _meta = prepare_feature_frame(
        nodes_df=nodes_df,
        requests_df=requests_df,
        shipments_df=shipments_df,
        batches_df=batches_df,
        freq=freq,
        festival_csv_path=festival_csv_path,
        income_csv_path=income_csv_path,
    )
    if features.empty:
        return []
    # Convert to list of dicts, preserving key columns alongside feature columns.
    return features.to_dict(orient="records")


def load_metadata(model_dir: Path, metadata_file: str | None) -> Dict[str, Any]:
    if metadata_file:
        path = Path(metadata_file)
    else:
        path = model_dir / "metadata.json"
    if not path.exists():
        raise FileNotFoundError(f"Metadata file not found at {path}")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_matrix(records: List[Dict[str, Any]], feature_columns: List[str]) -> Tuple[pd.DataFrame, List[str]]:
    frame = pd.DataFrame(records)
    missing_columns = [col for col in feature_columns if col not in frame.columns]
    for column in missing_columns:
        frame[column] = 0.0
    matrix = frame[feature_columns].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return matrix, missing_columns


def load_pipelines(model_dir: Path) -> Tuple[Any, Any]:
    kmeans_path = model_dir / "kmeans_model.joblib"
    iso_path = model_dir / "isolation_forest_model.joblib"

    if not kmeans_path.exists() or not iso_path.exists():
        raise FileNotFoundError(
            "Expected kmeans_model.joblib and isolation_forest_model.joblib in model directory"
        )

    kmeans_pipeline = joblib.load(kmeans_path)
    isolation_pipeline = joblib.load(iso_path)
    return kmeans_pipeline, isolation_pipeline


def run(models, matrix: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    kmeans_pipeline, isolation_pipeline = models

    clusters = kmeans_pipeline.predict(matrix)

    scaled = isolation_pipeline[:-1].transform(matrix)
    iso_model = isolation_pipeline.named_steps["model"]
    scores = iso_model.decision_function(scaled)
    flags = iso_model.predict(scaled)
    return clusters, scores, flags


def assemble_response(
    records: List[Dict[str, Any]],
    clusters: np.ndarray,
    scores: np.ndarray,
    flags: np.ndarray,
    feature_columns: List[str],
    missing_columns: List[str],
) -> Dict[str, Any]:
    results: List[Dict[str, Any]] = []
    for index, record in enumerate(records):
        result = {
            "cluster_id": int(clusters[index]),
            "anomaly_score": float(scores[index]),
            "is_anomaly": int(flags[index] == -1),
        }
        for key in ("state", "district", "period_start"):
            if key in record and key not in result:
                result[key] = record[key]
        extra_keys = set(record.keys()) - set(feature_columns) - set(result.keys())
        for key in extra_keys:
            result[key] = record[key]
        results.append(result)

    return {
        "count": len(results),
        "feature_columns": feature_columns,
        "missing_feature_columns": missing_columns,
        "results": results,
    }


def main() -> None:
    args = parse_args()
    model_dir = Path(args.model_dir)
    if not model_dir.exists():
        raise FileNotFoundError(f"Model directory not found: {model_dir}")
    # Read raw payload to allow both 'records' and server-model data.
    raw_text = Path(args.input_file).read_text(encoding="utf-8") if args.input_file else sys.stdin.read()
    if not raw_text.strip():
        raise ValueError("No inference payload supplied.")
    raw_payload = json.loads(raw_text)

    metadata = load_metadata(model_dir, args.metadata_file)
    feature_columns = metadata.get("feature_columns")
    if not feature_columns:
        raise KeyError("metadata.json does not contain 'feature_columns'.")
    default_freq = metadata.get("frequency", "M")

    def resolve_data_path(value: Any) -> Optional[str]:
        if not value or not isinstance(value, str):
            return None
        path = Path(value)
        if path.is_absolute():
            return str(path)
        # Interpret relative paths as relative to the ML package root (ml/)
        base_dir = Path(__file__).resolve().parent.parent
        return str((base_dir / path).resolve())

    meta_config = metadata.get("config") if isinstance(metadata, dict) else None
    festival_csv_path = None
    income_csv_path = None
    if isinstance(meta_config, dict):
        festival_csv_path = resolve_data_path(meta_config.get("festival_csv_path"))
        income_csv_path = resolve_data_path(meta_config.get("income_csv_path"))

    # If raw server-model data was provided, build feature rows on the fly.
    server_records = None
    if isinstance(raw_payload, dict):
        server_records = maybe_build_records_from_server_payload(
            raw_payload,
            default_freq,
            festival_csv_path=festival_csv_path,
            income_csv_path=income_csv_path,
        )

    if server_records is not None:
        if not server_records:
            raise ValueError("No feature rows could be generated from provided Server data.")
        records = server_records
    else:
        # Fall back to existing 'records' or list-of-dicts contract
        if isinstance(raw_payload, dict) and "records" in raw_payload:
            records = raw_payload["records"]
        elif isinstance(raw_payload, list):
            records = raw_payload
        else:
            raise ValueError(
                "Payload must be an object with 'records' or raw Server data (nodes/requests/shipments/batches)."
            )
        if not isinstance(records, list) or not records:
            raise ValueError("Provide a non-empty list of records for inference.")

    matrix, missing_columns = build_matrix(records, feature_columns)
    models = load_pipelines(model_dir)
    clusters, scores, flags = run(models, matrix)

    response = assemble_response(records, clusters, scores, flags, feature_columns, missing_columns)

    if args.output_file:
        Path(args.output_file).write_text(json.dumps(response, indent=2), encoding="utf-8")
    else:
        json.dump(_json_safe(response), sys.stdout)



if __name__ == "__main__":
    main()
