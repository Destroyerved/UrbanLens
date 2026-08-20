# Earth textures (optional)

The globe **works with zero asset files** — if these images are missing it
synthesises a believable Earth in the browser from a bundled public-domain
land mask (`data/landMask.ts`). Adding the real plates makes it photoreal.

## Where the files go

```
your-project/
└── public/
    └── urbanlens-globe/
        ├── earth-day.jpg          ← required for photoreal mode
        ├── earth-night.jpg        ← optional (city lights)
        ├── earth-clouds.png       ← optional (cloud plate)
        └── earth-ocean-mask.jpg   ← optional (white = water, drives specular)
```

The path is configurable: `<GujaratGlobeHero texturePath="/urbanlens-globe" />`

## What to download

All of these are NASA Visible Earth / Blue Marble products, which are in the
**public domain** (NASA imagery is not copyrighted; credit is appreciated).

| File | Source | NASA page |
| --- | --- | --- |
| `earth-day.jpg` | Blue Marble Next Generation, "land_ocean_ice" | https://visibleearth.nasa.gov/collection/1484/blue-marble |
| `earth-night.jpg` | Black Marble / Earth at Night 2016 | https://earthobservatory.nasa.gov/features/NightLights |
| `earth-clouds.png` | Blue Marble "cloud combined" plate | https://visibleearth.nasa.gov/images/57747 |
| `earth-ocean-mask.jpg` | Blue Marble "water mask" / specular map | https://visibleearth.nasa.gov/images/73963 |

Any equivalent **equirectangular (plate carrée) 2:1** Earth image works —
the shader assumes longitude −180…180 maps left→right and latitude 90…−90 maps
top→bottom, which is the standard for these plates.

## Recommended sizes

| Target | Day / night | Clouds | Ocean mask |
| --- | --- | --- | --- |
| Good default | 4096 × 2048 | 2048 × 1024 | 2048 × 1024 |
| Lighter pages | 2048 × 1024 | 1024 × 512 | 1024 × 512 |

Re-encode to JPEG quality ~80 (PNG for clouds, it needs alpha). A 4096-wide
day plate should land around 1–2 MB; anything above 8192 is wasted at this
camera distance and will stall on low-end laptops.

## Cloud plate note

If your cloud image is white-on-black with no alpha channel, that is fine —
the shader falls back to luminance when alpha is fully opaque.
