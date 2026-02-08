from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
GDP_CSV = DATA_DIR / "gdp.csv"
CENSUS_CSV = DATA_DIR / "census2011.csv"
OUTPUT_CSV = DATA_DIR / "income_features.csv"


def _load_gdp() -> pd.DataFrame:
    df = pd.read_csv(GDP_CSV)
    df.columns = [col.strip() for col in df.columns]
    df["year"] = (
        df["Year"].astype(str).str.extract(r"(\d{4})", expand=False).astype(int)
    )
    df = df[df["year"] == 2011].copy()
    df["gdp_million_rs"] = pd.to_numeric(
        df["TOTAL CURRENT PRICES (Millions in Rs)"].astype(str).str.replace(",", "", regex=False),
        errors="coerce",
    )
    df["state"] = df["State Name"].astype(str).str.strip()
    df["district"] = df["Dist Name"].astype(str).str.strip()
    return df[["state", "district", "gdp_million_rs"]]


def _load_population() -> pd.DataFrame:
    df = pd.read_csv(CENSUS_CSV)
    df.columns = [col.strip() for col in df.columns]
    df["state"] = df["State"].astype(str).str.strip()
    df["district"] = df["District"].astype(str).str.strip()
    df["population"] = pd.to_numeric(
        df["Population"].astype(str).str.replace(",", "", regex=False), errors="coerce"
    )
    df = df.dropna(subset=["population"])
    return df[["state", "district", "population"]]


def _normalise(text: Any) -> str:
    if text is None or (isinstance(text, float) and math.isnan(text)):
        return ""
    return (
        str(text)
        .strip()
        .lower()
    )


def main() -> None:
    gdp_df = _load_gdp()
    pop_df = _load_population()

    gdp_df["state_key"] = gdp_df["state"].apply(_normalise)
    gdp_df["district_key"] = gdp_df["district"].apply(_normalise)

    pop_df["state_key"] = pop_df["state"].apply(_normalise)
    pop_df["district_key"] = pop_df["district"].apply(_normalise)

    merged = gdp_df.merge(
        pop_df,
        on=["state_key", "district_key"],
        how="inner",
        suffixes=("_gdp", "_pop"),
    )

    if merged.empty:
        raise SystemExit("No matching state/district names between GDP and census files.")

    merged["per_capita_income"] = (
        merged["gdp_million_rs"] * 1_000_000
    ) / merged["population"]

    merged["per_capita_income"] = merged["per_capita_income"].round(2)
    merged["period_start"] = "2011-04-01"

    result = merged[["state_gdp", "district_gdp", "per_capita_income", "period_start"]].rename(
        columns={
            "state_gdp": "state",
            "district_gdp": "district",
        }
    ).sort_values(["state", "district"]).reset_index(drop=True)

    result.to_csv(OUTPUT_CSV, index=False)


if __name__ == "__main__":
    main()
