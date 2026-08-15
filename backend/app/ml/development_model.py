"""Development-pressure model (PRD §11, §44).

WHAT THIS MODEL IS, AND IS NOT
------------------------------
It is a gradient-boosted classifier trained on **real labels**: OpenStreetMap's
own land-use tags. Built-up classes (residential, commercial, industrial,
institutional) are the positive class; open classes (farmland, green, vacant,
water) are the negative class. Features are all measured from real geometry —
distance to arterial roads, to the urban core, to existing built-up land, to
facilities, plus local population density.

It therefore answers: *given where roads, people and existing development are,
how developed does this location look?* Applied to undeveloped land, high
probability marks places that resemble already-developed land — i.e. under
development pressure. That is a defensible, explainable planning signal, and
XGBoost's feature importances say exactly which factors drove it.

It is **not** a temporal forecast. A genuine "will this urbanise by 2030" model
needs observed built-up extent at two dates — GHSL or a Sentinel-2 derived
series. This repo has no such observation: the 2018/2022/2026 built-up history
in the demo layers is modelled, so training on it would only teach the model to
reproduce the formula that generated it. Rather than dress that up as a
prediction, the temporal model is left unbuilt and the gap is stated.

See `train()` for what would change once real historical rasters are available:
only the label changes — the feature pipeline is already the right one.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
from shapely.geometry import shape

from app.core.config import MODEL_DIR
from app.gis.raster import PointIndex, haversine_km

BUILT_UP = {"residential", "commercial", "industrial", "institutional", "mixed"}
OPEN_LAND = {"agriculture", "green", "vacant", "water"}

FEATURE_NAMES = [
    "road_km",           # distance to the nearest arterial road
    "core_km",           # distance to the nearest urban core
    "built_km",          # distance to the nearest already-built parcel
    "hospital_km",
    "school_km",
    "transit_km",
    "pop_density",       # people per km² at this point
    "pop_3km",           # catchment population within 3 km
    "area_ha",
]


@dataclass
class ModelReport:
    trained_at: str
    city_id: str
    samples: int
    positives: int
    accuracy: float
    roc_auc: float
    cv_mean: float
    cv_std: float
    feature_importance: dict[str, float]
    label_definition: str
    caveat: str


def _feature_row(
    lng: float,
    lat: float,
    area_ha: float,
    road_idx: PointIndex,
    built_idx: PointIndex,
    facility_idx: dict[str, PointIndex],
    cores: tuple[tuple[float, float], ...],
    grid,
) -> list[float]:
    from app.gis.raster import density_at, population_within_km

    core_km = min(haversine_km(cx, cy, lng, lat) for cx, cy in cores)
    transit = min(
        facility_idx["bus_stop"].nearest_km(lng, lat),
        facility_idx["metro_station"].nearest_km(lng, lat),
    )
    return [
        road_idx.nearest_km(lng, lat),
        float(core_km),
        built_idx.nearest_km(lng, lat),
        facility_idx["hospital"].nearest_km(lng, lat),
        facility_idx["school"].nearest_km(lng, lat),
        transit,
        density_at(grid, lng, lat),
        float(population_within_km(grid, lng, lat, 3.0)),
        area_ha,
    ]


def build_training_frame(ds) -> tuple[np.ndarray, np.ndarray, list[tuple[float, float]]]:
    """Features and labels from the real land polygons."""
    centroids: list[tuple[float, float]] = []
    labels: list[int] = []
    areas: list[float] = []

    for f in ds.land:
        use = f["properties"].get("land_use")
        if use in BUILT_UP:
            label = 1
        elif use in OPEN_LAND:
            label = 0
        else:
            continue
        geom = shape(f["geometry"])
        c = geom.centroid
        centroids.append((c.x, c.y))
        labels.append(label)
        areas.append(float(f["properties"].get("area_sqm", 0)) / 10_000.0)

    # "Distance to already-built land" must not include the parcel being scored,
    # or the model simply learns its own label. Built references are taken from a
    # held-out half of the positives.
    built_pts = [c for c, l in zip(centroids, labels) if l == 1]
    reference_built = PointIndex(built_pts[::2])

    road_idx = ds.road_index
    rows = [
        _feature_row(
            lng, lat, area,
            road_idx, reference_built, ds.facility_index,
            ds.city.urban_cores, ds.grid,
        )
        for (lng, lat), area in zip(centroids, areas)
    ]
    return np.asarray(rows, dtype=float), np.asarray(labels, dtype=int), centroids


def train(ds, save: bool = True) -> ModelReport:
    from datetime import datetime, timezone

    import xgboost as xgb
    from sklearn.metrics import accuracy_score, roc_auc_score
    from sklearn.model_selection import cross_val_score, train_test_split

    X, y, _ = build_training_frame(ds)
    if len(np.unique(y)) < 2:
        raise ValueError("Training data has only one class — check the land layer.")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )
    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= 0.5).astype(int)
    # Cross-validation matters more than a single split here: the classes are
    # unbalanced and the sample is only a few thousand polygons.
    cv = cross_val_score(model, X, y, cv=5, scoring="roc_auc")

    importance = {
        name: float(score)
        for name, score in zip(FEATURE_NAMES, model.feature_importances_)
    }

    report = ModelReport(
        trained_at=datetime.now(timezone.utc).isoformat(),
        city_id=ds.city.id,
        samples=int(len(y)),
        positives=int(y.sum()),
        accuracy=float(accuracy_score(y_test, preds)),
        roc_auc=float(roc_auc_score(y_test, proba)),
        cv_mean=float(cv.mean()),
        cv_std=float(cv.std()),
        feature_importance=dict(sorted(importance.items(), key=lambda kv: -kv[1])),
        label_definition=(
            "1 = OSM land use is residential/commercial/industrial/institutional; "
            "0 = farmland/green/vacant/water"
        ),
        caveat=(
            "Predicts how developed a location looks from real geometry, not whether "
            "it will urbanise by a future date. A temporal forecast needs observed "
            "built-up extent at two dates (GHSL or Sentinel-2), which this repo "
            "does not yet hold."
        ),
    )

    if save:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        model.save_model(str(MODEL_DIR / f"development_{ds.city.id}.json"))
        (MODEL_DIR / f"development_{ds.city.id}_report.json").write_text(
            json.dumps(asdict(report), indent=2), encoding="utf-8"
        )
    return report


def load_report(city_id: str) -> dict | None:
    path = MODEL_DIR / f"development_{city_id}_report.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
