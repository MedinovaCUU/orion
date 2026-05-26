@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "MSI_PATH=%SCRIPT_DIR%node-v24.16.0-x64.msi"

if not exist "%MSI_PATH%" (
  echo No existe "%MSI_PATH%".
  exit /b 1
)

echo Instalando Node.js LTS...
msiexec /i "%MSI_PATH%" /passive /norestart

if errorlevel 1 (
  echo La instalacion de Node.js fallo.
  exit /b 1
)

echo Node.js instalado. Cierra y abre de nuevo la terminal antes de ejecutar el monitor.
