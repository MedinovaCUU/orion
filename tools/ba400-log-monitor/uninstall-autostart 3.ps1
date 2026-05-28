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

Ensure-Elevated

if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    try {
      Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    } catch {
      # Ignore stop errors on uninstall.
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "La tarea '$taskName' fue eliminada."
  } else {
    Write-Host "La tarea '$taskName' no existia."
  }
} else {
  schtasks.exe /Delete /TN $taskName /F | Out-Null
  Write-Host "La tarea '$taskName' fue eliminada."
}
