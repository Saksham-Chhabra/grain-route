from __future__ import annotations

import argparse
import json
from dataclasses import asdict, replace
from pathlib import Path
from typing import Optional

import pandas as pd

from .config import TrainingConfig, load_config
from .data_loader import MongoDataLoader
from .feature_engineering import prepare_feature_frame
from .models import build_feature_matrix, train_unsupervised_models
from .utils.logging import get_logger

LOGGER = get_logger(__name__)


def parse_args(default_config: TrainingConfig) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train unsupervised demand clustering and anomaly models.")
    parser.add_argument("--start-date", dest="start_date", help="ISO date (inclusive) for historical window.")
    parser.add_argument("--end-date", dest="end_date", help="ISO date (inclusive) for historical window.")
    parser.add_argument(
        "--freq",
        dest="freq",
        default=default_config.feature_frequency,
        help="Pandas offset alias for feature aggregation (default from config).",
    )
    parser.add_argument(
        "--output-dir",
        dest="output_dir",
        default=default_config.output_dir,
        help="Directory to write model artifacts.",
    )
    parser.add_argument(
        "--kmeans-clusters",
        dest="kmeans_clusters",
        type=int,
        help="Override cluster count for KMeans.",
    )
    parser.add_argument(
        "--contamination",
        dest="contamination",
        type=float,
        help="Override IsolationForest contamination rate (0-0.5).",
    )
    return parser.parse_args()


def maybe_update_config(config: TrainingConfig, args: argparse.Namespace) -> TrainingConfig:
    new_config = config
    if args.freq:
        new_config = replace(new_config, feature_frequency=args.freq)
    if args.output_dir:
        new_config = replace(new_config, output_dir=args.output_dir)
    if args.kmeans_clusters:
        new_config = replace(new_config, kmeans_clusters=args.kmeans_clusters)
    if args.contamination:
        new_config = replace(new_config, isolation_contamination=args.contamination)
    return new_config


def parse_date(text: Optional[str]) -> Optional[pd.Timestamp]:
    if not text:
        return None
    ts = pd.to_datetime(text, errors="coerce")
    if pd.isna(ts):
        raise ValueError(f"Could not parse date '{text}'. Use ISO format, e.g. 2024-01-01.")
    return ts


def main() -> None:
    config = load_config()
    args = parse_args(config)
    config = maybe_update_config(config, args)

    start_ts = parse_date(args.start_date)
    end_ts = parse_date(args.end_date)

    LOGGER.info("Connecting to MongoDB at %s", config.mongo_uri)
    loader = MongoDataLoader(config.mongo_uri, config.mongo_db)

    try:
        nodes_df = loader.fetch_nodes()
        ngos_df = loader.fetch_ngos()
        batches_df = loader.fetch_batches(_to_datetime(start_ts), _to_datetime(end_ts))
        requests_df = loader.fetch_requests(_to_datetime(start_ts), _to_datetime(end_ts))
        shipments_df = loader.fetch_shipments(_to_datetime(start_ts), _to_datetime(end_ts))
    finally:
        loader.close()

    features, feature_meta = prepare_feature_frame(
        nodes_df=nodes_df,
        requests_df=requests_df,
        shipments_df=shipments_df,
        batches_df=batches_df,
        freq=config.feature_frequency,
        ngos_df=ngos_df,
        festival_csv_path=config.festival_csv_path,
        income_csv_path=config.income_csv_path,
    )

    if len(features) < 2:
        raise RuntimeError("Not enough aggregated rows to train models. Collect more historical data.")

    feature_matrix, feature_columns = build_feature_matrix(features)
    outputs = train_unsupervised_models(feature_matrix, config)

    run_dir = _create_run_directory(config.output_dir)

    _save_models(outputs, run_dir)
    _save_tabular_outputs(features, outputs, run_dir)
    _save_metadata(config, feature_meta, outputs, args, run_dir)

    LOGGER.info("Training complete. Artifacts written to %s", run_dir)


def _save_models(outputs, run_dir: Path) -> None:
    import joblib

    kmeans_path = run_dir / "kmeans_model.joblib"
    iso_path = run_dir / "isolation_forest_model.joblib"

    joblib.dump(outputs.kmeans_pipeline, kmeans_path)
    joblib.dump(outputs.isolation_pipeline, iso_path)


def _save_tabular_outputs(features: pd.DataFrame, outputs, run_dir: Path) -> None:
    enriched = features.copy()
    enriched["cluster_id"] = outputs.cluster_labels
    enriched["anomaly_score"] = outputs.anomaly_scores
    enriched["is_anomaly"] = (outputs.anomaly_flags == -1).astype(int)

    features_path = run_dir / "aggregated_features.csv"
    enriched_path = run_dir / "cluster_assignments.csv"

    features.to_csv(features_path, index=False)
    enriched.to_csv(enriched_path, index=False)


def _save_metadata(
    config: TrainingConfig,
    feature_meta: dict,
    outputs,
    args: argparse.Namespace,
    run_dir: Path,
) -> None:
    metadata = {
        "config": asdict(config),
        "feature_summary": feature_meta,
        "kmeans": outputs.kmeans_summary,
        "isolation_forest": outputs.isolation_summary,
        "feature_columns": outputs.feature_columns,
        "cli_args": {
            "start_date": args.start_date,
            "end_date": args.end_date,
            "freq": args.freq,
        },
    }
    metadata_path = run_dir / "metadata.json"
    with metadata_path.open("w", encoding="utf-8") as fp:
        json.dump(metadata, fp, indent=2)


def _create_run_directory(base_dir: str) -> Path:
    run_root = Path(base_dir)
    timestamp = pd.Timestamp.utcnow().strftime("%Y%m%dT%H%M%SZ")
    run_dir = run_root / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def _to_datetime(ts: Optional[pd.Timestamp]):
    if ts is None:
        return None
    return ts.to_pydatetime()


if __name__ == "__main__":
    main()
