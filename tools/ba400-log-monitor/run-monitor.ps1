$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptDir 'config.local.json'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js no esta instalado o no esta en PATH.'
}

if (-not (Test-Path $configPath)) {
  throw "No existe $configPath. Copia config.windows.example.json a config.local.json y ajusta la configuracion."
}

& node (Join-Path $scriptDir 'monitor.mjs') --config $configPath
