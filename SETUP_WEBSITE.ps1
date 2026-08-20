param(
  [switch]$InstallBackend
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Node.js 20+ is required. Install it, then run this script again."
}

Push-Location (Join-Path $root "web")
try {
  npm ci
} finally {
  Pop-Location
}

if ($InstallBackend) {
  if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.11+ is required to install the optional backend dependencies."
  }
  python -m pip install -r (Join-Path $root "backend\requirements.txt")
}

Write-Host "Setup complete. Run .\START_WEBSITE.ps1 to open UrbanLens locally."
