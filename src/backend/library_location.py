"""Steam library location — reads `libraryfolders.vdf` to map installed apps
to the Steam library folder that holds them, categorized Internal / External /
Network. Filesystem-level (VDF parsing), so this can only run here in the
plugin's own Python backend, not the renderer. Read-only, fail-soft, no
background poll — called on demand by the frontend filter/trigger resolvers.

"External" covers both SD cards and USB/external SSDs — distinguishing those
reliably needs device-level introspection (e.g. matching the underlying block
device against the SD-card slot's kernel name), which is Deck-specific and
not attempted here; every non-internal, non-network library is "external".
"""
import os
import re
from typing import Any, Dict, List, Optional

from paths import _steam_install_candidates

_TOKEN_RE = re.compile(r'"((?:[^"\\]|\\.)*)"|([{}])')
_NETWORK_FSTYPES = {"nfs", "nfs4", "cifs", "smb3", "smbfs", "afpfs"}


def _parse_vdf(text: str) -> Dict[str, Any]:
    """Minimal recursive-descent parser for Valve's VDF/KeyValues text
    format — enough for libraryfolders.vdf's flat, quoted shape. Not a
    general VDF parser (no macros/conditionals); fails soft on malformed
    input by producing a partial tree rather than raising."""
    root: Dict[str, Any] = {}
    stack: List[Dict[str, Any]] = [root]
    pending_key: Optional[str] = None
    for quoted, brace in _TOKEN_RE.findall(text):
        if brace == "{":
            new_obj: Dict[str, Any] = {}
            if pending_key is not None:
                stack[-1][pending_key] = new_obj
            stack.append(new_obj)
            pending_key = None
        elif brace == "}":
            pending_key = None
            if len(stack) > 1:
                stack.pop()
        elif pending_key is None:
            pending_key = quoted
        else:
            stack[-1][pending_key] = quoted
            pending_key = None
    return root


def _find_libraryfolders_vdf() -> Optional[str]:
    for root in _steam_install_candidates():
        path = os.path.join(root, "steamapps", "libraryfolders.vdf")
        if os.path.exists(path):
            return path
    return None


def _mount_fstype(path: str, mounts_file: str = "/proc/mounts") -> str:
    # Best-effort, Linux only: the longest /proc/mounts entry whose mount
    # point contains `path` owns it — same "longest prefix wins" logic
    # `findmnt` uses internally. `mounts_file` is overridable for tests.
    try:
        with open(mounts_file, encoding="utf-8", errors="ignore") as fh:
            lines = fh.readlines()
    except OSError:
        return ""
    best_mount, best_fstype = "", ""
    for line in lines:
        parts = line.split()
        if len(parts) < 3:
            continue
        mount_point, fstype = parts[1], parts[2]
        if (path == mount_point or path.startswith(mount_point.rstrip("/") + "/")) and len(mount_point) >= len(best_mount):
            best_mount, best_fstype = mount_point, fstype
    return best_fstype.lower()


def _categorize(path: str, default_root: Optional[str]) -> str:
    if default_root and os.path.normpath(path) == os.path.normpath(default_root):
        return "internal"
    if _mount_fstype(path) in _NETWORK_FSTYPES:
        return "network"
    return "external"


def get_library_locations() -> Dict[str, Any]:
    """`{ libraries: [{id, label, path, category, mounted}], appLibrary:
    {"<appid>": libraryId} }`. Never raises — `supported: False` (and both
    lists empty) when `libraryfolders.vdf` can't be found or read."""
    vdf_path = _find_libraryfolders_vdf()
    if not vdf_path:
        return {"libraries": [], "appLibrary": {}, "supported": False}
    try:
        with open(vdf_path, encoding="utf-8", errors="ignore") as fh:
            text = fh.read()
    except OSError:
        return {"libraries": [], "appLibrary": {}, "supported": False}

    tree = _parse_vdf(text)
    root_obj = tree.get("libraryfolders") or tree.get("LibraryFolders") or {}
    # steamapps/libraryfolders.vdf -> the Steam install root two levels up.
    default_root = os.path.dirname(os.path.dirname(vdf_path))

    libraries: List[Dict[str, Any]] = []
    app_library: Dict[str, str] = {}
    for key, entry in root_obj.items():
        if not isinstance(entry, dict):
            continue
        path = entry.get("path")
        if not isinstance(path, str) or not path:
            continue
        library_id = entry.get("contentid") or key
        libraries.append({
            "id": library_id,
            "label": entry.get("label") or os.path.basename(path.rstrip("/\\")) or path,
            "path": path,
            "category": _categorize(path, default_root),
            "mounted": os.path.isdir(path),
        })
        apps = entry.get("apps")
        if isinstance(apps, dict):
            for appid in apps.keys():
                app_library[appid] = library_id
    return {"libraries": libraries, "appLibrary": app_library, "supported": True}
