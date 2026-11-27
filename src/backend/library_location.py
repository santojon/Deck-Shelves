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


def _mount_entry(path: str, mounts_file: str = "/proc/mounts") -> tuple:
    # The longest /proc/mounts mount point containing the path owns it, as findmnt decides.
    try:
        with open(mounts_file, encoding="utf-8", errors="ignore") as fh:
            lines = fh.readlines()
    except OSError:
        return "", ""
    best_mount, best_source, best_fstype = "", "", ""
    for line in lines:
        parts = line.split()
        if len(parts) < 3:
            continue
        source, mount_point, fstype = parts[0], parts[1], parts[2]
        if (path == mount_point or path.startswith(mount_point.rstrip("/") + "/")) and len(mount_point) >= len(best_mount):
            best_mount, best_source, best_fstype = mount_point, source, fstype
    return best_source, best_fstype.lower()


def _mount_fstype(path: str, mounts_file: str = "/proc/mounts") -> str:
    return _mount_entry(path, mounts_file)[1]


def _is_sd_card(source: str) -> bool:
    # The Deck's card slot is the MMC block device.
    return os.path.basename(source).startswith("mmcblk")


def _unescape_udev(name: str) -> str:
    # udev writes unsafe bytes in by-label names as \xNN.
    raw = re.sub(rb"\\x([0-9a-fA-F]{2})", lambda m: bytes([int(m.group(1), 16)]), name.encode("utf-8", "surrogateescape"))
    return raw.decode("utf-8", "replace")


def _volume_label(source: str, labels_dir: str = "/dev/disk/by-label") -> str:
    if not source.startswith("/dev/"):
        return ""
    try:
        names = os.listdir(labels_dir)
        target = os.path.realpath(source)
        for name in names:
            if os.path.realpath(os.path.join(labels_dir, name)) == target:
                return _unescape_udev(name).strip()
    except OSError:
        return ""
    return ""


def _categorize(path: str, default_root: Optional[str]) -> str:
    if default_root and os.path.normpath(path) == os.path.normpath(default_root):
        return "internal"
    if _mount_fstype(path) in _NETWORK_FSTYPES:
        return "network"
    return "external"


def get_library_locations() -> Dict[str, Any]:
    """`{ libraries: [{id, label, named, sdCard, path, category, mounted}], appLibrary:
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
        source = _mount_entry(path)[0]
        category = _categorize(path, default_root)
        # The internal library's volume is the system's own partition, so its folder name reads better.
        named = entry.get("label") or ("" if category == "internal" else _volume_label(source))
        libraries.append({
            "id": library_id,
            "label": named or os.path.basename(path.rstrip("/\\")) or path,
            "named": bool(named),
            "sdCard": _is_sd_card(source),
            "path": path,
            "category": category,
            "mounted": os.path.isdir(path),
        })
        apps = entry.get("apps")
        if isinstance(apps, dict):
            for appid in apps.keys():
                app_library[appid] = library_id
    return {"libraries": libraries, "appLibrary": app_library, "supported": True}
