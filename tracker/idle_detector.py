"""
Idle detection - platform dispatcher.

tracker/daemon.py only ever calls is_idle(); the per-OS implementations
of get_idle_seconds() live in siblings:

    _idle_windows.py   GetLastInputInfo (Win32)
    _idle_macos.py     CGEventSourceSecondsSinceLastEventType (Quartz)

Only the module matching the current OS is imported.
"""
import sys

if sys.platform == "win32":
    from tracker._idle_windows import get_idle_seconds
elif sys.platform == "darwin":
    from tracker._idle_macos import get_idle_seconds
else:  # pragma: no cover - unsupported platform: never report idle
    def get_idle_seconds() -> float:
        """No idle backend for this platform - treat the user as active."""
        return 0.0


def is_idle(threshold_seconds: float) -> bool:
    return get_idle_seconds() >= threshold_seconds


__all__ = ["get_idle_seconds", "is_idle"]
