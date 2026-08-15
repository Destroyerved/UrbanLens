import os
import ssl
import json
import time
import http.client
from urllib.parse import urlencode

HOST = "gis.ahmedabadcity.gov.in"
BASE = "/arcgis/rest/services"
OUT_ROOT = "raw/amc"

SERVICES = [
    "Cultural",
    "Health_Facility",
    "Recreational_Services",
    "Our_Ahmedabad",
    "amcimage_new",
]

# layers shared across multiple map services -> fetch once from Cultural
SHARED = {"Landmarks", "Bridges", "Footpath", "Divider",
          "Road_Centerline", "Road_Polygon", "Ward_Boundary",
          "Zone_Boundary", "AMC_Boundary"}
SKIP_LAYER_SUBSTR = ["covid", "lock", "case"]


def make_conn():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.options |= ssl.OP_LEGACY_SERVER_CONNECT
    return http.client.HTTPSConnection(HOST, timeout=90, context=ctx)


def get(path, params, tries=3):
    q = urlencode(params)
    for i in range(tries):
        try:
            conn = make_conn()
            try:
                conn.request("GET", f"{path}?{q}", headers={"User-Agent": "Mozilla/5.0"})
                resp = conn.getresponse()
                body = resp.read().decode("utf-8", "replace")
            finally:
                conn.close()
            if body.strip():
                try:
                    return json.loads(body)
                except Exception:
                    time.sleep(1.5)
        except Exception:
            time.sleep(2)
    return None


def service_layers(svc):
    info = get(f"{BASE}/{svc}/MapServer", {"f": "json"})
    if not info:
        print(f"  WARN: no info for {svc}", flush=True)
        return []
    return [(l["id"], l.get("name", "")) for l in (info.get("layers") or [])]


def query_layer(svc, lid, name):
    out_path = os.path.join(OUT_ROOT, svc)
    os.makedirs(out_path, exist_ok=True)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    fname = os.path.join(out_path, f"{lid}_{safe}.geojson")

    features = []
    offset = 0
    batch = 2000
    while True:
        res = get(f"{BASE}/{svc}/MapServer/{lid}/query", {
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "4326",
            "resultOffset": offset,
            "resultRecordCount": batch,
            "f": "geojson",
        })
        if not res or res.get("features") is None:
            if "error" in str(res)[:200]:
                print(f"  {svc}/{name}: ERROR -> {str(res)[:120]}", flush=True)
            else:
                print(f"  {svc}/{name}: stop at offset {offset}", flush=True)
            break
        feats = res["features"]
        features.extend(feats)
        print(f"  {svc}/{name}: fetched {len(features)}", flush=True)
        if len(feats) < batch:
            break
        offset += batch
        time.sleep(0.3)

    if features:
        fc = {"type": "FeatureCollection", "features": features}
        with open(fname, "w", encoding="utf-8") as f:
            json.dump(fc, f)
        print(f"  {svc}/{name}: SAVED {len(features)} -> {fname}", flush=True)
    else:
        print(f"  {svc}/{name}: no features, skip", flush=True)


def main():
    for svc in SERVICES:
        print(f"SERVICE {svc}", flush=True)
        layers = service_layers(svc)
        print(f"  layers: {[n for _, n in layers]}", flush=True)
        for lid, name in layers:
            if svc != "Cultural" and name in SHARED:
                print(f"  {svc}/{name}: skip (shared, in Cultural)", flush=True)
                continue
            for attempt in range(2):
                try:
                    query_layer(svc, lid, name)
                    break
                except Exception as e:
                    print(f"  ERROR {svc}/{name} try{attempt+1}: {e}", flush=True)
                    time.sleep(2)
            time.sleep(0.3)
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()
