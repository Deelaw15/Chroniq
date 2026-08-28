"""
macOS active-window detection via the Cocoa / Quartz frameworks
(pyobjc). This is the only place that touches the macOS API directly.
The public entry point is get_active_window() in
tracker/window_capture.py, which dispatches here on macOS.

Permissions:
  - The frontmost application NAME needs no special permission.
  - The window TITLE comes from the on-screen window list, which is
    only populated for other apps once the user grants Chroniq
    "Screen Recording" permission (System Settings -> Privacy &
    Security -> Screen Recording). Until then window_title is None and
    only the app name is recorded - which is still useful.
"""
from AppKit import NSWorkspace
from Quartz import (
    CGWindowListCopyWindowInfo,
    kCGWindowListOptionOnScreenOnly,
    kCGWindowListExcludeDesktopElements,
    kCGNullWindowID,
)


def _frontmost_window_title(pid):
    """Best-effort: the title of the frontmost on-screen window owned by pid."""
    try:
        options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements
        windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) or []
        for info in windows:
            if info.get("kCGWindowOwnerPID") != pid:
                continue
            # Layer 0 is the normal window layer; menus/dock/status items sit higher.
            if int(info.get("kCGWindowLayer", 0) or 0) != 0:
                continue
            name = info.get("kCGWindowName")
            if name:
                return str(name)
        return None
    except Exception:
        return None


def get_active_window():
    """
    Returns (app_name, window_title) for the currently focused window.
    app_name is the app's display name (e.g. "Safari", "Code", "Google
    Chrome"). window_title may be None if Screen Recording permission
    has not been granted. Returns (None, None) on any failure.
    """
    try:
        workspace = NSWorkspace.sharedWorkspace()
        app = workspace.frontmostApplication()
        if app is None:
            return None, None

        app_name = app.localizedName() or app.bundleIdentifier() or "Unknown"
        pid = int(app.processIdentifier())

        return str(app_name), _frontmost_window_title(pid)

    except Exception:
        # Never let a capture failure crash the daemon - just skip this sample.
        return None, None
