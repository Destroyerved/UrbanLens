# UrbanLens — 4-minute judge demo script

1. **Open UrbanLens** (dark mode). Overview shows Ahmedabad, city pulse KPIs, planning signals.
   Say: "GLIS tells us what land exists. UrbanLens tells us what to do with it."
2. **Theme**: flip dark → light → dark (top-right) to show it's a real product, then stay dark.
3. **Urban Growth**: scrub 2018 → 2022 → 2026. The built-up footprint visibly explodes
   north-west along S.G. Highway (+46% since 2018). Point at the transition cards
   (Agriculture → Residential).
4. **2030 Prediction**: flip the toggle. Red/orange band = highest growth pressure, just
   beyond the NW frontier. Click "Why is the NW corridor predicted to grow?"
5. **Infrastructure**: healthcare category. Gota ranks near the bottom — ~240K residents
   beyond 3.5 km of a hospital in the fastest-growing corridor. Click Gota to highlight it.
   (Optional: click empty map for the 15-minute analyzer.)
6. **Ask the question**: "Where should Ahmedabad build a new public hospital?"
7. **Site Selection**: Hospital is preselected. Show constraints (min 4 ha, government
   land) and the six weight sliders — move one, results re-rank live. Run analysis.
8. **GJ-AHD-1028 ranks #1 (87/100)** — ranked markers drop on the map. Expand "Why this
   site ranked #1": government-owned, fills the service gap, strong road access, low flood
   risk — and the model honestly flags the transit trade-off. Hover the segmented score
   bar: every factor, weight and evidence.
9. **Simulate**: hit Simulate on #1. Analysis choreography → pin drops, coverage ring
   expands → corridor coverage 51% → 82%, +265K residents newly covered, avg hospital
   distance 4.1 → 2.8 km. All recomputed from the population grid live.
10. **Copilot**: ask "Why did GJ-AHD-1028 rank first?" — it answers from the same engine
    and flies the map there. Then "Show underserved areas near government land" — it
    switches modes and highlights wards. Close: "A natural-language controller over a real
    spatial analysis engine — not a chatbot."

Backup: `npm run sanity` prints the same numbers in the terminal — proof nothing is hardcoded.
