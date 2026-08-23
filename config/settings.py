"""
Central configuration. Every tunable value lives here so you never
have to hunt through tracker/db code to change behavior.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

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
