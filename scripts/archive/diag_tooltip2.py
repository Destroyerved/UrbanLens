import re
html = open('preview/map_preview.html', encoding='utf-8').read()

# extract full bindTooltip calls to see content
calls = re.findall(r'\.bindTooltip\(([^\)]*)\)', html)
print("calls:", len(calls))
for c in calls:
    if c.strip():
        print(repr(c[:100]))
        break

# Look for the actual JS error source: unescaped quote inside a bindTooltip("...")
# Show context around each bindTooltip with a " inside
idx = 0
count = 0
while True:
    i = html.find('.bindTooltip(', idx)
    if i == -1:
        break
    seg = html[i:i+160]
    # if a double-quote appears then end of string issue
    print(repr(seg))
    idx = i + 1
    count += 1
    if count > 8:
        break