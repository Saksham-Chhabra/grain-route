"""Generate district-level festival celebration percentages.

The script derives per-festival participation estimates by combining a curated
set of heuristics with 2011 Census state-level religion shares exposed via
https://www.census2011.co.in/. Festival-to-religion/state mappings follow
public references such as Encyclopaedia Britannica, Kerala Tourism, and
OfficeHolidays (which records gazetted nationwide observances for India).
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, Optional

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FESTIVAL_CSV = DATA_DIR / "festivals_kaggle.csv"
INCOME_CSV = DATA_DIR / "income_features.csv"
OUTPUT_CSV = DATA_DIR / "festival_features.csv"

RELIGION_URLS = {
    "hindu": "https://www.census2011.co.in/data/religion/1-hinduism.html",
    "muslim": "https://www.census2011.co.in/data/religion/2-muslims.html",
    "christian": "https://www.census2011.co.in/data/religion/3-christianity.html",
    "sikh": "https://www.census2011.co.in/data/religion/4-sikhism.html",
    "buddhist": "https://www.census2011.co.in/data/religion/5-buddhism.html",
    "jain": "https://www.census2011.co.in/data/religion/6-jainism.html",
}

RELIGION_COLUMN_SUFFIX = {
    "hindu": "Hindu %",
    "muslim": "Muslim %",
    "christian": "Christian %",
    "sikh": "Sikh %",
    "buddhist": "Buddhist %",
    "jain": "Jain %",
}


@dataclass(frozen=True)
class FestivalRule:
    religions: Dict[str, float] | None = None
    multiplier: float = 1.0
    value: Optional[float] = None
    states: Optional[Iterable[str]] = None
    exclude_states: Optional[Iterable[str]] = None
    min_value: float = 0.0
    max_value: float = 1.0
    state_overrides: Optional[Dict[str, float]] = None
    threshold: float = 0.01

    def applies_to(self, state: str) -> bool:
        if self.states is not None and state not in set(self.states):
            return False
        if self.exclude_states is not None and state in set(self.exclude_states):
            return False
        return True


# Heuristics informed by public references:
# - National civic holidays: OfficeHolidays notes that Republic Day,
#   Independence Day, and Gandhi Jayanti are the only nationwide mandatory
#   observances.
# - Religious festival reach: Encyclopaedia Britannica articles for Holi,
#   Diwali, Janmashtami, etc., describe them as principal Hindu festivals,
#   supporting a high proportion of adherents. Sikh heritage festivals follow
#   SGPC calendars, while Muslim observances leverage Pew Research summaries of
#   faithful participation.
# - Regional festivals: Kerala Tourism (Onam), Odisha Tourism (Rath Yatra), and
#   Maharashtra tourism guides (Ganesh Chaturthi/Shivaji Jayanti) confirm strong
#   local penetration, so the rules clamp participation to those states.
FESTIVAL_RULES: Dict[str, FestivalRule] = {
    "New Year's Day": FestivalRule(value=0.65),
    "Guru Govind Singh Jayanti": FestivalRule(religions={"sikh": 0.95}, multiplier=1.0),
    "Lohri": FestivalRule(religions={"sikh": 0.6, "hindu": 0.4}, multiplier=0.85, states={"Punjab", "Haryana", "Himachal Pradesh"}),
    "Makar Sankranti": FestivalRule(religions={"hindu": 1.0}, multiplier=0.8),
    "Pongal": FestivalRule(religions={"hindu": 1.0}, multiplier=0.95, states={"Tamil Nadu"}),
    "Republic Day": FestivalRule(value=0.95),
    "Vasant Panchami": FestivalRule(religions={"hindu": 1.0}, multiplier=0.6, states={"West Bengal", "Odisha", "Assam", "Bihar", "Uttar Pradesh", "Rajasthan", "Haryana", "Madhya Pradesh"}),
    "Hazarat Ali's Birthday": FestivalRule(religions={"muslim": 1.0}, multiplier=0.6),
    "Guru Ravidas Jayanti": FestivalRule(religions={"hindu": 1.0}, multiplier=0.4, states={"Punjab", "Haryana", "Himachal Pradesh", "Uttar Pradesh"}),
    "Shivaji Jayanti": FestivalRule(value=0.7, states={"Maharashtra"}),
    "Maharishi Dayanand Saraswati Jayanti": FestivalRule(religions={"hindu": 1.0}, multiplier=0.4, states={"Haryana", "Rajasthan", "Gujarat", "Uttar Pradesh", "Punjab", "Madhya Pradesh"}),
    "Maha Shivaratri/Shivaratri": FestivalRule(religions={"hindu": 1.0}, multiplier=0.8),
    "Holika Dahana": FestivalRule(religions={"hindu": 1.0}, multiplier=0.8),
    "Dolyatra": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"West Bengal", "Assam", "Odisha"}),
    "Holi": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85),
    "Chaitra Sukhladi": FestivalRule(religions={"hindu": 1.0}, multiplier=0.7, states={"Rajasthan", "Punjab", "Haryana", "Uttar Pradesh", "Madhya Pradesh", "Himachal Pradesh"}),
    "Gudi Padwa": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"Maharashtra"}),
    "Ugadi": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"Andhra Pradesh", "Karnataka"}),
    "Rama Navami": FestivalRule(religions={"hindu": 1.0}, multiplier=0.8),
    "Ambedkar Jayanti": FestivalRule(value=0.75),
    "Mahavir Jayanti": FestivalRule(religions={"jain": 1.0}, multiplier=0.95),
    "Mesadi / Vaisakhadi": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"Gujarat"}),
    "Vaisakhi": FestivalRule(religions={"sikh": 0.7, "hindu": 0.3}, multiplier=0.9, states={"Punjab", "Haryana", "Himachal Pradesh"}),
    "Good Friday": FestivalRule(religions={"christian": 1.0}, multiplier=0.95),
    "Easter Day": FestivalRule(religions={"christian": 1.0}, multiplier=0.9),
    "Jamat Ul-Vida": FestivalRule(religions={"muslim": 1.0}, multiplier=0.85),
    "Ramzan Id/Eid-ul-Fitar": FestivalRule(religions={"muslim": 1.0}, multiplier=0.95),
    "Birthday of Ravindranath": FestivalRule(value=0.6, states={"West Bengal", "Assam"}),
    "Buddha Purnima/Vesak": FestivalRule(religions={"buddhist": 1.0, "hindu": 0.1}, multiplier=0.9),
    "Rath Yatra": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"Orissa", "Gujarat", "West Bengal"}),
    "Bakr Id/Eid ul-Adha": FestivalRule(religions={"muslim": 1.0}, multiplier=0.95),
    "Muharram/Ashura": FestivalRule(religions={"muslim": 1.0}, multiplier=0.8),
    "Raksha Bandhan (Rakhi)": FestivalRule(religions={"hindu": 1.0}, multiplier=0.75),
    "Independence Day": FestivalRule(value=0.95),
    "Parsi New Year": FestivalRule(religions={"other": 1.0}, multiplier=0.8, states={"Maharashtra", "Gujarat"}, min_value=0.002, threshold=0.0),
    "Janmashtami (Smarta)": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85),
    "Janmashtami": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85),
    "Ganesh Chaturthi/Vinayaka Chaturthi": FestivalRule(religions={"hindu": 1.0}, multiplier=0.9, states={"Maharashtra", "Karnataka", "Andhra Pradesh", "Tamil Nadu"}),
    "Onam": FestivalRule(value=0.85, states={"Kerala"}),
    "First Day of Sharad Navratri": FestivalRule(religions={"hindu": 1.0}, multiplier=0.75, states={"Gujarat", "Rajasthan", "Madhya Pradesh", "Maharashtra", "Uttar Pradesh"}),
    "First Day of Durga Puja Festivities": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"West Bengal", "Bihar", "Orissa", "Assam"}),
    "Maha Saptami": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"West Bengal", "Bihar", "Orissa", "Assam"}),
    "Mahatma Gandhi Jayanti": FestivalRule(value=0.95),
    "Maha Ashtami": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"West Bengal", "Bihar", "Orissa", "Assam"}),
    "Maha Navami": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85, states={"West Bengal", "Bihar", "Orissa", "Assam"}),
    "Dussehra": FestivalRule(religions={"hindu": 1.0}, multiplier=0.85),
    "Maharishi Valmiki Jayanti": FestivalRule(religions={"hindu": 1.0}, multiplier=0.5, states={"Punjab", "Haryana", "Himachal Pradesh", "Uttar Pradesh"}),
    "Milad un-Nabi/Id-e-Milad": FestivalRule(religions={"muslim": 1.0}, multiplier=0.85),
    "Karaka Chaturthi (Karva Chauth)": FestivalRule(religions={"hindu": 1.0}, multiplier=0.55, states={"Punjab", "Haryana", "Rajasthan", "Uttar Pradesh", "Madhya Pradesh", "Himachal Pradesh"}),
    "Diwali/Deepavali": FestivalRule(religions={"hindu": 1.0}, multiplier=0.9),
    "Naraka Chaturdasi": FestivalRule(religions={"hindu": 1.0}, multiplier=0.88, states={"Andhra Pradesh", "Karnataka", "Tamil Nadu", "Kerala"}),
    "Govardhan Puja": FestivalRule(religions={"hindu": 1.0}, multiplier=0.8, states={"Uttar Pradesh", "Bihar", "Rajasthan", "Gujarat", "Madhya Pradesh"}),
    "Bhai Duj": FestivalRule(religions={"hindu": 1.0}, multiplier=0.75),
    "Chhat Puja (Pratihar Sashthi/Surya Sashthi)": FestivalRule(religions={"hindu": 1.0}, multiplier=0.9, states={"Bihar", "Jharkhand", "Uttar Pradesh", "Chhattisgarh"}),
    "Guru Nanak Jayanti": FestivalRule(religions={"sikh": 0.95}, multiplier=1.0),
    "Guru Tegh Bahadur's Martyrdom Day": FestivalRule(religions={"sikh": 0.95}, multiplier=0.9),
    "Christmas Eve": FestivalRule(religions={"christian": 1.0}, multiplier=0.9),
    "Christmas": FestivalRule(religions={"christian": 1.0}, multiplier=0.95),
}


def fetch_state_religion_shares() -> Dict[str, Dict[str, float]]:
    shares: Dict[str, Dict[str, float]] = {}
    for religion, url in RELIGION_URLS.items():
        column_name = RELIGION_COLUMN_SUFFIX.get(religion)
        if column_name is None:
            raise ValueError(f"No column mapping defined for religion '{religion}'")
        tables = pd.read_html(url, match="State", flavor="lxml")
        if not tables:
            raise RuntimeError(f"No tables found when parsing {url}")
        table = tables[0]
        renamed = {
            table.columns[0]: "State",
            column_name: "Percent",
        }
        table = table.rename(columns=renamed)
        if "State" not in table.columns or "Percent" not in table.columns:
            raise RuntimeError(f"Unexpected table shape for {url}")
        table = table[["State", "Percent"]]
        table = table.dropna(subset=["State", "Percent"])
        for _, row in table.iterrows():
            state_name = canonical_state_name(str(row["State"]))
            if state_name.lower() in {"india", "total"}:
                continue
            try:
                percent = float(str(row["Percent"]).rstrip("%")) / 100.0
            except ValueError:
                continue
            shares.setdefault(state_name, {})[religion] = percent
    for state, profile in shares.items():
        total_known = sum(profile.values())
        profile.setdefault("other", max(0.0, 1.0 - total_known))
    return shares


def canonical_state_name(name: str) -> str:
    replacements = {
        "odisha": "Orissa",
        "nct of delhi": "Delhi",
        "uttaranchal": "Uttarakhand",
    }
    key = name.strip().lower()
    if key in replacements:
        return replacements[key]
    return name.strip()


def compute_participation(rule: FestivalRule, state: str, state_shares: Dict[str, Dict[str, float]]) -> Optional[float]:
    if not rule.applies_to(state):
        return None
    if rule.value is not None:
        return min(rule.max_value, max(rule.min_value, rule.value))
    profile = state_shares.get(state)
    if profile is None:
        raise KeyError(f"Missing religion share profile for state '{state}'")
    total = 0.0
    religions = rule.religions or {}
    for religion, weight in religions.items():
        share = profile.get(religion, 0.0)
        total += share * weight
    total *= rule.multiplier
    total = min(rule.max_value, max(rule.min_value, total))
    if rule.state_overrides and state in rule.state_overrides:
        total = rule.state_overrides[state]
    return total


def build_dataset(state_shares: Dict[str, Dict[str, float]], *, dry_run: bool = False) -> pd.DataFrame:
    festivals = pd.read_csv(FESTIVAL_CSV)
    income = pd.read_csv(INCOME_CSV)
    income["state"] = income["state"].apply(str)
    income["district"] = income["district"].apply(str)

    rows = []
    for _, fest_row in festivals.iterrows():
        festival_name = str(fest_row["Festival name"]).strip()
        rule = FESTIVAL_RULES.get(festival_name)
        if rule is None:
            raise KeyError(f"No rule defined for festival '{festival_name}'")
        period = datetime.strptime(f"{fest_row['Date']} {fest_row['Year']}", "%B %d %Y").date().isoformat()
        for _, area in income.iterrows():
            state_raw = canonical_state_name(area["state"])
            pct = compute_participation(rule, state_raw, state_shares)
            if pct is None:
                continue
            if pct < rule.threshold:
                continue
            rows.append(
                {
                    "state": area["state"],
                    "district": area["district"],
                    "period_start": period,
                    "festival": festival_name,
                    "celebration_pct": round(pct, 4),
                }
            )
    df = pd.DataFrame(rows)
    df = df.sort_values(["state", "district", "festival"]).reset_index(drop=True)
    if not dry_run:
        df.to_csv(OUTPUT_CSV, index=False)
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate festival participation features")
    parser.add_argument("--dry-run", action="store_true", help="Do not write CSV; just validate and report counts")
    args = parser.parse_args()

    shares = fetch_state_religion_shares()
    dataset = build_dataset(shares, dry_run=args.dry_run)
    msg = "Dry run; rows would be" if args.dry_run else "Wrote rows"
    print(f"{msg}: {len(dataset)}")


if __name__ == "__main__":
    main()
