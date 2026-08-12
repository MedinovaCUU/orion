$ErrorActionPreference = "Continue"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:ORION_TRACKING_AGENT_CONFIG = Join-Path $env:ProgramData "OrionTrackingAgent\config.json"
$env:ORION_TRACKING_AGENT_DATA = Join-Path $env:ProgramData "OrionTrackingAgent\data"
$NodePath = Join-Path $AgentDir "runtime\node\node.exe"
if (-not (Test-Path $NodePath)) {
  $NodePath = "C:\Program Files\nodejs\node.exe"
}
if (-not (Test-Path $NodePath)) {
  $NodePath = (Get-Command node.exe -ErrorAction Stop).Source
}

Set-Location $AgentDir
while ($true) {
  & $NodePath (Join-Path $AgentDir "src\main.mjs")
  Start-Sleep -Seconds 15
}
