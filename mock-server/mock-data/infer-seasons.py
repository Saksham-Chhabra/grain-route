#!/usr/bin/env python3
"""
infer_seasons.py

Usage:
    python infer_seasons.py --mongo-uri mongodb://localhost:27017 --db agriculture --input_coll crops_history --grouping district --min_coverage 0.75 [--out seasons.json]

What it does:
 - Reads rows from MongoDB collection (crops_history)
 - Groups by (state, crop, district) by default (use --grouping state for state-level aggregation)
 - When monthly production is present, finds the tightest harvest window covering >= min_coverage of the weight
 - Otherwise weights season labels by production/area and maps them with state-specific season calendars
 - Falls back to crop-season hints when neither months nor labels exist
 - Upserts results into the 'crop_seasons' collection (optionally writes a JSON snapshot if --out is provided)
 - Annotates every matching document in the source collection with harvest/sowing month ranges (skip with --skip-history-update)

Output structure example (one entry):
{
  "state": "Andhra Pradesh",
  "crop": "Arhar/Tur",
  "district": "Anantapur",         # omitted / null when grouping='state'
  "grouping": "district",
  "harvest_windows": [
      { "label": "inferred_from_months", "harvest_start": 10, "harvest_end": 12, "coverage": 0.82 }
  ],
  "sowing_windows": [
     { "sowing_start": 7, "sowing_end": 9, "growth_months": 3 }
  ],
  "confidence": "high",
  "row_count": 96,
        "notes": "inferred from month data; coverage=0.82; rows=96; state_profile=custom"
}

"""
import argparse, json, re
from collections import defaultdict
from datetime import datetime
from pymongo import MongoClient, UpdateOne

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover
    def tqdm(iterable, **kwargs):
        return iterable

# ---------- Configs (tweak as needed) ----------
SEASON_DEFAULTS = {
    'kharif': {'harvest': (9, 11)},   # typical harvest months (Sept-Nov)
    'rabi':   {'harvest': (2, 4)},    # Feb-Apr (wrap handled)
    'zaid':   {'harvest': (5, 7)},    # May-Jul
    'summer': {'harvest': (4, 6)},
    'autumn': {'harvest': (9, 11)},
    'winter': {'harvest': (12, 2)},   # wrap: Dec -> Feb
}

SEASON_ALIASES = {
    'late kharif': 'kharif',
    'early kharif': 'kharif',
    'pre kharif': 'kharif',
    'post kharif': 'kharif',
    'late rabi': 'rabi',
    'early rabi': 'rabi',
    'pre rabi': 'rabi',
    'post rabi': 'rabi',
    'summer season': 'summer',
    'hot weather': 'summer',
    'pre monsoon': 'zaid',
    'post monsoon': 'autumn',
    'autumn winter': 'autumn',
    'winter season': 'winter'
}

SEASON_TOKENS = set(SEASON_DEFAULTS.keys())

STATE_ALIAS_MAP = {
    'andhra pradesh': 'Andhra Pradesh',
    'arunachal pradesh': 'Arunachal Pradesh',
    'assam': 'Assam',
    'bihar': 'Bihar',
    'chhattisgarh': 'Chhattisgarh',
    'chattisgarh': 'Chhattisgarh',
    'goa': 'Goa',
    'gujarat': 'Gujarat',
    'haryana': 'Haryana',
    'himachal pradesh': 'Himachal Pradesh',
    'jammu and kashmir': 'Jammu and Kashmir',
    'jammu & kashmir': 'Jammu and Kashmir',
    'jharkhand': 'Jharkhand',
    'karnataka': 'Karnataka',
    'kerala': 'Kerala',
    'madhya pradesh': 'Madhya Pradesh',
    'maharashtra': 'Maharashtra',
    'manipur': 'Manipur',
    'meghalaya': 'Meghalaya',
    'mizoram': 'Mizoram',
    'nagaland': 'Nagaland',
    'odisha': 'Odisha',
    'orissa': 'Odisha',
    'punjab': 'Punjab',
    'rajasthan': 'Rajasthan',
    'sikkim': 'Sikkim',
    'tamil nadu': 'Tamil Nadu',
    'tamilnadu': 'Tamil Nadu',
    'telangana': 'Telangana',
    'tripura': 'Tripura',
    'uttar pradesh': 'Uttar Pradesh',
    'uttaranchal': 'Uttarakhand',
    'uttarakhand': 'Uttarakhand',
    'west bengal': 'West Bengal',
    'andaman and nicobar islands': 'Andaman and Nicobar Islands',
    'andaman & nicobar islands': 'Andaman and Nicobar Islands',
    'a & n islands': 'Andaman and Nicobar Islands',
    'chandigarh': 'Chandigarh',
    'dadra and nagar haveli': 'Dadra and Nagar Haveli',
    'dadra & nagar haveli': 'Dadra and Nagar Haveli',
    'daman and diu': 'Daman and Diu',
    'daman & diu': 'Daman and Diu',
    'ut of daman & diu': 'Daman and Diu',
    'ut of dadra & nagar haveli': 'Dadra and Nagar Haveli',
    'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
    'the dadra & nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
    'ladakh': 'Ladakh',
    'lakshadweep': 'Lakshadweep',
    'puducherry': 'Puducherry',
    'pondicherry': 'Puducherry',
    'delhi': 'Delhi',
    'nct of delhi': 'Delhi',
    'national capital territory of delhi': 'Delhi',
    'nctdelhi': 'Delhi',
    'nct of delhi (ut)': 'Delhi'
}

STATE_SEASON_VARIANTS = {
    'Andhra Pradesh':      {'kharif': (9, 11), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (12, 2)},
    'Arunachal Pradesh':   {'kharif': (8, 10), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (1, 3)},
    'Assam':               {'kharif': (9, 11), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Bihar':               {'kharif': (9, 11), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Chhattisgarh':        {'kharif': (9, 11), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Goa':                 {'kharif': (9, 11), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (11, 1)},
    'Gujarat':             {'kharif': (8, 10), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Haryana':             {'kharif': (9, 10), 'rabi': (3, 5), 'zaid': (5, 6), 'summer': (4, 5), 'autumn': (9, 10), 'winter': (12, 2)},
    'Himachal Pradesh':    {'kharif': (8, 10), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (1, 3)},
    'Jammu and Kashmir':   {'kharif': (8, 9),  'rabi': (4, 6), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 10), 'winter': (1, 3)},
    'Jharkhand':           {'kharif': (9, 11), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Karnataka':           {'kharif': (8, 11), 'rabi': (11, 1), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (12, 2)},
    'Kerala':              {'kharif': (8, 10), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (11, 1)},
    'Madhya Pradesh':      {'kharif': (9, 11), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Maharashtra':         {'kharif': (9, 11), 'rabi': (2, 4), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (12, 2)},
    'Manipur':             {'kharif': (8, 10), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Meghalaya':           {'kharif': (8, 10), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (8, 10), 'winter': (12, 2)},
    'Mizoram':             {'kharif': (8, 10), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Nagaland':            {'kharif': (8, 10), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Odisha':              {'kharif': (9, 11), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Punjab':              {'kharif': (9, 10), 'rabi': (3, 5), 'zaid': (5, 6), 'summer': (4, 5), 'autumn': (9, 10), 'winter': (12, 2)},
    'Rajasthan':           {'kharif': (9, 11), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Sikkim':              {'kharif': (8, 10), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (1, 3)},
    'Tamil Nadu':          {'kharif': (8, 10), 'rabi': (12, 2), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (11, 1)},
    'Telangana':           {'kharif': (9, 11), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (12, 2)},
    'Tripura':             {'kharif': (9, 11), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Uttar Pradesh':       {'kharif': (9, 11), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Uttarakhand':         {'kharif': (8, 10), 'rabi': (3, 5), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (1, 3)},
    'West Bengal':         {'kharif': (9, 11), 'rabi': (2, 4), 'zaid': (5, 7), 'summer': (4, 6), 'autumn': (9, 11), 'winter': (12, 2)},
    'Andaman and Nicobar Islands': {'kharif': (8, 10), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (11, 1)},
    'Chandigarh':          {'kharif': (9, 10), 'rabi': (3, 5), 'zaid': (5, 6), 'summer': (4, 5), 'autumn': (9, 10), 'winter': (12, 2)},
    'Dadra and Nagar Haveli': {'kharif': (9, 11), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (12, 2)},
    'Daman and Diu':       {'kharif': (9, 11), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (12, 2)},
    'Lakshadweep':         {'kharif': (8, 10), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (11, 1)},
    'Puducherry':          {'kharif': (8, 10), 'rabi': (12, 2), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (11, 1)},
    'Delhi':               {'kharif': (9, 10), 'rabi': (3, 5), 'zaid': (5, 6), 'summer': (4, 5), 'autumn': (9, 10), 'winter': (12, 2)},
    'Ladakh':              {'kharif': (7, 9),  'rabi': (5, 6), 'zaid': (6, 7), 'summer': (5, 7), 'autumn': (8, 9),  'winter': (1, 2)},
    'Dadra and Nagar Haveli and Daman and Diu': {'kharif': (9, 11), 'rabi': (1, 3), 'zaid': (4, 6), 'summer': (3, 5), 'autumn': (9, 11), 'winter': (12, 2)}
}

DEFAULT_CROP_SEASON_HINTS = {
    'wheat': ['rabi'],
    'rice': ['kharif'],
    'paddy': ['kharif'],
    'maize': ['kharif'],
    'bajra': ['kharif'],
    'jowar': ['kharif'],
    'ragi': ['kharif'],
    'jute': ['kharif'],
    'sugarcane': ['autumn'],
    'cotton lint': ['kharif'],
    'cotton': ['kharif'],
    'groundnut': ['kharif'],
    'soybean': ['kharif'],
    'soyabean': ['kharif'],
    'sunflower': ['kharif'],
    'sesamum': ['kharif'],
    'castor seed': ['kharif'],
    'arhar tur': ['kharif'],
    'tur': ['kharif'],
    'pulses': ['rabi'],
    'gram': ['rabi'],
    'lentil': ['rabi'],
    'masoor': ['rabi'],
    'peas': ['rabi'],
    'mustard': ['rabi'],
    'rapeseed mustard': ['rabi'],
    'linseed': ['rabi'],
    'safflower': ['rabi'],
    'potato': ['rabi'],
    'onion': ['rabi'],
    'garlic': ['rabi'],
    'arecanut': ['autumn'],
    'banana': ['summer'],
    'plantain': ['summer'],
    'pepper': ['autumn'],
    'ginger': ['autumn'],
    'turmeric': ['autumn'],
    'tea': ['autumn'],
    'coffee': ['autumn']
}

# default growth months per crop (approx months between sowing and harvest)
DEFAULT_GROWTH_MONTHS = {
    'wheat': 5,
    'rice': 4,
    'paddy': 4,
    'maize': 3,
    'bajra': 3,
    'jowar': 3,
    'ragi': 4,
    'jute': 4,
    'sugarcane': 11,
    'cotton lint': 6,
    'cotton': 6,
    'groundnut': 4,
    'soybean': 4,
    'soyabean': 4,
    'sunflower': 4,
    'sesamum': 3,
    'castor seed': 5,
    'arhar tur': 5,
    'tur': 5,
    'pulses': 4,
    'gram': 5,
    'lentil': 5,
    'masoor': 5,
    'peas': 4,
    'mustard': 4,
    'rapeseed mustard': 4,
    'linseed': 5,
    'safflower': 5,
    'potato': 4,
    'onion': 4,
    'garlic': 4,
    'arecanut': 12,
    'banana': 11,
    'pepper': 12,
    'ginger': 8,
    'turmeric': 9,
    'tea': 12,
    'coffee': 12
}
DEFAULT_GROWTH_MONTHS_FALLBACK = 4

# ---------- Helpers ----------
def normalize_whitespace(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()


def canonical_state_name(state):
    text = normalize_whitespace(state)
    if not text:
        return 'UNKNOWN'
    lowered = text.lower()
    if lowered in STATE_ALIAS_MAP:
        return STATE_ALIAS_MAP[lowered]
    return text.title()


def normalize_district_name(name):
    text = normalize_whitespace(name)
    return text or None


def normalize_crop_key(name):
    if not name:
        return ''
    cleaned = re.sub(r'[^a-z0-9]+', ' ', str(name).lower())
    return re.sub(r'\s+', ' ', cleaned).strip()


def get_growth_months(norm_crop):
    return DEFAULT_GROWTH_MONTHS.get(norm_crop, DEFAULT_GROWTH_MONTHS_FALLBACK)


def get_state_season_window(state, season_token):
    profile = STATE_SEASON_VARIANTS.get(state)
    if profile and season_token in profile:
        return profile[season_token]
    default = SEASON_DEFAULTS.get(season_token)
    if default:
        return default['harvest']
    return (None, None)


def extract_season_tokens(label):
    if not label:
        return []
    text = normalize_whitespace(label).lower()
    tokens = set()
    for alias, canonical in SEASON_ALIASES.items():
        if alias in text:
            tokens.add(canonical)
    for token in SEASON_TOKENS:
        if token in text:
            tokens.add(token)
    if not tokens and text in SEASON_TOKENS:
        tokens.add(text)
    return list(tokens)


def row_weight(row):
    for field in ('production_tonnes', 'area_hectare'):
        value = row.get(field)
        if value is None:
            continue
        try:
            num = float(value)
            if num > 0:
                return num
        except (TypeError, ValueError):
            continue
    return 1.0


def select_season_window(state, norm_crop, season_tokens):
    if not state:
        return None
    # first try explicit season tokens from the document
    if season_tokens:
        for token in season_tokens:
            hstart, hend = get_state_season_window(state, token)
            if hstart is not None or hend is not None:
                return token, hstart, hend, 'state_profile_from_doc_season'
    # fall back to crop hints
    hints = DEFAULT_CROP_SEASON_HINTS.get(norm_crop)
    if hints:
        for token in hints:
            hstart, hend = get_state_season_window(state, token)
            if hstart is not None or hend is not None:
                return token, hstart, hend, 'crop_hint_profile'
    # final fallback: generic kharif window if available
    hstart, hend = get_state_season_window(state, 'kharif')
    if hstart is not None or hend is not None:
        return 'kharif', hstart, hend, 'generic_kharif_fallback'
    return None


def annotate_history_documents(collection, batch_size=500):
    updates = []
    annotated = 0
    checked = 0
    cursor = collection.find({}, {
        '_id': 1,
        'state': 1,
        'crop': 1,
        'season': 1
    })
    for doc in cursor:
        checked += 1
        state_canon = canonical_state_name(doc.get('state'))
        norm_crop = normalize_crop_key(doc.get('crop'))
        season_tokens = extract_season_tokens(doc.get('season'))
        selection = select_season_window(state_canon, norm_crop, season_tokens)
        if not selection:
            continue
        token, hstart, hend, method = selection
        gm = get_growth_months(norm_crop)
        sow_s = shift_month(hstart, -gm) if hstart is not None else None
        sow_e = shift_month(hend, -gm) if hend is not None else None
        payload = {
            'season_annotation_token': token,
            'season_annotation_method': method,
            'season_annotation_state': state_canon,
            'season_annotation_updated_at': datetime.utcnow(),
            'season_harvest_start_month': hstart,
            'season_harvest_end_month': hend,
            'season_sowing_start_month': sow_s,
            'season_sowing_end_month': sow_e,
            'season_growth_months': gm
        }
        # prune None values except for explicitly tracked fields
        payload = {k: v for k, v in payload.items() if v is not None}
        updates.append(UpdateOne({'_id': doc['_id']}, {'$set': payload}))
        if len(updates) >= batch_size:
            collection.bulk_write(updates, ordered=False)
            annotated += len(updates)
            updates = []
    if updates:
        collection.bulk_write(updates, ordered=False)
        annotated += len(updates)
    print(f"Annotated {annotated} of {checked} history documents with season windows")


def contiguous_block_covering(dist, min_cov=0.75):
    """
    dist: list of 12 (months 1..12) numbers (nonnegative), aggregated production per month.
    Return (start_month, end_month, coverage_fraction). If no production -> (None,None,0).
    start_month and end_month in 1..12. end may be < start for wrap-around (e.g., 10..3).
    Algorithm: find shortest contiguous block (including wrap) with coverage >= min_cov.
    """
    total = sum(dist)
    if total <= 0:
        return None, None, 0.0
    n = 12
    arr = dist + dist  # double for wrap
    # try windows from smallest length to full year
    for L in range(1, n+1):
        for start in range(0, n):
            s = sum(arr[start:start+L])
            if s / total >= min_cov:
                start_m = (start % n) + 1
                end_m = ((start + L - 1) % n) + 1
                return int(start_m), int(end_m), float(s/total)
    # fallback: return whole year
    return 1, 12, 1.0

def shift_month(month, delta):
    # month 1..12, delta can be negative
    return ((month - 1 + delta) % 12) + 1

def month_in_window(month, start, end):
    if start is None or end is None:
        return False
    if start <= end:
        return start <= month <= end
    else:
        # wrap-around
        return month >= start or month <= end

# ---------- Main inference ----------
def infer_seasons_from_mongo(mongo_uri, dbname, input_coll='crops_history', grouping='district', min_coverage=0.75, out_file=None, annotate_history=True):
    client = MongoClient(mongo_uri)
    db = client[dbname]
    coll = db[input_coll]

    per_district = grouping == 'district'

    # Read all docs but project only required fields to reduce memory
    projection = {'state':1, 'crop':1, 'district':1, 'year':1, 'month':1, 'season':1, 'production_tonnes':1, 'area_hectare':1}
    cursor = coll.find({}, projection)

    # Group rows by key
    groups = defaultdict(list)
    for doc in cursor:
        state = canonical_state_name(doc.get('state'))
        crop_raw = normalize_whitespace(doc.get('crop') or 'UNKNOWN')
        crop = crop_raw or 'UNKNOWN'
        norm_crop = normalize_crop_key(crop)
        district = normalize_district_name(doc.get('district')) if per_district else None
        key = (state, crop, district)
        doc['_norm_crop'] = norm_crop
        groups[key].append(doc)

    print(f"Found {len(groups)} groups (grouping={grouping})")

    results = []
    for key, rows in tqdm(groups.items(), desc='Groups'):
        state, crop, district = key
        norm_crop = normalize_crop_key(crop)

        # aggregate month weights
        monthly = [0.0] * 12
        for r in rows:
            m_value = r.get('month')
            if m_value is None:
                continue
            try:
                mi = int(m_value)
            except (TypeError, ValueError):
                continue
            if 1 <= mi <= 12:
                monthly[mi - 1] += row_weight(r)
        month_total = sum(monthly)
        has_month = month_total > 0

        # aggregate season weights
        season_weights = defaultdict(float)
        season_counts = defaultdict(int)
        for r in rows:
            tokens = extract_season_tokens(r.get('season'))
            if not tokens:
                continue
            weight = row_weight(r)
            for token in tokens:
                season_weights[token] += weight
                season_counts[token] += 1
        has_season = bool(season_weights)

        entry = {
            'state': state,
            'crop': crop,
            'district': district if per_district else None,
            'grouping': grouping,
            'harvest_windows': [],
            'sowing_windows': [],
            'confidence': None,
            'notes': '',
            'row_count': len(rows)
        }

        if has_month:
            hstart, hend, cov = contiguous_block_covering(monthly, min_cov=min_coverage)
            entry['harvest_windows'].append({'label':'inferred_from_months', 'harvest_start': hstart, 'harvest_end': hend, 'coverage': cov})
            # compute sowing by shift using growth months map
            gm = get_growth_months(norm_crop)
            sow_s = shift_month(hstart, -gm) if hstart is not None else None
            sow_e = shift_month(hend, -gm) if hend is not None else None
            entry['sowing_windows'].append({'sowing_start': sow_s, 'sowing_end': sow_e, 'growth_months': gm, 'method': 'shift_from_harvest'})
            entry['confidence'] = 'high'
            entry['notes'] = f'inferred from month data; coverage={cov:.2f}'
        elif has_season:
            total_weight = sum(season_weights.values())
            sorted_tokens = sorted(season_weights.items(), key=lambda x: x[1], reverse=True)
            for season_token, weight in sorted_tokens:
                hstart, hend = get_state_season_window(state, season_token)
                if hstart is None and hend is None:
                    continue
                cov_fraction = (weight / total_weight) if total_weight else None
                entry['harvest_windows'].append({
                    'label': season_token,
                    'harvest_start': hstart,
                    'harvest_end': hend,
                    'coverage_fraction': round(cov_fraction, 4) if cov_fraction is not None else None,
                    'season_weight': round(weight, 3),
                    'season_samples': season_counts[season_token],
                    'method': 'state_profile_from_season'
                })
                gm = get_growth_months(norm_crop)
                if hstart is not None and hend is not None:
                    sow_s = shift_month(hstart, -gm)
                    sow_e = shift_month(hend, -gm)
                else:
                    sow_s = sow_e = None
                entry['sowing_windows'].append({
                    'season': season_token,
                    'sowing_start': sow_s,
                    'sowing_end': sow_e,
                    'growth_months': gm,
                    'method': 'state_profile_from_season'
                })
            top_fraction = entry['harvest_windows'][0].get('coverage_fraction') if entry['harvest_windows'] else 0
            entry['confidence'] = 'medium-high' if top_fraction and top_fraction >= 0.7 else 'medium'
            top_summary = [(token, round((season_weights[token] / total_weight), 2)) for token, _ in sorted_tokens[:3]] if total_weight else []
            entry['notes'] = f'weighted season labels (top fractions: {top_summary})'
        else:
            # no month or season label — fallback to default hints (very low confidence)
            hint_seasons = DEFAULT_CROP_SEASON_HINTS.get(norm_crop)
            if not hint_seasons:
                hint_seasons = ['kharif']
            unique_hint_seasons = list(dict.fromkeys(hint_seasons))
            for season_token in unique_hint_seasons:
                hstart, hend = get_state_season_window(state, season_token)
                if hstart is None and hend is None:
                    continue
                entry['harvest_windows'].append({
                    'label': season_token,
                    'harvest_start': hstart,
                    'harvest_end': hend,
                    'coverage_fraction': None,
                    'method': 'crop_hint_profile'
                })
                gm = get_growth_months(norm_crop)
                if hstart is not None and hend is not None:
                    sow_s = shift_month(hstart, -gm)
                    sow_e = shift_month(hend, -gm)
                else:
                    sow_s = sow_e = None
                entry['sowing_windows'].append({
                    'season': season_token,
                    'sowing_start': sow_s,
                    'sowing_end': sow_e,
                    'growth_months': gm,
                    'method': 'crop_hint_profile'
                })
            entry['confidence'] = 'low'
            entry['notes'] = f'no month or season labels; used crop hint profile ({", ".join(unique_hint_seasons)})'

        profile_flag = 'custom' if state in STATE_SEASON_VARIANTS else 'default'
        if entry['notes']:
            entry['notes'] = entry['notes'] + f'; rows={len(rows)}; state_profile={profile_flag}'
        else:
            entry['notes'] = f'rows={len(rows)}; state_profile={profile_flag}'

        results.append(entry)

    # Write results back to MongoDB and JSON
    out_coll = db['crop_seasons']
    # optional: drop existing? we will upsert by (state,crop,district)
    for r in results:
        query = {'state': r['state'], 'crop': r['crop'], 'district': r['district']}
        out_coll.update_one(query, {'$set': r}, upsert=True)

    if annotate_history:
        annotate_history_documents(coll)

    if out_file:
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"Wrote {len(results)} season records to collection 'crop_seasons' and file '{out_file}'")
    else:
        print(f"Wrote {len(results)} season records to collection 'crop_seasons'")
    client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mongo-uri', default='mongodb://localhost:27017')
    parser.add_argument('--db', default='agriculture')
    parser.add_argument('--input_coll', default='crops_history')
    parser.add_argument('--grouping', choices=['district', 'state'], default='district', help='Aggregate per district (default) or per state')
    parser.add_argument('--per_district', dest='grouping', action='store_const', const='district', help=argparse.SUPPRESS)
    parser.add_argument('--per_state', dest='grouping', action='store_const', const='state', help=argparse.SUPPRESS)
    parser.add_argument('--min_coverage', type=float, default=0.75)
    parser.add_argument('--skip-history-update', action='store_true', help='Do not annotate crops_history documents with month ranges')
    parser.add_argument('--out', help='Optional path to write a JSON snapshot of inferred seasons')
    args = parser.parse_args()

    infer_seasons_from_mongo(
        args.mongo_uri,
        args.db,
        args.input_coll,
        grouping=args.grouping,
        min_coverage=args.min_coverage,
        out_file=args.out,
        annotate_history=not args.skip_history_update
    )
