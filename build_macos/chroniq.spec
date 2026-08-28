# PyInstaller spec - run this ON macOS with:
#   pyinstaller build_macos/chroniq.spec
#
# Produces build_macos/dist/Chroniq.app. PyInstaller bundles
# platform-native binaries and cannot cross-compile, so this must run
# on a Mac. See build_macos/README.md for the full walkthrough
# (icon, signing, notarization, DMG).

from pathlib import Path

project_root = Path(SPECPATH).resolve().parent
here = project_root / "build_macos"

icon_path = here / "Chroniq.icns"
entitlements_path = here / "entitlements.plist"

a = Analysis(
    [str(project_root / "desktop.py")],
    pathex=[str(project_root)],
    binaries=[],
    # frontend/ is bundled read-only and unpacked at runtime via
    # sys._MEIPASS (see resource_path() in backend/main.py). data/ and
    # logs/ are NOT bundled - they're writable and live in
    # ~/Library/Application Support/Chroniq (see config/settings.py).
    datas=[
        (str(project_root / "frontend"), "frontend"),
    ],
    hiddenimports=[
        # uvicorn loads these via plugin-style lookup that PyInstaller's
        # static analysis misses.
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # pyobjc frameworks the macOS tracker backend imports
        # (tracker/_capture_macos.py, tracker/_idle_macos.py).
        "AppKit",
        "Quartz",
        # pywebview's Cocoa backend
        "webview.platforms.cocoa",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Chroniq",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    # Set to "universal2" only if you built against a universal2 Python;
    # otherwise leave None to build for the current arch (arm64 or x86_64).
    target_arch=None,
    codesign_identity=None,  # signing is a separate step - see sign_and_notarize.sh
    entitlements_file=str(entitlements_path) if entitlements_path.exists() else None,
    icon=str(icon_path) if icon_path.exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Chroniq",
)

app = BUNDLE(
    coll,
    name="Chroniq.app",
    icon=str(icon_path) if icon_path.exists() else None,
    bundle_identifier="com.chroniq.app",
    version="0.1.0",
    info_plist={
        "CFBundleName": "Chroniq",
        "CFBundleDisplayName": "Chroniq",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundleVersion": "0.1.0",
        "LSMinimumSystemVersion": "11.0",
        "NSHighResolutionCapable": True,
        # Shown in the permission prompt the OS raises when Chroniq first
        # tries to read other apps' window titles. App names alone need
        # no permission; titles need Screen Recording.
        "NSAppleEventsUsageDescription":
            "Chroniq records which application is frontmost so it can show "
            "how you spend your time. It never reads what's on screen.",
        # Chroniq shows a normal window, so it stays a regular Dock app.
        # Set this to True to make it a menu-bar-only background agent.
        # "LSUIElement": True,
    },
)
