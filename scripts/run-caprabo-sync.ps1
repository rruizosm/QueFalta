# Ejecuta el sync de Caprabo desde tu PC. Eroski/Caprabo bloquean las IPs de
# GitHub Actions con HTTP 403; la ejecución local usa la red residencial.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env.local'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("caprabo-sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

if (-not (Test-Path $envFile)) { throw "No existe $envFile" }
$vars = @{}
foreach ($line in Get-Content $envFile) {
  $text = $line.Trim()
  if ($text -eq '' -or $text.StartsWith('#')) { continue }
  $index = $text.IndexOf('=')
  if ($index -lt 1) { continue }
  $vars[$text.Substring(0, $index).Trim()] = $text.Substring($index + 1).Trim().Trim('"')
}

$url = $vars['SUPABASE_URL']
if (-not $url) { $url = $vars['EXPO_PUBLIC_SUPABASE_URL'] }
$role = $vars['SUPABASE_SERVICE_ROLE']
if (-not $url) { throw 'Falta SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL en .env.local' }
if (-not $role) { throw 'Falta SUPABASE_SERVICE_ROLE en .env.local' }

$env:SUPABASE_URL = $url
$env:SUPABASE_SERVICE_ROLE = $role
$env:CONCURRENCY = '2'
$env:LEAF_DELAY_MS = '700'
$env:DETAIL_CONCURRENCY = '3'
if (-not $env:DETAIL_MAX) { $env:DETAIL_MAX = '1000' }

Set-Location $repo
"=== Caprabo sync $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log
# Node usa stderr para avisos recuperables (429, reintentos de red). No dejamos
# que PowerShell los convierta en una excepción: el resultado válido es el exit code.
$ErrorActionPreference = 'Continue'
& node scripts/sync-caprabo.mjs *>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

Get-ChildItem $logDir -Filter 'caprabo-sync-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
