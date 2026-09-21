param(
  [switch]$Publish,
  [switch]$Resume,
  [switch]$Visible,
  [int]$PageDelayMinMs = 1500,
  [int]$PageDelayMaxMs = 3000,
  [int]$CategoryDelayMs = 15000,
  [int]$WafCooldownMs = 90000
)

# Runner local de Hipercor. Akamai bloquea de forma sostenida las IP de los
# runners alojados de GitHub después de la primera categoría completa.
$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'No se encuentra Node.js en PATH. Instala Node.js 22 y abre una PowerShell nueva.'
}

if ($PageDelayMinMs -lt 0 -or $PageDelayMaxMs -lt $PageDelayMinMs) {
  throw 'PageDelayMinMs debe ser >= 0 y PageDelayMaxMs debe ser >= PageDelayMinMs.'
}
if ($CategoryDelayMs -lt 0 -or $WafCooldownMs -le 0) {
  throw 'CategoryDelayMs debe ser >= 0 y WafCooldownMs debe ser > 0.'
}

$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo '.env.local'
$logDir = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir ("hipercor-sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$checkpoint = Join-Path $logDir 'hipercor-sync-checkpoint.json'

# Publicar exige -Publish explícito. Las pruebas normales recorren todo el
# catálogo y validan su volumen, pero no leen credenciales ni escriben Supabase.
$env:DRY_RUN = if ($Publish) { '0' } else { '1' }
$env:RESUME = if ($Resume) { '1' } else { '0' }
$env:PW_CHANNEL = 'chrome'
$env:HEADLESS = if ($Visible) { '0' } else { '1' }
$env:PAGE_DELAY_MIN_MS = [string]$PageDelayMinMs
$env:PAGE_DELAY_MAX_MS = [string]$PageDelayMaxMs
$env:CATEGORY_DELAY_MS = [string]$CategoryDelayMs
$env:WAF_COOLDOWN_MS = [string]$WafCooldownMs
$env:HIPERCOR_CHECKPOINT = $checkpoint
$env:MIN_PRODUCTS = '10000'

if ($Publish) {
  if (-not (Test-Path $envFile)) { throw "No existe $envFile" }
  $vars = @{}
  foreach ($line in Get-Content $envFile) {
    $text = $line.Trim()
    if ($text -eq '' -or $text.StartsWith('#')) { continue }
    $separator = $text.IndexOf('=')
    if ($separator -lt 1) { continue }
    $vars[$text.Substring(0, $separator).Trim()] = $text.Substring($separator + 1).Trim().Trim('"')
  }

  $url = $vars['SUPABASE_URL']
  if (-not $url) { $url = $vars['EXPO_PUBLIC_SUPABASE_URL'] }
  $role = $vars['SUPABASE_SERVICE_ROLE']
  if (-not $url) { throw 'Falta SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL en .env.local' }
  if (-not $role) { throw 'Falta SUPABASE_SERVICE_ROLE en .env.local' }
  $env:SUPABASE_URL = $url
  $env:SUPABASE_SERVICE_ROLE = $role
}

Set-Location $repo
"=== Hipercor sync $(Get-Date -Format 'u') · publish=$Publish · resume=$Resume ===" | Tee-Object -FilePath $log
# cmd.exe mezcla stdout/stderr antes de entregarlos a Windows PowerShell 5.1;
# así un console.warn de Node no se convierte en NativeCommandError.
& cmd.exe /d /c 'node scripts/sync-hipercor.mjs 2>&1' | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
"=== fin (exit $code) $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $log -Append

Get-ChildItem $logDir -Filter 'hipercor-sync-*.log' |
  Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
