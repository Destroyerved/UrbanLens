import os
import json
import folium
import geopandas as gpd
import pandas as pd
import branca.colormap as cm

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
m = folium.Map(location=[23.15, 72.60], zoom_start=10,
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

# ---- POI layers ----
print("POIs:", flush=True)
ICON = {"schools": "\U0001F3EB", "health": "\U0001F3E5", "greenspace": "\U0001F333",
        "transport": "\U0001F68C", "worship": "\U0001F54A"}
for name, color in [("schools", "blue"), ("health", "red"), ("greenspace", "green"),
                    ("transport", "purple"), ("worship", "orange")]:
    add_layer(["ahmedabad", "gandhinagar"], name, f"{name.capitalize()}", color,
              show=(name in ("schools", "health")), icon=ICON.get(name))
print("landuse:", flush=True)
add_layer(["ahmedabad", "gandhinagar"], "landuse", "Land use", "brown", fill_opacity=0.25)

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

# ---- Custom autosuggest search box (live suggestions as user types) ----
search_data_json = json.dumps(search_items, ensure_ascii=False)

search_ui = folium.Element("""
<div id="gs-search-wrap">
  <input id="gs-search-input" type="text" autocomplete="off"
         placeholder="Search: ward, road, school, hospital, temple..."/>
  <div id="gs-search-results"></div>
</div>
<style>
  #gs-search-wrap{position:absolute; top:10px; left:50px; z-index:1000; width:320px; font:13px/1.4 Arial,sans-serif;}
  #gs-search-input{width:100%; padding:8px 10px; border:1px solid #ccc; border-radius:4px;
    box-shadow:0 1px 5px rgba(0,0,0,.35); font-size:13px;}
  #gs-search-results{display:none; background:#fff; border:1px solid #ccc; border-radius:4px;
    max-height:280px; overflow-y:auto; box-shadow:0 2px 8px rgba(0,0,0,.3); margin-top:3px;}
  #gs-search-results div{padding:7px 10px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  #gs-search-results div:hover,#gs-search-results div.active{background:#e8f0fe;}
  .gs-cat{display:inline-block; min-width:52px; font-weight:bold; font-size:11px; margin-right:6px;}
  .gs-cat.Ward{color:#7b2d8b;} .gs-cat.Road{color:#c1121f;} .gs-cat.School{color:#1565c0;}
  .gs-cat.Health{color:#d32f2f;} .gs-cat.Park{color:#2e7d32;} .gs-cat.Stop{color:#6a1b9a;} .gs-cat.Worship{color:#e65100;}
</style>
""")

search_js = folium.Element("""
var SEARCH_DATA_JSON = __SEARCH_DATA__;
function getGSMap(){ return window['__MAP_NAME__']; }
(function(){
  var data = SEARCH_DATA_JSON;
  var input = document.getElementById('gs-search-input');
  var results = document.getElementById('gs-search-results');
  var idx = -1;
  var hits = [];

  function catOf(label){ return label.split(' - ')[0]; }

  function render(q){
    q = q.trim().toLowerCase();
    results.innerHTML = '';
    idx = -1;
    hits = [];
    if (q.length < 1){ results.style.display='none'; return; }
    var parts = q.split(' ');
    for (var i=0;i<data.length;i++){
      var lbl = data[i][0].toLowerCase();
      var ok = parts.every(function(p){ return lbl.indexOf(p) !== -1; });
      if (ok){ hits.push(data[i]); }
      if (hits.length >= 10) break;
    }
    if (!hits.length){ results.style.display='none'; return; }
    hits.forEach(function(h, i){
      var d = document.createElement('div');
      var cat = catOf(h[0]);
      var rest = h[0].slice(cat.length + 3);
      d.innerHTML = '<span class="gs-cat '+cat+'">'+cat+'</span>'+rest;
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
    if (kids.length === 0) return;
    if (e.key === 'ArrowDown'){ e.preventDefault(); setActive((idx+1)%kids.length); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); setActive((idx-1+kids.length)%kids.length); }
    else if (e.key === 'Enter'){ e.preventDefault(); if (idx>=0 && idx<kids.length) pick(idx); }
    else if (e.key === 'Escape'){ results.style.display='none'; }
  });
  document.addEventListener('click', function(e){
    if (!document.getElementById('gs-search-wrap').contains(e.target)) results.style.display='none';
  });
})();

/* Click any feature -> fly to its spot on the map */
setTimeout(function(){
  var GS_MAP = getGSMap();
  if (typeof GS_MAP === 'undefined' || !GS_MAP) return;
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
}, 0);
""".replace("__SEARCH_DATA__", search_data_json).replace("__MAP_NAME__", m.get_name()))

m.get_root().html.add_child(search_ui)
m.get_root().script.add_child(search_js)

# ---- Ward labels ----
labels = folium.FeatureGroup(name="Ward labels", show=False)
for _, r in allw.iterrows():
    c = r.geometry.centroid
    folium.Marker([c.y, c.x], icon=folium.DivIcon(html=f'<div style="font-size:9px;color:#555">{r["name"]}</div>')).add_to(labels)
labels.add_to(m)

folium.LayerControl(collapsed=False).add_to(m)
m.save(OUT_HTML)
print(f"saved {OUT_HTML}", flush=True)