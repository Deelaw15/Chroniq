"""
macOS idle detection via Quartz's CGEventSource API (pyobjc).

CGEventSourceSecondsSinceLastEventType reports how long it's been
since the last HID input event system-wide. It reads only the *timing*
of input, never the content - no keylogging, and no special permission
is required.

Public entry point is get_idle_seconds() in tracker/idle_detector.py,
which dispatches here on macOS.
"""
from Quartz import (
    CGEventSourceSecondsSinceLastEventType,
    kCGEventSourceStateHIDSystemState,
)

try:
    from Quartz import kCGAnyInputEventType
except ImportError:  # pragma: no cover - older pyobjc without the constant
    # ~0 as a uint32: "any input event type" sentinel.
    kCGAnyInputEventType = 0xFFFFFFFF


def get_idle_seconds() -> float:
    """
    Seconds since the last keyboard/mouse/trackpad input anywhere on
    the system. Returns 0.0 (i.e. "not idle") if the API call fails,
    rather than falsely flagging idle.
    """
    try:
        seconds = CGEventSourceSecondsSinceLastEventType(
            kCGEventSourceStateHIDSystemState, kCGAnyInputEventType
        )
        return max(0.0, float(seconds))
    except Exception:
        return 0.0
