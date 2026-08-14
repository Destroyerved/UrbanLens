import re
html = open('preview/map_preview.html', encoding='utf-8').read()

# Find tooltip template literals that contain a backtick or ${ (breakage)
# bindTooltip(`<div>...</div>`
# risky if the name inside contains a ` or ${ or a stray `
risky = re.findall(r'bindTooltip\(\s*`<div>[^`]*`', html)
print("total tooltip literals:", len(risky))

# find ones with a ${ inside (unescaped) which would be interpolated/error
dollar = [r for r in risky if '${' in r]
print("tooltips containing ${:", len(dollar))
for d in dollar[:3]:
    print(repr(d))

# find tooltips containing backtick char in the name text
bt = [r for r in risky if '`' in r[15:-1]]
print("tooltips containing backtick in name:", len(bt))

# Show the LAST few risky content — maybe a name with newline or weird
# Actually find where the syntax error would be: names with )
# Let's instead check every feature name for characters that break <div> or template
import geopandas as gpd
for city in ["ahmedabad","gandhinagar"]:
    for layer in ["schools","health","greenspace","transport","worship"]:
        try:
            g = gpd.read_file(f"raw/osm/{city}_{layer}.geojson")
            for n in g["name"].dropna():
                if any(ch in str(n) for ch in ['`','$','(',')','"',"'"]):
                    print("SUSPECT:", city, layer, repr(str(n)))
        except Exception:
            pass
print("done")