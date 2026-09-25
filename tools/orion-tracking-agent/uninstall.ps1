#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$InstallDir = "$env:ProgramFiles\OrionTrackingAgent",
  [string]$DataDir = "$env:ProgramData\OrionTrackingAgentData"
)

$TaskName = "Orion DHL Tracking Agent"
$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Orion DHL Tracking Agent.lnk"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
if (Test-Path $startupShortcut) {
  Remove-Item -LiteralPath $startupShortcut -Force
}

Write-Host "El inicio automatico fue eliminado."
Write-Host "Los binarios permanecen en $InstallDir."
Write-Host "La configuracion y logs permanecen en $DataDir para recuperacion manual."
