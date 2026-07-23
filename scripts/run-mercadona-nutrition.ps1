# Lanza la extracción de nota de salud de Mercadona desde tu PC.
# Es INCREMENTAL: la 1ª ejecución es el backfill (miles de productos, varios
# minutos y coste de visión de unos pocos €); luego solo procesa los nuevos.
# Ver README-mercadona-nutrition.md.
#
# Lee los secretos de MercaAppMobile/.env.local (gitignored). Necesita:
#   EXPO_PUBLIC_SUPABASE_URL=...   (se usa como SUPABASE_URL)
#   SUPABASE_SERVICE_ROLE=...      (service_role key)
#   ANTHROPIC_API_KEY=...          (clave de la API de Anthropic, para la visión)

$ErrorActionPreference = 'Stop'

$repo   = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env.local'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("mercadona-nutrition-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

if (-not (Test-Path $envFile)) { throw "No existe $envFile" }
$vars = @{}
foreach ($line in Get-Content $envFile) {
  $t = $line.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $vars[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"')
}

$url  = $vars['SUPABASE_URL'];          if (-not $url)  { $url  = $vars['EXPO_PUBLIC_SUPABASE_URL'] }
$role = $vars['SUPABASE_SERVICE_ROLE']
$akey = $vars['ANTHROPIC_API_KEY']
if (-not $url)  { throw "Falta SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL en .env.local" }
if (-not $role) { throw "Falta SUPABASE_SERVICE_ROLE en .env.local" }
if (-not $akey) { throw "Falta ANTHROPIC_API_KEY en .env.local (clave de la API de Anthropic)" }

$env:SUPABASE_URL          = $url
$env:SUPABASE_SERVICE_ROLE = $role
$env:ANTHROPIC_API_KEY     = $akey
$env:CONCURRENCY           = '4'

Set-Location $repo
"=== Mercadona nutrition $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log
& node scripts/extract-mercadona-nutrition.mjs *>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

Get-ChildItem $logDir -Filter 'mercadona-nutrition-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
