from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd

from .config import load_config
from .data_loader import MongoDataLoader
from .utils.logging import get_logger

LOGGER = get_logger(__name__)

DEFAULT_MODE = "all"
RELEVANT_BATCH_STATUSES = {"stored", "reserved"}
DEFAULT_WAREHOUSE_CAPACITY = 10000.0
DEFAULT_FARM_CAPACITY = 5000.0


@dataclass
class NodeInfo:
    mongo_id: str
    node_id: Optional[str]
    name: Optional[str]
    node_type: Optional[str]
    state: Optional[str]
    district: Optional[str]
    region_id: Optional[str]
    capacity_kg: float
    lat: Optional[float]
    lon: Optional[float]

    def to_payload(self, inventory: float) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "mongoId": self.mongo_id,
            "nodeId": self.node_id,
            "name": self.name,
            "type": self.node_type,
            "state": self.state,
            "district": self.district,
            "regionId": self.region_id,
            "capacity_kg": round(self.capacity_kg, 2),
            "inventory_kg": round(float(inventory), 2),
        }
        if self.lat is not None and self.lon is not None:
            payload["location"] = {"lat": float(self.lat), "lon": float(self.lon)}
        else:
            payload["location"] = None
        return payload


@dataclass
class WarehouseState:
    node: NodeInfo
    inventory: float

    def capacity(self) -> float:
        return max(self.node.capacity_kg, 0.0)

    def available_capacity(self) -> float:
        return max(self.capacity() - self.inventory, 0.0)

    def utilization(self) -> Optional[float]:
        cap = self.capacity()
        if cap <= 0:
            return None
        return self.inventory / cap

    def clone(self) -> "WarehouseState":
        return WarehouseState(node=self.node, inventory=self.inventory)


@dataclass
class FarmState:
    node: NodeInfo
    supply: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate transfer recommendations between nodes based on inventory imbalances.",
    )
    parser.add_argument(
        "--mode",
        choices=["all", "warehouse_to_warehouse", "farm_to_warehouse"],
        default=DEFAULT_MODE,
        help="Type of recommendations to compute.",
    )
    parser.add_argument(
        "--max-pairs",
        type=int,
        default=5,
        help="Maximum recommendations to return per transfer category.",
    )
    parser.add_argument(
        "--min-transfer-kg",
        type=float,
        default=200.0,
        help="Minimum tonnage to consider for any transfer suggestion.",
    )
    parser.add_argument(
        "--overstock-ratio",
        type=float,
        default=0.8,
        help="Warehouse utilization ratio above which a node is considered overstocked.",
    )
    parser.add_argument(
        "--understock-ratio",
        type=float,
        default=0.4,
        help="Warehouse utilization ratio below which a node is considered understocked.",
    )
    parser.add_argument(
        "--target-ratio",
        type=float,
        default=0.6,
        help="Target utilization ratio to balance warehouses and receiving nodes towards.",
    )
    return parser.parse_args()


def read_payload(stream: Any) -> Dict[str, Any]:
    raw = stream.read()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
        if isinstance(payload, dict):
            return payload
        return {}
    except json.JSONDecodeError:
        return {}


def ensure_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def normalize_filters(raw: Any) -> Dict[str, List[str]]:
    if not isinstance(raw, dict):
        return {}
    filters: Dict[str, List[str]] = {}
    for key in ["states", "districts", "types", "node_ids", "nodeIds", "regions"]:
        values = ensure_list(raw.get(key))
        if not values:
            continue
        canonical_key = "node_ids" if key in {"node_ids", "nodeIds"} else key
        filters[canonical_key] = [str(value).strip().lower() for value in values if str(value).strip()]
    return filters


def to_node_info(record: Dict[str, Any]) -> NodeInfo:
    location = record.get("location") or {}
    coordinates = location.get("coordinates") if isinstance(location, dict) else None
    lon: Optional[float] = None
    lat: Optional[float] = None
    if isinstance(coordinates, (list, tuple)) and len(coordinates) == 2:
        try:
            lon = float(coordinates[0])
            lat = float(coordinates[1])
        except (TypeError, ValueError):
            lon = None
            lat = None

    capacity = record.get("capacity_kg")
    try:
        capacity_value = float(capacity) if capacity is not None else 0.0
    except (TypeError, ValueError):
        capacity_value = 0.0

    # Prefer Mongo _id; fall back to common alternatives present in payloads
    raw_id = (
        record.get("_id")
        or record.get("mongoId")
        or record.get("nodeId")
        or record.get("id")
    )
    mongo_id = str(raw_id) if raw_id is not None else ""

    raw_type = record.get("type")
    if isinstance(raw_type, str):
        cleaned_type = raw_type.strip().lower() or None
    else:
        cleaned_type = None

    raw_state = record.get("state")
    state_value = (
        raw_state.strip() if isinstance(raw_state, str) and raw_state.strip() else None
    )

    raw_district = record.get("district")
    district_value = (
        raw_district.strip()
        if isinstance(raw_district, str) and raw_district.strip()
        else None
    )

    if cleaned_type == "warehouse" and capacity_value <= 0:
        capacity_value = DEFAULT_WAREHOUSE_CAPACITY
    elif cleaned_type == "farm" and capacity_value <= 0:
        capacity_value = DEFAULT_FARM_CAPACITY

    return NodeInfo(
        mongo_id=mongo_id,
        node_id=record.get("nodeId"),
        name=record.get("name"),
        node_type=cleaned_type,
        state=state_value,
        district=district_value,
        region_id=record.get("regionId"),
        capacity_kg=capacity_value,
        lat=lat,
        lon=lon,
    )


def apply_filters(nodes: Iterable[NodeInfo], filters: Dict[str, List[str]]) -> List[NodeInfo]:
    if not filters:
        return list(nodes)

    state_filter = set(filters.get("states", []))
    district_filter = set(filters.get("districts", []))
    type_filter = set(filters.get("types", []))
    node_id_filter = set(filters.get("node_ids", []))
    region_filter = set(filters.get("regions", []))

    filtered: List[NodeInfo] = []
    for node in nodes:
        if state_filter and (node.state or "").lower() not in state_filter:
            continue
        if district_filter and (node.district or "").lower() not in district_filter:
            continue
        if type_filter and (node.node_type or "") not in type_filter:
            continue
        if node_id_filter:
            identifier_matches = False
            if node.node_id and node.node_id.lower() in node_id_filter:
                identifier_matches = True
            if node.mongo_id.lower() in node_id_filter:
                identifier_matches = True
            if not identifier_matches:
                continue
        if region_filter and (node.region_id or "").lower() not in region_filter:
            continue
        filtered.append(node)
    return filtered


def compute_inventory_maps(batches: pd.DataFrame) -> Tuple[Dict[str, float], Dict[str, float]]:
    if batches is None or batches.empty:
        return {}, {}

    working = batches.copy()
    # Normalize column shapes coming from various producers
    if "currentNode" not in working.columns and "originNode" in working.columns:
        working["currentNode"] = working["originNode"]
    else:
        working["currentNode"] = working.get("currentNode")

    working["currentNode"] = working["currentNode"].apply(lambda value: str(value) if value else None)
    working["originNode"] = working.get("originNode").apply(lambda value: str(value) if value else None)

    if "current_quantity_kg" not in working.columns and "quantity_kg" in working.columns:
        working["current_quantity_kg"] = working["quantity_kg"]
    working["current_quantity_kg"] = pd.to_numeric(working.get("current_quantity_kg"), errors="coerce").fillna(0.0)
    if "status" in working.columns:
        working["status"] = working["status"].astype(str).str.lower()
    else:
        working["status"] = "stored"

    relevant = working[working["status"].isin(RELEVANT_BATCH_STATUSES)]

    inventory_series = (
        relevant.dropna(subset=["currentNode"])
        .groupby("currentNode")["current_quantity_kg"]
        .sum()
    )
    inventory_map = {str(index): float(value) for index, value in inventory_series.items()}

    farm_series = (
        relevant[(relevant["originNode"] == relevant["currentNode"]) & relevant["originNode"].notna()]
        .groupby("originNode")["current_quantity_kg"]
        .sum()
    )
    farm_map = {str(index): float(value) for index, value in farm_series.items()}
    return inventory_map, farm_map


def haversine_km(point_a: NodeInfo, point_b: NodeInfo) -> Optional[float]:
    if (
        point_a.lat is None
        or point_a.lon is None
        or point_b.lat is None
        or point_b.lon is None
    ):
        return None
    lat1 = math.radians(point_a.lat)
    lat2 = math.radians(point_b.lat)
    diff_lat = lat2 - lat1
    diff_lon = math.radians(point_b.lon - point_a.lon)
    sin_lat = math.sin(diff_lat / 2.0)
    sin_lon = math.sin(diff_lon / 2.0)
    a = sin_lat * sin_lat + math.cos(lat1) * math.cos(lat2) * sin_lon * sin_lon
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return 6371.0 * c


def format_pct(value: Optional[float]) -> Optional[float]:
    if value is None or math.isnan(value):
        return None
    return round(value * 100.0, 1)


def node_projection_payload(
    state: WarehouseState,
    inventory_before: float,
    inventory_after: float,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = state.node.to_payload(inventory_before)
    payload["projected_inventory_kg"] = round(inventory_after, 2)
    payload["available_capacity_kg"] = round(max(state.node.capacity_kg - inventory_after, 0.0), 2)
    payload["utilization_pct"] = format_pct(
        inventory_before / state.node.capacity_kg if state.node.capacity_kg > 0 else None
    )
    payload["projected_utilization_pct"] = format_pct(
        inventory_after / state.node.capacity_kg if state.node.capacity_kg > 0 else None
    )
    if extra:
        payload.update(extra)
    return payload


def farm_payload(
    farm: FarmState,
    supply_before: float,
    supply_after: float,
) -> Dict[str, Any]:
    payload = farm.node.to_payload(supply_before)
    payload["remaining_supply_kg"] = round(supply_after, 2)
    payload["type"] = farm.node.node_type
    return payload


def plan_warehouse_transfers(
    warehouses: List[WarehouseState],
    max_pairs: int,
    min_transfer: float,
    overstock_ratio: float,
    understock_ratio: float,
    target_ratio: float,
) -> List[Dict[str, Any]]:
    candidates = warehouses
    overstock: List[Dict[str, Any]] = []
    understock: List[Dict[str, Any]] = []

    for state in candidates:
        capacity = state.capacity()
        if capacity <= 0:
            continue

        utilization = state.utilization() or 0.0
        target_inventory = capacity * target_ratio

        if utilization > overstock_ratio and state.inventory > target_inventory:
            excess = state.inventory - target_inventory
            if excess >= min_transfer:
                overstock.append({"state": state, "excess": excess})

        if utilization < understock_ratio:
            shortage = target_inventory - state.inventory
            if shortage >= min_transfer:
                understock.append({"state": state, "shortage": shortage})

    if not overstock or not understock:
        return []

    overstock.sort(key=lambda entry: entry["state"].utilization() or 0.0, reverse=True)
    understock.sort(key=lambda entry: entry["state"].utilization() or 0.0)

    recommendations: List[Dict[str, Any]] = []

    for over_entry in overstock:
        if len(recommendations) >= max_pairs:
            break

        available = over_entry["excess"]
        source_state: WarehouseState = over_entry["state"]

        sorted_targets = sorted(
            understock,
            key=lambda entry: haversine_km(source_state.node, entry["state"].node)
            if haversine_km(source_state.node, entry["state"].node) is not None
            else float("inf"),
        )

        for target_entry in sorted_targets:
            if len(recommendations) >= max_pairs or available < min_transfer:
                break

            target_state: WarehouseState = target_entry["state"]
            shortage = target_entry["shortage"]
            if shortage < min_transfer:
                continue

            distance = haversine_km(source_state.node, target_state.node)
            if distance is None:
                continue

            transfer_amount = min(available, shortage)
            if transfer_amount < min_transfer:
                continue

            source_before = source_state.inventory
            target_before = target_state.inventory

            source_after = max(source_before - transfer_amount, 0.0)
            target_after = target_before + transfer_amount

            recommendation = {
                "type": "warehouse_to_warehouse",
                "suggested_quantity_kg": round(transfer_amount, 2),
                "distance_km": round(distance, 3),
                "source": node_projection_payload(
                    source_state,
                    source_before,
                    source_after,
                    extra={
                        "excess_before_kg": round(max(source_before - source_state.capacity() * target_ratio, 0.0), 2),
                    },
                ),
                "target": node_projection_payload(
                    target_state,
                    target_before,
                    target_after,
                    extra={
                        "shortage_before_kg": round(max(target_state.capacity() * target_ratio - target_before, 0.0), 2),
                    },
                ),
                "notes": (
                    "Balance utilization by shifting inventory from an overstocked warehouse to a low-utilization peer."
                ),
            }

            recommendations.append(recommendation)

            available -= transfer_amount
            over_entry["excess"] = available
            target_entry["shortage"] = shortage - transfer_amount

            source_state.inventory = source_after
            target_state.inventory = target_after

    return recommendations[:max_pairs]


def plan_farm_to_warehouse(
    farms: List[FarmState],
    warehouses: List[WarehouseState],
    max_pairs: int,
    min_transfer: float,
    target_ratio: float,
) -> List[Dict[str, Any]]:
    if not farms or not warehouses:
        return []

    warehouses_sorted = warehouses

    recommendations: List[Dict[str, Any]] = []

    for farm_state in sorted(farms, key=lambda entry: entry.supply, reverse=True):
        if len(recommendations) >= max_pairs:
            break

        available_supply = farm_state.supply
        if available_supply < min_transfer:
            continue

        candidate_warehouses = sorted(
            warehouses_sorted,
            key=lambda state: haversine_km(farm_state.node, state.node)
            if haversine_km(farm_state.node, state.node) is not None
            else float("inf"),
        )

        for warehouse_state in candidate_warehouses:
            if len(recommendations) >= max_pairs or available_supply < min_transfer:
                break

            distance = haversine_km(farm_state.node, warehouse_state.node)
            if distance is None:
                continue

            capacity = warehouse_state.capacity()
            if capacity <= 0:
                continue

            target_inventory = capacity * target_ratio
            if warehouse_state.inventory >= target_inventory:
                continue

            receivable = min(
                max(target_inventory - warehouse_state.inventory, 0.0),
                warehouse_state.available_capacity(),
            )
            if receivable < min_transfer:
                continue

            transfer_amount = min(available_supply, receivable)
            if transfer_amount < min_transfer:
                continue

            source_before = available_supply
            source_after = max(available_supply - transfer_amount, 0.0)

            target_before = warehouse_state.inventory
            target_after = target_before + transfer_amount

            recommendations.append(
                {
                    "type": "farm_to_warehouse",
                    "suggested_quantity_kg": round(transfer_amount, 2),
                    "distance_km": round(distance, 3),
                    "source": farm_payload(farm_state, source_before, source_after),
                    "target": node_projection_payload(
                        warehouse_state,
                        target_before,
                        target_after,
                        extra={
                            "shortage_before_kg": round(max(target_inventory - target_before, 0.0), 2),
                        },
                    ),
                    "notes": "Route fresh harvest from farm to nearest warehouse with available capacity.",
                }
            )

            available_supply = source_after
            warehouse_state.inventory = target_after

    farm_state.supply = available_supply

    return recommendations[:max_pairs]


def validate_parameters(args: argparse.Namespace) -> None:
    if args.target_ratio <= 0 or args.target_ratio > 1:
        raise ValueError("target-ratio must be in (0, 1].")
    if not 0 < args.understock_ratio < args.overstock_ratio <= 1:
        raise ValueError("Ensure 0 < understock-ratio < overstock-ratio <= 1.")
    if args.min_transfer_kg <= 0:
        raise ValueError("min-transfer-kg must be positive.")
    if args.max_pairs <= 0:
        raise ValueError("max-pairs must be positive.")


def main() -> None:
    args = parse_args()
    validate_parameters(args)

    payload = read_payload(sys.stdin)
    filters = normalize_filters(payload.get("filters"))
    # Allow payload-driven mode (preferred when Server supplies nodes/batches).
    nodes_df: pd.DataFrame
    batches_df: pd.DataFrame

    if isinstance(payload, dict) and (
        isinstance(payload.get("nodes"), list)
        or isinstance(payload.get("batches"), list)
    ):
        nodes_df = pd.DataFrame(payload.get("nodes") or [])
        batches_df = pd.DataFrame(payload.get("batches") or [])
    else:
        # Fallback to Mongo-backed loader
        config = load_config()
        loader = MongoDataLoader(config.mongo_uri, config.mongo_db)
        try:
            nodes_df = loader.fetch_nodes()
            batches_df = loader.fetch_batches()
        finally:
            loader.close()

    node_infos = [to_node_info(record) for record in nodes_df.to_dict("records")]
    filtered_nodes = apply_filters(node_infos, filters)

    inventory_map, farm_map = compute_inventory_maps(batches_df)

    warehouses = [
        WarehouseState(node=node, inventory=float(inventory_map.get(node.mongo_id, 0.0)))
        for node in filtered_nodes
        if node.node_type == 'warehouse'
    ]
    warehouses_for_farm = [state.clone() for state in warehouses]

    farms = [
        FarmState(node=node, supply=float(farm_map.get(node.mongo_id, 0.0)))
        for node in filtered_nodes
        if node.node_type == 'farm'
    ]

    warehouse_recommendations: List[Dict[str, Any]] = []
    farm_recommendations: List[Dict[str, Any]] = []

    if args.mode in {"all", "warehouse_to_warehouse"}:
        warehouse_recommendations = plan_warehouse_transfers(
            warehouses=warehouses,
            max_pairs=args.max_pairs,
            min_transfer=args.min_transfer_kg,
            overstock_ratio=args.overstock_ratio,
            understock_ratio=args.understock_ratio,
            target_ratio=args.target_ratio,
        )

    if args.mode in {"all", "farm_to_warehouse"}:
        farm_recommendations = plan_farm_to_warehouse(
            farms=[farm for farm in farms if farm.supply >= args.min_transfer_kg],
            warehouses=warehouses_for_farm,
            max_pairs=args.max_pairs,
            min_transfer=args.min_transfer_kg,
            target_ratio=args.target_ratio,
        )

    result = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "mode": args.mode,
        "parameters": {
            "max_pairs": args.max_pairs,
            "min_transfer_kg": args.min_transfer_kg,
            "overstock_ratio": args.overstock_ratio,
            "understock_ratio": args.understock_ratio,
            "target_ratio": args.target_ratio,
        },
        "filters": {key: sorted(values) for key, values in filters.items()},
        "counts": {
            "warehouse_to_warehouse": len(warehouse_recommendations),
            "farm_to_warehouse": len(farm_recommendations),
        },
        "warehouse_to_warehouse": warehouse_recommendations,
        "farm_to_warehouse": farm_recommendations,
    }

    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
