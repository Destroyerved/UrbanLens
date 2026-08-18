# 🌍 UrbanLens Cinematic 3D Earth Globe

A standalone, high-performance, photorealistic 3D Earth Globe built with **React Three Fiber (R3F)**, **Three.js**, and **custom GLSL Shaders**.

Includes NASA Blue Marble day & night city lights shaders, atmospheric Rayleigh scattering rim, dynamic cloud layers, pulsing city pins, and GeoJSON regional boundary outlines.

---

## 📁 Package Structure

```text
urbanlens-globe/
├── README.md                      # Complete Integration & API guide
├── package.json                   # Dependency reference
├── components/
│   ├── CinematicGlobe.tsx         # Primary drop-in wrapper (Hero mode / Scroll mode / Manual)
│   ├── GlobeCanvas.tsx            # R3F Canvas container with responsive camera & error boundary
│   ├── Globe.tsx                  # Core Earth mesh with shaders and texture management
│   ├── CityMarkers.tsx            # Pulsing pin markers with HTML labels (Ahmedabad, Surat, etc.)
│   ├── GujaratOutline.tsx         # 3D GeoJSON boundary line overlay
│   ├── Stars.tsx                  # Particle starfield background
│   ├── FallbackGlobe.tsx          # Procedural WebGL fallback if textures fail to load
│   └── materials.ts               # Custom GLSL Shaders (day/night, atmosphere, clouds)
├── lib/
│   ├── geo.ts                     # Lat/Long to 3D sphere coordinate converter & city data
│   ├── scroll.ts                  # High-performance scroll state bridge
│   └── story.ts                   # Camera choreography & keyframe interpolations
├── public/
│   ├── textures/                  # NASA WebP Earth textures (1K/2K/4K day, night, clouds, oceans)
│   └── geo/                       # Gujarat GeoJSON boundary definition
└── styles/
    └── globe.css                  # City labels, glowing dots, and vignette styles
```

---

## 🚀 Step-by-Step Integration

### Step 1: Install Required Dependencies

In your original landing page / Next.js project, run:

```bash
npm install three @types/three @react-three/fiber @react-three/drei
```

*(Optional for scroll choreography: `npm install gsap lenis`)*

---

### Step 2: Copy the Assets to Your Project

1. Copy the `public/textures` and `public/geo` folders into your project's `public/` directory:
   - `public/textures/` → `<your-project>/public/textures/`
   - `public/geo/` → `<your-project>/public/geo/`

2. Copy the `urbanlens-globe` folder (or its `components`, `lib`, and `styles` folders) into your project:
   - e.g., `<your-project>/src/components/urbanlens-globe/` or `<your-project>/components/urbanlens-globe/`

3. Import the CSS in your `app/layout.tsx` or `globals.css`:
   ```css
   @import "./path/to/urbanlens-globe/styles/globe.css";
   ```

---

## 💻 Usage Examples

### Example 1: Standalone Hero Section (Auto-Rotating Globe)

Drop the globe directly into your Hero section with dynamic SSR disabled:

```tsx
"use client";

import dynamic from "next/dynamic";

const CinematicGlobe = dynamic(
  () => import("@/components/urbanlens-globe/CinematicGlobe"),
  { ssr: false }
);

export default function HeroSection() {
  return (
    <section className="relative w-full h-screen bg-[#020409] flex items-center justify-between px-12 overflow-hidden">
      {/* Hero Text */}
      <div className="z-10 max-w-xl text-white">
        <span className="text-cyan-400 text-xs font-semibold tracking-widest uppercase">
          Urban Planning Intelligence
        </span>
        <h1 className="text-5xl font-bold mt-3 leading-tight">
          Seeing Cities Before They Exist
        </h1>
        <p className="text-white/60 mt-4 text-lg">
          Planetary-scale satellite intelligence from orbit down to the parcel.
        </p>
      </div>

      {/* 3D Globe Container */}
      <div className="absolute right-0 top-0 w-full md:w-3/5 h-full">
        <CinematicGlobe
          mode="standalone"
          autoRotate={true}
          rotationSpeed={0.8}
          showMarkers={true}
          showStars={true}
        />
      </div>
    </section>
  );
}
```

---

### Example 2: Cinematic Scroll-Story Mode

Pin the globe behind multi-step story narrative sections:

```tsx
"use client";

import dynamic from "next/dynamic";

const CinematicGlobe = dynamic(
  () => import("@/components/urbanlens-globe/CinematicGlobe"),
  { ssr: false }
);

export default function StoryExperience() {
  return (
    <div className="relative bg-[#020409]">
      {/* Sticky Globe Canvas */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <CinematicGlobe mode="scroll" showStars={true} />
      </div>

      {/* Overlay Scroll Content (700vh scroll container) */}
      <div className="relative z-10 -mt-[100vh] space-y-[100vh] pb-[50vh] px-8 max-w-2xl text-white pointer-events-none">
        <div className="min-h-screen flex flex-col justify-center">
          <h2 className="text-4xl font-bold">1. Planetary Vision</h2>
          <p className="text-white/60 mt-2">Observing urbanization patterns from orbit.</p>
        </div>
        <div className="min-h-screen flex flex-col justify-center">
          <h2 className="text-4xl font-bold">2. India's Corridors</h2>
          <p className="text-white/60 mt-2">400M new urban residents by 2050.</p>
        </div>
        <div className="min-h-screen flex flex-col justify-center">
          <h2 className="text-4xl font-bold">3. Gujarat Growth Engine</h2>
          <p className="text-white/60 mt-2">Ahmedabad, Surat, Vadodara, Rajkot parcel grid.</p>
        </div>
      </div>
    </div>
  );
}
```

---

## ⚙️ Component Props (`CinematicGlobe`)

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `mode` | `"standalone" \| "scroll" \| "manual"` | `"standalone"` | Operational mode |
| `autoRotate` | `boolean` | `true` (standalone) | Enables idle planetary rotation |
| `rotationSpeed` | `number` | `1` | Multiplier for rotation speed |
| `showMarkers` | `boolean` | `true` | Show pulsing city pin markers |
| `showOutline` | `boolean` | `true` | Show regional GeoJSON boundary outline |
| `showStars` | `boolean` | `true` | Show space particle starfield |
| `showVignette` | `boolean` | `true` | Radial gradient background overlay |
| `progress` | `number` (0..1) | `0` | Manual camera scrub progress when `mode="manual"` |
| `textureBasePath`| `string` | `"/textures"` | Base URL path where texture webp files reside |
| `onReady` | `() => void` | `undefined` | Callback fired when textures and 3D shaders finish loading |

---

## 🛠️ Customizing Cities & Coordinates

To add or change city markers, edit `lib/geo.ts`:

```ts
export const CITIES: City[] = [
  { name: "Ahmedabad", lat: 23.0225, lon: 72.5714, major: true, dx: -1, dy: -1 },
  { name: "Mumbai",    lat: 19.0760, lon: 72.8777, major: true, dx:  1, dy:  1 },
  { name: "Delhi",     lat: 28.6139, lon: 77.2090, major: true, dx:  1, dy: -1 },
  { name: "Bengaluru", lat: 12.9716, lon: 77.5946, major: true, dx: -1, dy:  1 },
];
```
