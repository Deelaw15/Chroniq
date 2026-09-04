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

TIMEZONE HANDLING: the tracker stores every timestamp as naive UTC
(see tracker/daemon.py, which uses datetime.utcnow()). "Today" and
day/hour boundaries, however, are always meant in the user's LOCAL
time - "today" should mean the calendar day on their wall clock, not
in UTC. Comparing a local calendar date directly against a raw UTC
timestamp is wrong whenever local time isn't UTC+0 (e.g. any time in
London during BST, UTC+1) - it silently shifts every event by an
hour and can misattribute events near midnight to the wrong day
entirely. Every function here converts each event's UTC timestamp to
local time via _to_local() before comparing it to a calendar date or
bucketing it by hour, rather than doing timezone-naive comparisons.
"""
import json
from datetime import datetime, timedelta, date, time, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from config.settings import STATUS_FILE, POLL_INTERVAL_SECONDS
from db.models import RawEvent


def _to_local(utc_naive: datetime) -> datetime:
    """
    Converts a naive-UTC datetime (as stored by the tracker) into an
    aware datetime in the system's local timezone. Using astimezone()
    with no arguments asks the OS for the current local UTC offset,
    so this correctly handles DST transitions (e.g. BST vs GMT in the
    UK) without needing a timezone database bundled with the app.
    """
    return utc_naive.replace(tzinfo=timezone.utc).astimezone()


def _fetch_events_for_local_date(session: Session, target_date: date) -> list[RawEvent]:
    """
    Returns every RawEvent whose LOCAL start date equals target_date.

    Local-day boundaries don't align cleanly with the UTC timestamps
    in storage, so this pulls a generously padded UTC window first
    (wide enough to cover any timezone offset in either direction),
    then filters precisely in Python after converting each row to
    local time. Simpler and safer than computing exact UTC boundaries
    for a local day, which would require knowing the UTC offset in
    effect at that specific date (DST can change mid-year).
    """
    window_start = datetime.combine(target_date - timedelta(days=1), datetime.min.time())
    window_end = datetime.combine(target_date + timedelta(days=2), datetime.min.time())

    candidates = (
        session.query(RawEvent)
        .filter(RawEvent.start_time >= window_start, RawEvent.start_time < window_end)
        .all()
    )
    return [e for e in candidates if _to_local(e.start_time).date() == target_date]


def get_daily_summary(session: Session, target_date: date) -> dict:
    """
    Computes total active time, total idle time, per-app breakdown,
    and app-switch count for a single LOCAL calendar day.
    """
    events = _fetch_events_for_local_date(session, target_date)
    # Chronological order matters for switch counting below
    events.sort(key=lambda e: e.start_time)

    total_active = sum(e.duration_sec for e in events if not e.is_idle)
    total_idle = sum(e.duration_sec for e in events if e.is_idle)

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

    # App switches: count transitions between two different (non-idle)
    # apps. Going in/out of idle isn't counted as a "switch" - it's
    # meant to measure how much you hopped between different apps.
    app_switch_count = 0
    prev_app = None
    for e in events:
        if e.is_idle:
            continue
        if prev_app is not None and e.app_name != prev_app:
            app_switch_count += 1
        prev_app = e.app_name

    break_ratio = (total_idle / (total_active + total_idle)) if (total_active + total_idle) > 0 else 0.0

    return {
        "date": target_date.isoformat(),
        "total_active_seconds": total_active,
        "total_idle_seconds": total_idle,
        "app_breakdown": breakdown,
        "app_switch_count": app_switch_count,
        "break_ratio": break_ratio,
    }


def _read_status_file() -> Optional[dict]:
    """Load the tracker heartbeat file, or None if absent/unreadable."""
    try:
        with open(STATUS_FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError, OSError, ValueError):
        return None


def _parse_naive_utc(value) -> Optional[datetime]:
    """Parse an ISO string the tracker wrote (naive UTC) back to a datetime."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _local_midnight_as_utc(local_day: date) -> datetime:
    """Naive-UTC datetime for 00:00 local time on local_day."""
    midnight_local = datetime.combine(local_day, time.min).astimezone()
    return midnight_local.astimezone(timezone.utc).replace(tzinfo=None)


def get_live_status(session: Session) -> dict:
    """
    A near-real-time view of today's active time, for the dashboard's
    ticking clock. Unlike get_daily_summary (which only sees events the
    tracker has already committed to the DB - i.e. nothing since the
    last app switch), this adds the still-in-progress stretch the
    tracker is currently timing, and reports whether the tracker
    process is actually alive right now (via the heartbeat file's
    freshness) so the UI can show "tracker offline" instead of a clock
    that lies.
    """
    today = date.today()
    daily = get_daily_summary(session, today)
    committed = daily["total_active_seconds"]

    now_utc = datetime.utcnow()
    status = _read_status_file()

    tracker_online = False
    is_idle = False
    current_app = None
    in_progress = 0.0

    if status:
        updated_at = _parse_naive_utc(status.get("updated_at"))
        poll = status.get("poll_interval_seconds") or POLL_INTERVAL_SECONDS
        if updated_at is not None:
            staleness = (now_utc - updated_at).total_seconds()
            # Tolerate up to ~3 missed polls before declaring it offline.
            tracker_online = -5 < staleness < (poll * 3 + 5)

        if tracker_online:
            is_idle = bool(status.get("is_idle"))
            current_app = status.get("current_app")
            state_start = _parse_naive_utc(status.get("state_start"))
            if not is_idle and state_start is not None:
                # Count only the part of the current stretch that lands
                # on today (local), same rule get_daily_summary uses.
                effective_start = max(state_start, _local_midnight_as_utc(today))
                in_progress = max(0.0, (now_utc - effective_start).total_seconds())

    return {
        "as_of": now_utc.isoformat(),
        "tracker_online": tracker_online,
        "is_idle": is_idle,
        "current_app": current_app,
        "committed_active_seconds": committed,
        "in_progress_seconds": in_progress,
        "live_active_seconds": committed + in_progress,
        "total_idle_seconds": daily["total_idle_seconds"],
    }


def get_weekly_summary(session: Session, start_date: date) -> dict:
    """
    Computes a 7-day summary starting from start_date: daily active
    totals (for a trend chart), top apps across the whole week, the
    most active day, and an average app-switch count per day (used to
    give "today's switches" an honest baseline for comparison).
    """
    daily_totals = []
    app_totals: dict[str, float] = {}
    switch_counts = []
    most_active_day = None
    most_active_seconds = -1.0

    for offset in range(7):
        day = start_date + timedelta(days=offset)
        day_summary = get_daily_summary(session, day)

        active_secs = day_summary["total_active_seconds"]
        daily_totals.append({"date": day.isoformat(), "active_seconds": active_secs})
        switch_counts.append(day_summary["app_switch_count"])

        if active_secs > most_active_seconds:
            most_active_seconds = active_secs
            most_active_day = day.isoformat()

        for item in day_summary["app_breakdown"]:
            app_totals[item["app_name"]] = app_totals.get(item["app_name"], 0.0) + item["total_seconds"]

    top_apps = sorted(
        [{"app_name": app, "total_seconds": secs} for app, secs in app_totals.items()],
        key=lambda x: x["total_seconds"],
        reverse=True,
    )[:10]

    avg_switch_count = sum(switch_counts) / len(switch_counts) if switch_counts else 0.0

    end_date = start_date + timedelta(days=6)
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily_totals": daily_totals,
        "top_apps": top_apps,
        "most_active_day": most_active_day,
        "avg_app_switch_count": avg_switch_count,
    }


def _split_event_by_local_hour(event: RawEvent) -> list[tuple[date, int, float]]:
    """
    Splits one event's active duration across every local (date, hour)
    bucket it overlaps. A 3-hour coding session starting at 9:15 AM
    local contributes ~45min to the 9am bucket, 60min each to 10am and
    11am, and ~15min to 12pm - not the whole 3 hours dumped into 9am.
    This also correctly handles an event that spans local midnight,
    splitting its tail into the next day's hour-0 bucket rather than
    silently attributing it all to the day the event started.
    """
    start_local = _to_local(event.start_time)
    end_local = _to_local(event.end_time)

    buckets = []
    cursor = start_local
    while cursor < end_local:
        hour_start = cursor.replace(minute=0, second=0, microsecond=0)
        next_hour = hour_start + timedelta(hours=1)
        bucket_end = min(end_local, next_hour)
        seconds_in_bucket = (bucket_end - cursor).total_seconds()
        buckets.append((cursor.date(), cursor.hour, seconds_in_bucket))
        cursor = bucket_end

    return buckets


def get_hourly_heatmap(session: Session, start_date: date) -> dict:
    """
    Returns active-seconds-per-hour for each of 7 local days starting
    at start_date - a 7x24 grid for the "day x hour" heatmap. Idle
    time is excluded (the heatmap shows when you were actually
    working, not just tracked).
    """
    end_date = start_date + timedelta(days=6)

    # Pull a padded window covering the whole week plus slack for
    # events near either edge that might shift day under local-time
    # conversion, then bucket every event directly by local hour.
    window_start = datetime.combine(start_date - timedelta(days=1), datetime.min.time())
    window_end = datetime.combine(end_date + timedelta(days=2), datetime.min.time())

    candidates = (
        session.query(RawEvent)
        .filter(
            RawEvent.start_time >= window_start,
            RawEvent.start_time < window_end,
            RawEvent.is_idle == False,  # noqa: E712 - SQLAlchemy needs == not is
        )
        .all()
    )

    bucket_seconds: dict[tuple[date, int], float] = {}
    for event in candidates:
        for bucket_date, hour, seconds in _split_event_by_local_hour(event):
            if start_date <= bucket_date <= end_date:
                key = (bucket_date, hour)
                bucket_seconds[key] = bucket_seconds.get(key, 0.0) + seconds

    days = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        hours = [bucket_seconds.get((day, h), 0.0) for h in range(24)]
        days.append({"date": day.isoformat(), "hours": hours})

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "days": days,
    }


def _split_event_by_local_day(event: RawEvent) -> list[tuple[date, float]]:
    """
    Same idea as _split_event_by_local_hour but coarser - splits one
    event's active duration across every local CALENDAR DAY it
    overlaps, not hours. A session that runs from 11:40pm to 12:20am
    local time contributes 20min to the first day and 20min to the
    second, rather than all 40min landing on whichever day it started.
    """
    start_local = _to_local(event.start_time)
    end_local = _to_local(event.end_time)

    buckets = []
    cursor = start_local
    while cursor < end_local:
        day_start = cursor.replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = day_start + timedelta(days=1)
        bucket_end = min(end_local, next_day)
        seconds_in_bucket = (bucket_end - cursor).total_seconds()
        buckets.append((cursor.date(), seconds_in_bucket))
        cursor = bucket_end

    return buckets


def get_streak_data(session: Session, days: int = 120) -> dict:
    """
    Returns daily active-seconds totals for the last `days` local
    calendar days (today inclusive), plus an all-time total across
    every tracked event ever. Used by the frontend to compute streaks
    and cumulative-hours achievements against the user's CURRENT daily
    goal - the goal itself lives in browser localStorage (a personal
    preference, not tracked data), not here, so streak/achievement
    logic that depends on it is computed client-side against this raw
    daily-totals data rather than baked into the backend response.
    """
    today = date.today()
    start_date = today - timedelta(days=days - 1)

    window_start = datetime.combine(start_date - timedelta(days=1), datetime.min.time())
    window_end = datetime.combine(today + timedelta(days=2), datetime.min.time())

    candidates = (
        session.query(RawEvent)
        .filter(
            RawEvent.start_time >= window_start,
            RawEvent.start_time < window_end,
            RawEvent.is_idle == False,  # noqa: E712
        )
        .all()
    )

    bucket_seconds: dict[date, float] = {}
    for event in candidates:
        for bucket_date, seconds in _split_event_by_local_day(event):
            if start_date <= bucket_date <= today:
                bucket_seconds[bucket_date] = bucket_seconds.get(bucket_date, 0.0) + seconds

    daily_totals = []
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        daily_totals.append({"date": day.isoformat(), "active_seconds": bucket_seconds.get(day, 0.0)})

    # All-time total is a separate, cheap aggregate query - deliberately
    # not limited to the `days` window, since a 50/100-hour cumulative
    # achievement should reflect the user's ENTIRE tracked history, not
    # just the last few months.
    all_time_seconds = (
        session.query(func.sum(RawEvent.duration_sec))
        .filter(RawEvent.is_idle == False)  # noqa: E712
        .scalar()
    ) or 0.0

    return {
        "start_date": start_date.isoformat(),
        "end_date": today.isoformat(),
        "daily_totals": daily_totals,
        "all_time_active_seconds": all_time_seconds,
    }
