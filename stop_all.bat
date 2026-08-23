@echo off
REM Stops the tracker and backend if you started them with start_all.bat.
REM This closes their windows directly rather than hunting for them manually.

echo Stopping Focus Tracker processes...
taskkill /FI "WindowTitle eq Focus Tracker - Daemon*" /T /F >nul 2>&1
taskkill /FI "WindowTitle eq Focus Tracker - Backend*" /T /F >nul 2>&1
echo Done.
