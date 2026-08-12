[CmdletBinding()]
param([string]$InstallDir = "C:\ProgramData\OrionTrackingAgent")

$TaskName = "Orion DHL Tracking Agent"
$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Orion DHL Tracking Agent.lnk"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$logPath = Join-Path $InstallDir "data\agent.log"

if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Agente instalado mediante tarea programada." -ForegroundColor Green
  Write-Host "Tarea: $TaskName"
  Write-Host "Estado: $($task.State)"
  Write-Host "Último inicio: $($info.LastRunTime)"
  Write-Host "Último resultado: $($info.LastTaskResult)"
} elseif (Test-Path $startupShortcut) {
  Write-Host "Agente instalado mediante la carpeta Inicio." -ForegroundColor Green
  Write-Host "Acceso de inicio: $startupShortcut"
} else {
  Write-Host "El agente no está instalado o la instalación quedó incompleta." -ForegroundColor Yellow
  $installLog = Join-Path $env:ProgramData "OrionTrackingAgent-install.log"
  if (Test-Path $installLog) {
    Write-Host "`nÚltimo diagnóstico de instalación:"
    Get-Content -LiteralPath $installLog -Tail 35
  } else {
    Write-Host "No existe todavía un diagnóstico de instalación."
  }
  exit 1
}

if (Test-Path $logPath) {
  Write-Host "`nÚltimos eventos:"
  Get-Content -LiteralPath $logPath -Tail 25
} else {
  Write-Host "`nNo existe el log del agente; el proceso todavía no ha iniciado correctamente." -ForegroundColor Red
}
