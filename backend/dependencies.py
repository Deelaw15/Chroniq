"""
FastAPI dependency that opens a DB session per-request and always
closes it afterward, even if the request raises an exception.
"""
from db.database import SessionLocal


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
