#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$SupabaseUrl = "https://mzgrifkunevgestihlmh.supabase.co",
  [string]$SupabaseAnonKey = "",
  [string]$AgentToken = "",
  [string]$CredentialsFile = "",
  [string]$InstallDir = "C:\ProgramData\OrionTrackingAgent"
)

$ErrorActionPreference = "Stop"
$TaskName = "Orion DHL Tracking Agent"

function Write-Step([string]$Message) {
  Write-Host "`n[Orion] $Message" -ForegroundColor Cyan
}

function Install-NodeIfMissing {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) {
    return $node.Source
  }

  Write-Step "Node.js no está instalado. Descargando Node.js 22 LTS..."
  $index = Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v22.x/"
  $msiName = [regex]::Match($index.Content, 'href="(node-v22\.[0-9.]+-x64\.msi)"').Groups[1].Value
  if (-not $msiName) {
    throw "No se pudo localizar el instalador oficial de Node.js 22."
  }

  $msiPath = Join-Path $env:TEMP $msiName
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v22.x/$msiName" -OutFile $msiPath
  $process = Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Node.js no pudo instalarse. Código MSI: $($process.ExitCode)."
  }

  $nodePath = "C:\Program Files\nodejs\node.exe"
  if (-not (Test-Path $nodePath)) {
    throw "Node.js terminó de instalarse, pero no se encontró node.exe."
  }
  return $nodePath
}

function Confirm-BrowserAvailable {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )

  $browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $browser) {
    throw "No se encontró Google Chrome ni Microsoft Edge. Instala uno de los dos y vuelve a ejecutar este instalador."
  }
  return $browser
}

if (-not $CredentialsFile) {
  $CredentialsFile = Join-Path $PSScriptRoot "agent-credentials.json"
}
if (Test-Path $CredentialsFile) {
  $bundledCredentials = Get-Content -LiteralPath $CredentialsFile -Raw | ConvertFrom-Json
  if (-not $SupabaseUrl -and $bundledCredentials.supabaseUrl) {
    $SupabaseUrl = [string]$bundledCredentials.supabaseUrl
  }
  if (-not $SupabaseAnonKey -and $bundledCredentials.supabaseAnonKey) {
    $SupabaseAnonKey = [string]$bundledCredentials.supabaseAnonKey
  }
  if (-not $AgentToken -and $bundledCredentials.agentToken) {
    $AgentToken = [string]$bundledCredentials.agentToken
  }
}

if (-not $SupabaseAnonKey) {
  $SupabaseAnonKey = Read-Host "Pega la publishable/anon key de Supabase"
}
if (-not $AgentToken) {
  $secureToken = Read-Host "Pega TRACKING_AGENT_TOKEN" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $AgentToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

if (-not $SupabaseUrl -or -not $SupabaseAnonKey -or -not $AgentToken) {
  throw "SupabaseUrl, SupabaseAnonKey y AgentToken son obligatorios."
}

$nodePath = Install-NodeIfMissing
$browserPath = Confirm-BrowserAvailable
Write-Step "Navegador detectado: $browserPath"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Write-Step "Instalando archivos en $InstallDir..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Get-ChildItem -LiteralPath $PSScriptRoot -Force |
  Where-Object { $_.Name -notin @("node_modules", "data", "config.json", "agent-credentials.json") } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $InstallDir -Recurse -Force }

$config = [ordered]@{
  supabaseUrl = $SupabaseUrl.TrimEnd('/')
  supabaseAnonKey = $SupabaseAnonKey.Trim()
  agentToken = $AgentToken.Trim()
  pollSeconds = 15
  batchSize = 5
  browserExecutablePath = $browserPath
  browserDebugPort = 9223
}
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallDir "config.json") -Encoding UTF8
New-Item -ItemType Directory -Path (Join-Path $InstallDir "data") -Force | Out-Null

Write-Step "Instalando dependencias del agente..."
$npmPath = Join-Path (Split-Path $nodePath) "npm.cmd"
$npm = Start-Process $npmPath -ArgumentList "ci --omit=dev --no-audit --no-fund" -WorkingDirectory $InstallDir -Wait -PassThru -NoNewWindow
if ($npm.ExitCode -ne 0) {
  throw "No se pudieron instalar las dependencias del agente."
}

# Solo SYSTEM y administradores pueden leer la credencial local.
& icacls.exe $InstallDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /T /C | Out-Null

Write-Step "Registrando inicio automático para la sesión interactiva actual..."
$launcher = Join-Path $InstallDir "run-agent.ps1"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn -User $currentUser)
)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 4
$task = Get-ScheduledTask -TaskName $TaskName
Write-Host "`nInstalación completa." -ForegroundColor Green
Write-Host "Tarea: $TaskName"
Write-Host "Usuario interactivo: $currentUser"
Write-Host "Estado: $($task.State)"
Write-Host "Log: $InstallDir\data\agent.log"
Write-Host "Usa status.ps1 para revisar el estado y uninstall.ps1 para retirarlo."

if (Test-Path $CredentialsFile) {
  Remove-Item -LiteralPath $CredentialsFile -Force -ErrorAction SilentlyContinue
}
