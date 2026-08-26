# Focus Tracker

A personal desktop productivity tracker: logs active window/app time
and idle periods to a local SQLite database. Built in phases -
tracker first (no AI, no frontend needed to be useful), backend and
dashboard layered on top later.

## Current status: Phase 0 + Phase 1 + Phase 2 + Phase 4 (Foundation, Tracker, Backend, Dashboard)

What works right now:
- Captures the active window (app name + title) every 5 seconds
- Detects idle time (no keyboard/mouse input)
- Writes completed events to a local SQLite DB, append-only
- Runs as a standalone background process - no backend/frontend required
- FastAPI backend with aggregation endpoints (daily/weekly summaries, raw event inspection)
- A responsive web dashboard: today's totals, a day timeline strip, app
  breakdown, and a weekly trend chart - served directly from the backend

What's NOT built yet (see roadmap below):
- App categorization (Phase 3 - can be added independent of the dashboard)
- AI summary/categorization layer (Phase 6, optional)

## Setup (Windows)

```powershell
# 1. Clone/copy this folder, then from the project root:
python -m venv .venv
.venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the tracker
python scripts/run_tracker.py
```

You should see log lines like this print to your console and to
`logs/tracker.log`:

```
2026-08-21 10:03:15 [INFO] tracker.daemon: Tracker daemon starting. Poll interval=5s, idle threshold=120s
2026-08-21 10:04:02 [INFO] tracker.daemon: Logged: Code.exe | idle=False | 47s
2026-08-21 10:05:18 [INFO] tracker.daemon: Logged: chrome.exe | idle=False | 76s
```

Stop it with `Ctrl+C` - it flushes the in-progress event before exiting
so you don't lose the last few seconds of data.

## Running the backend API (Phase 2)

Open a **second terminal** (leave the tracker running in the first one),
activate the same venv, and run:

```powershell
.venv\Scripts\activate
python scripts/run_backend.py
```

Then open **http://127.0.0.1:8000/docs** in your browser - this gives
you an interactive page to test every endpoint without writing any
frontend code yet.

### Available endpoints

| Endpoint | What it returns |
|---|---|
| `GET /health` | `{"status": "ok"}` - confirms the server is up |
| `GET /summary/today` | Today's total active/idle time + per-app breakdown |
| `GET /summary/day?target_date=2026-08-23` | Same, for any specific date |
| `GET /summary/week` | Rolling 7-day trend + top 10 apps for the week |
| `GET /sessions?limit=50` | Raw events, most recent first - useful for debugging |

Both the tracker and the backend need to be running at the same time
in separate terminals - the tracker writes, the backend reads. Neither
depends on the other being alive; you can stop and restart either
independently.

## Viewing the dashboard (Phase 4)

With the backend running (`python scripts/run_backend.py`), open:

**http://127.0.0.1:8000/dashboard/**

You'll see:
- **Today** - total active/idle time as HH:MM:SS, a color-coded "day
  timeline" strip showing proportionally how your tracked time split
  across apps, and a ranked app breakdown list
- **This week** - a bar chart of daily active hours, plus your top
  apps across the last 7 days

It auto-refreshes every 60 seconds, or click "Refresh" to update on
demand. It's a static HTML/CSS/JS page (no build step) served
directly by FastAPI, so there's nothing extra to install - it needs
an internet connection on first load only, to fetch the Chart.js
library from a CDN.

## Verifying it's working

While the tracker runs, open a **second** terminal (don't kill the
tracker) and inspect the DB directly:

```powershell
python -c "
from db.database import SessionLocal
from db.models import RawEvent
session = SessionLocal()
for e in session.query(RawEvent).order_by(RawEvent.id.desc()).limit(10):
    print(e)
"
```

Or open `data/tracker.db` in [DB Browser for SQLite](https://sqlitebrowser.org/)
(free GUI tool) to eyeball the `raw_events` table directly. This is
your ground truth - trust this table over anything else until the
backend aggregation is built and tested against it.

## Running the tests

```powershell
pip install pytest
pytest tests/ -v
```

`tests/test_db.py` runs on any OS since it doesn't touch Windows APIs
- it validates the schema/DB layer in isolation using an in-memory
database, separate from your real tracking data.

## Project structure

```
focus-tracker/
├── tracker/          # Background daemon: capture + idle detection
├── db/                # SQLAlchemy models + session management
├── backend/           # FastAPI app: routers, aggregation service, schemas
│   ├── main.py          # App entrypoint, also serves the dashboard
│   ├── routers/          # /summary and /sessions endpoints
│   ├── services/          # aggregation.py - all rollup logic lives here
│   └── schemas.py          # API response shapes (Pydantic)
├── frontend/           # Dashboard: static HTML/CSS/JS, no build step
│   ├── index.html
│   ├── style.css
│   └── app.js
├── config/settings.py  # ALL tunable values live here
├── scripts/
│   ├── run_tracker.py   # Entry point for the tracker daemon
│   └── run_backend.py    # Entry point for the API server + dashboard
├── tests/              # Isolated, OS-independent tests
└── data/tracker.db      # SQLite file (gitignored)
```

## Roadmap

- [x] Phase 0: Schema + project structure
- [x] Phase 1: MVP tracker daemon
- [x] Phase 2: Aggregation logic + FastAPI backend
- [ ] Phase 3: Rule-based app categorization
- [x] Phase 4: Web dashboard (this is what's in this repo now)
- [ ] Phase 5: Run as a startup task, dogfood for a week
- [ ] Phase 6 (optional): AI-generated weekly summaries, AI fallback
      categorization for unrecognized apps - additive only, core
      tracking never depends on this working

## Design notes worth remembering

- **raw_events is append-only.** The tracker only ever inserts, never
  updates/deletes. Aggregation (Phase 2) reads from it but writes to
  a separate table, so you can always recompute from source truth.
- **The tracker doesn't know the backend/frontend exist.** It's a
  fully standalone process. This is deliberate - a background logger
  should never crash or stall because a dashboard window is closed.
- **Window title changes don't end an event, app switches do.**
  Otherwise every browser tab change (title changes constantly) would
  fragment your data into useless one-second slivers.
