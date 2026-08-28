"""
/export endpoints - lets you download your own raw tracked data.
Useful as a safety net before trusting the app with daily use: you
can always get your data out in a plain, portable format.
"""
import csv
import io
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.dependencies import get_db
from db.models import RawEvent

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/raw_events.csv")
def export_raw_events_csv(db: Session = Depends(get_db)):
    events = db.query(RawEvent).order_by(RawEvent.start_time).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "start_time_utc", "end_time_utc", "duration_sec", "app_name", "window_title", "is_idle"])
    for e in events:
        writer.writerow([e.id, e.start_time, e.end_time, e.duration_sec, e.app_name, e.window_title, e.is_idle])

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=chroniq_export.csv"},
    )
