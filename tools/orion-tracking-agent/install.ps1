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
$StartupShortcutName = "Orion DHL Tracking Agent.lnk"

function Write-Step([string]$Message) {
  Write-Host "`n[Orion] $Message" -ForegroundColor Cyan
}

function Install-NodeIfMissing {
  $bundledNode = Join-Path $PSScriptRoot "runtime\node\node.exe"
  if (Test-Path $bundledNode) {
    Write-Step "Usando Node.js portatil incluido en el paquete."
    return $bundledNode
  }

  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) {
    return $node.Source
  }

  Write-Step "Node.js no esta instalado. Consultando la distribucion oficial LTS..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $releases = Invoke-RestMethod -UseBasicParsing "https://nodejs.org/dist/index.json"
  $release = $releases |
    Where-Object { $_.lts -and $_.files -contains "win-x64-msi" } |
    Select-Object -First 1
  if (-not $release) {
    throw "No se pudo localizar una distribucion LTS de Node.js para Windows x64. Usa el paquete completo de Orion que ya incluye Node.js."
  }

  $msiName = "node-$($release.version)-x64.msi"
  $msiPath = Join-Path $env:TEMP $msiName
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$($release.version)/$msiName" -OutFile $msiPath
  $process = Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) {
    throw "Node.js no pudo instalarse. Codigo MSI: $($process.ExitCode)."
  }

  $nodePath = "C:\Program Files\nodejs\node.exe"
  if (-not (Test-Path $nodePath)) {
    throw "Node.js termino de instalarse, pero no se encontro node.exe."
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

$nodePath = Install-NodeIfMissing
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
Start-Sleep -Seconds 2

if (Test-Path $InstallDir) {
  # Versiones anteriores restringian la ACL antes de completar la instalacion.
  & takeown.exe /F $InstallDir /R /D Y | Out-Null
  & icacls.exe $InstallDir /reset /T /C /Q | Out-Null
  & icacls.exe $InstallDir /grant:r '*S-1-5-32-544:(OI)(CI)F' /T /C /Q | Out-Null
  Remove-Item -LiteralPath $InstallDir -Recurse -Force -ErrorAction Stop
}

Write-Step "Instalando archivos en $InstallDir..."
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Get-ChildItem -LiteralPath $PSScriptRoot -Force |
  Where-Object { $_.Name -notin @("data", "config.json", "agent-credentials.json") } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $InstallDir -Recurse -Force }

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
$configPath = Join-Path $InstallDir "config.json"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), $utf8WithoutBom)
New-Item -ItemType Directory -Path (Join-Path $InstallDir "data") -Force | Out-Null

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

# La cuenta interactiva necesita escribir logs y mantener el perfil exclusivo de Chrome.
$currentUserGrant = "*$currentUserSid`:(OI)(CI)F"
& icacls.exe $InstallDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' $currentUserGrant /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Windows no pudo asignar permisos al directorio del agente."
}

Write-Step "Ejecutando autodiagnostico del agente..."
$selfTestLogPath = Join-Path $InstallDir "data\self-test.log"
& $nodePath (Join-Path $InstallDir "src\main.mjs") --self-test *>&1 |
  Out-File -LiteralPath $selfTestLogPath -Encoding utf8
if ($LASTEXITCODE -ne 0) {
  $selfTestDetails = (Get-Content -LiteralPath $selfTestLogPath -Tail 20 -ErrorAction SilentlyContinue) -join " | "
  throw "El autodiagnostico del agente fallo. $selfTestDetails"
}

if (-not ((Get-Content -LiteralPath $selfTestLogPath -Raw) -match "Autodiagnostico completado")) {
  throw "Node.js inicio, pero no completo la prueba de conexion con Supabase. Revisa $selfTestLogPath."
}
$agentLogPath = Join-Path $InstallDir "data\agent.log"
$startCountBeforeLaunch = @(
  Select-String -LiteralPath $agentLogPath -Pattern "Orion Tracking Agent 1.0.4 iniciado" -ErrorAction SilentlyContinue
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
  Select-String -LiteralPath $agentLogPath -Pattern "Orion Tracking Agent 1.0.4 iniciado" -ErrorAction SilentlyContinue
).Count
if ($startCountAfterLaunch -le $startCountBeforeLaunch) {
  throw "node.exe esta activo, pero el log no confirma la version 1.0.4. Revisa $agentLogPath."
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
