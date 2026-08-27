"""Desktop launcher for Focus Tracker.

Starts the tracker and FastAPI server inside one process, then shows the
existing /dashboard frontend in a native pywebview window.

Development run:
    python desktop.py
"""
from __future__ import annotations

import logging
import socket
import sys
import threading
import time
from urllib.error import URLError
from urllib.request import urlopen

import uvicorn
import webview

from backend.main import app
from config.settings import LOG_FILE
from db.database import init_db
from tracker.daemon import run as run_tracker


HOST = "127.0.0.1"


def setup_logging() -> None:
    handlers: list[logging.Handler] = [
        logging.FileHandler(LOG_FILE, encoding="utf-8")
    ]

    # A PyInstaller --windowed build has no useful console. Keep console
    # logging during normal development, but always keep the file log.
    if not getattr(sys, "frozen", False):
        handlers.append(logging.StreamHandler(sys.stdout))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=handlers,
        force=True,
    )


def find_free_port() -> int:
    """Ask Windows/macOS for an unused local TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def wait_for_backend(port: int, timeout_seconds: float = 12.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    url = f"http://{HOST}:{port}/health"

    while time.monotonic() < deadline:
        try:
            with urlopen(url, timeout=0.5) as response:
                if response.status == 200:
                    return True
        except (URLError, OSError):
            time.sleep(0.1)

    return False


def main() -> None:
    setup_logging()
    logger = logging.getLogger("desktop")
    init_db()

    stop_tracker = threading.Event()

    tracker_thread = threading.Thread(
        target=run_tracker,
        args=(stop_tracker,),
        name="focus-tracker-daemon",
        daemon=True,
    )
    tracker_thread.start()

    port = find_free_port()
    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server_thread = threading.Thread(
        target=server.run,
        name="focus-tracker-api",
        daemon=True,
    )
    server_thread.start()

    try:
        if not wait_for_backend(port):
            raise RuntimeError(
                "Focus Tracker backend did not become ready. "
                f"Check the log file at: {LOG_FILE}"
            )

        dashboard_url = f"http://{HOST}:{port}/dashboard/"
        logger.info("Opening desktop dashboard: %s", dashboard_url)

        webview.create_window(
            "Focus Tracker",
            dashboard_url,
            width=1380,
            height=860,
            min_size=(1000, 650),
            resizable=True,
        )

        # Must run on the main thread on desktop platforms.
        webview.start()

    finally:
        logger.info("Desktop window closing; stopping services.")
        stop_tracker.set()
        server.should_exit = True

        tracker_thread.join(timeout=8)
        server_thread.join(timeout=8)
        logger.info("Focus Tracker desktop app stopped.")


if __name__ == "__main__":
    main()
