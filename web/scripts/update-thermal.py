"""Standalone thermal refresh — safe to run by hand or from Task Scheduler.

All the logic lives in ``backend/app/thermal.py``; this is just a thin CLI that
reuses it so the in-process loop and the scheduled job can never drift apart.
Prints a machine-readable status line and exits non-zero on failure (so a Task
Scheduler job can be flagged when a refresh failed).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make ``app`` importable whether run from backend/ or web/scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.thermal import refresh  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh the UrbanLens LST layer from NASA GIBS.")
    parser.add_argument("--force", action="store_true", help="download even if the committed date is current")
    args = parser.parse_args()

    result = refresh(force=args.force)
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())