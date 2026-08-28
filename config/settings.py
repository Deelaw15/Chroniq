"""
Central configuration. Every tunable value lives here so you never
have to hunt through tracker/db code to change behavior.
"""
import os
import shutil
import sys
from pathlib import Path

APP_NAME = "Chroniq"
_OLD_APP_NAME = "FocusTracker"  # pre-rename folder name - see migration below


def _resolve_base_dir() -> Path:
    """
    Where the database and logs live.

    Running normally (python scripts/run_tracker.py, python desktop.py):
    this is the project folder, same as before.

    Running as a packaged app (PyInstaller): sys.frozen is set, and the
    bundle unpacks itself into a TEMPORARY folder that gets deleted when
    the app closes. Writing the database there would silently lose all
    tracked data on every restart - so packaged builds use the standard
    per-user data folder for the OS, which persists across restarts,
    updates, and reinstalls:

        Windows   %APPDATA%\\Chroniq
        macOS     ~/Library/Application Support/Chroniq
        Linux     $XDG_DATA_HOME/Chroniq  (or ~/.local/share/Chroniq)

    One-time Windows migration: this app was previously named "Focus
    Tracker" and stored data in %APPDATA%\\FocusTracker. If that folder
    exists and the new one doesn't yet, its contents are moved over so
    early testers don't lose their tracked history just because of the
    rename - a fresh empty folder from the new name would otherwise
    silently look like "no data yet" instead of migrating it.
    """
    if not getattr(sys, "frozen", False):
        return Path(__file__).resolve().parent.parent

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME

    if sys.platform == "win32":
        appdata = Path(os.environ.get("APPDATA") or str(Path.home()))
        new_dir = appdata / APP_NAME
        old_dir = appdata / _OLD_APP_NAME
        if old_dir.exists() and not new_dir.exists():
            shutil.move(str(old_dir), str(new_dir))
        return new_dir

    # Linux / other
    xdg = os.environ.get("XDG_DATA_HOME")
    root = Path(xdg) if xdg else (Path.home() / ".local" / "share")
    return root / APP_NAME


BASE_DIR = _resolve_base_dir()

# --- Tracker behavior ---
POLL_INTERVAL_SECONDS = 5       # how often we sample the active window
IDLE_THRESHOLD_SECONDS = 120    # no input for this long = idle
MIN_EVENT_DURATION_SECONDS = 2  # discard flicker events shorter than this

# --- Storage ---
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "tracker.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Tracker heartbeat: the daemon rewrites this small JSON file every poll
# so the backend (and, via it, the dashboard's live clock) can tell
# whether the tracker is actually running right now and what it's
# currently timing. It is disposable state, not history.
STATUS_FILE = DATA_DIR / "tracker_status.json"

# --- Logging ---
LOG_DIR = BASE_DIR / "logs"
LOG_FILE = LOG_DIR / "tracker.log"

# Ensure directories exist at import time
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)
