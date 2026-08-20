# urbanlens-globe — integration

A self-contained cinematic 3D globe hero for UrbanLens.
Scroll journey: **Earth → India → Gujarat → Gujarat urban nodes → complete.**

---

## 1. Copy the folder

```
your-project/components/urbanlens-globe/
```

(Any components directory works. Nothing outside this folder is required,
except the optional textures in step 3.)

## 2. Install dependencies

```bash
npm install three @react-three/fiber @react-three/drei gsap
npm install -D @types/three
```

Nothing else is needed. There is no second `package.json`, no backend, no API.

## 3. Textures (optional — skip to see it work immediately)

Copy the NASA Blue Marble plates into:

```
public/urbanlens-globe/earth-day.jpg
public/urbanlens-globe/earth-night.jpg
public/urbanlens-globe/earth-clouds.png
public/urbanlens-globe/earth-ocean-mask.jpg
```

Exact sources and sizes: see `assets/README.md`.
**If the files are absent the globe still renders** — it generates an Earth
from a bundled public-domain land mask and logs nothing scary.

## 4. Import

```tsx
import { GujaratGlobeHero } from "@/components/urbanlens-globe";
```

## 5. Use it

```tsx
export default function LandingPage() {
  return (
    <>
      <GujaratGlobeHero />
      <NextLandingSection />
    </>
  );
}
```

The component renders its own tall scroll section (default 4.5 viewports) and
pins the globe inside it, so **no extra scroll height is needed on the parent**.
The page just must not be `overflow: hidden` on `html`/`body`.

## 6. Props (all optional)

```tsx
<GujaratGlobeHero
  eyebrow="AI-POWERED SPATIAL INTELLIGENCE"
  title={"See Gujarat.\nUnderstand what comes next."}   // \n = new line
  description="UrbanLens transforms land, satellite, population and infrastructure data into explainable urban-planning intelligence across Gujarat."
  primaryCta={{ label: "Explore UrbanLens", href: "/app" }}
  secondaryCta={{ label: "See How It Works", href: "#how-it-works" }}
  scrollLength={4.5}                 // viewport heights of scroll
  texturePath="/urbanlens-globe"
  accent="#16D9F5"                   // UrbanLens cyan
  atmosphereColor="#7ABEFF"          // Earth atmospheric blue
  showCityLabels
  showGrid
  quality="auto"                     // "auto" | "high" | "low"
  onStageChange={(stage) => console.log(stage)}
  onGujaratFocus={() => {}}
  onSequenceComplete={() => {}}
/>
```

Stage captions are overridable too:

```tsx
<GujaratGlobeHero
  stages={{
    gujarat: { label: "GUJARAT", title: "State-wide urban intelligence" },
  }}
/>
```

## 7. Syncing the rest of the page

`onStageChange` fires with `"earth" | "india" | "gujarat" | "cities" | "complete"`.
For finer control, read the live scroll value (0 → 1) without re-rendering:

```tsx
import { globeState, useGlobeSnapshot } from "@/components/urbanlens-globe";

globeState.progress;          // read inside your own rAF / useFrame
const { stage } = useGlobeSnapshot();   // reactive, changes ~5× per sequence
```

## 8. Server rendering

Every file is `"use client"`. Nothing touches `window` during render, so the
component is safe in the Next.js App Router as-is. If your setup still
complains, wrap it:

```tsx
import dynamic from "next/dynamic";
const GujaratGlobeHero = dynamic(
  () => import("@/components/urbanlens-globe").then((m) => m.GujaratGlobeHero),
  { ssr: false }
);
```

## 9. Styles

`GujaratGlobeHero.tsx` imports `./styles/globe.css`. Every class is namespaced
`ulg-`, so it cannot collide with existing UrbanLens styles, and it sets no
global rules.

*Pages Router only:* global CSS may not be imported from `components/`. In that
case delete the `import "./styles/globe.css";` line and import the file from
`pages/_app.tsx` instead.

## 10. Run

```bash
npm run dev
```

Scroll the hero. You should see: full Earth slowly rotating → the planet eases
around to India → Gujarat is outlined in cyan with a soft glow → the urban
nodes and their links fade up → the scene settles for the next section.

---

## Files

| File | Role |
| --- | --- |
| `GujaratGlobeHero.tsx` | The public component: HTML overlay + pinned viewport |
| `GlobeCanvas.tsx` | R3F `<Canvas>`, adaptive DPR, visibility pausing, camera rig |
| `Earth.tsx` / `Clouds.tsx` / `Atmosphere.tsx` / `Starfield.tsx` | Scene layers |
| `GujaratOverlay.tsx` | State outline, glow, pulse, analysis grid |
| `CityMarkers.tsx` / `CityLinks.tsx` | Urban nodes, labels, intelligence links |
| `GlobeScrollController.tsx` | GSAP ScrollTrigger → shared timeline |
| `lib/stage.ts` | Camera + layer choreography (pure functions of scroll) |
| `lib/store.ts` | Tiny external store, keeps scroll out of React state |
| `lib/textures.ts` | Texture loading + procedural fallback |
| `lib/geo.ts` | lat/lng → sphere, arcs, easing |
| `data/gujaratCities.ts` | Real coordinates for the seven urban nodes |
| `data/gujaratOutline.ts` | Simplified Gujarat boundary |
| `data/landMask.ts` | Bundled land mask used by the texture fallback |
| `shaders/` | Earth + atmosphere GLSL (`.ts` exports; `.vert`/`.frag` are reference copies) |

## Performance notes

- DPR is capped at 1.6 (1.25 on small screens) and the sphere drops to 64
  segments on mobile.
- Rendering stops completely (`frameloop="never"`) when the hero scrolls out of
  view, via `IntersectionObserver`.
- `prefers-reduced-motion` stops the idle spin, cloud drift, radar pulses and
  the analysis sweep, while keeping the full Gujarat highlight and all content.
- ScrollTrigger instances, textures, geometries and materials are disposed on
  unmount.

## Later: handing over to MapLibre

The sequence ends framed on Gujarat with `onSequenceComplete()` fired and
`stage === "complete"`. To cross-fade into a MapLibre map, mount it beneath the
hero and fade it in on that callback — `GUJARAT_BOUNDS` (exported from
`data/gujaratOutline.ts`) gives you the bounding box to `fitBounds` to, so the
two views line up.
