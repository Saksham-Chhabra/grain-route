"""Generate richer external CSV features for demo/training.

Creates:
- data/income_features_2023_2026.csv: monthly per-capita income for 2023-01..2026-02
- data/festival_features_2022_2026.csv: festival calendar replicated across years 2022..2026

These are intentionally synthetic expansions to provide multi-year coverage for model training.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

INCOME_IN = DATA_DIR / "income_features.csv"
FESTIVAL_IN = DATA_DIR / "festival_features.csv"

INCOME_OUT = DATA_DIR / "income_features_2023_2026.csv"
FESTIVAL_OUT = DATA_DIR / "festival_features_2022_2026.csv"


def _stable_unit_float(text: str) -> float:
    h = hashlib.sha256(text.encode("utf-8")).digest()
    # Use first 8 bytes as uint64 to produce stable [0,1)
    as_int = int.from_bytes(h[:8], "big", signed=False)
    return (as_int % (10**12)) / float(10**12)


def generate_income(start: str = "2023-01-01", end: str = "2026-02-01") -> None:
    if not INCOME_IN.exists():
        raise FileNotFoundError(INCOME_IN)

    df = pd.read_csv(INCOME_IN)
    if not {"state", "district", "per_capita_income"}.issubset(df.columns):
        raise ValueError("income_features.csv must contain state,district,per_capita_income")

    base = (
        df[["state", "district", "per_capita_income"]]
        .copy()
        .dropna(subset=["state", "district"])
        .drop_duplicates(subset=["state", "district"], keep="last")
    )
    base["per_capita_income"] = pd.to_numeric(base["per_capita_income"], errors="coerce")
    base["per_capita_income"] = base["per_capita_income"].fillna(base["per_capita_income"].median())

    periods = pd.date_range(start=start, end=end, freq="MS", tz="UTC").tz_localize(None)
    rows: list[dict] = []

    for _, r in base.iterrows():
        state = str(r["state"])
        district = str(r["district"])
        income0 = float(r["per_capita_income"])

        # Stable per-district growth (3%..9% annually)
        u = _stable_unit_float(f"growth|{state}|{district}")
        annual_growth = 0.03 + u * 0.06
        monthly_growth = (1.0 + annual_growth) ** (1.0 / 12.0)

        # Stable per-district volatility (0.5%..2.0% monthly)
        v = _stable_unit_float(f"vol|{state}|{district}")
        vol = 0.005 + v * 0.015

        level = income0
        for p in periods:
            # Small seasonal component by month (district-specific phase)
            phase = _stable_unit_float(f"phase|{state}|{district}") * 2.0 * np.pi
            seasonal = 1.0 + 0.01 * np.sin((p.month / 12.0) * 2.0 * np.pi + phase)

            # Deterministic pseudo-noise based on (district, period)
            noise_u = _stable_unit_float(f"noise|{state}|{district}|{p.date().isoformat()}")
            noise = (noise_u * 2.0 - 1.0) * vol

            level = level * monthly_growth
            income_t = max(1000.0, level * seasonal * (1.0 + noise))

            rows.append(
                {
                    "state": state,
                    "district": district,
                    "per_capita_income": round(income_t, 2),
                    "period_start": p.date().isoformat(),
                }
            )

    out = pd.DataFrame(rows)
    out.to_csv(INCOME_OUT, index=False)


def generate_festivals(start_year: int = 2022, end_year: int = 2026) -> None:
    if not FESTIVAL_IN.exists():
        raise FileNotFoundError(FESTIVAL_IN)

    df = pd.read_csv(FESTIVAL_IN)
    required = {"state", "district", "period_start", "festival", "celebration_pct"}
    if not required.issubset(df.columns):
        raise ValueError("festival_features.csv must contain state,district,period_start,festival,celebration_pct")

    df = df.copy()
    df["period_start"] = pd.to_datetime(df["period_start"], errors="coerce")
    df = df.dropna(subset=["period_start"])

    rows: list[dict] = []
    for _, r in df.iterrows():
        dt: pd.Timestamp = pd.Timestamp(r["period_start"])
        month = int(dt.month)
        day = int(dt.day)
        base_year = int(dt.year)

        for year in range(start_year, end_year + 1):
            # Keep the original row's year if it falls in range; otherwise replicate.
            if year == base_year or base_year < start_year or base_year > end_year:
                try:
                    new_dt = pd.Timestamp(year=year, month=month, day=day)
                except ValueError:
                    # Handle invalid dates like Feb 29 in non-leap years.
                    new_dt = pd.Timestamp(year=year, month=month, day=min(day, 28))

                rows.append(
                    {
                        "state": r["state"],
                        "district": r["district"],
                        "period_start": new_dt.date().isoformat(),
                        "festival": r["festival"],
                        "celebration_pct": r["celebration_pct"],
                    }
                )

    out = pd.DataFrame(rows)
    out.to_csv(FESTIVAL_OUT, index=False)


def main() -> None:
    generate_income()
    generate_festivals()
    print(f"✅ Wrote {INCOME_OUT.relative_to(ROOT)}")
    print(f"✅ Wrote {FESTIVAL_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
