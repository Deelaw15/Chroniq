# Building Chroniq for macOS

This must run **on a Mac** - PyInstaller bundles native binaries and
can't cross-compile. It builds for whatever architecture your Python
is (arm64 on Apple Silicon, x86_64 on Intel).

## How the Mac build differs from Windows

| | Windows | macOS |
|---|---|---|
| Entry point | `build_windows/app_launcher.py` (opens Edge in app mode) | `desktop.py` (pywebview / WKWebView window) |
| Active window | `pywin32` | `pyobjc` - `NSWorkspace` + `Quartz` (`tracker/_capture_macos.py`) |
| Idle detection | `GetLastInputInfo` | `CGEventSourceSecondsSinceLastEventType` (`tracker/_idle_macos.py`) |
| Data dir | `%APPDATA%\Chroniq` | `~/Library/Application Support/Chroniq` |
| Output | `Chroniq.exe` + Inno Setup installer | `Chroniq.app` + DMG |
| Gatekeeper | SmartScreen warning (click-through) | hard block unless signed **and** notarized |

`tracker/window_capture.py` and `tracker/idle_detector.py` are thin
dispatchers that import the right backend for the current OS, so
`daemon.py` is unchanged.

## One-time setup

```bash
git clone <repo> && cd Chroniq
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt        # pulls pyobjc on macOS via markers
python desktop.py                      # confirm it runs from source FIRST
```

If `python desktop.py` doesn't work, the bundle won't either - fix
that first. On first launch macOS may ask for **Screen Recording**
permission; see "Permissions" below.

## Build the .app

```bash
source .venv/bin/activate
build_macos/build.sh
```

Produces `build_macos/dist/Chroniq.app`. Test it:

```bash
open build_macos/dist/Chroniq.app
```

A window should open to the dashboard within a couple of seconds. Let
it run, switch between some apps, and check the top bar: the **"●
Tracking"** chip should be green and the **"Focus time today"** clock
should tick up every second. Logs go to
`~/Library/Application Support/Chroniq/logs/tracker.log`.

**First-build gotcha:** if it crashes with `ModuleNotFoundError`, add
the module to `hiddenimports` in `chroniq.spec` and rebuild. pyobjc
submodules and uvicorn's dynamic imports are the usual suspects.

## Permissions

- **App name only** (e.g. "Safari", "Code") - no permission needed.
  The tracker works out of the box at this level.
- **Window titles** - needs **Screen Recording** permission (System
  Settings → Privacy & Security → Screen Recording → enable Chroniq,
  then relaunch). Until granted, titles are simply blank; nothing
  breaks. This is a macOS rule for *any* app that reads other windows'
  titles - it is not Chroniq capturing your screen.

The permission prompt only behaves correctly for a **signed** app with
a stable bundle id (`com.chroniq.app`) - another reason to sign even
for personal use.

## Icon

`build.sh` runs `make_icns.sh`, which builds `Chroniq.icns` from
`frontend/logo.png`. That file is only 256×256, so the large icon
slices are upscaled and soft. For a crisp icon, drop a 1024×1024 PNG
at `build_macos/icon_src.png` and rebuild.

## Signing & notarization (required for distribution)

An unsigned `.app` downloaded from anywhere gets quarantined and
macOS refuses to open it ("Chroniq is damaged and can't be opened").
This is not a click-through like Windows SmartScreen.

**For yourself / a copy from another Mac**, strip the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/Chroniq.app
```

**For real distribution**, you need an Apple Developer account
($99/yr), then:

```bash
# one-time: store notarytool credentials in the keychain
xcrun notarytool store-credentials chroniq-notary \
  --apple-id "you@example.com" --team-id "YOURTEAMID" \
  --password "app-specific-password"

export DEV_ID="Developer ID Application: Your Name (YOURTEAMID)"
build_macos/build.sh
build_macos/sign_and_notarize.sh
```

`sign_and_notarize.sh` signs with the hardened runtime + entitlements
(`entitlements.plist`), builds the DMG, uploads it to Apple for
notarization, and staples the ticket. The result is
`build_macos/dist/Chroniq.dmg`, which opens cleanly on any Mac.

## DMG only (unsigned, for a quick internal share)

```bash
build_macos/build.sh
build_macos/make_dmg.sh          # -> build_macos/dist/Chroniq.dmg
```

Recipients still need the `xattr -dr com.apple.quarantine` step.

## Where data lives

`~/Library/Application Support/Chroniq/`
- `data/tracker.db` - your tracked activity (survives reinstalls)
- `data/tracker_status.json` - disposable tracker heartbeat
- `logs/tracker.log`

Deleting the `.app` does **not** touch this folder.

## Universal (arm64 + x86_64) builds

`build.sh` builds for the arch of your Python. For a universal binary,
install a `universal2` Python build (e.g. from python.org), recreate
the venv with it, set `target_arch="universal2"` in `chroniq.spec`,
and rebuild. Otherwise ship two DMGs, or build each on its own machine
/ CI runner.

## Build outputs are not committed

`build_macos/build/`, `build_macos/dist/`, and `build_macos/Chroniq.icns`
are git-ignored - regenerated by `build.sh`. Only the scripts, spec,
and `entitlements.plist` are tracked.
