@echo off
setlocal
set "INSTALL_SCRIPT=%~dp0install.ps1"

PowerShell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process PowerShell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%INSTALL_SCRIPT%""'"

endlocal
