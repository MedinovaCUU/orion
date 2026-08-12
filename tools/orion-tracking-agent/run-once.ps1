[CmdletBinding()]
param([string]$InstallDir = "C:\ProgramData\OrionTrackingAgent")

$nodePath = Join-Path $InstallDir "runtime\node\node.exe"
if (-not (Test-Path $nodePath)) {
  $nodePath = "C:\Program Files\nodejs\node.exe"
}
if (-not (Test-Path $nodePath)) {
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
}

Set-Location $InstallDir
& $nodePath (Join-Path $InstallDir "src\main.mjs") --once
