"""
Entry point: `python scripts/run_tracker.py`

Run this from the project root (focus-tracker/). It sets up logging
to both console and a log file, initializes the DB if needed, then
starts the tracker loop. Stop with Ctrl+C - it flushes the last
in-progress event before exiting.
"""
import sys
import logging
from pathlib import Path

# Allow running as `python scripts/run_tracker.py` from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import LOG_FILE
from db.database import init_db
from tracker.daemon import run


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


if __name__ == "__main__":
    setup_logging()
    init_db()
    run()
