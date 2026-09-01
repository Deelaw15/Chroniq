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

Use **Python 3.10 or newer** (the codebase uses `X | None` type hints,
which are a syntax error on 3.9). `python3 --version` to check; install
a newer one from python.org or `brew install python@3.12` if needed.

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

## Distributing to other Macs

### Package it as a DMG - never a zip

```bash
build_macos/build.sh
build_macos/make_dmg.sh          # -> build_macos/dist/Chroniq.dmg
```

Ship the **`.dmg`**. Do **not** use Finder's "Compress" or the plain
`zip` command on `Chroniq.app`:

- A plain zip adds a **`__MACOSX/`** folder full of `._*` files. That's
  where macOS stashes each file's resource fork / extended attributes,
  because the ZIP format can't hold them - a DMG (a real HFS+/APFS
  image) stores them natively, so no `__MACOSX`.
- Worse, a plain zip drops the bundle's **symlinks and executable
  bit** and breaks its embedded signature, so the receiving Mac
  reports **"Chroniq is damaged and can't be opened"**.

If you genuinely need a zip (GitHub release asset, `notarytool`
input), use `build_macos/make_zip.sh` - it uses `ditto`, which is
macOS-aware.

### "Chroniq is damaged" / "can't be opened" on another Mac

The app is **not signed with a Developer ID and not notarized**, so
when it arrives on another Mac (AirDrop, USB, download, unzip) it's
quarantined and Gatekeeper blocks it. This is a hard block, not a
click-through like Windows SmartScreen.

Quick unblock for a tester (per machine, after dragging it to
/Applications):

```bash
xattr -dr com.apple.quarantine /Applications/Chroniq.app
```

Or: **System Settings → Privacy & Security →** scroll down **→ "Open
Anyway"** (right-click → Open often no longer works on macOS 14+).

### The permanent fix: sign + notarize

Needs an **Apple Developer account ($99/yr)**. Then it opens by
double-click for everyone, no Terminal, no warnings.

```bash
# one-time: store notarytool credentials in the keychain
xcrun notarytool store-credentials chroniq-notary \
  --apple-id "you@example.com" --team-id "YOURTEAMID" \
  --password "app-specific-password"     # appleid.apple.com > App-Specific Passwords

export DEV_ID="Developer ID Application: Your Name (YOURTEAMID)"
build_macos/build.sh
build_macos/sign_and_notarize.sh
```

`sign_and_notarize.sh` signs every nested binary + the app with the
hardened runtime and `entitlements.plist`, builds the DMG, uploads it
to Apple, waits for notarization, and staples the ticket. The result
is `build_macos/dist/Chroniq.dmg`, which opens cleanly on any Mac.

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

`build_macos/build/`, `build_macos/dist/` (incl. the DMG/zip), and
`build_macos/Chroniq.icns` are git-ignored - regenerated by
`build.sh` / `make_dmg.sh`. `.DS_Store` and `venv/` are ignored too.
Only the scripts, `chroniq.spec`, and `entitlements.plist` are tracked.
