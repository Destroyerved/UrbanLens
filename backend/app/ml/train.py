"""Train the development model.

    python -m app.ml.train [city_id]
"""
from __future__ import annotations

import sys

from app.data.loader import get_dataset
from app.ml.development_model import train


def main() -> None:
    city = sys.argv[1] if len(sys.argv) > 1 else "ahmedabad"
    ds = get_dataset(city)
    report = train(ds)
    print(f"{city}: {report.samples} samples, {report.positives} built-up")
    print(f"  accuracy {report.accuracy:.3f} · ROC AUC {report.roc_auc:.3f} "
          f"· CV {report.cv_mean:.3f} ± {report.cv_std:.3f}")
    for name, score in report.feature_importance.items():
        print(f"    {name:14s} {score:.3f}")


if __name__ == "__main__":
    main()
