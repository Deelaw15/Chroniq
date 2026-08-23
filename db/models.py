"""
Database schema.

Design choice: raw_events is APPEND-ONLY. The tracker never updates or
deletes rows - it only inserts. This means even if aggregation logic
has bugs later, you never lose source-of-truth data and can always
recompute. Aggregation (Phase 2) reads from this table but writes to
a separate `sessions` table, never touching raw_events.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class RawEvent(Base):
    __tablename__ = "raw_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_sec = Column(Float, nullable=False)
    app_name = Column(String, nullable=False)       # e.g. "Code.exe"
    window_title = Column(String, nullable=True)    # e.g. "main.py - Visual Studio Code"
    is_idle = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return (
            f"<RawEvent {self.app_name!r} "
            f"{self.duration_sec:.0f}s idle={self.is_idle}>"
        )


# --- Phase 3 (categorization) will add this table later ---
# class CategoryRule(Base):
#     __tablename__ = "category_rules"
#     id = Column(Integer, primary_key=True)
#     app_name = Column(String, nullable=False, unique=True)
#     category = Column(String, nullable=False)  # "Work" / "Distraction" / etc.
