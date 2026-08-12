[CmdletBinding()]
param(
  [string]$InstallDir = "$env:ProgramFiles\OrionTrackingAgent",
  [string]$DataDir = "$env:ProgramData\OrionTrackingAgentData"
)

$TaskName = "Orion DHL Tracking Agent"
$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Orion DHL Tracking Agent.lnk"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$logPath = Join-Path $DataDir "data\agent.log"
$agentProcess = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*OrionTrackingAgent*src*main.mjs*" } |
  Select-Object -First 1

if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Agente instalado mediante tarea programada." -ForegroundColor Green
  Write-Host "Tarea: $TaskName"
  Write-Host "Estado: $($task.State)"
  Write-Host "Ultimo inicio: $($info.LastRunTime)"
  Write-Host "Ultimo resultado: $($info.LastTaskResult)"
} elseif (Test-Path $startupShortcut) {
  Write-Host "Agente instalado mediante la carpeta Inicio." -ForegroundColor Green
  Write-Host "Acceso de inicio: $startupShortcut"
} else {
  Write-Host "El agente no esta instalado o la instalacion quedo incompleta." -ForegroundColor Yellow
  $installLog = Join-Path $env:ProgramData "OrionTrackingAgent-install.log"
  if (Test-Path $installLog) {
    Write-Host "`nUltimo diagnostico de instalacion:"
    Get-Content -LiteralPath $installLog -Tail 35
  } else {
    Write-Host "No existe todavia un diagnostico de instalacion."
  }
  exit 1
}

if ($agentProcess) {
  Write-Host "Estado: Running" -ForegroundColor Green
  Write-Host "Proceso node.exe: $($agentProcess.ProcessId)"
} else {
  Write-Host "Estado: Detenido" -ForegroundColor Red
}

if (Test-Path $logPath) {
  Write-Host "`nUltimos eventos:"
  Get-Content -LiteralPath $logPath -Tail 25
} else {
  Write-Host "`nNo existe el log del agente; el proceso todavia no ha iniciado correctamente." -ForegroundColor Red
}
