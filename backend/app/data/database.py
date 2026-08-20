"""SQLite lifecycle and persistent compute-cache support for UrbanLens.

The database is deliberately self-initialising. A configured database path can
point to a missing/empty file: the backend creates the schema instead of failing
with ``no such table: layers``. Source GeoJSON remains the canonical fallback,
so a partially-populated DB never makes layers disappear.
"""
from __future__ import annotations

import json
import os
import sqlite3
import zlib

try:
    import orjson
except ImportError:  # pragma: no cover - fallback for minimal installs
    orjson = None
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Iterable

from app.core.config import DATA_DIR

SCHEMA_VERSION = 4
CORE_LAYERS = ("wards", "land", "facilities", "roads")
OPTIONAL_LAYERS = ("vegetation", "greenspace", "water", "flood")
ALL_LAYERS = CORE_LAYERS + OPTIONAL_LAYERS
_LOCK = RLock()


def _dumps(value) -> bytes:
    if orjson is not None:
        return orjson.dumps(value, option=orjson.OPT_NON_STR_KEYS)
    return json.dumps(value, separators=(",", ":")).encode("utf-8")


def _loads(value):
    if orjson is not None:
        return orjson.loads(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        value = bytes(value).decode("utf-8")
    return json.loads(value)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str | Path, *, readonly: bool = False) -> sqlite3.Connection:
    path = Path(path)
    if readonly:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=15)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, timeout=30)
    conn.execute("PRAGMA busy_timeout=15000")
    if not readonly:
        # WAL allows the API to keep reading layers while a persistent parcel
        # cache/index metadata entry is written.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


def ensure_database(path: str | Path) -> Path:
    """Create/upgrade the database schema in-place and return its Path."""
    path = Path(path)
    with _LOCK:
        conn = connect(path)
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_meta (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS layers (
                  city TEXT NOT NULL,
                  layer TEXT NOT NULL,
                  data TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (city, layer)
                );
                CREATE INDEX IF NOT EXISTS idx_layers_city ON layers(city);

                CREATE TABLE IF NOT EXISTS data_status (
                  city TEXT PRIMARY KEY,
                  layers_missing TEXT NOT NULL,
                  imported_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS parcel_cache (
                  city TEXT NOT NULL,
                  source_signature TEXT NOT NULL,
                  data BLOB NOT NULL,
                  parcel_count INTEGER NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (city, source_signature)
                );
                CREATE INDEX IF NOT EXISTS idx_parcel_cache_city
                  ON parcel_cache(city, updated_at DESC);

                CREATE TABLE IF NOT EXISTS vector_index_meta (
                  city TEXT NOT NULL,
                  source_signature TEXT NOT NULL,
                  backend TEXT NOT NULL,
                  dimensions INTEGER NOT NULL,
                  item_count INTEGER NOT NULL,
                  index_path TEXT,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (city, source_signature)
                );

                CREATE TABLE IF NOT EXISTS json_cache (
                  cache_key TEXT NOT NULL,
                  city TEXT NOT NULL,
                  source_signature TEXT NOT NULL,
                  data BLOB NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (cache_key, city, source_signature)
                );

                CREATE TABLE IF NOT EXISTS response_cache (
                  cache_key TEXT NOT NULL,
                  city TEXT NOT NULL,
                  source_signature TEXT NOT NULL,
                  data BLOB NOT NULL,
                  gzip_data BLOB NOT NULL,
                  etag TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (cache_key, city, source_signature)
                );
                CREATE INDEX IF NOT EXISTS idx_response_cache_city
                  ON response_cache(cache_key, city, updated_at DESC);
                """
            )
            conn.execute(
                "INSERT INTO schema_meta(key,value) VALUES('schema_version',?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(SCHEMA_VERSION),),
            )
            conn.commit()
        finally:
            conn.close()
    return path


def import_layers(path: str | Path, cities: Iterable[str], layers: Iterable[str] = ALL_LAYERS) -> dict[str, list[str]]:
    """Upsert existing engine files for the requested cities.

    Missing optional layers are tolerated; missing core layers are reflected in
    ``data_status``. This function is shared by the CLI importer and startup
    auto-seeding so schema behaviour cannot drift between them.
    """
    path = ensure_database(path)
    now = utcnow()
    result: dict[str, list[str]] = {}
    conn = connect(path)
    try:
        for city in cities:
            present: list[str] = []
            missing_core: list[str] = []
            for layer in layers:
                src = DATA_DIR / f"{city}_{layer}.json"
                if not src.exists():
                    if layer in CORE_LAYERS:
                        missing_core.append(layer)
                    continue
                try:
                    doc = json.loads(src.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    if layer in CORE_LAYERS:
                        missing_core.append(layer)
                    continue
                # Stable timestamp based on the source file means rerunning the
                # importer without changing data does not invalidate caches.
                updated = str(src.stat().st_mtime_ns)
                conn.execute(
                    "INSERT INTO layers(city,layer,data,updated_at) VALUES(?,?,?,?) "
                    "ON CONFLICT(city,layer) DO UPDATE SET "
                    "data=excluded.data, updated_at=excluded.updated_at",
                    (city, layer, json.dumps(doc, separators=(",", ":")), updated),
                )
                present.append(layer)
            conn.execute(
                "INSERT INTO data_status(city,layers_missing,imported_at) VALUES(?,?,?) "
                "ON CONFLICT(city) DO UPDATE SET "
                "layers_missing=excluded.layers_missing, imported_at=excluded.imported_at",
                (city, ",".join(missing_core), now),
            )
            result[city] = present
        conn.commit()
    finally:
        conn.close()
    return result


def has_city_layers(path: str | Path, city: str, required: Iterable[str] = CORE_LAYERS) -> bool:
    path = Path(path)
    if not path.exists():
        return False
    try:
        conn = connect(path, readonly=True)
        try:
            rows = conn.execute("SELECT layer FROM layers WHERE city=?", (city,)).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return False
    found = {r[0] for r in rows}
    return all(x in found for x in required)


def load_parcel_cache(path: str | Path, city: str, signature: str) -> list[dict] | None:
    path = Path(path)
    if not path.exists():
        return None
    try:
        conn = connect(path, readonly=True)
        try:
            row = conn.execute(
                "SELECT data FROM parcel_cache WHERE city=? AND source_signature=?",
                (city, signature),
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    if row is None:
        return None
    try:
        return _loads(zlib.decompress(row[0]))
    except (zlib.error, UnicodeDecodeError, json.JSONDecodeError):
        return None


def store_parcel_cache(path: str | Path, city: str, signature: str, rows: list[dict]) -> None:
    """Persist enriched parcels; failure is non-fatal (e.g. read-only host)."""
    payload = zlib.compress(_dumps(rows), level=3)
    try:
        conn = connect(path)
        try:
            conn.execute(
                "INSERT INTO parcel_cache(city,source_signature,data,parcel_count,updated_at) "
                "VALUES(?,?,?,?,?) ON CONFLICT(city,source_signature) DO UPDATE SET "
                "data=excluded.data, parcel_count=excluded.parcel_count, updated_at=excluded.updated_at",
                (city, signature, payload, len(rows), utcnow()),
            )
            # Keep only the newest two signatures per city.
            conn.execute(
                "DELETE FROM parcel_cache WHERE city=? AND source_signature NOT IN ("
                "SELECT source_signature FROM parcel_cache WHERE city=? ORDER BY updated_at DESC LIMIT 2)",
                (city, city),
            )
            conn.commit()
        finally:
            conn.close()
    except (sqlite3.Error, OSError):
        return


def load_json_cache(path: str | Path, cache_key: str, city: str, signature: str) -> dict | list | None:
    path = Path(path)
    if not path.exists():
        return None
    try:
        conn = connect(path, readonly=True)
        try:
            row = conn.execute(
                "SELECT data FROM json_cache WHERE cache_key=? AND city=? AND source_signature=?",
                (cache_key, city, signature),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        return _loads(zlib.decompress(row[0]))
    except (sqlite3.Error, OSError, zlib.error, UnicodeDecodeError, json.JSONDecodeError):
        return None


def store_json_cache(path: str | Path, cache_key: str, city: str, signature: str, value: dict | list) -> None:
    payload = zlib.compress(_dumps(value), level=3)
    try:
        conn = connect(path)
        try:
            conn.execute(
                "INSERT INTO json_cache(cache_key,city,source_signature,data,updated_at) VALUES(?,?,?,?,?) "
                "ON CONFLICT(cache_key,city,source_signature) DO UPDATE SET "
                "data=excluded.data, updated_at=excluded.updated_at",
                (cache_key, city, signature, payload, utcnow()),
            )
            conn.commit()
        finally:
            conn.close()
    except (sqlite3.Error, OSError):
        return



def load_response_cache(
    path: str | Path, cache_key: str, city: str, signature: str
) -> tuple[bytes, bytes, str] | None:
    """Return pre-serialized HTTP payloads without JSON decoding.

    This is intentionally separate from ``json_cache``. UI bootstrap responses
    are large but immutable for a source signature; parsing them into Python
    objects just to serialize them again would waste 50-200 ms on every fresh
    worker. The exact JSON bytes and their pre-gzipped form are persisted.
    """
    path = Path(path)
    if not path.exists():
        return None
    try:
        conn = connect(path, readonly=True)
        try:
            row = conn.execute(
                "SELECT data,gzip_data,etag FROM response_cache "
                "WHERE cache_key=? AND city=? AND source_signature=?",
                (cache_key, city, signature),
            ).fetchone()
        finally:
            conn.close()
    except (sqlite3.Error, OSError):
        return None
    if row is None:
        return None
    return bytes(row[0]), bytes(row[1]), str(row[2])


def store_response_cache(
    path: str | Path,
    cache_key: str,
    city: str,
    signature: str,
    data: bytes,
    gzip_data: bytes,
    etag: str,
) -> None:
    """Persist already-serialized HTTP response bytes; failure is non-fatal."""
    try:
        conn = connect(path)
        try:
            conn.execute(
                "INSERT INTO response_cache(cache_key,city,source_signature,data,gzip_data,etag,updated_at) "
                "VALUES(?,?,?,?,?,?,?) ON CONFLICT(cache_key,city,source_signature) DO UPDATE SET "
                "data=excluded.data,gzip_data=excluded.gzip_data,etag=excluded.etag,updated_at=excluded.updated_at",
                (cache_key, city, signature, data, gzip_data, etag, utcnow()),
            )
            conn.execute(
                "DELETE FROM response_cache WHERE cache_key=? AND city=? AND source_signature NOT IN ("
                "SELECT source_signature FROM response_cache WHERE cache_key=? AND city=? "
                "ORDER BY updated_at DESC LIMIT 2)",
                (cache_key, city, cache_key, city),
            )
            conn.commit()
        finally:
            conn.close()
    except (sqlite3.Error, OSError):
        return

def db_status(path: str | Path | None) -> dict:
    if path is None:
        return {"enabled": False, "path": None, "schema_version": None}
    p = Path(path)
    if not p.exists():
        return {"enabled": True, "path": str(p), "exists": False, "schema_version": None}
    try:
        conn = connect(p, readonly=True)
        try:
            version = conn.execute("SELECT value FROM schema_meta WHERE key='schema_version'").fetchone()
            layers = conn.execute("SELECT COUNT(*) FROM layers").fetchone()[0]
            caches = conn.execute("SELECT COUNT(*) FROM parcel_cache").fetchone()[0]
            response_caches = conn.execute("SELECT COUNT(*) FROM response_cache").fetchone()[0]
        finally:
            conn.close()
        return {
            "enabled": True,
            "path": str(p),
            "exists": True,
            "schema_version": int(version[0]) if version else 1,
            "layers": layers,
            "parcel_caches": caches,
            "response_caches": response_caches,
        }
    except sqlite3.Error as exc:
        return {"enabled": True, "path": str(p), "exists": True, "error": str(exc)}
