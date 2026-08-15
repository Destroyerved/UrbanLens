import os
import json
import folium
import geopandas as gpd
import pandas as pd
import branca.colormap as cm
from jinja2 import Template
from shapely.geometry import Polygon

OUT_HTML = "preview/map_preview.html"

# ---- Load ward boundaries with attributes ----
wards = gpd.read_file("refined/gandhinagar_wards_full.geojson")
wards["city"] = "Gandhinagar"
wards_a = gpd.read_file("refined/ahmedabad_wards_full.geojson")
wards_a["city"] = "Ahmedabad"
allw = pd.concat([wards[["ward_id", "name", "city", "area_km2", "compactness", "geometry"]],
                  wards_a[["ward_id", "name", "city", "area_km2", "compactness", "geometry"]]],
                 ignore_index=True)

# ---- Basemap ----
m = folium.Map(location=[23.15, 72.60], zoom_start=10, zoom_control=False,
               tiles="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
               attr="&copy; OpenStreetMap &copy; CARTO")
folium.TileLayer(
    tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr="Esri, Maxar, Earthstar Geographics", name="Satellite (Esri World Imagery)", show=False).add_to(m)
folium.TileLayer(
    tiles="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attr="&copy; OpenStreetMap &copy; CARTO", name="Streets (Carto Voyager)", show=False).add_to(m)

# ---- Ward polygons ----
cmin, cmax = float(allw["compactness"].min()), float(allw["compactness"].max())
colormap = cm.linear.YlGnBu_09.scale(cmin, cmax)
colormap.caption = "Ward compactness (4\u03c0A/P\u00b2)"

def style_casing(feature):
    comp = feature["properties"].get("compactness", 0)
    return {"color": "#374151", "weight": 4.5, "fillColor": colormap(comp), "fillOpacity": 0.15}

ward_casing = folium.GeoJson(
    allw.to_json(), name="wards_casing", style_function=style_casing,
    interactive=False, show=True)

def ward_style_inner(feature):
    return {"color": "#ffffff", "weight": 1.6, "fillColor": "none", "fillOpacity": 0}

ward_gj = folium.GeoJson(
    allw.to_json(), name="wards", style_function=ward_style_inner,
    tooltip=folium.GeoJsonTooltip(
        fields=["name", "city", "area_km2", "compactness"],
        aliases=["Ward", "City", "Area km\u00b2", "Compactness"],
        localize=False, sticky=True))
ward_casing.add_to(m)
ward_gj.add_to(m)
m.add_child(colormap)
layer_vars = {"Wards": ward_gj}

# ---- Helper: add POI layer (points -> icon markers, others -> GeoJson) ----
def add_layer(city_names, layer_name, label, color, weight=2, fill_opacity=0.2, radius=4, show=False, icon=None):
    parts = []
    for city in city_names:
        path = f"raw/osm/{city}_{layer_name}.geojson"
        if not os.path.exists(path):
            continue
        try:
            g = gpd.read_file(path)
        except Exception:
            continue
        if len(g) == 0:
            continue
        g = g[~g.geometry.is_empty]
        if layer_name in ("roads", "landuse"):
            g = g.copy()
            g["geometry"] = g.geometry.simplify(0.0005)
        if layer_name == "landuse":
            geoms = []
            for gm in g.geometry:
                if gm is None:
                    geoms.append(None)
                elif gm.geom_type == "LineString":
                    coords = list(gm.coords)
                    if len(coords) >= 4 and coords[0] == coords[-1]:
                        geoms.append(Polygon(coords))
                    else:
                        geoms.append(None)
                elif gm.geom_type in ("Polygon", "MultiPolygon"):
                    geoms.append(gm)
                else:
                    geoms.append(None)
            g = g.assign(geometry=geoms)
            g = g[~g.geometry.isna()]
        gj = json.loads(g.to_json())
        for feat in gj["features"]:
            feat["properties"]["_city"] = city
            if "name" in feat["properties"]:
                n = str(feat["properties"].get("name") or "")
                feat["properties"]["name"] = (n.replace("`", "'").replace("${", "$ {")
                                              .replace("\n", " ").replace("\r", " "))
            if "highway" in feat["properties"]:
                feat["properties"]["highway"] = str(feat["properties"]["highway"]).replace("`", "'")
        parts.append(gj)
        print(f"  {city}/{layer_name}: {len(g)}", flush=True)
    if not parts:
        return
    feats = []
    for p in parts:
        feats.extend(p["features"])

    fg = folium.FeatureGroup(name=label, show=show)

    points, lines = [], []
    for feat in feats:
        gtype = feat["geometry"]["type"]
        if gtype in ("Point", "MultiPoint"):
            points.append(feat)
        else:
            lines.append(feat)

    for feat in points:
        coord = feat["geometry"]["coordinates"]
        if gtype == "Point":
            lat, lon = coord[1], coord[0]
        else:
            lon, lat = coord[0], coord[1]
        name = str(feat["properties"].get("name", "") or "")
        city = str(feat["properties"].get("_city", "") or "")
        name = name.replace("`", "'").replace("${", "$ {").replace("\n", " ").replace("\r", " ")
        city = city.replace("`", "'")
        tip = f"{name} ({city})" if name else None
        if icon:
            div = f"""<div style="width:24px;height:24px;border-radius:50%;
background:{color};color:#fff;font-size:13px;line-height:24px;
text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.5)">{icon}</div>"""
            folium.Marker([lat, lon], icon=folium.DivIcon(html=div),
                          tooltip=tip).add_to(fg)
        else:
            folium.CircleMarker([lat, lon], radius=radius, color=color,
                                fill=True, fillOpacity=0.8, tooltip=tip).add_to(fg)

    if lines:
        fc = {"type": "FeatureCollection", "features": lines}

        def style(f, color=color, fill_opacity=fill_opacity):
            return {"color": color, "weight": weight, "opacity": 0.8,
                    "fillColor": color, "fillOpacity": fill_opacity}

        folium.GeoJson(fc, name=label, style_function=style,
                       tooltip=folium.GeoJsonTooltip(fields=["name", "_city"],
                                                     aliases=["Name", "City"])).add_to(fg)
    fg.add_to(m)
    return fg

# ---- Roads: hierarchical styling by highway class (not a mesh) ----
ROAD_STYLE = {
    "motorway": {"color": "#c1121f", "weight": 5},
    "trunk": {"color": "#e07a26", "weight": 4},
    "primary": {"color": "#e9c46a", "weight": 3.2},
    "secondary": {"color": "#90be6d", "weight": 2.6},
    "tertiary": {"color": "#a8b5c2", "weight": 2},
    "default": {"color": "#8d99ae", "weight": 1.8},
}

def road_style(feature):
    cls = str(feature["properties"].get("highway", "")).lower()
    s = ROAD_STYLE.get(cls, ROAD_STYLE["default"])
    return {"color": s["color"], "weight": s["weight"], "opacity": 0.85}

road_feats = []
for city in ["ahmedabad", "gandhinagar"]:
    path = f"raw/osm/{city}_roads.geojson"
    if not os.path.exists(path):
        continue
    try:
        g = gpd.read_file(path)
    except Exception:
        continue
    if len(g) == 0:
        continue
    g = g[~g.geometry.is_empty]
    g = g.copy()
    g["geometry"] = g.geometry.simplify(0.0005)
    gj = json.loads(g.to_json())
    for feat in gj["features"]:
        feat["properties"]["_city"] = city
        if "name" in feat["properties"]:
            n = str(feat["properties"].get("name") or "")
            feat["properties"]["name"] = n.replace("`", "'").replace("${", "$ {")
            feat["properties"]["name"] = feat["properties"]["name"].replace("\n", " ").replace("\r", " ")
        if "highway" in feat["properties"]:
            feat["properties"]["highway"] = str(feat["properties"]["highway"]).replace("`", "'")
    road_feats.extend(gj["features"])
    print(f"  roads {city}: {len(g)}", flush=True)

if road_feats:
    road_gj = folium.GeoJson(
        {"type": "FeatureCollection", "features": road_feats},
        name="Roads", style_function=road_style,
        tooltip=folium.GeoJsonTooltip(fields=["name", "highway", "_city"],
                                      aliases=["Road", "Class", "City"]))
    road_gj.add_to(m)
    layer_vars["Roads"] = road_gj

# ---- POI layers ----
print("POIs:", flush=True)
ICON = {"schools": "\U0001F3EB", "health": "\U0001F3E5", "greenspace": "\U0001F333",
        "transport": "\U0001F68C", "worship": "\U0001F54A", "shops": "\U0001F6CD",
        "markets": "\U0001F3EC"}
layer_vars = dict(layer_vars)  # keep Wards + Roads, then add POIs
for name, color in [("schools", "blue"), ("health", "red"), ("greenspace", "green"),
                    ("transport", "purple"), ("worship", "orange"),
                    ("shops", "#0d9488"), ("markets", "#d97706")]:
    fg = add_layer(["ahmedabad", "gandhinagar"], name, f"{name.capitalize()}", color,
                   show=(name in ("schools", "health")), icon=ICON.get(name))
    if fg is not None:
        layer_vars[name.capitalize()] = fg
print("landuse:", flush=True)
landuse_fg = add_layer(["ahmedabad", "gandhinagar"], "landuse", "Land use", "brown", fill_opacity=0.25, show=False)
if landuse_fg is not None:
    layer_vars["Land use"] = landuse_fg
print("localities:", flush=True)
localities_fg = add_layer(["ahmedabad", "gandhinagar"], "places", "Localities", "#4f46e5",
                          icon="\U0001F3D8", show=False)
if localities_fg is not None:
    layer_vars["Localities"] = localities_fg

# ---- AMC official layers (source: gis.ahmedabadcity.gov.in) ----
print("AMC layers:", flush=True)
bridges_fg = add_layer(["ahmedabad"], "bridges", "Bridges", "#0e7490", fill_opacity=0.3,
                       weight=2, radius=4, show=False)
if bridges_fg is not None:
    layer_vars["Bridges"] = bridges_fg
heritage_fg = add_layer(["ahmedabad"], "heritage_property", "Heritage & Govt properties", "#7c3aed",
                        fill_opacity=0.35, weight=1, radius=3, show=False)
if heritage_fg is not None:
    layer_vars["Heritage & Govt"] = heritage_fg
libraries_fg = add_layer(["ahmedabad"], "libraries", "Libraries", "#be185d",
                         icon="\U0001F4DA", show=False)
if libraries_fg is not None:
    layer_vars["Libraries"] = libraries_fg
museums_fg = add_layer(["ahmedabad"], "museums", "Museums", "#b45309",
                       icon="\U0001F3DB", show=False)
if museums_fg is not None:
    layer_vars["Museums"] = museums_fg
heritage_s_fg = add_layer(["ahmedabad"], "heritage_structures", "Heritage structures", "#9333ea",
                          icon="\u2694", show=False)
if heritage_s_fg is not None:
    layer_vars["Heritage structures"] = heritage_s_fg
uhc_fg = add_layer(["ahmedabad"], "uhc", "UHC (health centres)", "#dc2626",
                   radius=3, show=False)
if uhc_fg is not None:
    layer_vars["UHC"] = uhc_fg

# ---- Unified search index (wards + roads + POIs in ONE search bar) ----
def representative_point(geom):
    try:
        return geom.representative_point()
    except Exception:
        return geom.centroid

search_items = []  # [label, lon, lat]

# wards
for _, r in allw.iterrows():
    p = representative_point(r.geometry)
    wname = str(r["name"]).replace("Ward No - ", "Ward ")
    search_items.append([f"Ward - {wname}", "Ward", r["city"], float(p.y), float(p.x)])

# roads
for city in ["ahmedabad", "gandhinagar"]:
    path = f"raw/osm/{city}_roads.geojson"
    if not os.path.exists(path):
        continue
    try:
        g = gpd.read_file(path)
    except Exception:
        continue
    if len(g) == 0:
        continue
    for _, row in g.iterrows():
        nm = str(row.get("name", "") or "").strip()
        if not nm or row.geometry is None:
            continue
        p = representative_point(row.geometry)
        cls = str(row.get("highway", "") or "")
        city_label = "Ahmedabad" if city == "ahmedabad" else "Gandhinagar"
        search_items.append([f"Road - {nm}", "Road", city_label, float(p.y), float(p.x)])
    print(f"  search roads {city}: added", flush=True)

# POIs
for layer_name, label in [("schools", "School"), ("health", "Health"),
                          ("greenspace", "Park"), ("transport", "Stop"),
                          ("worship", "Worship"), ("shops", "Shop"),
                          ("markets", "Market")]:
    for city in ["ahmedabad", "gandhinagar"]:
        path = f"raw/osm/{city}_{layer_name}.geojson"
        if not os.path.exists(path):
            continue
        try:
            g = gpd.read_file(path)
        except Exception:
            continue
        if len(g) == 0:
            continue
        for _, row in g.iterrows():
            nm = str(row.get("name", "") or "").strip()
            if not nm or row.geometry is None:
                continue
            if row.geometry.geom_type in ("Point", "MultiPoint"):
                if row.geometry.geom_type == "Point":
                    lon, lat = row.geometry.x, row.geometry.y
                else:
                    lon, lat = row.geometry.centroid.x, row.geometry.centroid.y
            else:
                p = representative_point(row.geometry)
                lon, lat = p.x, p.y
            city_label = "Ahmedabad" if city == "ahmedabad" else "Gandhinagar"
            search_items.append([f"{label} - {nm}", label, city_label, float(lat), float(lon)])
    print(f"  search {layer_name}: added", flush=True)

# localities / societies (places geojson)
for city in ["ahmedabad", "gandhinagar"]:
    path = f"raw/osm/{city}_places.geojson"
    if not os.path.exists(path):
        continue
    try:
        g = gpd.read_file(path)
    except Exception:
        continue
    if len(g) == 0:
        continue
    for _, row in g.iterrows():
        nm = str(row.get("name", "") or "").strip()
        if not nm or row.geometry is None:
            continue
        p = representative_point(row.geometry)
        kind = "Locality" if str(row.get("place", "") or "") else "Society"
        city_label = "Ahmedabad" if city == "ahmedabad" else "Gandhinagar"
        search_items.append([f"{kind} - {nm}", kind, city_label, float(p.y), float(p.x)])
    print(f"  search places {city}: added", flush=True)

# AMC official layers (bridges, libraries, museums, heritage structures, UHC)
for layer_name, label in [("bridges", "Bridge"), ("libraries", "Library"),
                          ("museums", "Museum"), ("heritage_structures", "Heritage"),
                          ("uhc", "UHC")]:
    for city in ["ahmedabad"]:
        path = f"raw/osm/{city}_{layer_name}.geojson"
        if not os.path.exists(path):
            continue
        try:
            g = gpd.read_file(path)
        except Exception:
            continue
        if len(g) == 0:
            continue
        for _, row in g.iterrows():
            nm = str(row.get("name", "") or "").strip()
            if not nm or row.geometry is None:
                continue
            p = representative_point(row.geometry)
            search_items.append([f"{label} - {nm}", label, "Ahmedabad", float(p.y), float(p.x)])
    print(f"  search {layer_name}: added", flush=True)

# Census 2011 ward reference entries (no geometry -> place at city centre, labeled reference only)
import csv as _csv
for city_file, city_name in [("refined/census_ward_population_ahmedabad.csv", "Ahmedabad"),
                             ("refined/census_ward_population_gandhinagar.csv", "Gandhinagar")]:
    if not os.path.exists(city_file):
        continue
    with open(city_file, encoding="utf-8") as f:
        rd = list(_csv.DictReader(f))
    anchor = {"Ahmedabad": (23.0225, 72.5714), "Gandhinagar": (23.2156, 72.6369)}[city_name]
    for r in rd:
        wnum = str(r["ward"])
        pop = int(r["TOT_P"])
        search_items.append([f"Census ward - {wnum} (pop {pop:,})", "Census", city_name,
                             anchor[0], anchor[1]])
    print(f"  census reference {city_name}: added {len(rd)}", flush=True)

print(f"unified search index: {len(search_items)} entries", flush=True)

# ---- Export every searchable place as a geocoded CSV (name/city/coords) ----
import csv
_csv_rows = []
for rec in search_items:
    label, cat, city, lat, lon = rec
    _csv_rows.append({"name": label.split(" - ", 1)[1] if " - " in label else label,
                      "category": cat, "city": city, "lat": round(lat, 6), "lon": round(lon, 6),
                      "source": "AMC GIS portal" if cat in ("Bridge", "Library", "Museum", "Heritage", "UHC") else "OSM"})
with open("refined/all_places_geocoded.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["name", "category", "city", "lat", "lon", "source"])
    w.writeheader()
    w.writerows(_csv_rows)
print(f"wrote refined/all_places_geocoded.csv: {len(_csv_rows)} rows", flush=True)

# ---- Quick stats for the UI ----
def geojson_len(city, layer):
    p = f"raw/osm/{city}_{layer}.geojson"
    if not os.path.exists(p):
        return 0
    try:
        g = gpd.read_file(p)
    except Exception:
        return 0
    return len(g) if len(g) else 0

poi_counts = {l: sum(geojson_len(c, l) for c in ["ahmedabad", "gandhinagar"])
              for l in ["schools", "health", "greenspace", "transport", "worship", "shops", "markets", "places"]}
poi_counts.update({l: geojson_len("ahmedabad", l)
                   for l in ["bridges", "libraries", "museums", "heritage_structures", "uhc", "heritage_property"]})

road_km = 0.0
for city in ["ahmedabad", "gandhinagar"]:
    p = f"raw/osm/{city}_roads.geojson"
    if not os.path.exists(p):
        continue
    try:
        g = gpd.read_file(p)
    except Exception:
        continue
    if len(g) == 0:
        continue
    for _, row in g.iterrows():
        gm = row.geometry
        if gm is None:
            continue
        if gm.geom_type == "LineString":
            road_km += gm.length
        elif gm.geom_type == "MultiLineString":
            road_km += sum(x.length for x in gm.geoms)
road_km *= 111.32  # deg -> km (approx)

stats_json = json.dumps({
    "wards": len(allw),
    "roads_km": round(road_km),
    "schools": poi_counts["schools"],
    "hospitals": poi_counts["health"],
    "parks": poi_counts["greenspace"],
    "stops": poi_counts["transport"],
    "worship": poi_counts["worship"],
    "shops": poi_counts["shops"],
    "markets": poi_counts["markets"],
    "localities": poi_counts["places"],
    "bridges": poi_counts["bridges"],
    "heritage": poi_counts["heritage_property"],
    "libraries": poi_counts["libraries"],
    "museums": poi_counts["museums"],
    "uhc": poi_counts["uhc"],
    "census_pop": 5577940,
    "census_hh": 1179823,
})

# Gradient legend stops from the ward colormap
n = len(colormap.colors)
stops = "".join(f"#{colormap.colors[i]} {i/(n-1)*100:.0f}%" for i in range(n))

# ---- Custom autosuggest search box (live suggestions as user types) ----
search_data_json = json.dumps(search_items, ensure_ascii=False)

search_ui = folium.Element("""
<div id="gs-brand">
  <span id="gs-logo">&#128506;</span>
  <span>UrbanLens<small>AHM + GNR wards &amp; facilities</small></span>
</div>

<div id="gs-search-wrap">
  <input id="gs-search-input" type="text" autocomplete="off"
         placeholder="Search ward, road, school, hospital, bridge..."/>
  <span id="gs-clear">&#10005;</span>
  <div id="gs-search-results"></div>
</div>

<div id="gs-right">
  <div class="gs-sec-panel" id="gs-basemap-sec">
    <div class="gs-sec-title">Basemap</div>
    <div id="gs-basemap-body">
      <label class="gs-bm"><input type="radio" name="gs-basemap" value="light" checked> Light</label>
      <label class="gs-bm"><input type="radio" name="gs-basemap" value="streets"> Streets</label>
      <label class="gs-bm"><input type="radio" name="gs-basemap" value="satellite"> Satellite</label>
    </div>
  </div>
  <div id="gs-layers">
    <div id="gs-layers-title">Layers <span>&#9776;</span></div>
    <div id="gs-layers-body"></div>
  </div>
  <div id="gs-actions">
    <button id="gs-reset" title="Reset map view">&#9850; Reset view</button>
  </div>
</div>

<div id="gs-legend">
  <div id="gs-legend-title">Legend <span id="gs-legend-toggle">&#8722;</span></div>
  <div id="gs-legend-body">
    <div class="gs-sec">Ward compactness</div>
    <div id="gs-gradient"></div>
    <div class="gs-range"><span>less compact</span><span>more compact</span></div>
    <div class="gs-sec">Points of interest</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#1565c0">&#127979;</span>Schools</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#d32f2f">&#127973;</span>Hospitals</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#2e7d32">&#127807;</span>Parks</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#6a1b9a">&#128652;</span>Bus stops</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#e65100">&#128722;</span>Worship</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#4f46e5">&#127960;</span>Localities / Societies</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#0e7490">&#127776;</span>Bridges</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#7c3aed">&#127963;</span>Heritage / Govt properties</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#be185d">&#128218;</span>Libraries</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#b45309">&#127963;</span>Museums</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#9333ea">&#9876;</span>Heritage structures</div>
    <div class="gs-leg-row"><span class="gs-badge" style="background:#dc2626">&#10010;</span>UHC (health centres)</div>
    <div class="gs-sec">Roads</div>
    <div class="gs-leg-row"><span class="gs-line" style="background:#c1121f"></span>Motorway</div>
    <div class="gs-leg-row"><span class="gs-line" style="background:#e07a26"></span>Trunk</div>
    <div class="gs-leg-row"><span class="gs-line" style="background:#e9c46a"></span>Primary</div>
    <div class="gs-leg-row"><span class="gs-line" style="background:#90be6d"></span>Secondary</div>
    <div class="gs-leg-row"><span class="gs-line" style="background:#a8b5c2"></span>Tertiary / other</div>
    <div class="gs-sec">Dataset stats</div>
    <div id="gs-stats"></div>
  </div>
</div>

<style>
  html,body{width:100%; height:100%; margin:0; padding:0; overflow:hidden;}
  .folium-map{width:100% !important; height:100vh !important;}
  #gs-brand{position:fixed; top:12px; left:14px; z-index:1300; display:flex; align-items:center; gap:8px;
    white-space:nowrap; background:#fff; border:1px solid #d7dde3; border-radius:10px;
    box-shadow:0 2px 10px rgba(0,0,0,.12); padding:8px 12px; font:13px/1.3 Arial,sans-serif;}
  #gs-logo{font-size:20px;}
  #gs-brand span{display:flex; flex-direction:column; font-weight:bold; color:#0f172a;}
  #gs-brand small{color:#6b7684; font-size:10px; font-weight:normal;}
  #gs-search-wrap{position:fixed; top:12px; left:50%; transform:translateX(-50%); width:560px; z-index:1300;}
  #gs-search-input{width:100%; padding:10px 34px 10px 12px; border:1px solid #c9d2da; border-radius:10px;
    font-size:13px; outline:none; transition:border .15s, box-shadow .15s; box-sizing:border-box;
    background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.12);}
  #gs-search-input:focus{border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.18);}
  #gs-clear{position:absolute; right:10px; top:10px; cursor:pointer; color:#9aa4af; font-size:13px; display:none;}
  #gs-search-results{position:absolute; left:0; right:0; top:100%; margin-top:4px; display:none;
    background:#fff; border:1px solid #d7dde3; border-radius:10px; max-height:50vh; overflow-y:auto;
    box-shadow:0 6px 20px rgba(0,0,0,.18); z-index:1400;}
  #gs-search-results .gs-hit{padding:8px 12px; cursor:pointer;}
  #gs-search-results .gs-hit:hover,#gs-search-results .gs-hit.active{background:#eef4ff;}
  #gs-search-results .gs-none{padding:10px 12px; color:#8a94a0; font-style:italic;}
  .gs-hit-main{display:flex; align-items:center; gap:8px; white-space:nowrap; overflow:hidden;}
  .gs-cat{display:inline-block; min-width:52px; font-weight:bold; font-size:11px; text-align:center;
    padding:1px 6px; border-radius:4px; color:#fff; flex:0 0 auto;}
  .gs-cat.Ward{background:#7b2d8b;} .gs-cat.Road{background:#c1121f;} .gs-cat.School{background:#1565c0;}
  .gs-cat.Health{background:#d32f2f;} .gs-cat.Park{background:#2e7d32;} .gs-cat.Stop{background:#6a1b9a;}
  .gs-cat.Worship{background:#e65100;} .gs-cat.Locality{background:#4f46e5;} .gs-cat.Society{background:#4f46e5;}
  .gs-cat.Bridge{background:#0e7490;} .gs-cat.Library{background:#be185d;} .gs-cat.Museum{background:#b45309;}
  .gs-cat.Heritage{background:#9333ea;} .gs-cat.UHC{background:#dc2626;} .gs-cat.Census{background:#475569;}
  .gs-name{overflow:hidden; text-overflow:ellipsis; flex:1 1 auto;}
  .gs-name b{color:#1a56db;}
  .gs-hit-sub{display:flex; gap:12px; font-size:11px; color:#8a94a0; margin:3px 0 0 60px;}
  .gs-city{background:#f1f5f9; border-radius:4px; padding:0 6px; color:#475569;}
  .gs-coords{cursor:pointer; color:#94a3b8;}
  .gs-coords:hover{color:#1a56db;}
  .gs-copy-tip{font-style:italic;}

  #gs-right{position:fixed; top:64px; right:10px; z-index:1200; width:330px; max-height:calc(100vh - 80px);
    overflow-y:auto; display:flex; flex-direction:column; gap:8px; background:#fff;
    border:1px solid #d7dde3; border-radius:10px; box-shadow:0 3px 14px rgba(0,0,0,.18);
    padding:12px; font:13px/1.35 Arial,sans-serif;}
  .gs-sec-panel{border-top:1px solid #e5eaef; padding-top:8px;}
  .gs-sec-title{font-weight:bold; color:#5b6673; font-size:11px; text-transform:uppercase; letter-spacing:.4px; margin-bottom:5px;}
  #gs-basemap-body{display:flex; gap:6px;}
  .gs-bm{flex:1; text-align:center; font-size:12px; color:#33415c; cursor:pointer;
    border:1px solid #d7dde3; border-radius:6px; padding:4px 2px; transition:all .15s;}
  .gs-bm input{display:none;}
  .gs-bm.active{background:#3b82f6; color:#fff; border-color:#3b82f6;}

  #gs-layers{width:100%; border-top:1px solid #e5eaef; padding-top:8px;}
  #gs-layers-title{font-weight:bold; color:#5b6673; font-size:11px; text-transform:uppercase; letter-spacing:.4px;
    display:flex; justify-content:space-between; margin-bottom:6px; cursor:pointer;}
  #gs-layers-body{display:flex; flex-direction:column; gap:6px;}
  .gs-layer-group{display:flex; flex-direction:column; gap:2px; padding:4px 0; border-bottom:1px dashed #eef1f4;}
  .gs-layer-group:last-child{border-bottom:none;}
  .gs-group-head{font-size:11px; font-weight:bold; color:#7b8794; text-transform:uppercase; letter-spacing:.3px;
    display:flex; justify-content:space-between; cursor:pointer; padding:1px 0;}
  .gs-group-head:hover{color:#3b82f6;}
  .gs-layer-row{display:flex; align-items:center; justify-content:space-between; padding:3px 0 3px 10px; font-size:12px; color:#33415c;}
  .gs-switch{position:relative; width:36px; height:20px; background:#cbd5e1; border-radius:10px; cursor:pointer; transition:background .2s; flex:0 0 auto;}
  .gs-switch::after{content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; background:#fff;
    border-radius:50%; transition:left .2s; box-shadow:0 1px 2px rgba(0,0,0,.3);}
  .gs-switch.on{background:#22c55e;}
  .gs-switch.on::after{left:18px;}

  #gs-actions{border-top:1px solid #e5eaef; padding-top:8px;}
  #gs-reset{width:100%; padding:7px; border:1px solid #d7dde3; border-radius:7px; background:#fafbfc;
    cursor:pointer; font-size:12px; color:#33415c; transition:all .15s;}
  #gs-reset:hover{background:#eef4ff; border-color:#3b82f6; color:#1a56db;}

  #gs-legend{position:fixed; left:10px; top:64px; z-index:1200; width:240px; max-height:calc(100vh - 80px);
    overflow-y:auto; background:#fff; border:1px solid #d7dde3; border-radius:10px;
    box-shadow:0 3px 14px rgba(0,0,0,.16); font:12px/1.5 Arial,sans-serif; padding:0;}
  #gs-legend-title{padding:8px 12px; font-weight:bold; cursor:pointer; background:#fafbfc;
    border-bottom:1px solid #eceff2; display:flex; justify-content:space-between;
    color:#5b6673; font-size:11px; text-transform:uppercase; letter-spacing:.4px;}
  #gs-legend-body{padding:10px 12px;}
  .gs-sec{font-weight:bold; color:#5b6673; margin:10px 0 5px; font-size:11px; text-transform:uppercase; letter-spacing:.4px;}
  .gs-sec:first-child{margin-top:0;}
  #gs-gradient{height:12px; border-radius:6px; background:linear-gradient(to right,__GRADIENT__);}
  .gs-range{display:flex; justify-content:space-between; color:#8a94a0; font-size:10px; margin-bottom:2px;}
  .gs-leg-row{display:flex; align-items:center; gap:8px; padding:3px 0;}
  .gs-badge{width:18px; height:18px; border-radius:50%; color:#fff; text-align:center; font-size:11px; line-height:18px; flex:0 0 auto;}
  .gs-line{width:22px; height:4px; border-radius:2px; flex:0 0 auto;}
  #gs-stats div{padding:2px 0; color:#33415c;}
  #gs-stats b{color:#0f172a;}
  .leaflet-top.leaflet-left{margin-top:8px;}
  .leaflet-control-attribution{font-size:9px;}
  @media (max-width:760px){ #gs-brand{display:none;} #gs-search-wrap{width:92%;} #gs-right{width:92%;} #gs-legend{width:200px;} }
</style>
""")

layer_vars_json = json.dumps({k: v.get_name() for k, v in layer_vars.items()}, ensure_ascii=False)
print(f"layer toggles: {list(layer_vars.keys())}", flush=True)

search_js = folium.Element("""
var SEARCH_DATA_JSON = __SEARCH_DATA__;
var STATS_JSON = __STATS__;
var LAYER_VARS_JSON = __LAYER_VARS__;
function getGSMap(){ return window['__MAP_NAME__']; }
(function(){
  var data = SEARCH_DATA_JSON;
  var input = document.getElementById('gs-search-input');
  var results = document.getElementById('gs-search-results');
  var clear = document.getElementById('gs-clear');
  var curCat = 'All';
  var idx = -1;
  var hits = [];

  function catOf(label){ return label.split(' - ')[0]; }

  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function hl(name, parts){
    var out = esc(name); var lower = out.toLowerCase();
    parts.forEach(function(p){ if(p) out = out.replace(new RegExp('('+esc(p).replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+')','gi'),'<b>$1</b>'); });
    return out;
  }

  function fmtCoord(lat, lon){
    var ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(4) + '\u00b0' + ns + ' ' + Math.abs(lon).toFixed(4) + '\u00b0' + ew;
  }

  function render(q){
    q = q.trim().toLowerCase();
    results.innerHTML = '';
    idx = -1;
    hits = [];
    if (q.length < 1){ results.style.display='none'; clear.style.display='none'; return; }
    clear.style.display='block';
    var parts = q.split(' ');
    for (var i=0;i<data.length;i++){
      var rec = data[i];           // [label, category, city, lat, lon]
      var label = rec[0];
      var lbl = label.toLowerCase();
      var cat = rec[1];
      if (curCat !== 'All' && cat !== curCat) continue;
      var ok = parts.every(function(p){ return lbl.indexOf(p) !== -1; });
      if (ok){ hits.push(rec); }
      if (hits.length >= 12) break;
    }
    if (!hits.length){
      var none = document.createElement('div');
      none.className = 'gs-none';
      none.textContent = 'No matches for "' + input.value + '"';
      results.appendChild(none);
      results.style.display='block';
      return;
    }
    hits.forEach(function(h, i){
      var d = document.createElement('div');
      d.className = 'gs-hit';
      var cat = h[1];
      var rest = h[0].slice(cat.length + 3);
      var city = h[2] || '';
      var main = document.createElement('div');
      main.className = 'gs-hit-main';
      main.innerHTML = '<span class="gs-cat '+cat+'">'+cat+'</span>' +
                       '<span class="gs-name">'+hl(rest, parts)+'</span>';
      var sub = document.createElement('div');
      sub.className = 'gs-hit-sub';
      if (city) sub.innerHTML += '<span class="gs-city">'+esc(city)+'</span>';
      sub.innerHTML += '<span class="gs-coords" title="Copy coordinates">'+fmtCoord(h[3], h[4])+'</span>';
      d.appendChild(main);
      d.appendChild(sub);
      d.addEventListener('mousedown', function(){ pick(i); });
      d.addEventListener('mouseenter', function(){ setActive(i); });
      var co = d.querySelector('.gs-coords');
      if (co) co.addEventListener('click', function(e){
        e.stopPropagation();
        try{ navigator.clipboard.writeText(h[3].toFixed(6)+', '+h[4].toFixed(6)); }catch(err){}
        co.textContent = 'copied!';
        setTimeout(function(){ co.textContent = fmtCoord(h[3], h[4]); }, 1200);
      });
      results.appendChild(d);
    });
    results.style.display = 'block';
  }

  function setActive(i){
    idx = i;
    var kids = results.children;
    for (var k=0;k<kids.length;k++){ kids[k].classList.remove('active'); }
    if (kids[i]) kids[i].classList.add('active');
  }

  function pick(i){
    if (i < 0 || i >= hits.length) return;
    var h = hits[i];
    getGSMap().flyTo([h[3], h[4]], 16, {duration:1});
    input.value = h[0];
    results.style.display = 'none';
  }

  input.addEventListener('input', function(){ render(input.value); });
  input.addEventListener('keydown', function(e){
    var kids = results.children;
    if (e.key === 'ArrowDown'){ e.preventDefault(); if(kids.length) setActive((idx+1)%kids.length); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); if(kids.length) setActive((idx-1+kids.length)%kids.length); }
    else if (e.key === 'Enter'){ e.preventDefault(); if (idx>=0 && idx<kids.length) pick(idx); }
    else if (e.key === 'Escape'){ results.style.display='none'; input.blur(); }
  });
  clear.addEventListener('click', function(){ input.value=''; render(''); input.focus(); });
  document.addEventListener('click', function(e){
    if (!document.getElementById('gs-search-wrap').contains(e.target)) results.style.display='none';
  });

  // ---- Legend / stats ----
  var statsEl = document.getElementById('gs-stats');
  var S = STATS_JSON;
  var rows = [['Wards', S.wards], ['Roads (km)', S.roads_km], ['Schools', S.schools],
              ['Hospitals', S.hospitals], ['Parks', S.parks], ['Bus stops', S.stops],
              ['Worship', S.worship], ['Shops', S.shops], ['Markets', S.markets],
              ['Localities', S.localities], ['Bridges', S.bridges],
              ['Heritage / Govt properties', S.heritage], ['Libraries', S.libraries],
              ['Museums', S.museums], ['UHCs', S.uhc],
              ['Census 2011 population', S.census_pop.toLocaleString('en-IN')],
              ['Census 2011 households', S.census_hh.toLocaleString('en-IN')]];
  rows.forEach(function(r){
    var d = document.createElement('div');
    d.innerHTML = r[0] + ': <b>' + r[1] + '</b>';
    statsEl.appendChild(d);
  });
  var legendBody = document.getElementById('gs-legend-body');
  var legendToggle = document.getElementById('gs-legend-toggle');
  document.getElementById('gs-legend-title').addEventListener('click', function(){
    if (legendBody.style.display === 'none'){
      legendBody.style.display = 'block'; legendToggle.textContent = '\u2212';
    } else {
      legendBody.style.display = 'none'; legendToggle.textContent = '+';
    }
  });

  // ---- Layer ON/OFF toggles (grouped) ----
  var layerBody = document.getElementById('gs-layers-body');
  var layerVars = LAYER_VARS_JSON;
  var groups = [
    {name:'Boundaries', labels:['Wards']},
    {name:'Infrastructure', labels:['Roads','Bridges','UHC']},
    {name:'Amenities', labels:['Schools','Health','Greenspace','Transport','Worship','Libraries','Museums']},
    {name:'Economy', labels:['Shops','Markets']},
    {name:'Zoning', labels:['Land use']},
    {name:'Communities', labels:['Localities']},
    {name:'Heritage', labels:['Heritage & Govt','Heritage structures']},
  ];
  var allRows = [];
  groups.forEach(function(grp){
    var avail = grp.labels.filter(function(lbl){ return layerVars[lbl]; });
    if (!avail.length) return;
    var g = document.createElement('div');
    g.className = 'gs-layer-group';
    var head = document.createElement('div');
    head.className = 'gs-group-head';
    head.innerHTML = '<span>'+grp.name+' ('+avail.length+')</span><span>+</span>';
    var body = document.createElement('div');
    body.style.display = 'none';
    head.addEventListener('click', function(){
      var show = body.style.display === 'none';
      body.style.display = show ? 'flex' : 'none';
      head.lastChild.textContent = show ? '\u2212' : '+';
    });
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    avail.forEach(function(lbl){
      var row = document.createElement('div');
      row.className = 'gs-layer-row';
      var name = document.createElement('span');
      name.textContent = lbl;
      var sw = document.createElement('span');
      sw.className = 'gs-switch on';
      sw.addEventListener('click', function(){
        var map = getGSMap();
        var obj = window[layerVars[lbl]];
        if (!obj || !map) return;
        var on = map.hasLayer(obj);
        if (on){
          try{ map.removeLayer(obj); }catch(e){}
          sw.classList.remove('on');
        } else {
          try{ map.addLayer(obj); }catch(e){}
          sw.classList.add('on');
        }
      });
      row.appendChild(name);
      row.appendChild(sw);
      body.appendChild(row);
      allRows.push({lbl: lbl, row: row});
    });
    g.appendChild(head);
    g.appendChild(body);
    layerBody.appendChild(g);
  });
  // sync switch state after the map & layers exist
  setTimeout(function(){
    var map = getGSMap();
    if (!map) return;
    allRows.forEach(function(item){
      if (!layerVars[item.lbl]) return;
      var obj = window[layerVars[item.lbl]];
      if (!obj) return;
      var on = map.hasLayer(obj);
      item.row.querySelector('.gs-switch').classList.toggle('on', on);
    });
  }, 0);
  document.getElementById('gs-layers-title').addEventListener('click', function(){
    var body = document.getElementById('gs-layers-body');
    var t = document.getElementById('gs-layers-title').lastChild;
    if (body.style.display === 'none'){
      body.style.display = 'flex'; t.textContent = '\u2630';
    } else {
      body.style.display = 'none'; t.textContent = '+';
    }
  });

  // ---- Basemap radio ----
  var BM = {
    light: {tiles:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr:'&copy; OpenStreetMap &copy; CARTO'},
    streets: {tiles:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr:'&copy; OpenStreetMap &copy; CARTO'},
    satellite: {tiles:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'Esri, Maxar, Earthstar Geographics'},
  };
  var baseMap = null;
  document.querySelectorAll('#gs-basemap-body input[name=gs-basemap]').forEach(function(inp){
    inp.addEventListener('change', function(){
      var map = getGSMap();
      if (!map) return;
      var key = inp.value;
      var spec = BM[key];
      if (baseMap){ try{ map.removeLayer(baseMap); }catch(e){} }
      baseMap = L.tileLayer(spec.tiles, {attribution: spec.attr});
      baseMap.addTo(map);
      document.querySelectorAll('#gs-basemap-body label').forEach(function(l){
        l.classList.toggle('active', l.querySelector('input').checked);
      });
    });
    if (inp.checked){
      inp.parentElement.classList.add('active');
    }
  });

  // ---- Reset view ----
  document.getElementById('gs-reset').addEventListener('click', function(){
    var map = getGSMap();
    if (map) map.setView([23.15, 72.60], 10, {animate:true});
  });
})();

/* Click any feature -> fly to its spot on the map */
(function(){
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    var GS_MAP = getGSMap();
    if (!GS_MAP){ if (tries > 60) clearInterval(iv); return; }
    clearInterval(iv);
    L.control.scale({imperial:false, position:'bottomleft'}).addTo(GS_MAP);
    function bindLayer(lyr){
      if (typeof lyr.eachLayer === 'function'){
        lyr.eachLayer(function(fl){
          if (typeof fl.on === 'function'){
            fl.on('click', function(){
              try{
                if (typeof fl.getBounds === 'function'){
                  GS_MAP.flyToBounds(fl.getBounds(), {padding:[30,30], maxZoom:17, duration:1});
                } else if (typeof fl.getLatLng === 'function'){
                  GS_MAP.flyTo(fl.getLatLng(), 17, {duration:1});
                }
              } catch(err){}
            });
          }
        });
      } else if (typeof lyr.getLatLng === 'function' && typeof lyr.on === 'function'){
        lyr.on('click', function(){
          try{ GS_MAP.flyTo(lyr.getLatLng(), 17, {duration:1}); } catch(err){}
        });
      }
    }
    GS_MAP.eachLayer(bindLayer);
  }, 100);
})();
""".replace("__SEARCH_DATA__", search_data_json)
 .replace("__STATS__", stats_json)
 .replace("__LAYER_VARS__", layer_vars_json)
 .replace("__MAP_NAME__", m.get_name()))

if hasattr(search_ui, "_template_str"):
    before = search_ui._template_str
    search_ui._template_str = search_ui._template_str.replace("__GRADIENT__", stops)
    search_ui._template = Template(search_ui._template_str)
    print("gradient replaced:", "__GRADIENT__" in before, "->", "__GRADIENT__" not in search_ui._template_str, flush=True)
else:
    print("WARN: no _template_str on search_ui", flush=True)
m.get_root().html.add_child(search_ui)
m.get_root().script.add_child(search_js)

# ---- Ward labels ----
labels = folium.FeatureGroup(name="Ward labels", show=False)
for _, r in allw.iterrows():
    c = r.geometry.centroid
    folium.Marker([c.y, c.x], icon=folium.DivIcon(html=f'<div style="font-size:9px;color:#555">{r["name"]}</div>')).add_to(labels)
labels.add_to(m)

m.save(OUT_HTML)
print(f"saved {OUT_HTML}", flush=True)