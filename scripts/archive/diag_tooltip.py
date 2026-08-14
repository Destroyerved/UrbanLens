import re
html = open('preview/map_preview.html', encoding='utf-8').read()

# Find all tooltip strings passed to CircleMarker .bindTooltip("...")
# Risky: names containing ", \, or newlines inside JS string literals
risky = re.findall(r'bindTooltip\("([^"]*)"\)', html)
print("bindTooltip strings:", len(risky))

# find tooltips containing an unescaped double-quote (would break JS)
for t in risky:
    if '"' in t or '\\' in t or '\n' in t or ')' in t:
        print("RISKY:", repr(t))

# Also check DivIcon html for issues
print("--- checking CircleMarker tooltip bindings in raw source ---")
# The tooltip is passed as a python kwarg, folium renders as element_XX.bindTooltip("...")
matches = re.findall(r'\.bindTooltip\([^\n]{0,80}', html)
for mm in matches[:10]:
    print(repr(mm))