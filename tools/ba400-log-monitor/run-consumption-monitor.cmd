@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "NODE_EXE="

for %%I in (node.exe) do set "NODE_EXE=%%~$PATH:I"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if defined ProgramW6432 if exist "%ProgramW6432%\nodejs\node.exe" set "NODE_EXE=%ProgramW6432%\nodejs\node.exe"
if not defined NODE_EXE if defined ProgramFiles(x86) if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"

if not defined NODE_EXE (
  echo No se encontro node.exe. Ejecuta install-node-lts.cmd primero.
  exit /b 1
)

"%NODE_EXE%" "%SCRIPT_DIR%consumption-monitor.mjs" --config "%SCRIPT_DIR%config.windows.consumo.json"

endlocal
