"""
FastAPI app entry point.

Run with: python scripts/run_backend.py
Then visit http://localhost:8000/docs for interactive API testing -
this is your fastest way to verify aggregation numbers without
building the frontend first.
"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.routers import summary, sessions, export
from db.database import init_db

app = FastAPI(
    title="Focus Tracker API",
    description="Local API for querying personal activity tracking data.",
    version="0.1.0",
)

# Create the database schema on startup if it doesn't exist yet.
# init_db() is idempotent (CREATE TABLE IF NOT EXISTS under the hood),
# so this is safe to call even if the tracker already created it.
# Without this, starting the backend before the tracker has ever run
# once (e.g. right after a fresh install, or after deleting the DB to
# reset) crashes every /summary endpoint with "no such table".
init_db()

# Local-only CORS: kept permissive since this only ever runs on localhost
# for a single user - not exposed to the internet.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(summary.router)
app.include_router(sessions.router)
app.include_router(export.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Serve the dashboard at /dashboard - same-origin as the API, so the
# frontend's fetch() calls never hit a CORS restriction. The frontend
# is entirely static (HTML/CSS/JS), no build step required.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/dashboard", StaticFiles(directory=FRONTEND_DIR, html=True), name="dashboard")
