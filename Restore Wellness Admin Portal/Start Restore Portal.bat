@echo off
rem Starts the portal on this computer. Keep this window open while using it; close it to stop.
cd /d "%~dp0"
start "" "http://localhost:8765/"
python server.py
if errorlevel 1 (
  echo.
  echo Python was not found, or the portal is already open in another window.
  pause
)
