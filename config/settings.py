"""
Central configuration. Every tunable value lives here so you never
have to hunt through tracker/db code to change behavior.
"""
import os
import sys
from pathlib import Path


def _resolve_base_dir() -> Path:
    """
    Resolve the writable application-data directory.

    Development:
        Keep using the project directory so existing development data
        continues to work.

    Packaged Windows:
        %LOCALAPPDATA%\\FocusTracker

    Packaged macOS:
        ~/Library/Application Support/FocusTracker
    """
    if not getattr(sys, "frozen", False):
        return Path(__file__).resolve().parent.parent

    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA")
        if local_appdata:
            return Path(local_appdata) / "FocusTracker"

        return Path.home() / "AppData" / "Local" / "FocusTracker"

    if sys.platform == "darwin":
        return (
            Path.home()
            / "Library"
            / "Application Support"
            / "FocusTracker"
        )

    return Path.home() / ".local" / "share" / "FocusTracker"


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
