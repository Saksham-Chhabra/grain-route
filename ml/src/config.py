import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


@dataclass
class TrainingConfig:
    mongo_uri: str
    mongo_db: Optional[str]
    feature_frequency: str
    output_dir: str
    kmeans_clusters: int
    isolation_contamination: float
    random_state: int
    festival_csv_path: Optional[str]
    income_csv_path: Optional[str]


def _get_env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        raise ValueError(f"Environment variable {name} must be a float, got '{raw}'")


def _get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"Environment variable {name} must be an integer, got '{raw}'")


def load_config() -> TrainingConfig:
    return TrainingConfig(
        mongo_uri=os.getenv("MONGODB_URI", "mongodb://localhost:27017/food_net"),
        mongo_db=os.getenv("MONGODB_DB_NAME"),
        feature_frequency=os.getenv("ML_FEATURE_FREQ", "W"),
    output_dir=os.getenv("ML_OUTPUT_DIR", "artifacts"),
        kmeans_clusters=_get_env_int("ML_KMEANS_CLUSTERS", 6),
        isolation_contamination=_get_env_float("ML_IFOREST_CONTAMINATION", 0.05),
        random_state=_get_env_int("ML_RANDOM_STATE", 42),
        festival_csv_path=os.getenv("FESTIVAL_FEATURES_CSV"),
        income_csv_path=os.getenv("INCOME_FEATURES_CSV"),
    )
