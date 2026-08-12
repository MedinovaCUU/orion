$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$logPath = Join-Path $env:ProgramData "OrionTrackingAgent-install.log"
$exitCode = 0

try {
  Start-Transcript -Path $logPath -Append | Out-Null
  & (Join-Path $PSScriptRoot "install.ps1")
} catch {
  $exitCode = 1
  Write-Host "`nLa instalacion no termino." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "`nDiagnostico guardado en: $logPath" -ForegroundColor Yellow
} finally {
  try {
    Stop-Transcript | Out-Null
  } catch {
    # El transcript puede no haber iniciado si Windows rechazo el acceso antes.
  }

  if ($exitCode -eq 0) {
    Write-Host "`nEl agente quedo instalado. Puedes cerrar esta ventana." -ForegroundColor Green
  } else {
    Write-Host "`nNo cierres esta ventana sin anotar o fotografiar el mensaje rojo." -ForegroundColor Yellow
  }
  Read-Host "Presiona Enter para cerrar"
}

exit $exitCode
