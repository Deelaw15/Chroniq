"""
Engine and session management. Import `SessionLocal` wherever you need
to talk to the DB; call `init_db()` once at startup to create tables.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config.settings import DATABASE_URL
from db.models import Base

# check_same_thread=False is required because SQLite by default only
# allows the thread that created the connection to use it, but our
# daemon may write from a background thread.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    """Create all tables if they don't already exist. Safe to call every run."""
    Base.metadata.create_all(bind=engine)


def get_session():
    """Context-managed session for scripts/tests."""
    return SessionLocal()
