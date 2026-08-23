"""
Entry point: `python scripts/run_backend.py`

Run this from the project root, in a SEPARATE terminal from the
tracker (both need to run at the same time - the tracker keeps
logging, the backend serves queries against what's been logged).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)