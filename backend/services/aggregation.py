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
from datetime import datetime, timedelta, date, timezone
from sqlalchemy.orm import Session

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
