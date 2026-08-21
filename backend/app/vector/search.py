"""FAISS-backed parcel similarity search with an exact NumPy fallback.

The index uses interpretable engineered parcel features, not text embeddings.
That makes similarity useful for planners (area, access, demand, environment,
infrastructure) and avoids adding an embedding service to the deployment.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.core.cache import singleflight
from app.core.config import REPO_ROOT
from app.gis.parcels import Parcel, get_parcels, parcel_signature

INDEX_DIR = REPO_ROOT / "backend" / "cache" / "faiss"
INDEX_DIR.mkdir(parents=True, exist_ok=True)

FEATURE_NAMES = (
    "log_area_sqm",
    "built_up",
    "vegetation",
    "water",
    "road_access",
    "hospital_access",
    "school_access",
    "park_access",
    "transit_access",
    "log_population_3km",
    "accessibility",
    "infrastructure",
    "environment",
    "development_potential",
    "flood_safety",
    "government_land",
)


def _access(distance_km: float | None, scale: float) -> float:
    # None means "nothing of that kind was found", which scores the same as
    # infinitely far. Guarding here as well as in _nearest_km keeps a stray
    # None out of np.isfinite, which raises rather than returning False.
    if distance_km is None or not np.isfinite(distance_km):
        return 0.0
    return float(np.exp(-max(distance_km, 0.0) / scale))


def _nearest_km(p: Parcel, *kinds: str) -> float:
    """Distance to the closest facility of any of `kinds`, in km.

    `nearest` carries an explicit None when nothing of that kind was found
    inside the search radius, and that is not the same as the key being
    absent -- but dict.get's default only covers the absent case. Feeding the
    None straight into min() is what took /api/vector/status down with a
    TypeError on every district whose parcels have an unserved category:
    Ahmedabad has a bus stop near everything and never hit it, Kutch and
    Porbandar do not and hit it immediately.
    """
    found = [v for v in (p.nearest.get(k) for k in kinds) if v is not None]
    return min(found) if found else float("inf")


def parcel_features(p: Parcel) -> np.ndarray:
    flood = {"high": 0.0, "medium": 0.5, "low": 1.0}.get(p.flood_risk, 0.5)
    return np.asarray(
        [
            np.log1p(max(p.area_sqm, 0.0)),
            p.built_up_percent / 100.0,
            p.vegetation_percent / 100.0,
            p.water_percent / 100.0,
            _access(p.road_km, 2.0),
            _access(_nearest_km(p, "hospital"), 5.0),
            _access(_nearest_km(p, "school"), 3.0),
            _access(_nearest_km(p, "park"), 3.0),
            _access(_nearest_km(p, "bus_stop", "metro_station"), 3.0),
            np.log1p(max(p.pop_3km, 0)),
            p.scores.get("accessibility", 0.0) / 100.0,
            p.scores.get("infrastructure", 0.0) / 100.0,
            p.scores.get("environment", 0.0) / 100.0,
            p.scores.get("development_potential", 0.0) / 100.0,
            flood,
            1.0 if p.ownership == "government" else 0.0,
        ],
        dtype=np.float32,
    )


@dataclass
class VectorIndex:
    city_id: str
    signature: str
    ids: list[str]
    id_to_row: dict[str, int]
    matrix: np.ndarray
    mean: np.ndarray
    std: np.ndarray
    backend: str
    faiss_index: object | None = None

    def search_row(self, row: int, limit: int) -> list[tuple[int, float]]:
        k = min(max(limit + 1, 2), len(self.ids))
        query = self.matrix[row : row + 1]
        if self.faiss_index is not None:
            scores, indices = self.faiss_index.search(query, k)
            pairs = [(int(i), float(s)) for i, s in zip(indices[0], scores[0]) if i >= 0 and i != row]
        else:
            sims = self.matrix @ query[0]
            order = np.argsort(-sims)
            pairs = [(int(i), float(sims[i])) for i in order if int(i) != row]
        return pairs[:limit]


def _paths(city_id: str, signature: str) -> tuple[Path, Path]:
    digest = hashlib.blake2b(signature.encode("utf-8"), digest_size=8).hexdigest()
    stem = INDEX_DIR / f"{city_id}-{digest}"
    return stem.with_suffix(".npz"), stem.with_suffix(".faiss")


def _try_import_faiss():
    try:
        import faiss  # type: ignore
        return faiss
    except ImportError:
        return None


def _normalise(raw: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = raw.mean(axis=0).astype(np.float32)
    std = raw.std(axis=0).astype(np.float32)
    std[std < 1e-6] = 1.0
    z = ((raw - mean) / std).astype(np.float32)
    norm = np.linalg.norm(z, axis=1, keepdims=True)
    norm[norm < 1e-8] = 1.0
    return (z / norm).astype(np.float32), mean, std


def _load_persisted(city_id: str, signature: str) -> VectorIndex | None:
    npz_path, faiss_path = _paths(city_id, signature)
    if not npz_path.exists():
        return None
    try:
        data = np.load(npz_path, allow_pickle=False)
        matrix = data["matrix"].astype(np.float32)
        ids = [str(x) for x in data["ids"].tolist()]
        mean = data["mean"].astype(np.float32)
        std = data["std"].astype(np.float32)
    except (OSError, KeyError, ValueError):
        return None

    faiss = _try_import_faiss()
    index = None
    backend = "numpy"
    if faiss is not None:
        if faiss_path.exists():
            try:
                index = faiss.read_index(str(faiss_path))
            except Exception:
                index = None
        if index is None:
            index = faiss.IndexFlatIP(matrix.shape[1])
            index.add(matrix)
            try:
                faiss.write_index(index, str(faiss_path))
            except Exception:
                pass
        backend = "faiss.IndexFlatIP"
    return VectorIndex(city_id, signature, ids, {pid: i for i, pid in enumerate(ids)}, matrix, mean, std, backend, index)


def _build(city_id: str, signature: str) -> VectorIndex:
    existing = _load_persisted(city_id, signature)
    if existing is not None:
        return existing

    parcels = get_parcels(city_id)
    if not parcels:
        return VectorIndex(city_id, signature, [], {}, np.empty((0, len(FEATURE_NAMES)), dtype=np.float32),
                           np.zeros(len(FEATURE_NAMES), dtype=np.float32), np.ones(len(FEATURE_NAMES), dtype=np.float32),
                           "numpy", None)
    raw = np.vstack([parcel_features(p) for p in parcels]).astype(np.float32)
    matrix, mean, std = _normalise(raw)
    ids = [p.parcel_id for p in parcels]

    npz_path, faiss_path = _paths(city_id, signature)
    try:
        np.savez_compressed(npz_path, matrix=matrix, ids=np.asarray(ids), mean=mean, std=std)
    except OSError:
        pass

    faiss = _try_import_faiss()
    index = None
    backend = "numpy"
    if faiss is not None:
        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)
        backend = "faiss.IndexFlatIP"
        try:
            faiss.write_index(index, str(faiss_path))
        except Exception:
            pass
    return VectorIndex(city_id, signature, ids, {pid: i for i, pid in enumerate(ids)}, matrix, mean, std, backend, index)


@lru_cache(maxsize=16)
def _index_cached(city_id: str, signature: str) -> VectorIndex:
    return _build(city_id, signature)


def get_vector_index(city_id: str) -> VectorIndex:
    signature = parcel_signature(city_id)
    with singleflight(("vector-index", city_id, signature)):
        return _index_cached(city_id, signature)


@lru_cache(maxsize=16)
def _parcel_map_cached(city_id: str, signature: str) -> dict[str, Parcel]:
    return {p.parcel_id: p for p in get_parcels(city_id)}


def similar_parcels(city_id: str, parcel_id: str, limit: int = 10) -> dict:
    index = get_vector_index(city_id)
    if not index.ids:
        return {"city": city_id, "parcel_id": parcel_id, "backend": index.backend, "results": []}
    row = index.id_to_row.get(parcel_id)
    if row is None:
        raise KeyError(parcel_id)

    parcels = _parcel_map_cached(city_id, index.signature)
    results = []
    for i, sim in index.search_row(row, limit):
        pid = index.ids[i]
        p = parcels[pid]
        # cosine is [-1,1]; clamp a display-friendly percentage without claiming
        # it is a statistical probability.
        similarity = round(max(0.0, min(1.0, (sim + 1.0) / 2.0)) * 100, 1)
        results.append(
            {
                "parcel_id": pid,
                "similarity": similarity,
                "centroid": list(p.centroid),
                "area_acres": p.area_acres,
                "land_use": p.land_use,
                "ownership": p.ownership,
                "flood_risk": p.flood_risk,
                "development_potential": round(p.scores.get("development_potential", 0)),
            }
        )
    return {
        "city": city_id,
        "parcel_id": parcel_id,
        "backend": index.backend,
        "dimensions": len(FEATURE_NAMES),
        "feature_names": list(FEATURE_NAMES),
        "indexed_parcels": len(index.ids),
        "results": results,
    }
