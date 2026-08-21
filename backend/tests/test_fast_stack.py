from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.data.database import ALL_LAYERS, db_status, ensure_database, import_layers
from app.data.loader import ACTIVE_DB_PATH, SqliteSource, get_flood, get_water
from app.gis.parcels import get_parcels
from app.main import app
from app.vector.search import get_vector_index, similar_parcels


def test_database_self_initialises_and_imports_all_layers(tmp_path: Path):
    db = tmp_path / "urbanlens.db"
    ensure_database(db)
    status = db_status(db)
    assert status["exists"] is True
    assert status["schema_version"] >= 4

    imported = import_layers(db, ["ahmedabad"], ALL_LAYERS)
    assert "water" in imported["ahmedabad"]
    assert "flood" in imported["ahmedabad"]

    conn = sqlite3.connect(db)
    try:
        names = {r[0] for r in conn.execute("SELECT layer FROM layers WHERE city='ahmedabad'")}
    finally:
        conn.close()
    assert {"wards", "land", "facilities", "roads", "water", "flood"}.issubset(names)


def test_sqlite_fingerprint_refreshes_after_wal_write(tmp_path: Path):
    db = tmp_path / "fingerprint.db"
    import_layers(db, ["ahmedabad"], ["wards"])
    source = SqliteSource(db)
    first = source.fingerprint("ahmedabad", "wards")
    conn = sqlite3.connect(db)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            "UPDATE layers SET updated_at='changed-by-test' WHERE city='ahmedabad' AND layer='wards'"
        )
        conn.commit()
    finally:
        conn.close()
    assert source.fingerprint("ahmedabad", "wards") == "changed-by-test"
    assert first != "changed-by-test"


def test_db_mode_has_water_and_flood():
    assert len(get_water("ahmedabad").get("features", [])) > 0
    assert len(get_flood("ahmedabad").get("features", [])) > 0


def test_persisted_parcels_and_vector_search():
    parcels = get_parcels("ahmedabad")
    assert len(parcels) > 1000
    idx = get_vector_index("ahmedabad")
    assert len(idx.ids) == len(parcels)
    result = similar_parcels("ahmedabad", parcels[0].parcel_id, 5)
    assert len(result["results"]) == 5
    assert result["dimensions"] >= 10


def test_api_smoke():
    with TestClient(app) as client:
        health = client.get("/api/health?city=ahmedabad")
        assert health.status_code == 200
        assert health.json()["ok"] is True
        # Health must not load the GIS dataset unless explicitly requested.
        assert "counts" not in health.json()
        deep = client.get("/api/health?city=ahmedabad&deep=true")
        assert deep.status_code == 200
        assert deep.json()["counts"]["parcels"] > 1000

        bootstrap = client.get("/api/bootstrap?city=ahmedabad")
        assert bootstrap.status_code == 200
        assert bootstrap.json()["v"] >= 3
        assert len(bootstrap.json()["p"]) > 1000
        etag = bootstrap.headers["etag"]
        not_modified = client.get("/api/bootstrap?city=ahmedabad", headers={"If-None-Match": etag})
        assert not_modified.status_code == 304

        wards = client.get("/api/wards?city=ahmedabad")
        assert wards.status_code == 200
        assert len(wards.json()["features"]) > 0

        parcels = client.get("/api/parcels?city=ahmedabad")
        assert parcels.status_code == 200
        pid = parcels.json()["features"][0]["properties"]["parcel_id"]
        similar = client.get(f"/api/parcels/{pid}/similar?city=ahmedabad&limit=3")
        assert similar.status_code == 200
        assert len(similar.json()["results"]) == 3

        growth = client.get("/api/growth/prediction?city=ahmedabad")
        assert growth.status_code == 200
        assert len(growth.json()["features"]) > 0


def test_bundled_database_is_active():
    assert ACTIVE_DB_PATH is not None
    status = db_status(ACTIVE_DB_PATH)
    assert status.get("schema_version", 0) >= 4
    assert status.get("parcel_caches", 0) >= 1


def test_parcel_detail_and_full_attributes_smoke():
    with TestClient(app) as client:
        # Full detail query
        res = client.get("/api/parcels?city=ahmedabad&detail=full")
        assert res.status_code == 200
        feat = res.json()["features"][0]
        assert "hospital_km" in feat["properties"]
        assert "transit_km" in feat["properties"]
        pid = feat["properties"]["parcel_id"]

        # Detail endpoint
        detail = client.get(f"/api/parcels/{pid}?city=ahmedabad")
        assert detail.status_code == 200
        d_json = detail.json()
        assert d_json["parcel_id"] == pid
        assert "distances" in d_json
        assert "scores" in d_json

        # Report PDF generation smoke
        report = client.post("/api/report", json={"parcel_id": pid, "city": "ahmedabad", "project_type": "hospital"})
        assert report.status_code == 200
        assert report.headers["content-type"] == "application/pdf"
        assert len(report.content) > 1000


def test_decay_score_guards():
    from app.gis.scoring import decay_score
    import math

    assert decay_score(None, 1.0, 5.0) == 0.0
    assert decay_score(float("nan"), 1.0, 5.0) == 0.0
    assert decay_score(float("inf"), 1.0, 5.0) == 0.0
    assert decay_score(0.5, 1.0, 5.0) == 100.0
    assert decay_score(6.0, 1.0, 5.0) == 0.0
    assert math.isclose(decay_score(3.0, 1.0, 5.0), 50.0)

