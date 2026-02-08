from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.metrics import calinski_harabasz_score, silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .config import TrainingConfig
from .utils.logging import get_logger

LOGGER = get_logger(__name__)


@dataclass
class ModelOutputs:
    feature_columns: List[str]
    feature_matrix: pd.DataFrame
    kmeans_pipeline: Pipeline
    isolation_pipeline: Pipeline
    kmeans_summary: Dict[str, float]
    isolation_summary: Dict[str, float]
    cluster_labels: np.ndarray
    anomaly_scores: np.ndarray
    anomaly_flags: np.ndarray


def build_feature_matrix(features: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
    numeric_cols = features.select_dtypes(include=[np.number]).columns.tolist()
    if not numeric_cols:
        raise ValueError("No numeric feature columns available for training.")
    numeric_cols = sorted(numeric_cols)
    matrix = features[numeric_cols].copy()
    matrix = matrix.fillna(0.0)
    return matrix, numeric_cols


def train_unsupervised_models(matrix: pd.DataFrame, config: TrainingConfig) -> ModelOutputs:
    if len(matrix) < 2:
        raise ValueError("Need at least two samples to train unsupervised models.")

    feature_columns = matrix.columns.tolist()
    feature_values = matrix.to_numpy(dtype=float)

    kmeans_pipeline, kmeans_summary, cluster_labels = _train_kmeans(feature_values, config)
    isolation_pipeline, isolation_summary, anomaly_scores, anomaly_flags = _train_isolation_forest(
        feature_values, config
    )

    return ModelOutputs(
        feature_columns=feature_columns,
        feature_matrix=matrix,
        kmeans_pipeline=kmeans_pipeline,
        isolation_pipeline=isolation_pipeline,
        kmeans_summary=kmeans_summary,
        isolation_summary=isolation_summary,
        cluster_labels=cluster_labels,
        anomaly_scores=anomaly_scores,
        anomaly_flags=anomaly_flags,
    )


def _train_kmeans(values: np.ndarray, config: TrainingConfig) -> Tuple[Pipeline, Dict[str, float], np.ndarray]:
    n_samples = values.shape[0]
    desired_clusters = config.kmeans_clusters
    n_clusters = min(desired_clusters, n_samples)
    if n_clusters < 2 and n_samples >= 2:
        n_clusters = 2
    if n_clusters < 1:
        n_clusters = 1

    LOGGER.info("Training KMeans with %s clusters on %s samples", n_clusters, n_samples)

    pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "model",
                KMeans(
                    n_clusters=n_clusters,
                    random_state=config.random_state,
                    n_init=10,
                ),
            ),
        ]
    )
    pipeline.fit(values)

    model: KMeans = pipeline.named_steps["model"]
    labels = model.labels_
    summary: Dict[str, float] = {"inertia": float(model.inertia_)}

    if model.n_clusters > 1 and len(np.unique(labels)) > 1:
        summary["silhouette_score"] = float(silhouette_score(values, labels))
        summary["calinski_harabasz_score"] = float(calinski_harabasz_score(values, labels))

    summary["n_clusters"] = float(model.n_clusters)
    return pipeline, summary, labels


def _train_isolation_forest(
    values: np.ndarray,
    config: TrainingConfig,
) -> Tuple[Pipeline, Dict[str, float], np.ndarray, np.ndarray]:
    LOGGER.info(
        "Training IsolationForest with contamination %.3f on %s samples",
        config.isolation_contamination,
        values.shape[0],
    )

    pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "model",
                IsolationForest(
                    contamination=config.isolation_contamination,
                    random_state=config.random_state,
                    n_estimators=300,
                ),
            ),
        ]
    )
    pipeline.fit(values)

    model: IsolationForest = pipeline.named_steps["model"]
    scores = model.decision_function(values)
    flags = model.predict(values)  # 1 for inliers, -1 for outliers

    summary = {
        "threshold": float(np.percentile(scores, config.isolation_contamination * 100)),
        "contamination": float(config.isolation_contamination),
    }

    return pipeline, summary, scores, flags
