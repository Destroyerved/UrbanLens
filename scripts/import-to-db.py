"""Import UrbanLens engine layers into the self-initialising SQLite database.

Usage:
    python scripts/import-to-db.py
    python scripts/import-to-db.py --city ahmedabad
    python scripts/import-to-db.py --city ahmedabad --layer water
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.data.database import ALL_LAYERS, CORE_LAYERS, ensure_database, import_layers  # noqa: E402
from app.core.config import GUJARAT_CONFIG_PATH  # noqa: E402

DEFAULT_DB = BACKEND / "urbanlens.db"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=str(DEFAULT_DB), help="SQLite file to write")
    ap.add_argument("--city", help="only this district id")
    ap.add_argument("--layer", choices=ALL_LAYERS, help="only this layer")
    args = ap.parse_args()

    cfg = json.loads(GUJARAT_CONFIG_PATH.read_text(encoding="utf-8"))
    districts = [d["id"] for d in cfg.get("districts", [])]
    if args.city:
        if args.city not in districts:
            raise SystemExit(f"{args.city} is not a district id in gujarat_config.json")
        districts = [args.city]

    layers = (args.layer,) if args.layer else ALL_LAYERS
    db = ensure_database(args.db)
    result = import_layers(db, districts, layers)

    for city in districts:
        present = result.get(city, [])
        missing = [l for l in CORE_LAYERS if not (REPO / "web" / "data" / "engine" / f"{city}_{l}.json").exists()]
        print(f"  {city}: imported {','.join(present) or '-'} | missing core {','.join(missing) or '-'}")
    print(f"wrote {db}")


if __name__ == "__main__":
    main()
