"""
Central configuration. Every tunable value lives here so you never
have to hunt through tracker/db code to change behavior.
"""
import os
import sys
from pathlib import Path


def _resolve_base_dir() -> Path:
    """
    Where the database and logs live.

    Running normally (python scripts/run_tracker.py): this is the
    project folder, same as before.

    Running as a packaged .exe (PyInstaller): sys.frozen is set, and
    the exe unpacks itself into a TEMPORARY folder that gets deleted
    when the app closes. Writing the database there would silently
    lose all tracked data on every restart - so packaged builds
    instead use the standard Windows per-user data folder
    (%APPDATA%\\FocusTracker), which persists across restarts,
    updates, and reinstalls.
    """
    if getattr(sys, "frozen", False):
        appdata = os.environ.get("APPDATA") or str(Path.home())
        return Path(appdata) / "FocusTracker"
    return Path(__file__).resolve().parent.parent


BASE_DIR = _resolve_base_dir()

# --- Tracker behavior ---
POLL_INTERVAL_SECONDS = 5       # how often we sample the active window
IDLE_THRESHOLD_SECONDS = 120    # no input for this long = idle
MIN_EVENT_DURATION_SECONDS = 2  # discard flicker events shorter than this

# --- Storage ---
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "tracker.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# --- Logging ---
LOG_DIR = BASE_DIR / "logs"
LOG_FILE = LOG_DIR / "tracker.log"

# Ensure directories exist at import time
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)
