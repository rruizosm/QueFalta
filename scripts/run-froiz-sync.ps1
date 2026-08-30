# Ejecuta el sync productivo de Froiz desde el PC y, si termina correctamente,
# materializa los cambios del comparador y arranca los workers de embeddings.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("froiz-sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

Set-Location $repo
"=== Froiz sync $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log
$ErrorActionPreference = 'Continue'
& node scripts/sync-froiz.mjs *>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'

if ($code -eq 0 -and $env:DRY_RUN -ne '1') {
  "=== Actualizando comparador (froiz) ===" | Tee-Object -FilePath $log -Append
  $env:STORES = 'froiz'
  $ErrorActionPreference = 'Continue'
  & node scripts/sync-comparator-embedding-catalog.mjs *>&1 | Tee-Object -FilePath $log -Append
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
}

"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

Get-ChildItem $logDir -Filter 'froiz-sync-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
