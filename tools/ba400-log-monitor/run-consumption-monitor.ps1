$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

node (Join-Path $scriptDir "consumption-monitor.mjs") `
  --config (Join-Path $scriptDir "config.windows.consumo.json")
