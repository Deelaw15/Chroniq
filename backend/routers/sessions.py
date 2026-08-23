"""
/sessions endpoints - direct access to raw_events. Mainly useful for
debugging: if a summary number looks wrong, this lets you see the
underlying rows it was computed from.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.dependencies import get_db
from backend.schemas import RawEventOut
from db.models import RawEvent

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[RawEventOut])
def list_sessions(
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
):
    events = (
        db.query(RawEvent)
        .order_by(RawEvent.start_time.desc())
        .limit(limit)
        .all()
    )
    return events
