import os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import json
import io
import sys

USAGE = """
Usage:
  python scripts/merge_commercial.py <city> [--dedupe]

Merges <city>_shops.geojson and <city>_markets.geojson into
raw/osm/<city>_commercial.geojson.

  --dedupe   drop features whose osm_id already appeared in the earlier file
             (markets are merged first, then shops; duplicates removed).
"""


def load(path):
    if not os.path.exists(path):
        print("  (skip, not found:", path, ")")
        return []
    return json.load(io.open(path, encoding="utf-8"))["features"]


def save(path, feats):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "features": feats}, fh, ensure_ascii=False)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(USAGE)
        return
    city = args[0]
    dedupe = "--dedupe" in sys.argv[1:]

    markets = load(f"raw/osm/{city}_markets.geojson")
    shops = load(f"raw/osm/{city}_shops.geojson")

    combined = list(markets) + list(shops)
    if dedupe:
        seen = set()
        uniq = []
        for fe in combined:
            oid = fe["properties"].get("osm_id")
            if oid is not None and oid in seen:
                continue
            if oid is not None:
                seen.add(oid)
            uniq.append(fe)
        combined = uniq

    save(f"raw/osm/{city}_commercial.geojson", combined)
    print(f"{city}: markets={len(markets)} shops={len(shops)} "
          f"-> commercial={len(combined)} (dedupe={dedupe})")


main()