# Building the Windows Installer

This has to run on an actual Windows machine - PyInstaller bundles
Windows-native binaries and can't cross-compile from another OS.

## One-time setup

1. Make sure your normal dev environment works first (tracker and
   backend both run fine via `python scripts\run_tracker.py` /
   `python scripts\run_backend.py`, or `python desktop.py`). If those
   don't work, the packaged build won't either - fix that first.

2. Install [Inno Setup](https://jrsoftware.org/isdl.php) (free) -
   needed for the installer step below, not for the raw .exe build.

## Building

**Step 1 - Build the raw .exe:**

```powershell
.venv\Scripts\activate
build_windows\build.bat
```

This produces `build_windows\dist\Chroniq.exe`. Run it directly first
to sanity-check it before making an installer:

```powershell
build_windows\dist\Chroniq.exe
```

There is no console window (the build is `--windowed`). Within a couple
of seconds an Edge app window should open to the dashboard. Let it run
for a few minutes and switch between some apps - the top bar shows a
**"● Tracking"** status chip and a **"Focus time today"** clock that
ticks up every second while you're active. If that clock is moving and
the chip is green, tracking works. (If the chip says "Tracker offline",
the background tracker thread didn't start - check the log.)

Any startup failure shows a popup and is always written to
`%APPDATA%\Chroniq\logs\tracker.log`.

To stop it: close the Edge window, then end the `Chroniq.exe` process
from Task Manager (the backend keeps running headless after the window
closes - a tray icon to stop it cleanly is a future nicety).

**Known first-build gotcha:** if it fails with a `ModuleNotFoundError`
for something not already listed in `chroniq.spec`'s `hiddenimports`,
add the missing module name there and rebuild. PyInstaller's static
analysis occasionally misses imports that happen dynamically - this is
normal and just needs one extra line per missing module.

**Step 2 - Build the installer:**

Right-click `build_windows\installer.iss` and choose **Compile**
(or open it in Inno Setup and click Build > Compile).

This produces `build_windows\dist_installer\Chroniq-Setup.exe` - this
is the file you'd host on a website for people to download.

## Testing the installer

Run `Chroniq-Setup.exe` on a clean-ish account or a VM if you have one
available, to catch anything that only breaks on a machine that's
never had Python or your dev environment installed - that's the real
test of whether packaging worked, not running it on your own dev
machine where Python's already present.

## What to expect from testers (unsigned build)

Since this isn't code-signed (that requires a paid certificate,
usually not worth it until you have real traction), Windows
SmartScreen will show "Windows protected your PC" the first time
someone runs the installer. This is normal and expected for small-
scale indie/beta distribution - testers need to click **"More info"**
then **"Run anyway"**. Worth telling them this upfront so it doesn't
look broken or suspicious.

## Distributing to testers

The `Chroniq-Setup.exe` file is what you'd upload somewhere and link
to from a simple download page - a single static HTML page with a
download button is enough for a small test group; you don't need
anything fancier than that until you're ready for a wider release.

## Where data lives once packaged

Tracked data lives in `%APPDATA%\Chroniq\data\tracker.db` - NOT in the
project folder like during development. This is intentional (see the
comment in `config/settings.py`) so that data survives reinstalls and
doesn't get wiped by PyInstaller's temp extraction folder. The
`%APPDATA%\Chroniq` folder also holds `logs\tracker.log` and a
disposable `data\tracker_status.json` heartbeat file.

Uninstalling the app does **not** delete `%APPDATA%\Chroniq` - see the
comment in `installer.iss`.

## Build outputs are not committed

`build_windows\build\`, `build_windows\dist\`, and
`build_windows\dist_installer\` are git-ignored - they're regenerated
by the two steps above. Only the source (`chroniq.spec`, `build.bat`,
`installer.iss`, `app_launcher.py`, `app_icon.ico`) is tracked.
