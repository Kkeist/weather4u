@echo off
chcp 65001 >nul
title Weather-News
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Please install Node.js then run again.
  pause
  exit /b
)
echo Starting... the browser will open automatically in a few seconds.
rem Free port 8787: stop any old server still running so this launch always uses the latest code.
rem Only the process listening on 8787 (our own node server) is stopped; nothing else is touched.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>nul
start "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:8787'"
node server.js
echo.
echo Stopped. Press any key to close this window.
pause >nul
