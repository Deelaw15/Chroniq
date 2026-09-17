"""
macOS screen-lock detection via the session's "CGSSession" dictionary,
which the WindowServer maintains per login session. It carries a
CGSSessionScreenIsLocked flag whenever the screen is locked (Lock
Screen, fast user switching, or the screensaver in "require password"
mode) - no extra entitlements needed to read it.
"""
from typing import Optional

try:
    from Quartz import CGSessionCopyCurrentDictionary
except ImportError:  # pragma: no cover - only exercised on non-macOS dev machines
    CGSessionCopyCurrentDictionary = None


def is_locked() -> bool:
    if CGSessionCopyCurrentDictionary is None:
        return False

    info: Optional[dict] = CGSessionCopyCurrentDictionary()
    if not info:
        # No session dictionary at all is unusual - fail open rather than
        # silently going idle for the whole session.
        return False

    return bool(info.get("CGSSessionScreenIsLocked", False))
