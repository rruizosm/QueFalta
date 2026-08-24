# Lanza el sync de Carrefour desde tu PC (Cloudflare bloquea las IPs de datacenter
# de GitHub Actions, pero tu IP residencial española sí pasa). Pensado para una
# Tarea Programada SEMANAL (lunes 08:00). Ver scripts/README-carrefour-sync.md para instalarla.
#
# Lee los secretos de MercaAppMobile/.env.local (gitignored). Necesita en ese fichero:
#   EXPO_PUBLIC_SUPABASE_URL=...     (ya lo tienes; se usa como SUPABASE_URL)
#   SUPABASE_SERVICE_ROLE=...        (AÑÁDELO: la service_role key, la misma del secret de GitHub)

$ErrorActionPreference = 'Stop'

$repo   = Split-Path -Parent $PSScriptRoot          # ...\MercaAppMobile
$envFile = Join-Path $repo '.env.local'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("carrefour-sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

# --- Cargar variables de .env.local ---
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
if (-not $url)  { throw "Falta SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL en .env.local" }
if (-not $role) { throw "Falta SUPABASE_SERVICE_ROLE en .env.local (agrega la service_role key, la misma del secret de GitHub)" }

$env:SUPABASE_URL          = $url
$env:SUPABASE_SERVICE_ROLE = $role
$env:CONCURRENCY           = '4'
# Tope de fichas por ejecución para caber en la ventana de 4 h de la tarea: el barrido
# multi-zona (~18 almacenes) ya consume ~2 h, y en el 1er run hay ~17k fichas nuevas que
# NO caben enteras. El catálogo + regions se guardan ANTES de la ficha (ver sync-carrefour.mjs),
# así que aunque la ficha se corte el catálogo queda a salvo; el backlog se drena en ~3 runs
# semanales (DETAIL_TTL_DAYS=30). Súbelo/quítalo (Infinity) si amplías el límite de la tarea.
if (-not $env:DETAIL_MAX) { $env:DETAIL_MAX = '6000' }

# --- Ejecutar el sync ---
Set-Location $repo
"=== Carrefour sync $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log
& node scripts/sync-carrefour.mjs *>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
if ($code -eq 0 -and $env:DRY_RUN -ne '1') {
  "=== Actualizando comparador (carrefour) ===" | Tee-Object -FilePath $log -Append
  $env:STORES = 'carrefour'
  & node scripts/sync-comparator-embedding-catalog.mjs *>&1 | Tee-Object -FilePath $log -Append
  $code = $LASTEXITCODE
}
"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

# Conservar solo los últimos 14 logs.
Get-ChildItem $logDir -Filter 'carrefour-sync-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
