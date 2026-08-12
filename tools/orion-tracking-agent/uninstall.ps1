#Requires -RunAsAdministrator
[CmdletBinding()]
param([string]$InstallDir = "C:\ProgramData\OrionTrackingAgent")

$TaskName = "Orion DHL Tracking Agent"
$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Orion DHL Tracking Agent.lnk"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
if (Test-Path $startupShortcut) {
  Remove-Item -LiteralPath $startupShortcut -Force
}

Write-Host "El inicio automático fue eliminado."
Write-Host "Los archivos y logs permanecen en $InstallDir para recuperación manual."
