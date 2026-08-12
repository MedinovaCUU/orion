[CmdletBinding()]
param([string]$InstallDir = "$env:ProgramFiles\OrionTrackingAgent")

$env:ORION_TRACKING_AGENT_CONFIG = Join-Path $env:ProgramData "OrionTrackingAgent\config.json"
$env:ORION_TRACKING_AGENT_DATA = Join-Path $env:ProgramData "OrionTrackingAgent\data"

$nodePath = Join-Path $InstallDir "runtime\node\node.exe"
if (-not (Test-Path $nodePath)) {
  $nodePath = "C:\Program Files\nodejs\node.exe"
}
if (-not (Test-Path $nodePath)) {
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
}

Set-Location $InstallDir
& $nodePath (Join-Path $InstallDir "src\main.mjs") --once
