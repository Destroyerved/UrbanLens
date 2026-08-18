"""Run the satellite NDVI pipeline for every district, one at a time.

Each district is processed as its own bbox. Districts that already have a
vegetation.json are skipped, so a stalled run can simply be restarted.

Usage:
    python scripts/run-satellite-all.py            # every district
    python scripts/run-satellite-all.py [ids...]   # only these districts
    python scripts/run-satellite-all.py --refine   # re-run districts whose
                                                   # existing vegetation is
                                                   # missing wards (e.g. before
                                                   # multi-tile mosaics existed)
"""

from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

# fetch-satellite.py has a hyphen, so it is not importable by name.
_SPEC = importlib.util.spec_from_file_location(
    "fetch_satellite", Path(__file__).resolve().parent / "fetch-satellite.py"
)
fs = importlib.util.module_from_spec(_SPEC)
assert _SPEC.loader is not None
_SPEC.loader.exec_module(fs)

ENGINE = fs.ENGINE


def incomplete(cid: str) -> bool:
    """True if the district's vegetation layer is missing any ward NDVI."""
    p = ENGINE / f"{cid}_vegetation.json"
    if not p.exists():
        return True
    doc = json.loads(p.read_text(encoding="utf-8"))
    feats = doc.get("features", [])
    if not feats:
        return True
    return any(f.get("properties", {}).get("cells", 0) == 0 for f in feats)


def main(argv: list[str]) -> int:
    refine = "--refine" in argv
    args = [a for a in argv if a != "--refine"]
    if args:
        ids = args
    else:
        cfg = json.loads((ENGINE / "gujarat_config.json").read_text(encoding="utf-8"))
        ids = [d["id"] for d in cfg.get("districts", [])]

    ok, failed = 0, 0
    for cid in ids:
        out = ENGINE / f"{cid}_vegetation.json"
        if out.exists() and not refine:
            print(f"== skip {cid} (already has vegetation)")
            continue
        if refine and out.exists() and not incomplete(cid):
            print(f"== skip {cid} (vegetation complete)")
            continue
        print(f"\n== {cid} ================", flush=True)
        try:
            fs.main([cid])
            ok += 1
        except SystemExit as e:
            print(f"!! {cid} exited: {e}", flush=True)
            failed += 1
        except Exception as e:  # noqa: BLE001
            print(f"!! {cid} failed: {e}", flush=True)
            failed += 1
        time.sleep(2)

    print(f"\nDONE: {ok} ok, {failed} failed (re-run to retry failed ones)")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
