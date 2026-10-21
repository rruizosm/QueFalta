# Ejecuta los catálogos de Dia y Froiz en secuencia desde la tarea semanal.
# Cada lanzador conserva su propio log; este log resume los códigos de salida.

$ErrorActionPreference = 'Stop'

$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("monday-catalog-sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$powershell = Join-Path $PSHOME 'powershell.exe'

# Ambos catálogos deben publicarse incluso si el proceso que inició la tarea
# heredó una variable de diagnóstico.
Remove-Item Env:DRY_RUN -ErrorAction SilentlyContinue
"=== Sync semanal Dia + Froiz $(Get-Date -Format 'o') ===" | Set-Content -Path $log

$failures = @()
foreach ($sync in @(
  @{ Store = 'Dia'; Script = 'run-dia-sync.ps1' },
  @{ Store = 'Froiz'; Script = 'run-froiz-sync.ps1' }
)) {
  $runner = Join-Path $PSScriptRoot $sync.Script
  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $runner
  try {
    $process = Start-Process -FilePath $powershell -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
    $code = [int]$process.ExitCode
  } catch {
    $code = 1
    Add-Content -Path $log -Value ("{0}: no se pudo iniciar: {1}" -f $sync.Store, $_.Exception.Message)
  }

  Add-Content -Path $log -Value ("{0}: exit {1}" -f $sync.Store, $code)
  if ($code -ne 0) { $failures += $sync.Store }
}

if ($failures.Count -gt 0) {
  Add-Content -Path $log -Value ("=== Sync semanal incompleto: {0} ===" -f ($failures -join ', '))
  exit 1
}

Add-Content -Path $log -Value '=== Sync semanal completado ==='
Get-ChildItem $logDir -Filter 'monday-catalog-sync-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue
exit 0
