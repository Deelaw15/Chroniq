"""
Single entry point for the packaged .exe.

Unlike the dev workflow (two separate terminals running run_tracker.py
and run_backend.py), the packaged app runs BOTH in one process using
threads, then opens your browser to the dashboard automatically. This
is what PyInstaller bundles into Chroniq.exe.

Not meant to be run with `python build_windows/app_launcher.py` for
daily development - use scripts/run_tracker.py + scripts/run_backend.py
for that instead, since they give you two separate windows of logs and
support uvicorn's --reload for editing the backend. This file is only
for the packaged build.
"""
import sys
import os
import logging
import threading
import time
import shutil
import subprocess
import webbrowser
from pathlib import Path

# Allow running from the build_windows/ folder during manual testing
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import LOG_FILE
from db.database import init_db
from tracker.daemon import run as run_tracker_loop


def setup_logging():
    handlers = [logging.FileHandler(LOG_FILE, encoding="utf-8")]
    # In windowed/no-console mode (see chroniq.spec), there is no
    # real stdout - it's either None or a dummy stream, depending on
    # the PyInstaller version. Writing to it can crash the app on the
    # very first log line. The file handler above is always safe and
    # is now the only place logs go once console=False; adding a
    # stdout handler only makes sense when a console genuinely exists.
    if sys.stdout is not None:
        handlers.append(logging.StreamHandler(sys.stdout))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=handlers,
    )


def show_startup_error(message: str):
    """
    Last-resort error display for when something fails during startup.
    With no console window (see chroniq.spec), a crash would
    otherwise be completely invisible - the app would just do nothing
    and a non-technical tester would have no idea why, or what to do
    about it. This shows a plain Windows message box instead, using
    ctypes directly rather than a GUI library, since it needs to work
    even if something upstream (like a missing dependency) is already
    broken.
    """
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            f"Chroniq couldn't start.\n\n{message}\n\n"
            f"Please send this log file to the developer:\n{LOG_FILE}",
            "Chroniq - Startup Error",
            0x10,  # MB_ICONERROR
        )
    except Exception:
        pass  # if even the error popup fails, there's nothing more we can do


def run_tracker_thread():
    """Tracker runs in a background thread - if it ever crashes, it
    shouldn't take the whole app down with it, so any exception here
    is logged rather than left to propagate and kill the process."""
    try:
        run_tracker_loop()
    except Exception:
        logging.getLogger("launcher").exception("Tracker thread crashed")


def _find_edge() -> str | None:
    """Locates msedge.exe. Edge ships built into every Windows 10/11
    install, so this should virtually always succeed - but a fallback
    exists below in case it doesn't (e.g. a stripped-down Windows N
    edition without Edge preinstalled)."""
    found = shutil.which("msedge")
    if found:
        return found
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for path in candidates:
        if path.exists():
            return str(path)
    return None


def open_browser_when_ready():
    """Gives the backend a moment to start listening before opening
    the window, rather than racing it and hitting connection refused.

    Launches Edge in "app mode" (--app=) rather than a normal browser
    tab: no address bar, no tabs, no bookmarks bar, and its own
    taskbar icon - this is the same technique apps like Slack, Discord,
    and VS Code use under the hood, just without bundling an entire
    separate browser engine the way Electron does. Falls back to
    opening a regular browser tab only if Edge genuinely can't be
    found, so the app still works either way.
    """
    time.sleep(2.5)
    url = "http://127.0.0.1:8073/dashboard/"
    edge_exe = _find_edge()
    if edge_exe:
        subprocess.Popen([edge_exe, f"--app={url}", "--window-size=1400,900"])
    else:
        webbrowser.open(url)


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
    # log_config=None stops uvicorn from setting up its OWN logging
    # (which by default targets stderr - unsafe in windowed mode for
    # the same reason described in setup_logging() above). With this
    # set, uvicorn's loggers fall back to propagating into the root
    # logger we already configured, which only ever writes to the log
    # file once console=False.
    uvicorn.run(app, host="127.0.0.1", port=8073, reload=False, log_config=None)


if __name__ == "__main__":
    setup_logging()
    logger = logging.getLogger("launcher")
    logger.info("Chroniq starting...")

    try:
        init_db()
        threading.Thread(target=run_tracker_thread, daemon=True, name="tracker").start()
        threading.Thread(target=open_browser_when_ready, daemon=True, name="browser-opener").start()

        # Backend runs on the main thread - this call blocks until the
        # process is closed (Ctrl+C, or the window is closed). If it
        # fails to even start (e.g. the port is somehow still taken),
        # that's the most likely real-world failure - the except
        # below is what turns that into a visible popup instead of
        # the app just silently doing nothing.
        run_backend()
    except Exception as e:
        logger.exception("Fatal error during startup")
        show_startup_error(str(e))
