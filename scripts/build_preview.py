import os
import json
import folium
import geopandas as gpd
import pandas as pd
import branca.colormap as cm
from jinja2 import Template

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

def style_fn(feature):
    comp = feature["properties"].get("compactness", 0)
    return {"fillColor": colormap(comp), "color": "#333", "weight": 1.5, "fillOpacity": 0.6}

ward_gj = folium.GeoJson(
    allw.to_json(), name="wards", style_function=style_fn,
    tooltip=folium.GeoJsonTooltip(
        fields=["name", "city", "area_km2", "compactness"],
        aliases=["Ward", "City", "Area km\u00b2", "Compactness"],
        localize=False, sticky=True))
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
        "transport": "\U0001F68C", "worship": "\U0001F54A"}
layer_vars = dict(layer_vars)  # keep Wards + Roads, then add POIs
for name, color in [("schools", "blue"), ("health", "red"), ("greenspace", "green"),
                    ("transport", "purple"), ("worship", "orange")]:
    fg = add_layer(["ahmedabad", "gandhinagar"], name, f"{name.capitalize()}", color,
                   show=(name in ("schools", "health")), icon=ICON.get(name))
    if fg is not None:
        layer_vars[name.capitalize()] = fg
print("landuse:", flush=True)
landuse_fg = add_layer(["ahmedabad", "gandhinagar"], "landuse", "Land use", "brown", fill_opacity=0.25)
if landuse_fg is not None:
    layer_vars["Land use"] = landuse_fg

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
    search_items.append([f"Ward - {r['name']} ({r['city']})", float(p.x), float(p.y)])

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
        search_items.append([f"Road - {nm} ({cls})", float(p.x), float(p.y)])
    print(f"  search roads {city}: added", flush=True)

# POIs
for layer_name, label in [("schools", "School"), ("health", "Health"),
                          ("greenspace", "Park"), ("transport", "Stop"),
                          ("worship", "Worship")]:
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
            search_items.append([f"{label} - {nm}", float(lon), float(lat)])
    print(f"  search {layer_name}: added", flush=True)

print(f"unified search index: {len(search_items)} entries", flush=True)

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
              for l in ["schools", "health", "greenspace", "transport", "worship"]}

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
})

# Gradient legend stops from the ward colormap
n = len(colormap.colors)
stops = "".join(f"#{colormap.colors[i]} {i/(n-1)*100:.0f}%" for i in range(n))

# ---- Custom autosuggest search box (live suggestions as user types) ----
search_data_json = json.dumps(search_items, ensure_ascii=False)

search_ui = folium.Element("""
<div id="gs-topbar">
  <div id="gs-brand">
    <span id="gs-logo">&#128506;</span>
    <span>UrbanLens<br><small>AHM + GNR wards &amp; facilities</small></span>
  </div>
  <div id="gs-search-wrap">
    <input id="gs-search-input" type="text" autocomplete="off"
           placeholder="Search ward, road, school, hospital, temple, bus stop..."/>
    <span id="gs-clear">&#10005;</span>
    <div id="gs-search-results"></div>
  </div>
  <div id="gs-layers">
    <div id="gs-layers-title">Layers <span>&#9776;</span></div>
    <div id="gs-layers-body"></div>
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
  #gs-topbar{position:absolute; top:110px; right:10px; z-index:1100;
    display:flex; flex-direction:column; gap:10px; width:340px;
    background:#fff; border:1px solid #d7dde3; border-radius:10px;
    box-shadow:0 3px 14px rgba(0,0,0,.18); padding:12px; font:13px/1.35 Arial,sans-serif;}
  #gs-brand{display:flex; align-items:center; gap:8px; white-space:nowrap; padding-bottom:10px; border-bottom:1px solid #e5eaef;}
  #gs-logo{font-size:22px;}
  #gs-brand small{color:#6b7684; font-size:10px;}
  #gs-search-wrap{position:relative; width:100%;}
  #gs-search-input{width:100%; padding:9px 28px 9px 11px; border:1px solid #c9d2da; border-radius:8px;
    font-size:13px; outline:none; transition:border .15s, box-shadow .15s; box-sizing:border-box;}
  #gs-search-input:focus{border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.18);}
  #gs-clear{position:absolute; right:8px; top:8px; cursor:pointer; color:#9aa4af; font-size:12px; display:none;}
  #gs-search-results{position:absolute; left:0; right:0; top:100%; margin-top:4px; display:none;
    background:#fff; border:1px solid #d7dde3; border-radius:8px; max-height:300px; overflow-y:auto;
    box-shadow:0 6px 20px rgba(0,0,0,.18); z-index:1200;}
  #gs-search-results .gs-hit{padding:7px 11px; cursor:pointer; display:flex; align-items:center; gap:8px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  #gs-search-results .gs-hit:hover,#gs-search-results .gs-hit.active{background:#eef4ff;}
  #gs-search-results .gs-none{padding:10px 12px; color:#8a94a0; font-style:italic;}
  .gs-cat{display:inline-block; min-width:50px; font-weight:bold; font-size:11px; text-align:center;
    padding:1px 6px; border-radius:4px; color:#fff; flex:0 0 auto;}
  .gs-cat.Ward{background:#7b2d8b;} .gs-cat.Road{background:#c1121f;} .gs-cat.School{background:#1565c0;}
  .gs-cat.Health{background:#d32f2f;} .gs-cat.Park{background:#2e7d32;} .gs-cat.Stop{background:#6a1b9a;}
  .gs-cat.Worship{background:#e65100;}
  .gs-name{overflow:hidden; text-overflow:ellipsis;}
  .gs-name b{color:#1a56db;}
  #gs-layers{width:100%; border-top:1px solid #e5eaef; padding-top:8px;}
  #gs-layers-title{font-weight:bold; color:#5b6673; font-size:11px; text-transform:uppercase; letter-spacing:.4px;
    display:flex; justify-content:space-between; margin-bottom:6px; cursor:pointer;}
  #gs-layers-body{display:flex; flex-direction:column; gap:6px;}
  .gs-layer-row{display:flex; align-items:center; justify-content:space-between; padding:3px 0; font-size:12px; color:#33415c;}
  .gs-switch{position:relative; width:36px; height:20px; background:#cbd5e1; border-radius:10px; cursor:pointer; transition:background .2s; flex:0 0 auto;}
  .gs-switch::after{content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; background:#fff;
    border-radius:50%; transition:left .2s; box-shadow:0 1px 2px rgba(0,0,0,.3);}
  .gs-switch.on{background:#22c55e;}
  .gs-switch.on::after{left:18px;}
  #gs-legend{position:fixed; left:10px; top:80px; z-index:2000; width:230px; background:#fff;
    border:1px solid #d7dde3; border-radius:10px; box-shadow:0 3px 14px rgba(0,0,0,.16);
    font:12px/1.5 Arial,sans-serif; overflow:hidden;}
  #gs-legend-title{padding:8px 12px; font-weight:bold; cursor:pointer; background:#fafbfc;
    border-bottom:1px solid #eceff2; display:flex; justify-content:space-between;}
  #gs-legend-body{padding:10px 12px; max-height:60vh; overflow-y:auto;}
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
  @media (max-width:760px){ #gs-brand{display:none;} #gs-topbar{width:96%;} }
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

  function render(q){
    q = q.trim().toLowerCase();
    results.innerHTML = '';
    idx = -1;
    hits = [];
    if (q.length < 1){ results.style.display='none'; clear.style.display='none'; return; }
    clear.style.display='block';
    var parts = q.split(' ');
    for (var i=0;i<data.length;i++){
      var label = data[i][0];
      var lbl = label.toLowerCase();
      if (curCat !== 'All' && catOf(label) !== curCat) continue;
      var ok = parts.every(function(p){ return lbl.indexOf(p) !== -1; });
      if (ok){ hits.push(data[i]); }
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
      var cat = catOf(h[0]);
      var rest = h[0].slice(cat.length + 3);
      d.innerHTML = '<span class="gs-cat '+cat+'">'+cat+'</span>' +
                    '<span class="gs-name">'+hl(rest, parts)+'</span>';
      d.addEventListener('mousedown', function(){ pick(i); });
      d.addEventListener('mouseenter', function(){ setActive(i); });
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
    getGSMap().flyTo([h[2], h[1]], 16, {duration:1});
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
              ['Worship', S.worship]];
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

  // ---- Layer ON/OFF toggles ----
  var layerBody = document.getElementById('gs-layers-body');
  var layerVars = LAYER_VARS_JSON;
  var order = ['Wards','Roads','Schools','Health','Greenspace','Transport','Worship','Land use'];
  order.forEach(function(lbl){
    if (!layerVars[lbl]) return;
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
    layerBody.appendChild(row);
  });
  // sync switch state after the map & layers exist
  setTimeout(function(){
    var map = getGSMap();
    if (!map) return;
    order.forEach(function(lbl){
      if (!layerVars[lbl]) return;
      var obj = window[layerVars[lbl]];
      if (!obj) return;
      var rows = layerBody.querySelectorAll('.gs-layer-row');
      rows.forEach(function(r){
        if (r.firstChild.textContent === lbl){
          var on = map.hasLayer(obj);
          r.querySelector('.gs-switch').classList.toggle('on', on);
        }
      });
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