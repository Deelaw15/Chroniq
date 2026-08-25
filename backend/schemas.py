"""
Pydantic models define the exact JSON shape the API returns. Keeping
these separate from db/models.py (SQLAlchemy) is deliberate - the DB
schema and the API contract are allowed to evolve independently.
"""
from datetime import datetime
from pydantic import BaseModel


class RawEventOut(BaseModel):
    id: int
    start_time: datetime
    end_time: datetime
    duration_sec: float
    app_name: str
    window_title: str | None
    is_idle: bool

    class Config:
        from_attributes = True  # allows creating this from a SQLAlchemy row


class AppBreakdownItem(BaseModel):
    app_name: str
    total_seconds: float


class DailySummaryOut(BaseModel):
    date: str  # "2026-08-23"
    total_active_seconds: float
    total_idle_seconds: float
    app_breakdown: list[AppBreakdownItem]
    app_switch_count: int
    break_ratio: float  # 0.0-1.0, idle time as a fraction of total tracked time


class WeeklySummaryOut(BaseModel):
    start_date: str
    end_date: str
    daily_totals: list[dict]  # [{"date": "...", "active_seconds": ...}, ...]
    top_apps: list[AppBreakdownItem]
    most_active_day: str | None  # date string, e.g. "2026-08-22"
    avg_app_switch_count: float


class HeatmapDay(BaseModel):
    date: str
    hours: list[float]  # 24 values, active seconds per local hour (0-23)


class HeatmapOut(BaseModel):
    start_date: str
    end_date: str
    days: list[HeatmapDay]
