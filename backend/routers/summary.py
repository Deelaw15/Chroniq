"""
/summary endpoints - the aggregated view of the data. These are what
the dashboard (Phase 4) will primarily call.
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.dependencies import get_db
from backend.schemas import DailySummaryOut, WeeklySummaryOut, HeatmapOut
from backend.services import aggregation

router = APIRouter(prefix="/summary", tags=["summary"])


@router.get("/today", response_model=DailySummaryOut)
def summary_today(db: Session = Depends(get_db)):
    return aggregation.get_daily_summary(db, date.today())


@router.get("/day", response_model=DailySummaryOut)
def summary_day(
    target_date: date = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    return aggregation.get_daily_summary(db, target_date)


@router.get("/week", response_model=WeeklySummaryOut)
def summary_week(
    start_date: date | None = Query(
        None, description="YYYY-MM-DD. Defaults to 6 days ago (rolling week ending today)."
    ),
    db: Session = Depends(get_db),
):
    if start_date is None:
        start_date = date.today() - timedelta(days=6)
    return aggregation.get_weekly_summary(db, start_date)


@router.get("/heatmap", response_model=HeatmapOut)
def summary_heatmap(
    start_date: date | None = Query(
        None, description="YYYY-MM-DD, must be a Monday. Defaults to the Monday of the current calendar week."
    ),
    db: Session = Depends(get_db),
):
    if start_date is None:
        today = date.today()
        start_date = today - timedelta(days=today.weekday())  # Monday=0 ... Sunday=6
    return aggregation.get_hourly_heatmap(db, start_date)
