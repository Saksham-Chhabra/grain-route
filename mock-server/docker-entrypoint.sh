#!/usr/bin/env bash
set -euo pipefail

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  echo "[$(timestamp)] $*"
}

MONGO_URI="${MONGO_URI:-mongodb://mongo:27017/arcanix}"

if [ -z "${MONGO_DB:-}" ]; then
  MONGO_DB="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
uri = os.environ.get('MONGO_URI', 'mongodb://mongo:27017/arcanix')
parsed = urlparse(uri)
path = parsed.path.lstrip('/')
print(path or 'arcanix')
PY
)"
else
  MONGO_DB="${MONGO_DB}"
fi

export MONGO_URI MONGO_DB

log "Waiting for MongoDB at ${MONGO_URI} (db: ${MONGO_DB})"
until python3 - <<PY
import sys
from pymongo import MongoClient
uri = "${MONGO_URI}"
try:
    client = MongoClient(uri, serverSelectionTimeoutMS=2000)
    client.admin.command('ping')
except Exception:
    sys.exit(1)
else:
    client.close()
PY

do
  log "MongoDB not reachable yet, retrying in 3s..."
  sleep 3

done
log "MongoDB connection verified."

if [ "${SKIP_DATA_SETUP:-0}" != "1" ]; then
  pushd /app/mock-data > /dev/null
  log "Running excel-to-mongo.py"
  python3 excel-to-mongo.py --folder ./crop-generation-data --mongo-uri "${MONGO_URI}" --db "${MONGO_DB}"
  log "Running infer-seasons.py"
  python3 infer-seasons.py --mongo-uri "${MONGO_URI}" --db "${MONGO_DB}"
  popd > /dev/null
else
  log "Skipping data setup scripts because SKIP_DATA_SETUP=1"
fi

log "Starting Scenario Manager server on port ${PORT:-5001}"
exec node src/server.js
