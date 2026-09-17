"""
Windows workstation-lock detection.

Trick: OpenInputDesktop() returns whichever desktop is currently
receiving user input. During normal use that's the "Default" desktop.
Locking the workstation (Win+L, idle lock policy, switching users)
swaps the input desktop to "Winlogon" (or "Screen-saver" for a
screensaver) - a desktop our process can't meaningfully read window
titles or input timing from anyway. So checking the desktop's name
doubles as "is Chroniq allowed to see anything useful right now?".

No extra permissions or window hooks needed, and nothing here reads
what's actually on screen - just which desktop is active.
"""
import ctypes
from ctypes import wintypes

_user32 = ctypes.windll.user32

_DESKTOP_SWITCHDESKTOP = 0x0100
_UOI_NAME = 2


def is_locked() -> bool:
    """True if the workstation is locked or on the logon/screensaver desktop."""
    hdesktop = _user32.OpenInputDesktop(0, False, _DESKTOP_SWITCHDESKTOP)
    if not hdesktop:
        # Couldn't even ask - safer to assume locked than to risk logging
        # activity we can't actually verify.
        return True

    try:
        name_buf = ctypes.create_unicode_buffer(256)
        length = wintypes.DWORD(0)
        ok = _user32.GetUserObjectInformationW(
            hdesktop, _UOI_NAME, ctypes.byref(name_buf), ctypes.sizeof(name_buf), ctypes.byref(length)
        )
        name = name_buf.value if ok else ""
    finally:
        _user32.CloseDesktop(hdesktop)

    return name.strip().lower() != "default"
