from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .utils.logging import get_logger

LOGGER = get_logger(__name__)

KEY_COLUMNS = ["state", "district", "period_start"]


def prepare_feature_frame(
    nodes_df: pd.DataFrame,
    requests_df: pd.DataFrame,
    shipments_df: pd.DataFrame,
    batches_df: pd.DataFrame,
    freq: str,
    ngos_df: Optional[pd.DataFrame] = None,
    festival_csv_path: Optional[str] = None,
    income_csv_path: Optional[str] = None,
) -> Tuple[pd.DataFrame, Dict[str, object]]:
    nodes = _prepare_nodes(nodes_df)
    batches = _normalize_batches(batches_df)

    request_block = _prepare_request_features(requests_df, nodes, freq, ngos_df=ngos_df)
    shipment_block = _prepare_shipment_features(shipments_df, nodes, batches, freq)
    batch_block = _prepare_batch_features(batches, nodes, freq)

    # If we have any snapshot-derived activity rows, we should avoid returning
    # "historical" rows that come only from external feature blocks (festival/income).
    # This keeps inference aligned to the live snapshot being scored.
    activity_blocks = [b for b in (request_block, shipment_block, batch_block) if not b.empty]
    activity_keys = (
        pd.concat([b[KEY_COLUMNS] for b in activity_blocks], ignore_index=True)
        .drop_duplicates()
        if activity_blocks
        else pd.DataFrame()
    )
    festival_block, festival_meta = _load_festival_features(festival_csv_path, freq)
    income_dynamic, income_static, income_meta = _load_income_features(income_csv_path, freq)

    blocks: List[pd.DataFrame] = [
        request_block,
        shipment_block,
        batch_block,
        income_dynamic,
    ]
    blocks = [block for block in blocks if not block.empty]

    if blocks:
        features = _merge_blocks(blocks)
    else:
        features = pd.DataFrame(columns=KEY_COLUMNS)

    if not activity_keys.empty and not features.empty:
        features = features.merge(activity_keys, on=KEY_COLUMNS, how="inner")

    # Festival CSV may only contain a single year's calendar (e.g., 2022). To let
    # festival seasonality inform 2026+ snapshots, we merge festivals by
    # (state, district, month-of-year) instead of exact year.
    if not festival_block.empty and not features.empty:
        # Use a temporary column name to avoid becoming a trained feature.
        features["__month_of_year"] = pd.to_datetime(features["period_start"], errors="coerce").dt.month
        features = features.merge(
            festival_block,
            left_on=["state", "district", "__month_of_year"],
            right_on=["state", "district", "month_of_year"],
            how="left",
        )

        festival_cols = [col for col in features.columns if isinstance(col, str) and col.startswith("festival_")]
        if festival_cols:
            features[festival_cols] = features[festival_cols].fillna(0.0)
        features.drop(columns=["__month_of_year", "month_of_year"], inplace=True, errors="ignore")

    if not income_static.empty:
        features = features.merge(income_static, on=["state", "district"], how="left")

    if not features.empty:
        features = features.sort_values(KEY_COLUMNS).reset_index(drop=True)
        features = _post_process(features)

    metadata = {
        "rows": int(len(features)),
        "feature_columns": [col for col in features.columns if col not in KEY_COLUMNS],
        "frequency": freq,
        "festival_records": festival_meta,
        "income_records": income_meta,
        "generated_at": pd.Timestamp.utcnow().isoformat(),
    }
    return features, metadata


def _prepare_nodes(nodes_df: pd.DataFrame) -> pd.DataFrame:
    if nodes_df is None or nodes_df.empty:
        LOGGER.warning("Node collection is empty; downstream joins may miss location metadata.")
        return pd.DataFrame(columns=["node_mongo_id", "state", "district", "type", "capacity_kg"])

    nodes = nodes_df.copy()
    if "_id" not in nodes.columns:
        raise ValueError("Nodes dataframe missing Mongo _id field.")

    nodes["node_mongo_id"] = nodes["_id"].astype(str)

    # Preserve name when available (useful for NGO org -> node mapping).
    if "name" not in nodes.columns:
        nodes["name"] = pd.NA

    # Backend A stores state-like info in regionId; some snapshots may already provide state.
    if "state" in nodes.columns:
        nodes["state"] = nodes["state"].astype("string").fillna("Unknown")
    elif "regionId" in nodes.columns:
        nodes["state"] = nodes["regionId"].astype("string").fillna("Unknown")
    else:
        nodes["state"] = "Unknown"

    if "district" in nodes.columns:
        nodes["district"] = nodes["district"].astype("string").fillna("Unknown")
    else:
        nodes["district"] = "Unknown"

    if "capacity_kg" in nodes.columns:
        nodes["capacity_kg"] = pd.to_numeric(nodes["capacity_kg"], errors="coerce")

    return nodes


def _normalize_batches(batches_df: pd.DataFrame) -> pd.DataFrame:
    if batches_df is None or batches_df.empty:
        LOGGER.warning("Batch collection is empty; production features will be zero.")
        return pd.DataFrame(
            columns=[
                "batch_mongo_id",
                "batchId",
                "originNode",
                "manufacture_date",
                "initial_quantity_kg",
                "current_quantity_kg",
                "freshnessPct",
                "shelf_life_hours",
            ]
        )

    batches = batches_df.copy()
    batches["batch_mongo_id"] = batches["_id"].astype(str)

    for field in ["originNode", "currentNode"]:
        if field in batches.columns:
            batches[field] = batches[field].astype(str)

    for field in ["manufacture_date", "expiry_iso"]:
        if field in batches.columns:
            batches[field] = pd.to_datetime(batches[field], errors="coerce")

    batches.rename(
        columns={
            "quantity_kg": "current_quantity_kg",
            "original_quantity_kg": "initial_quantity_kg",
        },
        inplace=True,
    )

    for field in ["current_quantity_kg", "initial_quantity_kg", "freshnessPct", "shelf_life_hours"]:
        if field in batches.columns:
            batches[field] = pd.to_numeric(batches[field], errors="coerce")
            
        # 🔒 HARD GUARANTEE REQUIRED COLUMNS EXIST (NO KEYERRORS DOWNSTREAM)
    required_defaults = {
        "initial_quantity_kg": 0.0,
        "current_quantity_kg": 0.0,
        "freshnessPct": 100.0,
        "shelf_life_hours": 72.0,
    }

    for col, default in required_defaults.items():
        if col not in batches.columns:
            batches[col] = default
        else:
            batches[col] = pd.to_numeric(batches[col], errors="coerce").fillna(default)


    return batches



def _prepare_request_features(
    requests_df: pd.DataFrame,
    nodes: pd.DataFrame,
    freq: str,
    ngos_df: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    if requests_df is None or requests_df.empty:
        LOGGER.info("No request documents found for the selected period.")
        return pd.DataFrame(columns=KEY_COLUMNS + ["requested_kg", "unique_food_types", "request_count"])

    requests = requests_df.copy()

    # Normalize schema differences across services:
    # - request id can be requestID, requestId, requestID/requestId, or _id
    if "requestId" not in requests.columns:
        if "requestID" in requests.columns:
            requests["requestId"] = requests["requestID"]
        else:
            requests["requestId"] = requests.get("_id")

    if "requesterNode" in requests.columns:
        requests["requesterNode"] = requests["requesterNode"].astype(str)
    else:
        requests["requesterNode"] = ""

    # Backend A uses requiredBefore; some snapshots use requiredBy_iso.
    if "requiredBy_iso" in requests.columns:
        required_col = "requiredBy_iso"
    elif "requiredBefore" in requests.columns:
        required_col = "requiredBefore"
    else:
        required_col = "requiredBy_iso"
    requests["requiredBy_iso"] = pd.to_datetime(requests.get(required_col), errors="coerce")

    # Optional: Map NGO org _id -> NGO Node _id by name so request joins work in training.
    # In live inference snapshots, requesterNode is already normalized to match nodes._id.
    if ngos_df is not None and not ngos_df.empty and not nodes.empty:
        try:
            ngo_org = ngos_df.copy()
            if "_id" in ngo_org.columns and "name" in ngo_org.columns and "name" in nodes.columns and "type" in nodes.columns:
                ngo_org["org_id"] = ngo_org["_id"].astype(str)
                ngo_org["name"] = ngo_org["name"].astype("string")

                ngo_nodes = nodes[nodes["type"].astype("string") == "ngo"].copy()
                ngo_nodes["name"] = ngo_nodes["name"].astype("string")

                org_name_by_id = dict(zip(ngo_org["org_id"].tolist(), ngo_org["name"].tolist()))
                node_id_by_name = dict(zip(ngo_nodes["name"].tolist(), ngo_nodes["node_mongo_id"].tolist()))

                mapped = []
                for raw in requests["requesterNode"].tolist():
                    org_name = org_name_by_id.get(raw)
                    mapped.append(node_id_by_name.get(org_name, raw))
                requests["requesterNode"] = pd.Series(mapped, index=requests.index).astype(str)
        except Exception:
            # Mapping is best-effort; never fail feature generation.
            pass
    requests["items"] = requests.get("items").apply(_normalize_request_items)

    exploded = requests.explode("items", ignore_index=True)
    exploded["items"] = exploded["items"].apply(lambda item: item if isinstance(item, dict) else {})
    exploded["required_kg"] = exploded["items"].apply(lambda item: float(item.get("required_kg", 0.0)))
    exploded["foodType"] = exploded["items"].apply(lambda item: item.get("foodType"))

    exploded = exploded.merge(
        nodes[["node_mongo_id", "state", "district"]],
        left_on="requesterNode",
        right_on="node_mongo_id",
        how="left",
    )

    exploded["period_start"] = _assign_period(exploded, "requiredBy_iso", freq)

    aggregated = (
        exploded.groupby(KEY_COLUMNS, dropna=False)
        .agg(
            requested_kg=("required_kg", "sum"),
            unique_food_types=("foodType", pd.Series.nunique),
            request_count=("requestId", "nunique"),
        )
        .reset_index()
    )

    aggregated["unique_food_types"] = aggregated["unique_food_types"].fillna(0.0)

    if "status" in requests.columns:
        status = requests.merge(
            nodes[["node_mongo_id", "state", "district"]],
            left_on="requesterNode",
            right_on="node_mongo_id",
            how="left",
        )
        status["period_start"] = _assign_period(status, "requiredBy_iso", freq)
        status_counts = (
            status.pivot_table(
                index=KEY_COLUMNS,
                columns="status",
                values="requestId",
                aggfunc="count",
                fill_value=0,
            )
            .reset_index()
        )
        status_counts.columns = [
            col if col in KEY_COLUMNS else f"request_status_{str(col).lower()}"
            for col in status_counts.columns
        ]
        aggregated = aggregated.merge(status_counts, on=KEY_COLUMNS, how="outer")

    return aggregated


def _prepare_shipment_features(
    shipments_df: pd.DataFrame,
    nodes: pd.DataFrame,
    batches: pd.DataFrame,
    freq: str,
) -> pd.DataFrame:
    if shipments_df is None or shipments_df.empty:
        LOGGER.info("No shipment documents found for the selected period.")
        return pd.DataFrame(
            columns=KEY_COLUMNS
            + [
                "incoming_shipments",
                "incoming_batches",
                "incoming_kg",
                "outgoing_shipments",
                "outgoing_batches",
                "outgoing_kg",
                "avg_travel_time_minutes",
            ]
        )

    shipments = shipments_df.copy()
    shipments["start_iso"] = pd.to_datetime(shipments.get("start_iso"), errors="coerce")
    shipments["batchIds"] = shipments.get("batchIds").apply(_normalize_id_list)

    for field in ["fromNode", "toNode"]:
        if field in shipments.columns:
            shipments[field] = shipments[field].astype(str)

    exploded = shipments.explode("batchIds", ignore_index=True)
    exploded["batchIds"] = exploded["batchIds"].astype(str)

    batch_lookup = pd.DataFrame()
    if not batches.empty:
        batch_lookup = batches[["batch_mongo_id", "initial_quantity_kg", "current_quantity_kg"]]

    if not batch_lookup.empty:
        exploded = exploded.merge(
            batch_lookup,
            left_on="batchIds",
            right_on="batch_mongo_id",
            how="left",
        )
        exploded["batch_payload_kg"] = exploded["initial_quantity_kg"].fillna(exploded["current_quantity_kg"])
    else:
        exploded["batch_payload_kg"] = np.nan

    exploded["batch_payload_kg"] = (
        pd.to_numeric(exploded["batch_payload_kg"], errors="coerce").fillna(0.0)
    )

    incoming = exploded.merge(
        nodes[["node_mongo_id", "state", "district"]],
        left_on="toNode",
        right_on="node_mongo_id",
        how="left",
    )
    incoming["period_start"] = _assign_period(incoming, "start_iso", freq)

    incoming_grouped = (
        incoming.groupby(KEY_COLUMNS, dropna=False)
        .agg(
            incoming_shipments=("shipmentId", "nunique"),
            incoming_batches=("batchIds", "count"),
            incoming_kg=("batch_payload_kg", "sum"),
            avg_travel_time_minutes=("travel_time_minutes", "mean"),
        )
        .reset_index()
    )

    outgoing = exploded.merge(
        nodes[["node_mongo_id", "state", "district"]],
        left_on="fromNode",
        right_on="node_mongo_id",
        how="left",
    )
    outgoing["period_start"] = _assign_period(outgoing, "start_iso", freq)

    outgoing_grouped = (
        outgoing.groupby(KEY_COLUMNS, dropna=False)
        .agg(
            outgoing_shipments=("shipmentId", "nunique"),
            outgoing_batches=("batchIds", "count"),
            outgoing_kg=("batch_payload_kg", "sum"),
        )
        .reset_index()
    )

    features = incoming_grouped.merge(outgoing_grouped, on=KEY_COLUMNS, how="outer")
    return features


def _prepare_batch_features(batches: pd.DataFrame, nodes: pd.DataFrame, freq: str) -> pd.DataFrame:
    if batches is None or batches.empty:
        return pd.DataFrame(
            columns=KEY_COLUMNS
            + ["produced_batches", "produced_kg", "avg_batch_freshness", "avg_shelf_life_hours"]
        )

    summary = batches.merge(
        nodes[["node_mongo_id", "state", "district"]],
        left_on="originNode",
        right_on="node_mongo_id",
        how="left",
    )
    summary["period_start"] = _assign_period(summary, "manufacture_date", freq)

    batch_id_col = None
    for candidate in ("batchId", "batchID", "_id", "id"):
        if candidate in summary.columns:
            batch_id_col = candidate
            break

    quantity_col = None
    for candidate in ("original_quantity_kg", "initial_quantity_kg", "quantity_kg"):
        if candidate in summary.columns:
            quantity_col = candidate
            break

    if batch_id_col is None:
        summary["__batch_id"] = summary.index.astype(str)
        batch_id_col = "__batch_id"

    if quantity_col is None:
        summary["__produced_kg"] = 0.0
        quantity_col = "__produced_kg"

    summary[quantity_col] = pd.to_numeric(summary[quantity_col], errors="coerce").fillna(0.0)

    aggregated = (
        summary.groupby(KEY_COLUMNS, dropna=False)
        .agg(
            produced_batches=(batch_id_col, "nunique"),
            produced_kg=(quantity_col, "sum"),
            avg_batch_freshness=("freshnessPct", "mean"),
            avg_shelf_life_hours=("shelf_life_hours", "mean"),
        )
        .reset_index()
    )

    return aggregated


def _load_festival_features(path: Optional[str], freq: str) -> Tuple[pd.DataFrame, Dict[str, object]]:
    meta: Dict[str, object] = {"source_path": path, "records": 0, "festivals": [], "mode": "none"}
    if not path:
        return pd.DataFrame(), meta

    file_path = Path(path)
    if not file_path.exists():
        LOGGER.warning("Festival feature file %s not found; skipping.", path)
        return pd.DataFrame(), meta

    festival_df = pd.read_csv(file_path)
    required_cols = {"state", "district", "period_start", "festival", "celebration_pct"}
    missing = required_cols - set(festival_df.columns)
    if missing:
        raise ValueError(
            f"Festival CSV missing required columns: {sorted(missing)}. Found: {sorted(festival_df.columns)}"
        )

    festival_df["period_start"] = pd.to_datetime(festival_df["period_start"], errors="coerce")
    festival_df.dropna(subset=["period_start"], inplace=True)

    # We still respect the requested aggregation freq for bucketing, but we merge
    # to operational rows by seasonality bucket (month-of-year) so the calendar
    # generalizes beyond the single year provided in the CSV.
    festival_df["period_start"] = festival_df["period_start"].dt.to_period(freq).dt.start_time
    if str(freq).upper() != "M":
        LOGGER.warning(
            "Festival seasonality generalization currently assumes monthly aggregation (freq='M'); got freq=%s. Falling back to exact period_start merge.",
            freq,
        )
        meta["mode"] = "exact"
        index_cols = KEY_COLUMNS
    else:
        festival_df["month_of_year"] = festival_df["period_start"].dt.month
        meta["mode"] = "month_of_year"
        index_cols = ["state", "district", "month_of_year"]

    festival_df["celebration_pct"] = pd.to_numeric(
        festival_df["celebration_pct"], errors="coerce"
    ).fillna(0.0)

    pivot = (
        festival_df.pivot_table(
            index=index_cols,
            columns="festival",
            values="celebration_pct",
            aggfunc="max",
            fill_value=0.0,
        )
        .reset_index()
    )
    pivot.columns = [
        col
        if col in KEY_COLUMNS or col == "month_of_year"
        else f"festival_{str(col).lower().replace(' ', '_')}"
        for col in pivot.columns
    ]

    meta["records"] = int(len(festival_df))
    meta["festivals"] = sorted({str(val) for val in festival_df["festival"].unique()})
    return pivot, meta


def _load_income_features(
    path: Optional[str],
    freq: str,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, object]]:
    meta: Dict[str, object] = {"source_path": path, "records": 0, "mode": "static"}
    if not path:
        return pd.DataFrame(), pd.DataFrame(), meta

    file_path = Path(path)
    if not file_path.exists():
        LOGGER.warning("Income feature file %s not found; skipping.", path)
        return pd.DataFrame(), pd.DataFrame(), meta

    income_df = pd.read_csv(file_path)
    required_cols = {"state", "district", "per_capita_income"}
    missing = required_cols - set(income_df.columns)
    if missing:
        raise ValueError(
            f"Income CSV missing required columns: {sorted(missing)}. Found: {sorted(income_df.columns)}"
        )

    income_df["per_capita_income"] = pd.to_numeric(
        income_df["per_capita_income"], errors="coerce"
    )

    dynamic = pd.DataFrame()
    if "period_start" in income_df.columns:
        income_df["period_start"] = pd.to_datetime(income_df["period_start"], errors="coerce")
        income_df.dropna(subset=["period_start"], inplace=True)
        income_df["period_start"] = income_df["period_start"].dt.to_period(freq).dt.start_time
        dynamic = income_df[KEY_COLUMNS + ["per_capita_income"]]
        meta["mode"] = "time_variant"
    static = (
        income_df[["state", "district", "per_capita_income"]]
        .drop_duplicates(subset=["state", "district"], keep="last")
        .reset_index(drop=True)
    )

    meta["records"] = int(len(income_df))
    return dynamic, static, meta


def _merge_blocks(blocks: List[pd.DataFrame]) -> pd.DataFrame:
    def normalize_keys(frame: pd.DataFrame) -> pd.DataFrame:
        normalized = frame.copy()
        for col in KEY_COLUMNS:
            if col not in normalized.columns:
                normalized[col] = pd.NA

        # Ensure merge keys are consistent across blocks.
        for col in ("state", "district"):
            normalized[col] = (
                normalized[col]
                .astype("string")
                .fillna("Unknown")
                .astype(object)
            )

        normalized["period_start"] = pd.to_datetime(
            normalized["period_start"], errors="coerce"
        )

        return normalized

    normalized_blocks = [normalize_keys(block) for block in blocks]

    merged = normalized_blocks[0]
    for block in normalized_blocks[1:]:
        merged = merged.merge(block, on=KEY_COLUMNS, how="outer")
    return merged


def _post_process(features: pd.DataFrame) -> pd.DataFrame:
    features["state"] = features["state"].fillna("Unknown")
    features["district"] = features["district"].fillna("Unknown")

    numeric_cols = features.select_dtypes(include=[np.number]).columns.tolist()
    for col in numeric_cols:
        if col == "per_capita_income":
            continue
        features[col] = features[col].fillna(0.0)

    if "per_capita_income" in features.columns:
        median_income = features["per_capita_income"].median()
        features["per_capita_income"] = features["per_capita_income"].fillna(median_income)

    requested = _safe_series(features, "requested_kg")
    incoming = _safe_series(features, "incoming_kg")
    outgoing = _safe_series(features, "outgoing_kg")
    produced = _safe_series(features, "produced_kg")

    features["supply_demand_gap_kg"] = incoming - requested
    features["net_flow_kg"] = incoming - outgoing
    features["production_vs_demand_ratio"] = np.where(
        requested > 0,
        produced / requested,
        0.0,
    )
    features["request_to_supply_ratio"] = np.where(
        incoming > 0,
        requested / incoming,
        0.0,
    )

    return features


def _assign_period(frame: pd.DataFrame, column: str, freq: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(pd.NaT, index=frame.index)
    series = pd.to_datetime(frame[column], errors="coerce")
    period = series.dt.to_period(freq)
    return period.dt.start_time


def _normalize_request_items(payload) -> List[dict]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        return [payload]
    if pd.isna(payload):
        return []
    return []


def _normalize_id_list(payload) -> List[object]:
    if isinstance(payload, list):
        return payload
    if pd.isna(payload):
        return []
    return [payload]


def _safe_series(frame: pd.DataFrame, column: str) -> pd.Series:
    if column in frame.columns:
        return pd.to_numeric(frame[column], errors="coerce").fillna(0.0)
    return pd.Series(0.0, index=frame.index, dtype=float)
