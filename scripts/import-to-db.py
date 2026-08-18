"""Import every district layer from web/data/engine into a SQLite database.

The filesystem stays the default serving source (loader.FilesystemSource);
this script builds the optional `layers` table that SqliteSource reads when
URBANLENS_DB is set. The app runs unchanged either way.

Rerun anytime to refresh a district or layer — rows are upserted by
(city, layer) and `updated_at` advances, which is what lets the backend's
fingerprint-keyed cache serve fresh data without a restart.

Composites (ahmedabad-gandhinagar, ahmedabad-metro, gujarat) are views
resolved in memory from member districts, so they are never stored here.

Usage:
    python scripts/import-to-db.py                 # all districts, all layers
    python scripts/import-to-db.py --city porbandar
    python scripts/import-to-db.py --city porbandar --layer vegetation
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENGINE = REPO / "web" / "data" / "engine"
DEFAULT_DB = REPO / "backend" / "urbanlens.db"

CORE_LAYERS = ["wards", "land", "facilities", "roads"]
OPTIONAL_LAYERS = ["vegetation", "greenspace"]
ALL_LAYERS = CORE_LAYERS + OPTIONAL_LAYERS


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=str(DEFAULT_DB), help="SQLite file to write")
    ap.add_argument("--city", help="only this district id")
    ap.add_argument("--layer", choices=ALL_LAYERS, help="only this layer")
    args = ap.parse_args()

    cfg = json.loads((ENGINE / "gujarat_config.json").read_text(encoding="utf-8"))
    districts = [d["id"] for d in cfg.get("districts", [])]
    if args.city:
        if args.city not in districts:
            raise SystemExit(f"{args.city} is not a district id in gujarat_config.json")
        districts = [args.city]

    layers = [args.layer] if args.layer else ALL_LAYERS
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    conn = sqlite3.connect(args.db)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS layers (
              city TEXT NOT NULL,
              layer TEXT NOT NULL,
              data TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (city, layer)
            );
            CREATE TABLE IF NOT EXISTS data_status (
              city TEXT PRIMARY KEY,
              layers_missing TEXT NOT NULL,
              imported_at TEXT NOT NULL
            );
            """
        )
        for city in districts:
            present: list[str] = []
            missing: list[str] = []
            for layer in layers:
                path = ENGINE / f"{city}_{layer}.json"
                if not path.exists():
                    if layer in CORE_LAYERS:
                        missing.append(layer)
                    continue
                try:
                    doc = json.loads(path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    # File mid-write (OSM fetch still running) — record as missing;
                    # a later rerun picks it up.
                    if layer in CORE_LAYERS:
                        missing.append(layer)
                    continue
                conn.execute(
                    "INSERT INTO layers(city, layer, data, updated_at) VALUES(?,?,?,?) "
                    "ON CONFLICT(city, layer) DO UPDATE SET "
                    "  data = excluded.data, updated_at = excluded.updated_at",
                    (city, layer, json.dumps(doc, separators=(",", ":")), now),
                )
                present.append(layer)
            conn.execute(
                "INSERT INTO data_status(city, layers_missing, imported_at) VALUES(?,?,?) "
                "ON CONFLICT(city) DO UPDATE SET "
                "  layers_missing = excluded.layers_missing, imported_at = excluded.imported_at",
                (city, ",".join(missing), now),
            )
            print(f"  {city}: imported {','.join(present) or '-'} | missing {','.join(missing) or '-'}")
        conn.commit()
    finally:
        conn.close()
    print(f"wrote {args.db}")


if __name__ == "__main__":
    main()
