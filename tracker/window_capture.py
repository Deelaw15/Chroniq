"""
Active-window detection - platform dispatcher.

tracker/daemon.py only ever calls get_active_window() and doesn't care
how it's implemented. The per-OS implementations live in siblings:

    _capture_windows.py   pywin32
    _capture_macos.py     pyobjc (Cocoa / Quartz)

Only the module matching the current OS is imported, so the other
platform's dependencies never need to be installed.
"""
import sys

if sys.platform == "win32":
    from tracker._capture_windows import get_active_window
elif sys.platform == "darwin":
    from tracker._capture_macos import get_active_window
else:  # pragma: no cover - unsupported platform, degrade to a no-op
    def get_active_window():
        """No active-window backend for this platform."""
        return None, None


__all__ = ["get_active_window"]
