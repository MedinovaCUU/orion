@echo off
setlocal
set "INSTALL_SCRIPT=%~dp0install-interactive.ps1"

PowerShell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$process = Start-Process PowerShell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%INSTALL_SCRIPT%""'; exit $process.ExitCode"

if errorlevel 1 pause
endlocal
