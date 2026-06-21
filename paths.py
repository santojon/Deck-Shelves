"""Path discovery + path-validation helpers shared by the plugin.

Kept dependency-free (only stdlib) so it loads cleanly under both Decky's
sandboxed Python and the standalone runtime. The Plugin class in main.py
imports from here directly.
"""
import os
import sys
from typing import Any, List


def _steam_install_candidates() -> List[str]:
    """Candidate Steam install roots ordered by platform priority.

    Each platform contributes the paths that exist in the wild — the
    callers append the file-specific suffix (`config/htmlcache/Default/Cookies`,
    `userdata`, etc.) and pick the first one that resolves. Adding
    support for a new OS is a one-liner here; nothing else in this file
    needs platform-conditional logic for path discovery.

    Linux roots cover native Steam (`~/.local/share/Steam`,
    `~/.steam/steam`) and the Flatpak sandbox layout (default on
    Bazzite / ChimeraOS); both Flatpak variants are listed because the
    flatpak version determines which path is populated.

    Windows roots cover the standard installer paths under Program
    Files and an `APPDATA`-based fallback for portable installs. The
    cookie file lives under `config/htmlcache/Default/Cookies` on
    Windows too, so the same suffix appended by callers applies.

    macOS root is the standard Application Support directory; the
    htmlcache subtree is laid out identically to Linux.
    """
    candidates: List[str] = []
    if sys.platform.startswith("linux"):
        candidates += [
            os.path.expanduser("~/.local/share/Steam"),
            os.path.expanduser("~/.steam/steam"),
            os.path.expanduser("~/.var/app/com.valvesoftware.Steam/.local/share/Steam"),
            os.path.expanduser("~/.var/app/com.valvesoftware.Steam/data/Steam"),
        ]
    elif sys.platform == "win32":
        # Most authoritative: Steam records its install dir in the registry,
        # so a non-default drive (e.g. D:\Games\Steam) still resolves where
        # the ProgramFiles guesses below would miss it.
        candidates += _windows_registry_steam_roots()
        for env in ("ProgramFiles(x86)", "ProgramFiles", "ProgramW6432"):
            base = os.environ.get(env)
            if base:
                candidates.append(os.path.join(base, "Steam"))
        appdata = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if appdata:
            candidates.append(os.path.join(appdata, "Steam"))
    elif sys.platform == "darwin":
        candidates.append(os.path.expanduser("~/Library/Application Support/Steam"))
    # Always include the home-relative POSIX fallback as a final attempt
    # so unconventional layouts still resolve when present.
    candidates.append(os.path.expanduser("~/.local/share/Steam"))
    # Order-preserving de-dupe so registry/env paths keep their priority.
    seen: set = set()
    out: List[str] = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _windows_registry_steam_roots() -> List[str]:
    """Steam install roots from the Windows registry (empty on other OSes)."""
    if sys.platform != "win32":
        return []
    roots: List[str] = []
    try:
        import winreg  # Windows-only stdlib
        for hive, sub, val in (
            (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        ):
            try:
                with winreg.OpenKey(hive, sub) as k:
                    p = winreg.QueryValueEx(k, val)[0]
                    if p:
                        roots.append(os.path.normpath(p))
            except OSError:
                pass
    except Exception:
        pass
    return roots


def _normalize_path(path: Any) -> str:
    """Validate + normalize a user-supplied path so the plugin can only
    read/write inside the user's home directory.

    Strips wrapping quotes, drops the `file://` prefix, resolves `~`
    expansion, and realpath-flattens `..` so traversal attempts can't
    escape the home root. Returns "" on any non-conforming input —
    callers should treat empty as "reject".
    """
    if isinstance(path, dict):
        path = path.get("dest_path") or path.get("src_path") or path.get("path") or path.get("file")
    if not isinstance(path, str):
        return ""
    path = path.strip().strip('"').strip("'")
    if path.startswith("file://"):
        path = path[7:]
    if not path:
        return ""
    try:
        resolved = os.path.realpath(os.path.expanduser(path))
    except Exception:
        return ""
    # Confine to the user's home directory. Realpath collapses `..` so a
    # traversal like `~/../../../etc/passwd` resolves to `/etc/passwd` and
    # gets rejected here. Absolute system paths fall into the same branch.
    home = os.path.realpath(os.path.expanduser("~"))
    if resolved != home and not resolved.startswith(home + os.sep):
        return ""
    return resolved
