@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CONFIG_PATH=%SCRIPT_DIR%config.windows.834001902.json"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado o no esta en PATH.
  exit /b 1
)

if not exist "%CONFIG_PATH%" (
  echo No existe "%CONFIG_PATH%".
  exit /b 1
)

node "%SCRIPT_DIR%monitor.mjs" --config "%CONFIG_PATH%"
