"""
Thin per-OS dispatcher, same pattern as window_capture.py and
idle_detector.py: import the right backend for the current platform so
daemon.py never has to know which OS it's running on.
"""
import sys

if sys.platform == "win32":
    from tracker._lock_windows import is_locked
elif sys.platform == "darwin":
    from tracker._lock_macos import is_locked
else:
    def is_locked() -> bool:
        return False
