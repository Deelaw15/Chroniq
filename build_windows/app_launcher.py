"""
Single entry point for the packaged .exe.

Unlike the dev workflow (two separate terminals running run_tracker.py
and run_backend.py), the packaged app runs BOTH in one process using
threads, then opens your browser to the dashboard automatically. This
is what PyInstaller bundles into FocusTracker.exe.

Not meant to be run with `python packaging/app_launcher.py` for daily
development - use scripts/run_tracker.py + scripts/run_backend.py for
that instead, since they give you two separate windows of logs and
support uvicorn's --reload for editing the backend. This file is only
for the packaged build.
"""
import sys
import os
import logging
import threading
import time
import webbrowser
from pathlib import Path

# Allow running from the packaging/ folder during manual testing
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import LOG_FILE
from db.database import init_db
from tracker.daemon import run as run_tracker_loop


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def run_tracker_thread():
    """Tracker runs in a background thread - if it ever crashes, it
    shouldn't take the whole app down with it, so any exception here
    is logged rather than left to propagate and kill the process."""
    try:
        run_tracker_loop()
    except Exception:
        logging.getLogger("launcher").exception("Tracker thread crashed")


def open_browser_when_ready():
    """Gives the backend a moment to start listening before opening
    the browser, rather than racing it and hitting connection refused."""
    time.sleep(2.5)
    webbrowser.open("http://127.0.0.1:8073/dashboard/")


def run_backend():
    # Imported here, not at module level, so logging is configured
    # before uvicorn's own logging setup runs.
    import uvicorn
    from backend.main import app

    # Port 8073 rather than the more common 8000: some Windows setups
    # (Hyper-V, WSL, certain VPN/antivirus tools) reserve port ranges
    # including 8000, or leave it stuck bound after a crashed process.
    # 8073 avoids that class of conflict entirely. reload=False is
    # required for a packaged build: uvicorn's reload mode works by
    # re-launching a subprocess and watching files on disk, which
    # doesn't apply (and doesn't work) inside a frozen .exe - there's
    # no source file to watch or subprocess to spawn.
    uvicorn.run(app, host="127.0.0.1", port=8073, reload=False, log_level="info")


if __name__ == "__main__":
    setup_logging()
    logger = logging.getLogger("launcher")
    logger.info("Focus Tracker starting...")

    init_db()

    threading.Thread(target=run_tracker_thread, daemon=True, name="tracker").start()
    threading.Thread(target=open_browser_when_ready, daemon=True, name="browser-opener").start()

    # Backend runs on the main thread - this call blocks until the
    # process is closed (Ctrl+C, or the window is closed).
    run_backend()
