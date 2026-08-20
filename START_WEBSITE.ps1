$ErrorActionPreference = "Stop"
$web = Join-Path $PSScriptRoot "web"

if (-not (Test-Path -LiteralPath (Join-Path $web "node_modules"))) {
  throw "Dependencies are not installed. Run .\SETUP_WEBSITE.ps1 first."
}

Push-Location $web
try {
  npm run dev
} finally {
  Pop-Location
}
