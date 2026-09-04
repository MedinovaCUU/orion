#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$SupabaseUrl = "https://mzgrifkunevgestihlmh.supabase.co",
  [string]$SupabaseAnonKey = "",
  [string]$AgentToken = "",
  [string]$CredentialsFile = "",
  [string]$InstallDir = "$env:ProgramFiles\OrionTrackingAgent",
  [string]$DataDir = "$env:ProgramData\OrionTrackingAgentData"
)

$ErrorActionPreference = "Stop"
$TaskName = "Orion DHL Tracking Agent"
$StartupShortcutName = "Orion DHL Tracking Agent.lnk"

function Write-Step([string]$Message) {
  Write-Host "`n[Orion] $Message" -ForegroundColor Cyan
}

function Remove-OrionDirectory([string]$Path) {
  if (-not (Test-Path $Path)) {
    return
  }

  # Usa SIDs independientes del idioma; no usa TAKEOWN /D, que cambia entre Y y S.
  & icacls.exe $Path /setowner '*S-1-5-32-544' /T /C /Q | Out-Null
  & icacls.exe $Path /grant:r '*S-1-5-32-544:(OI)(CI)F' /T /C /Q | Out-Null
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
}

function Test-NodeExecutable([string]$Path) {
  if (-not $Path -or -not (Test-Path $Path)) {
    return $false
  }

  try {
    $process = Start-Process -FilePath $Path -ArgumentList "--version" -Wait -PassThru -NoNewWindow -ErrorAction Stop
    return $process.ExitCode -eq 0
  } catch {
    return $false
  }
}

function Find-InstalledNode {
  $candidates = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe"
  )
  $pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($pathNode) {
    $candidates += $pathNode.Source
  }

  return $candidates |
    Where-Object { $_ -and (Test-NodeExecutable $_) } |
    Select-Object -First 1
}

function Require-InstalledNode {
  $installedNode = Find-InstalledNode
  if ($installedNode) {
    Write-Step "Usando Node.js instalado en $installedNode"
    return $installedNode
  }

  throw "Node.js 22 x64 no esta instalado o Windows impide ejecutarlo. Instala https://nodejs.org/dist/v22.23.2/node-v22.23.2-x64.msi y vuelve a ejecutar INSTALAR-ORION.cmd."
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
    throw "No se encontro Google Chrome ni Microsoft Edge. Instala uno de los dos y vuelve a ejecutar este instalador."
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

$nodePath = Require-InstalledNode
$browserPath = Confirm-BrowserAvailable
Write-Step "Navegador detectado: $browserPath"

$currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$currentUser = $currentIdentity.Name
$currentUserSid = $currentIdentity.User.Value
$startupPath = [Environment]::GetFolderPath("Startup")
$startupShortcut = Join-Path $startupPath $StartupShortcutName

Write-Step "Preparando una instalacion limpia..."
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
if (Test-Path $startupShortcut) {
  Remove-Item -LiteralPath $startupShortcut -Force
}

# Detiene solamente procesos Node iniciados desde una instalacion anterior del agente.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*OrionTrackingAgent*src*main.mjs*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -in @('chrome.exe', 'msedge.exe') -and
    $_.CommandLine -and
    $_.CommandLine -like "*OrionTrackingAgent*chrome-profile*"
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Remove-OrionDirectory $InstallDir
$legacyInstallDir = Join-Path $env:ProgramData "OrionTrackingAgent"
if (Test-Path $legacyInstallDir) {
  Write-Host "Se detecto una instalacion antigua bloqueada en $legacyInstallDir." -ForegroundColor Yellow
  Write-Host "Se dejara intacta; el agente nuevo utilizara rutas independientes." -ForegroundColor Yellow
}

Write-Step "Instalando archivos en $InstallDir..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Get-ChildItem -LiteralPath $PSScriptRoot -Force |
  Where-Object { $_.Name -notin @("data", "config.json", "agent-credentials.json") } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $InstallDir -Recurse -Force }

# Explorer propaga la marca de descarga del ZIP; se retira después de copiar a Program Files.
Get-ChildItem -LiteralPath $InstallDir -Recurse -File -Force -ErrorAction SilentlyContinue |
  Unblock-File -ErrorAction SilentlyContinue

$installedPortableNode = Join-Path $InstallDir "runtime\node\node.exe"
if (Test-Path $installedPortableNode) {
  $nodePath = $installedPortableNode
}

$config = [ordered]@{
  supabaseUrl = $SupabaseUrl.TrimEnd('/')
  supabaseAnonKey = $SupabaseAnonKey.Trim()
  agentToken = $AgentToken.Trim()
  pollSeconds = 15
  batchSize = 5
  browserExecutablePath = $browserPath
  browserDebugPort = 9223
}
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
$configPath = Join-Path $DataDir "config.json"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), $utf8WithoutBom)
$agentDataDir = Join-Path $DataDir "data"
New-Item -ItemType Directory -Path $agentDataDir -Force | Out-Null

Write-Step "Instalando dependencias del agente..."
$playwrightPackage = Join-Path $InstallDir "node_modules\playwright-core\package.json"
if (Test-Path $playwrightPackage) {
  Write-Host "Dependencias incluidas en el paquete; no se requiere descarga." -ForegroundColor Green
} else {
  $npmPath = Join-Path (Split-Path $nodePath) "npm.cmd"
  $npm = Start-Process $npmPath -ArgumentList "ci --omit=dev --no-audit --no-fund" -WorkingDirectory $InstallDir -Wait -PassThru -NoNewWindow
  if ($npm.ExitCode -ne 0) {
    throw "No se pudieron instalar las dependencias del agente."
  }
}

# Los binarios quedan en Program Files; datos, perfil de Chrome y logs quedan en ProgramData.
$currentUserReadGrant = "*$currentUserSid`:(OI)(CI)RX"
$currentUserFullGrant = "*$currentUserSid`:(OI)(CI)F"
& icacls.exe $InstallDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' $currentUserReadGrant /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Windows no pudo asignar permisos al directorio del agente."
}
& icacls.exe $DataDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' $currentUserFullGrant /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Windows no pudo asignar permisos al directorio de datos del agente."
}

Write-Step "Validando Node.js instalado..."
$nodeVersionPath = Join-Path $agentDataDir "node-version.txt"
$nodeVersionProcess = Start-Process -FilePath $nodePath -ArgumentList "--version" -WorkingDirectory $InstallDir -Wait -PassThru -NoNewWindow -RedirectStandardOutput $nodeVersionPath
if ($nodeVersionProcess.ExitCode -ne 0) {
  throw "Windows no permitio ejecutar Node.js desde Program Files."
}

Write-Step "Ejecutando autodiagnostico del agente..."
$env:ORION_TRACKING_AGENT_CONFIG = $configPath
$env:ORION_TRACKING_AGENT_DATA = $agentDataDir
$selfTestLogPath = Join-Path $agentDataDir "self-test.log"
& $nodePath (Join-Path $InstallDir "src\main.mjs") --self-test *>&1 |
  Out-File -LiteralPath $selfTestLogPath -Encoding utf8
if ($LASTEXITCODE -ne 0) {
  $selfTestDetails = (Get-Content -LiteralPath $selfTestLogPath -Tail 20 -ErrorAction SilentlyContinue) -join " | "
  throw "El autodiagnostico del agente fallo. $selfTestDetails"
}

if (-not ((Get-Content -LiteralPath $selfTestLogPath -Raw) -match "Autodiagnostico completado")) {
  throw "Node.js inicio, pero no completo la prueba de conexion con Supabase. Revisa $selfTestLogPath."
}
$agentLogPath = Join-Path $agentDataDir "agent.log"
$startCountBeforeLaunch = @(
  Select-String -LiteralPath $agentLogPath -Pattern "Orion Tracking Agent 1.0.8 iniciado" -ErrorAction SilentlyContinue
).Count

Write-Step "Registrando inicio automatico para la sesion interactiva actual..."
$launcher = Join-Path $InstallDir "run-agent.ps1"
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcut = $shortcutShell.CreateShortcut($startupShortcut)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
$shortcut.WorkingDirectory = $InstallDir
$shortcut.WindowStyle = 7
$shortcut.Save()

Start-Process powershell.exe -WindowStyle Hidden -ArgumentList $shortcut.Arguments

$agentProcess = $null
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Seconds 1
  $agentProcess = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*OrionTrackingAgent*src*main.mjs*" } |
    Select-Object -First 1
  if ($agentProcess) {
    break
  }
}

if (-not (Test-Path $startupShortcut)) {
  throw "No quedo registrado el acceso de inicio automatico."
}
if (-not $agentProcess) {
  $agentDetails = (Get-Content -LiteralPath $agentLogPath -Tail 20 -ErrorAction SilentlyContinue) -join " | "
  throw "El autodiagnostico fue correcto, pero Windows no mantuvo node.exe activo. $agentDetails"
}

$agentLog = Get-Content -LiteralPath $agentLogPath -Tail 30 -ErrorAction SilentlyContinue
$startCountAfterLaunch = @(
  Select-String -LiteralPath $agentLogPath -Pattern "Orion Tracking Agent 1.0.8 iniciado" -ErrorAction SilentlyContinue
).Count
if ($startCountAfterLaunch -le $startCountBeforeLaunch) {
  throw "node.exe esta activo, pero el log no confirma la version 1.0.8. Revisa $agentLogPath."
}

Write-Host "`nInstalacion completa." -ForegroundColor Green
Write-Host "Usuario interactivo: $currentUser"
Write-Host "Inicio automatico: Carpeta Inicio"
Write-Host "Estado: Running"
Write-Host "Proceso node.exe: $($agentProcess.ProcessId)"
Write-Host "Log: $agentLogPath"
Write-Host "Usa status.ps1 para revisar el estado y uninstall.ps1 para retirarlo."

if (Test-Path $CredentialsFile) {
  Remove-Item -LiteralPath $CredentialsFile -Force -ErrorAction SilentlyContinue
}
