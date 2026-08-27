"""
The core tracker loop.

Logic: poll every POLL_INTERVAL_SECONDS. Keep track of the "current
state" (app + idle flag). As long as the state doesn't change, we
just extend its duration. The moment the state changes (different
app focused, OR idle status flips), we write the PREVIOUS state as a
completed RawEvent and start timing the new one.

This version also accepts an optional threading.Event so the packaged
desktop app can stop the tracker cleanly and flush the final event.
The existing `python scripts/run_tracker.py` workflow still works by
calling run() with no argument.
"""
import json
import logging
import os
import time
from datetime import datetime
from threading import Event

from config.settings import (
    POLL_INTERVAL_SECONDS,
    IDLE_THRESHOLD_SECONDS,
    MIN_EVENT_DURATION_SECONDS,
    STATUS_FILE,
)
from tracker.window_capture import get_active_window
from tracker.idle_detector import is_idle
from db.database import SessionLocal
from db.models import RawEvent

logger = logging.getLogger("tracker.daemon")


class TrackerState:
    """Holds the in-progress event we're currently timing."""

    def __init__(self, app_name, window_title, idle_flag, start_time):
        self.app_name = app_name
        self.window_title = window_title
        self.is_idle = idle_flag
        self.start_time = start_time

    def matches(self, app_name, idle_flag):
        # A state "continues" if the app is the same AND idle status
        # hasn't changed. Window title changes do NOT end the event.
        return self.app_name == app_name and self.is_idle == idle_flag


def _write_event(session, state: TrackerState, end_time: datetime):
    duration = (end_time - state.start_time).total_seconds()

    if duration < MIN_EVENT_DURATION_SECONDS:
        return

    event = RawEvent(
        start_time=state.start_time,
        end_time=end_time,
        duration_sec=duration,
        app_name=state.app_name or "Unknown",
        window_title=state.window_title,
        is_idle=state.is_idle,
    )
    session.add(event)
    try:
        session.commit()
    except Exception as e:
        session.rollback()
        logger.warning("Failed to write event, rolled back: %s", e)
        return

    logger.info(
        "Logged: %s | idle=%s | %.0fs",
        event.app_name,
        event.is_idle,
        event.duration_sec,
    )


def _write_heartbeat(state: "TrackerState | None") -> None:
    """
    Rewrite the tracker status file. Called every poll so its mtime /
    `updated_at` doubles as a "tracker is alive" signal for the backend.
    Written atomically (temp file + os.replace) so a reader never sees
    a half-written file. Any failure here is non-fatal - the heartbeat
    is a convenience for the dashboard, not part of tracking itself.
    """
    payload = {
        "updated_at": datetime.utcnow().isoformat(),
        "poll_interval_seconds": POLL_INTERVAL_SECONDS,
        "current_app": (state.app_name if state else None),
        "is_idle": (bool(state.is_idle) if state else False),
        "state_start": (state.start_time.isoformat() if state else None),
    }
    try:
        tmp = f"{STATUS_FILE}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        os.replace(tmp, STATUS_FILE)
    except Exception as e:  # pragma: no cover - best effort only
        logger.debug("Could not write heartbeat: %s", e)


def _clear_heartbeat() -> None:
    try:
        os.remove(STATUS_FILE)
    except FileNotFoundError:
        pass
    except Exception as e:  # pragma: no cover
        logger.debug("Could not clear heartbeat: %s", e)


def run(stop_event: Event | None = None):
    """Run the tracker until Ctrl+C or until stop_event is set."""
    logger.info(
        "Tracker daemon starting. Poll interval=%ss, idle threshold=%ss",
        POLL_INTERVAL_SECONDS,
        IDLE_THRESHOLD_SECONDS,
    )

    session = SessionLocal()
    current_state = None

    try:
        while stop_event is None or not stop_event.is_set():
            now = datetime.utcnow()
            app_name, window_title = get_active_window()
            idle_flag = is_idle(IDLE_THRESHOLD_SECONDS)

            if current_state is None:
                current_state = TrackerState(
                    app_name, window_title, idle_flag, now
                )

            elif not current_state.matches(app_name, idle_flag):
                _write_event(session, current_state, now)
                current_state = TrackerState(
                    app_name, window_title, idle_flag, now
                )

            else:
                current_state.window_title = window_title

            _write_heartbeat(current_state)

            # In desktop mode this lets shutdown interrupt the normal poll
            # wait immediately. The original standalone mode still sleeps.
            if stop_event is not None:
                if stop_event.wait(POLL_INTERVAL_SECONDS):
                    break
            else:
                time.sleep(POLL_INTERVAL_SECONDS)

    except KeyboardInterrupt:
        logger.info("Shutdown signal received.")

    finally:
        # Ensure a half-failed transaction does not block the final flush.
        try:
            session.rollback()
        except Exception:
            pass

        if current_state is not None:
            try:
                _write_event(session, current_state, datetime.utcnow())
            except Exception as e:
                logger.warning(
                    "Could not flush final event on shutdown: %s", e
                )

        session.close()
        _clear_heartbeat()
        logger.info("Tracker daemon stopped cleanly.")
