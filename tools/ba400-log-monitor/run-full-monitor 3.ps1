$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

node (Join-Path $scriptDir "full-monitor.mjs") `
  --config (Join-Path $scriptDir "config.windows.completo.json")
