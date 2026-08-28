@echo off
REM Builds Chroniq.exe from source. Run this from the project root
REM (the folder containing requirements.txt), with your venv activated -
REM the same one you use for normal development.
REM
REM Output: build_windows\dist\Chroniq.exe

echo Installing PyInstaller...
pip install pyinstaller

echo.
echo Building Chroniq.exe...
pyinstaller build_windows\chroniq.spec --distpath build_windows\dist --workpath build_windows\build --noconfirm

echo.
if exist "build_windows\dist\Chroniq.exe" (
    echo Build succeeded: build_windows\dist\Chroniq.exe
    echo.
    echo Try running it directly to test before making an installer.
) else (
    echo Build may have failed - check the output above for errors.
)
