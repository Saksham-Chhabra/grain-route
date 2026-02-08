from __future__ import annotations

from datetime import datetime
from typing import Optional

import pandas as pd
from pymongo import MongoClient


class MongoDataLoader:
    def __init__(self, mongo_uri: str, db_name: Optional[str] = None) -> None:
        self.client = MongoClient(mongo_uri)
        if db_name:
            self.db = self.client[db_name]
        else:
            try:
                self.db = self.client.get_default_database()
            except Exception as exc:  # pragma: no cover
                raise ValueError("Provide MONGODB_DB_NAME when URI has no default database") from exc
        if self.db is None:
            raise ValueError("Could not resolve MongoDB database. Set MONGODB_DB_NAME.")

    def close(self) -> None:
        self.client.close()

    def _collection_to_frame(self, name: str, query: Optional[dict] = None, projection: Optional[dict] = None) -> pd.DataFrame:
        cursor = self.db[name].find(query or {}, projection)
        docs = list(cursor)
        if not docs:
            return pd.DataFrame()
        return pd.DataFrame(docs)

    def fetch_nodes(self) -> pd.DataFrame:
        projection = {
            "nodeId": 1,
            "name": 1,
            "type": 1,
            "state": 1,
            "district": 1,
            "regionId": 1,
            "location": 1,
            "capacity_kg": 1,
        }
        return self._collection_to_frame("nodes", projection=projection)

    def fetch_ngos(self) -> pd.DataFrame:
        projection = {
            "name": 1,
        }
        return self._collection_to_frame("ngos", projection=projection)

    def fetch_batches(self, start: Optional[datetime] = None, end: Optional[datetime] = None) -> pd.DataFrame:
        query = self._date_query("manufacture_date", start, end)
        projection = {
            "batchId": 1,
            "originNode": 1,
            "currentNode": 1,
            "quantity_kg": 1,
            "original_quantity_kg": 1,
            "manufacture_date": 1,
            "expiry_iso": 1,
            "status": 1,
            "shelf_life_hours": 1,
            "freshnessPct": 1,
        }
        return self._collection_to_frame("batches", query=query, projection=projection)

    def fetch_requests(self, start: Optional[datetime] = None, end: Optional[datetime] = None) -> pd.DataFrame:
        # Backend A stores the request due date as requiredBefore.
        query = self._date_query("requiredBefore", start, end)
        projection = {
            "requestId": 1,
            "requestID": 1,
            "requesterNode": 1,
            "items": 1,
            "requiredBefore": 1,
            "createdOn": 1,
            "status": 1,
            "history": 1,
        }
        return self._collection_to_frame("requests", query=query, projection=projection)

    def fetch_shipments(self, start: Optional[datetime] = None, end: Optional[datetime] = None) -> pd.DataFrame:
        query = self._date_query("start_iso", start, end)
        projection = {
            "shipmentId": 1,
            "batchIds": 1,
            "fromNode": 1,
            "toNode": 1,
            "start_iso": 1,
            "eta_iso": 1,
            "arrived_iso": 1,
            "status": 1,
            "travel_time_minutes": 1,
        }
        return self._collection_to_frame("shipments", query=query, projection=projection)

    @staticmethod
    def _date_query(field: str, start: Optional[datetime], end: Optional[datetime]) -> Optional[dict]:
        if not start and not end:
            return None
        clause: dict = {field: {}}
        if start:
            clause[field]["$gte"] = start
        if end:
            clause[field]["$lte"] = end
        return clause
