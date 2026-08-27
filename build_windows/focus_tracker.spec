# PyInstaller spec file - run this ON WINDOWS with:
#   pyinstaller build_windows/focus_tracker.spec
#
# This cannot be run from Linux/Mac - PyInstaller bundles
# platform-native binaries, so the build must happen on the same OS
# you're targeting. See build_windows/README.md for full instructions.

import sys
from pathlib import Path

block_cipher = None
project_root = Path(SPECPATH).resolve().parent

a = Analysis(
    ['app_launcher.py'],
    pathex=[str(project_root)],
    binaries=[],
    # frontend/ is bundled as a read-only asset, unpacked at runtime
    # via sys._MEIPASS - see resource_path() in backend/main.py.
    # The 'data' and 'logs' folders are deliberately NOT bundled here:
    # those are writable and belong in %APPDATA%\Chroniq instead
    # (see config/settings.py), created fresh on first run.
    datas=[
        (str(project_root / 'frontend'), 'frontend'),
    ],
    hiddenimports=[
        # PyInstaller's static analysis sometimes misses these because
        # they're imported dynamically or via plugin-style mechanisms.
        'win32timezone',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='Chroniq',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # hidden console - safe now that setup_logging()
                    # and uvicorn's log_config avoid writing to a
                    # stdout/stderr that doesn't exist in this mode.
                    # Errors still reach the user via show_startup_error()
                    # (a popup) and always land in the log file at
                    # %APPDATA%\Chroniq\logs\tracker.log regardless.
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(project_root / 'build_windows' / 'app_icon.ico'),
)
