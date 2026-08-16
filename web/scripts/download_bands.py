import json
import os
import sys
import time

import requests

BASE_DL = "https://download.dataspace.copernicus.eu/odata/v1"
BASE_CAT = "https://catalogue.dataspace.copernicus.eu/odata/v1"
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "raw", ".cdse_token")
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "raw", "satellite")

TARGETS = ["_B04_10m.jp2", "_B08_10m.jp2", "_SCL_20m.jp2"]

SCENES = {
    "T43QBF": "S2B_MSIL2A_20260421T053639_N0512_R005_T43QBF_20260421T091905",
    "T42QZL": "S2B_MSIL2A_20260421T053639_N0512_R005_T42QZL_20260421T091905",
}


def product_uuid(name):
    u = f"{BASE_CAT}/Products?$filter=contains(Name,'{name}')&$top=1"
    r = requests.get(u, timeout=60)
    r.raise_for_status()
    items = r.json().get("value", [])
    if not items:
        raise RuntimeError(f"product not found: {name}")
    return items[0]["Id"]


def locate_bands(session, headers, pid, out_cache):
    targets = list(TARGETS)
    found = {}
    calls = [0]

    def walk(path):
        if not targets:
            return
        calls[0] += 1
        u = f"{BASE_DL}/{'/'.join(path)}/Nodes"
        r = session.get(u, headers=headers, timeout=90)
        if r.status_code != 200:
            raise RuntimeError(f"node listing failed {r.status_code}: {r.text[:200]}")
        for n in r.json().get("result", []):
            name = n["Name"]
            is_folder = n.get("ChildrenNumber", 0) > 0
            for t in list(targets):
                if name.endswith(t) and not is_folder:
                    found[t] = {"path": path[:], "name": name}
                    targets.remove(t)
            if is_folder:
                walk(path + [f"Nodes({name})"])

    walk([f"Products({pid})"])
    print(f"  locate calls: {calls[0]}")
    missing = [t for t in TARGETS if t not in found]
    if missing:
        raise RuntimeError(f"missing bands in product {pid}: {missing}")
    with open(out_cache, "w") as fh:
        json.dump({"pid": pid, "bands": found}, fh)
    return found


def download(session, headers, pid, rel, name, out_path):
    u = f"{BASE_DL}/Products({pid})/{rel}/Nodes({name})/$value"
    r = session.get(u, headers=headers, timeout=600, stream=True)
    r.raise_for_status()
    tmp = out_path + ".part"
    with open(tmp, "wb") as fh:
        for chunk in r.iter_content(1 << 20):
            fh.write(chunk)
    os.replace(tmp, out_path)
    return os.path.getsize(out_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    token = open(TOKEN_FILE).read().strip()
    headers = {"Authorization": f"Bearer {token}"}
    session = requests.Session()

    for tile, name in SCENES.items():
        cache = os.path.join(OUT_DIR, f".{tile}_nodes.json")
        if os.path.exists(cache):
            data = json.load(open(cache))
            pid = data["pid"]
            found = data["bands"]
            print(f"[{tile}] using cached node map pid={pid}")
        else:
            print(f"[{tile}] resolving uuid for {name}")
            pid = product_uuid(name)
            print(f"[{tile}] pid={pid}")
            found = locate_bands(session, headers, pid, cache)

        for t, info in found.items():
            suffix = t  # e.g. "_B04_10m.jp2"
            out_name = f"{name}{suffix}"
            out_path = os.path.join(OUT_DIR, out_name)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                print(f"[{tile}] skip existing {out_name} ({os.path.getsize(out_path)})")
                continue
            rel = "/".join(info["path"][1:])
            print(f"[{tile}] downloading {out_name} ...")
            for attempt in range(3):
                try:
                    size = download(session, headers, pid, rel, info["name"], out_path)
                    print(f"[{tile}] saved {out_name} ({size} bytes)")
                    break
                except requests.RequestException as e:
                    print(f"[{tile}] attempt {attempt + 1} failed: {e}")
                    time.sleep(3)
            else:
                raise RuntimeError(f"failed to download {out_name}")

    print("ALL DONE")


if __name__ == "__main__":
    main()