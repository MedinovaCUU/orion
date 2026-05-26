$ErrorActionPreference = "Stop"

function Get-NodeExecutable {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    return $command.Source
  }

  $candidates = @()

  foreach ($basePath in @($env:ProgramFiles, $env:ProgramW6432, ${env:ProgramFiles(x86)})) {
    if ([string]::IsNullOrWhiteSpace($basePath)) {
      continue
    }
    $candidates += (Join-Path $basePath "nodejs\\node.exe")
  }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "No se encontro node.exe. Instala Node.js antes de usar el arranque automatico."
}

function Write-DaemonLog {
  param(
    [string]$Message
  )

  $line = "[{0}] {1}" -f ([DateTime]::UtcNow.ToString("o")), $Message
  Add-Content -LiteralPath $script:DaemonLogPath -Value $line
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$monitorScript = Join-Path $scriptDir "full-monitor.mjs"
$configPath = Join-Path $scriptDir "config.windows.completo.json"
$logDir = Join-Path $scriptDir "logs"
$script:DaemonLogPath = Join-Path $logDir "full-monitor-daemon.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$nodePath = Get-NodeExecutable
Write-DaemonLog "Daemon iniciado con node: $nodePath"
Write-DaemonLog "Script: $monitorScript"
Write-DaemonLog "Config: $configPath"

while ($true) {
  Write-DaemonLog "Iniciando full-monitor"
  & $nodePath $monitorScript --config $configPath *>> $script:DaemonLogPath
  $exitCode = $LASTEXITCODE
  Write-DaemonLog "full-monitor termino con codigo $exitCode. Reinicio en 5 segundos."
  Start-Sleep -Seconds 5
}
