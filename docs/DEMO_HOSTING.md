# Serving the engine from your laptop

Frontend on Vercel, engine on your machine, exposed through a TLS tunnel.

```
browser ──▶ vercel.app              Next + static bootstrap payloads
       └──▶ your-name.ngrok-free.app ──▶ 127.0.0.1:8000  FastAPI engine
```

## Why this is a serious option, not a hack

| | This laptop | Render free | Cloud Run |
|---|---|---|---|
| RAM | 32 GB | 512 MB | 4 GiB |
| Kutch (needs 2,956 MB) | fine | OOM | fine |
| Parcel cache present | yes, 251 MB | no | no |
| Cost | none | none | free grant |

The SQLite cache is the interesting part: no deployment ships it, so every
cloud option rebuilds parcels from street geometry on demand. Locally that
work is already done, which makes this the *fastest* way to run UrbanLens,
not merely the cheapest.

Bandwidth is not the problem you would expect either. `web/lib/dataset.ts`
requests `/data/bootstrap/<city>.json.gz` first and only falls back to
`/api/bootstrap`, so the 3.7–8.3 MB per district comes from Vercel's CDN.
Your uplink carries the small analytic calls — equity, conservation,
provenance, parcels — not the geometry.

## Setup

**1. Install ngrok and claim the free static domain** at
[dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains).

The static domain is not optional in practice. `NEXT_PUBLIC_API_URL` is
inlined into the Vercel build, so a URL that changes on every tunnel restart
means a Vercel redeploy on every tunnel restart. With a static domain you set
it once.

The tunnel must terminate TLS. Vercel serves HTTPS, and a browser blocks a
plain `http://` backend as mixed content before the request is even sent.

**2. Start the engine and the tunnel:**

```bash
NGROK_DOMAIN=your-name.ngrok-free.app npm run demo:host
```

**3. In Vercel**, set `NEXT_PUBLIC_API_URL` to `https://your-name.ngrok-free.app`
and redeploy. One time only.

**4. Verify from outside the browser**, which skips CORS and tells the truth:

```bash
curl "https://your-name.ngrok-free.app/api/health?city=ahmedabad"
```

## Before the demo

**Stop the laptop sleeping.** A closed lid ends the demo:

```bash
powercfg /change standby-timeout-ac 0
```

Also set lid-close to "Do nothing" while on power, in Windows power settings.

**Test on the venue network, not just at home.** Corporate and conference
wifi sometimes blocks outbound tunnels or throttles them hard. This is the
one risk that cannot be mitigated from the code, and it is worth ten minutes
of testing on the actual network before you present.

**Warm the districts you plan to show.** Load each one once so its parcels
are cached in the running process. Kutch takes ~100s cold and is instant
afterwards.

## Honest limits

This is a single point of failure that you carry in a bag. It is excellent
for a judged demo where you control the machine and want the fastest possible
responses, and unsuitable as anything a third party depends on.

The sensible arrangement is both: laptop as primary because it is fast and
has every district, [Cloud Run](CLOUD_RUN.md) deployed as the fallback. They
differ only by the value of `NEXT_PUBLIC_API_URL`, so switching is a Vercel
environment variable and a redeploy.
