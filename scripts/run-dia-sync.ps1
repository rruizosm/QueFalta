# Lanza el sync de Dia desde Windows, a mano o mediante una Tarea Programada semanal.
# Esta es la vía operativa desde 2026-09-14: Akamai bloquea con HTTP 403 el SSR
# de dia.es desde los runners alojados de GitHub/Azure.
# Ver README-dia-sync.md.
#
# Lee los secretos de MercaAppMobile/.env.local (gitignored). Necesita en ese fichero:
#   EXPO_PUBLIC_SUPABASE_URL=...     (ya lo tienes; se usa como SUPABASE_URL)
#   SUPABASE_SERVICE_ROLE=...        (la service_role key, la misma del secret de GitHub)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'No se encuentra Node.js en PATH. Instala Node.js 22 y abre una PowerShell nueva.'
}

$repo   = Split-Path -Parent $PSScriptRoot          # ...\MercaAppMobile
$envFile = Join-Path $repo '.env.local'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("dia-sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

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

# --- Ejecutar el sync ---
Set-Location $repo
"=== Dia sync $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log
# Windows PowerShell 5.1 convierte el stderr de Node en NativeCommandError al
# mezclarlo con *>&1; con ErrorActionPreference=Stop abortaría ante un aviso.
# cmd.exe mezcla ambos flujos antes de entregarlos a PowerShell, conservando
# el código de salida real de Node para decidir si continuar.
& cmd.exe /d /c 'node scripts/sync-dia.mjs 2>&1' | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
if ($code -eq 0 -and $env:DRY_RUN -ne '1') {
  "=== Actualizando comparador (dia) ===" | Tee-Object -FilePath $log -Append
  $env:STORES = 'dia'
  & cmd.exe /d /c 'node scripts/sync-comparator-embedding-catalog.mjs 2>&1' | Tee-Object -FilePath $log -Append
  $code = $LASTEXITCODE
}
"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

# Conservar solo los últimos 14 logs.
Get-ChildItem $logDir -Filter 'dia-sync-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
