$ErrorActionPreference = "Stop"

$taskName = "AX00 Equipment Monitor"

function Test-IsAdministrator {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Elevated {
  if (Test-IsAdministrator) {
    return
  }

  $powerShellPath = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`""
  )

  Start-Process -FilePath $powerShellPath -Verb RunAs -ArgumentList $arguments | Out-Null
  exit
}

function Register-WithScheduledTasksModule {
  param(
    [string]$PowerShellPath,
    [string]$DaemonScriptPath
  )

  $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$DaemonScriptPath`""
  $action = New-ScheduledTaskAction -Execute $PowerShellPath -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
  $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

  Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
}

function Register-WithSchTasks {
  param(
    [string]$PowerShellPath,
    [string]$DaemonScriptPath
  )

  $taskCommand = "`"$PowerShellPath`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$DaemonScriptPath`""
  schtasks.exe /Create /TN $taskName /SC ONSTART /RU SYSTEM /RL HIGHEST /TR $taskCommand /F | Out-Null
}

Ensure-Elevated

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$daemonScript = Join-Path $scriptDir "run-full-monitor-daemon.ps1"
$powerShellPath = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"

if (-not (Test-Path -LiteralPath $daemonScript)) {
  throw "No existe el archivo $daemonScript"
}

if (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue) {
  Register-WithScheduledTasksModule -PowerShellPath $powerShellPath -DaemonScriptPath $daemonScript
} else {
  Register-WithSchTasks -PowerShellPath $powerShellPath -DaemonScriptPath $daemonScript
}

try {
  if (Get-Command Start-ScheduledTask -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName $taskName
  } else {
    schtasks.exe /Run /TN $taskName | Out-Null
  }
} catch {
  Write-Host "La tarea se registro, pero no se pudo arrancar inmediatamente. Iniciara en el siguiente reinicio."
}

Write-Host "La tarea '$taskName' quedo registrada para ejecutarse automaticamente al iniciar Windows."
Write-Host "Para quitarla, ejecuta uninstall-autostart.cmd como administrador."
