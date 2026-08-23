"""
Windows-specific active window detection.

Uses pywin32 to ask the OS: "what window is focused right now, and
which process owns it?" This file is the ONLY place that touches the
Windows API directly - if you ever port to Mac/Linux, this is the
only file you'd swap out (see tracker/daemon.py, which only calls
get_active_window() and doesn't care how it's implemented).
"""
import win32gui
import win32process
import psutil


def get_active_window():
    """
    Returns (app_name, window_title) for the currently focused window.
    Returns (None, None) if nothing could be determined (e.g. desktop
    focused, or a system window with no accessible process).
    """
    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return None, None

        window_title = win32gui.GetWindowText(hwnd)

        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        if not pid:
            return None, window_title

        try:
            process = psutil.Process(pid)
            app_name = process.name()  # e.g. "chrome.exe", "Code.exe"
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            app_name = "Unknown"

        return app_name, window_title

    except Exception:
        # Never let a capture failure crash the daemon - just skip this sample.
        return None, None
