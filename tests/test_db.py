"""
Tests the DB layer in isolation - no Windows APIs involved, so this
runs anywhere. Run with: pytest tests/test_db.py -v

This is the kind of test you should write BEFORE trusting the tracker
daemon's output: confirm the schema behaves as expected first.
"""
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import Base, RawEvent


def make_in_memory_session():
    """Use an in-memory DB for tests so we never touch real tracking data."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_insert_and_read_event():
    session = make_in_memory_session()
    start = datetime.utcnow()
    end = start + timedelta(seconds=30)

    event = RawEvent(
        start_time=start,
        end_time=end,
        duration_sec=30.0,
        app_name="Code.exe",
        window_title="daemon.py - Visual Studio Code",
        is_idle=False,
    )
    session.add(event)
    session.commit()

    result = session.query(RawEvent).first()
    assert result.app_name == "Code.exe"
    assert result.duration_sec == 30.0
    assert result.is_idle is False
    session.close()


def test_idle_flag_defaults_false():
    session = make_in_memory_session()
    event = RawEvent(
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow(),
        duration_sec=5.0,
        app_name="explorer.exe",
    )
    session.add(event)
    session.commit()

    result = session.query(RawEvent).first()
    assert result.is_idle is False
    session.close()


if __name__ == "__main__":
    test_insert_and_read_event()
    test_idle_flag_defaults_false()
    print("All tests passed.")
