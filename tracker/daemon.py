"""
The core tracker loop.

Logic: poll every POLL_INTERVAL_SECONDS. Keep track of the "current
state" (app + idle flag). As long as the state doesn't change, we
just extend its duration. The moment the state changes (different
app focused, OR idle status flips), we write the PREVIOUS state as a
completed RawEvent and start timing the new one.

This means events represent continuous stretches of "you were in X
app" or "you were idle" - not one row per poll, which would bloat
the DB and be useless to query.

Run this as its own process: `python scripts/run_tracker.py`
It has no dependency on the backend or frontend being alive.
"""
import logging
import time
from datetime import datetime

from config.settings import (
    POLL_INTERVAL_SECONDS,
    IDLE_THRESHOLD_SECONDS,
    MIN_EVENT_DURATION_SECONDS,
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
        # hasn't changed. Window title changes (e.g. browser tab switch)
        # do NOT end the event - only app switches and idle transitions do.
        # This keeps event volume sane; title is still recorded per-event.
        return self.app_name == app_name and self.is_idle == idle_flag


def _write_event(session, state: TrackerState, end_time: datetime):
    duration = (end_time - state.start_time).total_seconds()

    if duration < MIN_EVENT_DURATION_SECONDS:
        return  # discard flicker/noise events

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
        # If the commit itself fails or is interrupted, roll back so the
        # session isn't left in a broken state for the next write.
        session.rollback()
        logger.warning("Failed to write event, rolled back: %s", e)
        return

    logger.info(
        "Logged: %s | idle=%s | %.0fs",
        event.app_name, event.is_idle, event.duration_sec,
    )


def run():
    logger.info("Tracker daemon starting. Poll interval=%ss, idle threshold=%ss",
                POLL_INTERVAL_SECONDS, IDLE_THRESHOLD_SECONDS)

    session = SessionLocal()
    current_state = None

    try:
        while True:
            now = datetime.utcnow()
            app_name, window_title = get_active_window()
            idle_flag = is_idle(IDLE_THRESHOLD_SECONDS)

            if current_state is None:
                # First sample - start timing.
                current_state = TrackerState(app_name, window_title, idle_flag, now)

            elif not current_state.matches(app_name, idle_flag):
                # State changed - close out the previous event, start a new one.
                _write_event(session, current_state, now)
                current_state = TrackerState(app_name, window_title, idle_flag, now)

            else:
                # Same state continues - update the title in case it drifted
                # (e.g. browser tab changed but we're not treating that as
                # a new event); keeps the eventual record's title current.
                current_state.window_title = window_title

            time.sleep(POLL_INTERVAL_SECONDS)

    except KeyboardInterrupt:
        logger.info("Shutdown signal received - flushing final event.")

        # If Ctrl+C landed mid-commit, the session may be holding a
        # broken transaction. Roll it back before reusing the session,
        # otherwise SQLAlchemy refuses to do anything else with it.
        try:
            session.rollback()
        except Exception:
            pass

        if current_state is not None:
            try:
                _write_event(session, current_state, datetime.utcnow())
            except Exception as e:
                # Don't let a failed final write crash the shutdown -
                # worst case we lose the last few seconds, which is
                # acceptable; a scary traceback on every Ctrl+C is not.
                logger.warning("Could not flush final event on shutdown: %s", e)

    finally:
        session.close()
        logger.info("Tracker daemon stopped cleanly.")
