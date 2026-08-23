@echo off
REM Double-click this file to start everything at once:
REM   - the tracker daemon (logging your activity)
REM   - the backend API (serving the dashboard)
REM   - opens the dashboard in your default browser
REM
REM Each process opens in its own window so you can see the logs.
REM Close those windows (or Ctrl+C inside them) to stop tracking.

cd /d %~dp0

echo Starting tracker...
start "Focus Tracker - Daemon" cmd /k ".venv\Scripts\activate && python scripts\run_tracker.py"

echo Starting backend...
start "Focus Tracker - Backend" cmd /k ".venv\Scripts\activate && python scripts\run_backend.py"

echo Waiting for backend to come up...
timeout /t 4 /nobreak >nul

echo Opening dashboard...
start http://127.0.0.1:8000/dashboard/

echo.
echo Both processes are running in their own windows.
echo Close this window any time - it's not doing anything further.
