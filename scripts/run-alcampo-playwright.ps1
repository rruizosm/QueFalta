param(
  [switch]$Publish,
  [switch]$Resume,
  [int]$MaxLeaves = 0,
  [int]$DelayMs = 4500,
  [int]$WaitMs = 90000
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# Por seguridad, la publicación exige -Publish explícito. Sin él, el runner
# recorre la web y valida el volumen sin tocar Supabase.
$env:DRY_RUN = if ($Publish) { '0' } else { '1' }
$env:RESUME = if ($Resume) { '1' } else { '0' }
$env:DELAY_MS = [string]$DelayMs
$env:WAIT_MS = [string]$WaitMs
if ($MaxLeaves -gt 0) { $env:MAX_LEAVES = [string]$MaxLeaves } else { Remove-Item Env:MAX_LEAVES -ErrorAction SilentlyContinue }

node scripts/sync-alcampo-playwright.mjs
