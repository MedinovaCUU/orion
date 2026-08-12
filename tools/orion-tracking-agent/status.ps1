[CmdletBinding()]
param([string]$InstallDir = "C:\ProgramData\OrionTrackingAgent")

$TaskName = "Orion DHL Tracking Agent"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "El agente no está instalado." -ForegroundColor Yellow
  exit 1
}

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "Tarea: $TaskName"
Write-Host "Estado: $($task.State)"
Write-Host "Último inicio: $($info.LastRunTime)"
Write-Host "Último resultado: $($info.LastTaskResult)"

$logPath = Join-Path $InstallDir "data\agent.log"
if (Test-Path $logPath) {
  Write-Host "`nÚltimos eventos:"
  Get-Content -LiteralPath $logPath -Tail 25
}
