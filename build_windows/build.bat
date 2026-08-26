@echo off
REM Builds FocusTracker.exe from source. Run this from the project
REM root (the folder containing requirements.txt), with your venv
REM activated - same one you use for normal development.
REM
REM Output: build_windows\dist\FocusTracker.exe

echo Installing PyInstaller...
pip install pyinstaller

echo.
echo Building FocusTracker.exe...
pyinstaller build_windows\focus_tracker.spec --distpath build_windows\dist --workpath build_windows\build --noconfirm

echo.
if exist "build_windows\dist\FocusTracker.exe" (
    echo Build succeeded: build_windows\dist\FocusTracker.exe
    echo.
    echo Try running it directly to test before making an installer.
) else (
    echo Build may have failed - check the output above for errors.
)
