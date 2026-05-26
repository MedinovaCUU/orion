$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptDir 'config.windows.nacional.json'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js no esta instalado o no esta en PATH.'
}

if (-not (Test-Path $configPath)) {
  throw "No existe $configPath."
}

& node (Join-Path $scriptDir 'monitor.mjs') --config $configPath
