# Ejecuta el sync productivo de Lidl desde el PC leyendo los secretos de
# MercaAppMobile/.env.local. No imprime las credenciales.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env.local'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'No existe MercaAppMobile/.env.local' }
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$vars = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $parts = $line -split '=', 2
  if ($parts.Count -eq 2) { $vars[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'") }
}

$url = $vars['SUPABASE_URL']
if (-not $url) { $url = $vars['EXPO_PUBLIC_SUPABASE_URL'] }
$role = $vars['SUPABASE_SERVICE_ROLE']
if (-not $url) { throw 'Falta SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL en .env.local' }
if (-not $role) { throw 'Falta SUPABASE_SERVICE_ROLE en .env.local' }

$env:SUPABASE_URL = $url
$env:SUPABASE_SERVICE_ROLE = $role
$log = Join-Path $logDir ("lidl-sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

Set-Location $repo
"=== Lidl sync $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log
$ErrorActionPreference = 'Continue'
& node scripts/sync-lidl.mjs *>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

Get-ChildItem -LiteralPath $logDir -Filter 'lidl-sync-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
