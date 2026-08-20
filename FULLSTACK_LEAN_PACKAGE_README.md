# UrbanLens lean full-stack package

This package includes the complete frontend source, all 68 prebuilt district
payloads, and the backend application source. It excludes raw satellite data,
engine-layer files, the 1.5 GB SQLite database, backups, models, caches,
dependencies, build output and logs.

## Run the website

Install Node.js 20 or newer, then in PowerShell from the package folder run:

```powershell
.\SETUP_WEBSITE.ps1
.\START_WEBSITE.ps1
```

Open `http://localhost:3000/app`.

All district switching, observed 2018/2022/2024 built-up views, 2030 expansion
likelihood and hospital-access deficit views run from the included static data.

## Backend source

The `backend` folder and dependency manifest are included for development. Its
full spatial API requires the excluded SQLite database or engine-layer files,
so it is not started by the website scripts. To install its dependencies for
development, use `./SETUP_WEBSITE.ps1 -InstallBackend`, then provide a data
store through `URBANLENS_DB` before starting Uvicorn.
