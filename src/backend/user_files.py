"""Files the user picks: the JSON files behind export and import, and local images.
Every path is confined to the allowed folders before it is touched."""
import json
import os
from typing import Any, Dict, List

from plugin_host import logger
from paths import _normalize_path, _validate_json_export_path
from storage import _settings_dir, _canonical_settings_dir, _loader_settings_dir, sweep_export_tmps


def _json_export_roots() -> List[str]:
    """Where the JSON-shaped read/write/backup RPCs are allowed to touch:
    the plugin's own settings directory (every host variant, so mirroring
    between a plugin loader and a standalone host keeps working) plus the
    standard folders the export/import file picker actually offers —
    never an arbitrary path like `~/.ssh` or `~/.config/autostart`."""
    roots = []
    try:
        roots.append(_settings_dir())
    except Exception:
        pass
    try:
        roots.append(_canonical_settings_dir())
    except Exception:
        pass
    try:
        roots.append(_loader_settings_dir())
    except Exception:
        pass
    roots += [
        os.path.expanduser("~/Downloads"),
        os.path.expanduser("~/Desktop"),
        os.path.expanduser("~/Documents"),
    ]
    return roots


def write_json_file(path: str = "", content: str = "", *args, **kwargs) -> bool:
    # Decky may bundle content inside the first positional dict; recover it so a 0-byte file is never written.
    if isinstance(path, dict) and not content:
        content = path.get("content", "")
    if not content and isinstance(kwargs.get("content"), str):
        content = kwargs.get("content")
    path = _validate_json_export_path(path if path else (args[0] if args else kwargs.get("path")), _json_export_roots())
    if not path or not isinstance(content, str):
        return False
    try:
        json.loads(content)  # reject anything that isn't actually JSON, even with a .json path
    except (json.JSONDecodeError, ValueError):
        return False
    try:
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)
        sweep_export_tmps(path)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        return True
    except Exception as e:
        try:
            logger.error(f"Failed writing json to {path}: {e}")
        except Exception:
            pass
        return False


def read_json_file(path: str = "", *args, **kwargs) -> Dict[str, Any]:
    path = _validate_json_export_path(path if path else (args[0] if args else kwargs.get("path")), _json_export_roots())
    if not path or not os.path.exists(path):
        return {"ok": False}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {"ok": True, "content": f.read()}
    except Exception as e:
        try:
            logger.error(f"Failed reading json from {path}: {e}")
        except Exception:
            pass
        return {"ok": False}


def read_image_b64(path: str = "", *args, **kwargs) -> Dict[str, Any]:
    # CEF blocks bare file:// URLs on the home shelf, so images go to the frontend as data URLs.
    import base64
    # Symlinks are rejected so a planted link can't redirect the read; the extension/mime allowlist covers the rest.
    path = _normalize_path(path if path else (args[0] if args else kwargs.get("path")), reject_symlinks=True)
    if not path or not os.path.exists(path) or not os.path.isfile(path):
        return {"ok": False}
    try:
        size = os.path.getsize(path)
        if size > 8 * 1024 * 1024:
            return {"ok": False}
        ext = os.path.splitext(path)[1].lower().lstrip(".")
        mime_by_ext = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "webp": "image/webp",
            "gif": "image/gif",
            "bmp": "image/bmp",
        }
        mime = mime_by_ext.get(ext)
        if not mime:
            return {"ok": False}
        with open(path, "rb") as f:
            raw = f.read()
        data_url = "data:" + mime + ";base64," + base64.b64encode(raw).decode("ascii")
        return {"ok": True, "dataUrl": data_url}
    except Exception as e:
        try:
            logger.error(f"Failed reading image from {path}: {e}")
        except Exception:
            pass
        return {"ok": False}
