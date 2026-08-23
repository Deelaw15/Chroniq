"""
Windows idle detection via the GetLastInputInfo Win32 API.

This asks Windows for the tick count of the last keyboard/mouse input
system-wide - it does NOT capture what was typed or clicked, only
*when* the last input happened. That's all we need for idle detection
and it's not a privacy concern (no keylogging).
"""
import ctypes
from ctypes import wintypes


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.UINT),
        ("dwTime", wintypes.DWORD),
    ]


def get_idle_seconds() -> float:
    """
    Returns how many seconds have passed since the last keyboard/mouse
    input anywhere on the system.
    """
    last_input_info = LASTINPUTINFO()
    last_input_info.cbSize = ctypes.sizeof(LASTINPUTINFO)

    if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(last_input_info)):
        # API call failed - assume not idle rather than falsely flagging idle
        return 0.0

    millis_since_boot = ctypes.windll.kernel32.GetTickCount()
    millis_since_input = millis_since_boot - last_input_info.dwTime
    return millis_since_input / 1000.0


def is_idle(threshold_seconds: float) -> bool:
    return get_idle_seconds() >= threshold_seconds
