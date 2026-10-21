# Barrido Lidl semanal desde Windows. Ver README-lidl-sync.md.
# .env.local debe contener EXPO_PUBLIC_SUPABASE_URL (o SUPABASE_URL) y
# SUPABASE_SERVICE_ROLE. El script no imprime las credenciales.
$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'No se encuentra Node.js en PATH. Instala Node.js 22 y abre una PowerShell nueva.'
}

$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env.local'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path -LiteralPath $envFile)) { throw "No existe $envFile" }
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$vars = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  $entry = $line.Trim()
  if (-not $entry -or $entry.StartsWith('#')) { continue }
  $parts = $entry -split '=', 2
  if ($parts.Count -eq 2) { $vars[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'") }
}
$url = $vars['SUPABASE_URL']
if (-not $url) { $url = $vars['EXPO_PUBLIC_SUPABASE_URL'] }
$role = $vars['SUPABASE_SERVICE_ROLE']
if (-not $url) { throw 'Falta SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL en .env.local' }
if (-not $role) { throw 'Falta SUPABASE_SERVICE_ROLE en .env.local' }

$env:SUPABASE_URL = $url
$env:SUPABASE_SERVICE_ROLE = $role
$log = Join-Path $logDir ("lidl-fleet-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$mode = if ($args.Count -eq 1 -and $args[0] -eq '-Recover') { '--recover' } elseif ($args.Count -eq 0) { '' } else { throw 'Uso: run-lidl-fleet.ps1 [-Recover]' }

Set-Location $repo
"=== Lidl fleet $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log
# PowerShell 5.1 convierte stderr nativo en NativeCommandError con *>&1.
# cmd.exe une los flujos y conserva el código de salida de Node.
if ($mode) {
  & cmd.exe /d /c 'node scripts/run-lidl-fleet-local.mjs --recover 2>&1' | Tee-Object -FilePath $log -Append
} else {
  & cmd.exe /d /c 'node scripts/run-lidl-fleet-local.mjs 2>&1' | Tee-Object -FilePath $log -Append
}
$code = $LASTEXITCODE
"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

Get-ChildItem -LiteralPath $logDir -Filter 'lidl-fleet-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
