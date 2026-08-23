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

from backend.routers import summary, sessions

app = FastAPI(
    title="Focus Tracker API",
    description="Local API for querying personal activity tracking data.",
    version="0.1.0",
)

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


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Serve the dashboard at /dashboard - same-origin as the API, so the
# frontend's fetch() calls never hit a CORS restriction. The frontend
# is entirely static (HTML/CSS/JS), no build step required.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/dashboard", StaticFiles(directory=FRONTEND_DIR, html=True), name="dashboard")
