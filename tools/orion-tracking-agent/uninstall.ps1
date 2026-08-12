#Requires -RunAsAdministrator
[CmdletBinding()]
param([string]$InstallDir = "C:\ProgramData\OrionTrackingAgent")

$TaskName = "Orion DHL Tracking Agent"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Write-Host "La tarea automática fue eliminada."
Write-Host "Los archivos y logs permanecen en $InstallDir para recuperación manual."
