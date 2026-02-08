#!/usr/bin/env python3
"""
excel_to_mongo_v2.py

More robust importer tuned for the "State/Crop/District" tables you showed.

Usage:
  python excel_to_mongo_v2.py --folder ./crop-generation-data --mongo-uri mongodb://localhost:27017 --db agriculture --dryrun

This script:
 - reads each file using pandas.read_html (handles .xls HTML tables)
 - treats the left-most column as label (state/crop/district)
 - picks the right-most 3 numeric columns as area/production/yield
 - finds a season column among early columns (if present)
 - iterates rows and extracts district-level rows
 - uses state machine to maintain current_state and current_crop
 - inserts into MongoDB 'crops_history' (unless --dryrun)
"""

import os, sys, argparse, json, re
import pandas as pd
from pymongo import MongoClient
from typing import List

SEASON_TOKENS = set(['rabi','kharif','zaid','summer','winter','autumn'])

STATE_NAME_HINTS = {
    'andhrapradesh','arunachalpradesh','assam','bihar','chhattisgarh','chattisgarh',
    'goa','gujarat','haryana','himachalpradesh','jammukashmir','jharkhand',
    'karnataka','kerala','madhyapradesh','maharashtra','manipur','meghalaya',
    'mizoram','nagaland','odisha','orissa','punjab','rajasthan','sikkim',
    'tamilnadu','tamilnaduut','telangana','tripura','uttaranchal',
    'uttarpradesh','uttarakhand','westbengal','andamanandnicobarislands',
    'andamannicobar','andamannicobarislandsut','andamannicobarislandsunionterritory',
    'chandigarh','dadranagarhaveli','dadraandnagarhaveli',
    'dadranagarhavelidamananddiu','damananddiu','damananddiuut','delhi',
    'nctdelhi','nctofdelhi','lakshadweep','puducherry','pondicherry',
    'ladakh','jammuandkashmir','jammukashmirandladakh','jammukashmirut',
    'jammuandkashmirut','nationalcapitalterritorydelhi','utofdadranagarhaveli',
    'utofdamananddiu','utofdandiu','anislands',
    'thedadranagarhavelianddamananddiu'
}


def normalize_state_label(label: str) -> str:
    if not label:
        return ''
    return re.sub(r'[^a-z]', '', label.lower())

def try_read_tables(path):
    """Return list of tables (DataFrames). Uses read_html primarily (your files are HTML-like)."""
    try:
        tables = pd.read_html(path, header=None)  # no header: we will parse content
        return tables
    except Exception as e:
        # Try pandas.read_excel fallback
        try:
            xls = pd.read_excel(path, sheet_name=0, header=None)
            return [xls]
        except Exception as e2:
            raise RuntimeError(f"Failed to read {path}: {e} | {e2}")

def is_number_like(val):
    if pd.isna(val):
        return False
    try:
        s = str(val).strip().replace(',', '')
        if s == '':
            return False
        float(s)
        return True
    except:
        return False

def numeric_density(series):
    if series is None or len(series) == 0:
        return 0.0
    return series.map(is_number_like).sum() / len(series)

def detect_rightmost_numeric_cols(df, want=3):
    """
    Pick rightmost columns that look numeric (by numeric_density), in order right->left.
    Return list of column indices sorted left->right for area, production, yield.
    """
    cols = list(df.columns)
    densities = [(c, numeric_density(df[c])) for c in cols]
    # iterate from rightmost to left, pick columns with some numeric density (>0.15)
    chosen = []
    for c in reversed(cols):
        if numeric_density(df[c]) > 0.12:  # low threshold to capture numbers in messy tables
            chosen.append(c)
            if len(chosen) >= want:
                break
    # if not enough numeric columns, pick top numeric density columns overall
    if len(chosen) < want:
        sorted_by_density = sorted(densities, key=lambda x: x[1], reverse=True)
        for c, d in sorted_by_density:
            if c not in chosen and d > 0.05:
                chosen.append(c)
            if len(chosen) >= want:
                break
    chosen = list(reversed(chosen))  # make left->right order
    return chosen[:want]

def detect_season_col(df, label_col_idx=0):
    """
    Among first few columns after label_col try to detect a column that contains season tokens
    """
    cols = list(df.columns)
    start_idx = cols.index(label_col_idx) if label_col_idx in cols else 0
    candidates = cols[start_idx+1 : start_idx+4]  # look up to next 3 columns
    for c in candidates:
        # compute fraction of season tokens
        ser = df[c].astype(str).fillna('').str.strip().str.lower()
        if len(ser) == 0: 
            continue
        frac = ser.map(lambda v: v in SEASON_TOKENS).sum() / max(1, len(ser))
        if frac > 0.06:
            return c
    # fallback: try any column with many season-like tokens
    for c in df.columns:
        ser = df[c].astype(str).fillna('').str.strip().str.lower()
        frac = ser.map(lambda v: v in SEASON_TOKENS).sum() / max(1, len(ser))
        if frac > 0.06:
            return c
    return None

def clean_label(s):
    if pd.isna(s):
        return ''
    return str(s).strip()

def is_total_row(label):
    if not label:
        return False
    return 'total' in label.lower()

def is_crop_heading(label):
    if not label:
        return False
    m = re.match(r'^\s*\d+\.\s*(.+)$', label)  # "1. Arecanut"
    if m:
        return True, m.group(1).strip()
    # sometimes there is just a number with crop name in same cell like "2. Arhar/Tur"
    return False, None

def is_state_header(label):
    # state row tends to be long and non-numbered, often title-case or all caps
    if not label:
        return False
    lowered = label.lower().strip()
    if 'total' in lowered:
        return False
    norm = normalize_state_label(label)
    if norm in STATE_NAME_HINTS:
        return True
    if re.search(r'\b(union territory|state)\b', lowered):
        return True
    return False

def strip_numbering(label):
    if not label:
        return ''
    # remove leading numbering "1." or "1)"
    t = re.sub(r'^\s*\d+\.\s*', '', label)
    t = re.sub(r'^\s*\d+\)\s*', '', t)
    return t.strip()

def process_table(df, source_file):
    """
    Parse one DataFrame (no header) into records.
    """
    records = []
    skipped = []

    # trim completely empty rows
    df = df.dropna(how='all').reset_index(drop=True)

    if df.shape[0] == 0:
        return records, skipped

    # label column is very likely column 0 (left-most)
    label_col = df.columns[0]

    # detect numeric columns (area/production/yield) as rightmost numeric columns
    numeric_cols = detect_rightmost_numeric_cols(df, want=3)
    # map them to area/prod/yield by order left->right
    area_col = numeric_cols[0] if len(numeric_cols) > 0 else None
    prod_col = numeric_cols[1] if len(numeric_cols) > 1 else None
    yield_col = numeric_cols[2] if len(numeric_cols) > 2 else None

    season_col = detect_season_col(df, label_col_idx=label_col)

    # state machine
    current_state = None
    current_crop = None

    for idx, row in df.iterrows():
        label = clean_label(row[label_col]) if label_col in df.columns else ''
        season = clean_label(row[season_col]) if season_col and season_col in df.columns else ''
        # numeric checks
        area_val = None if area_col is None else row[area_col]
        prod_val = None if prod_col is None else row[prod_col]
        yield_val = None if yield_col is None else row[yield_col]

        any_numeric = any(is_number_like(x) for x in [area_val, prod_val, yield_val])

        # skip blank/heading noisy rows
        if not label and not any_numeric:
            continue

        # Detect state header
        if not any_numeric and is_state_header(label):
            current_state = label
            current_crop = None
            continue

        # Detect crop heading - e.g., "1. Arecanut"
        crop_detect = is_crop_heading(label)
        if crop_detect[0] and not any_numeric:
            current_crop = crop_detect[1]
            continue

        # Skip totals
        if is_total_row(label):
            continue

        # If row has numeric columns (area/prod/yield) and label not empty: treat as district row
        if any_numeric and label:
            district = strip_numbering(label)
            rec = {
                'state': current_state,
                'crop': current_crop,
                'district': district if district else None,
                'season': season if season else None,
                'area_hectare': float(area_val) if is_number_like(area_val) else None,
                'production_tonnes': float(prod_val) if is_number_like(prod_val) else None,
                'yield_tonha': float(yield_val) if is_number_like(yield_val) else None,
                'source_file': os.path.basename(source_file),
                'row_index': int(idx)
            }
            # If crop missing, try to look back in last few rows for crop heading
            if not rec['crop']:
                # look back up to 5 rows for crop heading cell in label_col
                for back in range(1,6):
                    if idx - back >= 0:
                        prev_label = clean_label(df.at[idx-back, label_col])
                        if is_crop_heading(prev_label)[0]:
                            rec['crop'] = is_crop_heading(prev_label)[1]
                            break
            # If state missing, backfill
            if not rec['state']:
                for back in range(1,12):
                    if idx - back >= 0:
                        prev_label = clean_label(df.at[idx-back, label_col])
                        if is_state_header(prev_label):
                            rec['state'] = prev_label
                            break
            # if still missing production but numbers present in other columns, attempt nearest numeric mapping
            # (we already used rightmost mapping, so usually fine)
            records.append(rec)
            continue

        # fallback: sometimes district name present without numbers in same row, numbers in next row(s).
        # If label present but no numbers, attempt to peek next row for numbers.
        if label and not any_numeric:
            # peek next row for numbers
            if idx + 1 < len(df):
                next_row = df.iloc[idx + 1]
                # check if next_row has numeric values in the area/prod/yield cols
                a = float(next_row[area_col]) if area_col and is_number_like(next_row[area_col]) else None
                p = float(next_row[prod_col]) if prod_col and is_number_like(next_row[prod_col]) else None
                y = float(next_row[yield_col]) if yield_col and is_number_like(next_row[yield_col]) else None
                if any(v is not None for v in [a,p,y]):
                    # treat current label as district, combine with next row numbers
                    district = strip_numbering(label)
                    rec = {
                        'state': current_state,
                        'crop': current_crop,
                        'district': district if district else None,
                        'season': season if season else None,
                        'area_hectare': a,
                        'production_tonnes': p,
                        'yield_tonha': y,
                        'source_file': os.path.basename(source_file),
                        'row_index': int(idx)
                    }
                    records.append(rec)
                    # skip the next row by incrementing index — but since we use for-loop we can't skip; mark next row processed by setting its numeric cols to NaN
                    for c in [area_col, prod_col, yield_col]:
                        if c in df.columns:
                            df.at[idx+1, c] = None
                    continue

        # If reached here, we couldn't classify the row as a useful district/state/crop line.
        skipped.append({'file': os.path.basename(source_file), 'row_index': int(idx), 'label': label, 'season': season,
                        'area': area_val, 'prod': prod_val, 'yield': yield_val})
        continue

    return records, skipped

def main(args):
    folder = args.folder
    files = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(('.xls','.xlsx','.csv','.xlsb'))]
    print("Found", len(files), "files")
    if len(files) == 0:
        return

    client = None
    coll = None
    if not args.dryrun:
        client = MongoClient(args.mongo_uri)
        coll = client[args.db]['crops_history']

    total_inserted = 0
    total_skipped = []
    all_records = []

    for f in files:
        print("Parsing", f)
        try:
            tables = try_read_tables(f)
        except Exception as e:
            print("  ERROR reading file:", e)
            total_skipped.append({'file': f, 'error': str(e)})
            continue
        # parse all tables; many files may have multiple tables; we'll process each
        for ti, df in enumerate(tables):
            # skip tiny tables
            if df.shape[0] < 3 or df.shape[1] < 2:
                continue
            try:
                recs, skipped = process_table(df, f)
            except Exception as e:
                print("  ERROR processing table:", e)
                total_skipped.append({'file': f, 'table_index': ti, 'error': str(e)})
                continue
            print(f"  table {ti}: extracted {len(recs)} records, skipped {len(skipped)} rows")
            total_skipped.extend(skipped)
            all_records.extend(recs)
            # insert into DB or print
            if not args.dryrun:
                if recs:
                    coll.insert_many(recs)
                    total_inserted += len(recs)

    print("Total extracted records:", len(all_records))
    print("Total inserted:", total_inserted)
    print("Total skipped items:", len(total_skipped))
    with open('skipped_rows.json', 'w', encoding='utf-8') as f:
        json.dump(total_skipped, f, indent=2, ensure_ascii=False)
    if client:
        client.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--folder', required=True)
    parser.add_argument('--mongo-uri', default='mongodb://localhost:27017')
    parser.add_argument('--db', default='agriculture')
    parser.add_argument('--dryrun', action='store_true')
    args = parser.parse_args()
    main(args)
