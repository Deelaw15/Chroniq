"""
FastAPI app entry point.

Run with: python scripts/run_backend.py
Then visit http://localhost:8000/docs for interactive API testing -
this is your fastest way to verify aggregation numbers without
building the frontend first.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import summary, sessions

app = FastAPI(
    title="Focus Tracker API",
    description="Local API for querying personal activity tracking data.",
    version="0.1.0",
)

# Local-only CORS: allows a future frontend running on a different
# localhost port (e.g. Vite on :5173) to call this API on :8000.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(summary.router)
app.include_router(sessions.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
