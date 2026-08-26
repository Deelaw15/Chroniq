# Building the Windows Installer

This has to run on an actual Windows machine - PyInstaller bundles
Windows-native binaries and can't cross-compile from another OS.

## One-time setup

1. Make sure your normal dev environment works first (tracker and
   backend both run fine via `python scripts\run_tracker.py` /
   `python scripts\run_backend.py`). If those don't work, the
   packaged build won't either - fix that first.

2. Install [Inno Setup](https://jrsoftware.org/isdl.php) (free) -
   needed for step 2 below, not for the raw .exe build.

## Building

**Step 1 - Build the raw .exe:**

```powershell
.venv\Scripts\activate
build_windows\build.bat
```

This produces `build_windows\dist\FocusTracker.exe`. Run it directly
first to sanity-check it before making an installer:

```powershell
build_windows\dist\FocusTracker.exe
```

It should open a console window, then your browser should open to
the dashboard within a couple seconds. Let it run for a few minutes,
switch between some apps, and confirm activity is being tracked
(check the Today page). Close the console window to stop it.

**Known first-build gotcha:** if it fails with a `ModuleNotFoundError`
for something not already listed in `focus_tracker.spec`'s
`hiddenimports`, add the missing module name there and rebuild.
PyInstaller's static analysis occasionally misses imports that happen
dynamically - this is normal and just needs one extra line per
missing module.

**Step 2 - Build the installer:**

Right-click `build_windows\installer.iss` and choose **Compile**
(or open it in Inno Setup and click Build > Compile).

This produces `build_windows\dist_installer\FocusTracker-Setup.exe` -
this is the file you'd host on a website for people to download.

## Testing the installer

Run `FocusTracker-Setup.exe` on a clean-ish account or a VM if you
have one available, to catch anything that only breaks on a machine
that's never had Python or your dev environment installed - that's
the real test of whether packaging worked, not running it on your
own dev machine where Python's already present.

## What to expect from testers (unsigned build)

Since this isn't code-signed (that requires a paid certificate,
usually not worth it until you have real traction), Windows
SmartScreen will show "Windows protected your PC" the first time
someone runs the installer. This is normal and expected for small-
scale indie/beta distribution - testers need to click **"More info"**
then **"Run anyway"**. Worth telling them this upfront so it doesn't
look broken or suspicious.

## Distributing to testers

The `FocusTracker-Setup.exe` file is what you'd upload somewhere and
link to from a simple download page - a single static HTML page with
a download button is enough for a small test group; you don't need
anything fancier than that until you're ready for a wider release.

## Updating your data path expectations

Once packaged, tracked data lives in `%APPDATA%\FocusTracker\data\
tracker.db` - NOT in the project folder like during development. This
is intentional (see the comment in `config/settings.py`) so that data
survives reinstalls and doesn't get wiped by PyInstaller's temp
extraction folder.
