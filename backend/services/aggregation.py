"""
Aggregation logic. This is the ONLY layer that transforms raw_events
into summaries - the API routers call these functions, they never
write their own aggregation SQL inline. Keeping it centralized here
means when the numbers look wrong, there's exactly one place to check.

All aggregation is computed on-demand from raw_events (not cached in
a separate table). This is deliberately simple for now - raw_events
is small enough that this is fast. If the DB grows to millions of
rows, this is the place you'd add a materialized `daily_summary`
table, kept in sync separately from raw_events.
"""
from datetime import datetime, timedelta, date
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import RawEvent


def _day_bounds(target_date: date) -> tuple[datetime, datetime]:
    """Returns (start, end) datetimes covering the full target_date, UTC."""
    start = datetime.combine(target_date, datetime.min.time())
    end = start + timedelta(days=1)
    return start, end


def get_daily_summary(session: Session, target_date: date) -> dict:
    """
    Computes total active time, total idle time, and per-app breakdown
    for a single calendar day.
    """
    start, end = _day_bounds(target_date)

    events = (
        session.query(RawEvent)
        .filter(RawEvent.start_time >= start, RawEvent.start_time < end)
        .all()
    )

    total_active = sum(e.duration_sec for e in events if not e.is_idle)
    total_idle = sum(e.duration_sec for e in events if e.is_idle)

    # Per-app breakdown, active time only (idle isn't attributed to an app)
    app_totals: dict[str, float] = {}
    for e in events:
        if e.is_idle:
            continue
        app_totals[e.app_name] = app_totals.get(e.app_name, 0.0) + e.duration_sec

    breakdown = sorted(
        [{"app_name": app, "total_seconds": secs} for app, secs in app_totals.items()],
        key=lambda x: x["total_seconds"],
        reverse=True,
    )

    return {
        "date": target_date.isoformat(),
        "total_active_seconds": total_active,
        "total_idle_seconds": total_idle,
        "app_breakdown": breakdown,
    }


def get_weekly_summary(session: Session, start_date: date) -> dict:
    """
    Computes a 7-day summary starting from start_date: daily active
    totals (for a trend chart) plus the top apps across the whole week.
    """
    daily_totals = []
    app_totals: dict[str, float] = {}

    for offset in range(7):
        day = start_date + timedelta(days=offset)
        day_start, day_end = _day_bounds(day)

        events = (
            session.query(RawEvent)
            .filter(RawEvent.start_time >= day_start, RawEvent.start_time < day_end)
            .all()
        )

        active_secs = sum(e.duration_sec for e in events if not e.is_idle)
        daily_totals.append({"date": day.isoformat(), "active_seconds": active_secs})

        for e in events:
            if e.is_idle:
                continue
            app_totals[e.app_name] = app_totals.get(e.app_name, 0.0) + e.duration_sec

    top_apps = sorted(
        [{"app_name": app, "total_seconds": secs} for app, secs in app_totals.items()],
        key=lambda x: x["total_seconds"],
        reverse=True,
    )[:10]

    end_date = start_date + timedelta(days=6)
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily_totals": daily_totals,
        "top_apps": top_apps,
    }
