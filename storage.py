"""Settings-file storage helpers: discover the Decky-managed plugin
settings directory and read/write the primary `settings.json` safely.

`_settings_dir` honours the Decky env var when set; otherwise falls back
to the conventional `~/.config/decky-loader/settings/deck-shelves` so
local-dev outside Decky still works.
"""
import json
import os
import shutil
import time
from typing import Any, Dict, List

# `decky` is the runtime-injected module from Decky Loader. It exists in
# both prod + dev contexts and exposes `DECKY_PLUGIN_SETTINGS_DIR` plus
# `logger`. Importing here keeps the storage helpers usable from main.py
# without requiring the Plugin class to forward the module reference.
import decky


def _settings_dir() -> str:
    return os.environ.get("DECKY_PLUGIN_SETTINGS_DIR") or getattr(decky, "DECKY_PLUGIN_SETTINGS_DIR", "") or os.path.expanduser("~/.config/decky-loader/settings/deck-shelves")


def _primary_file() -> str:
    return os.path.join(_settings_dir(), "settings.json")


def _safe_read_json(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        try:
            decky.logger.error(f"Failed reading json '{path}': {e}")
        except Exception:
            pass
        return {}


# Versioned settings backups: a rolling history under `<settings>/backups/` so a
# bad edit or a destructive action can be rolled back. Auto snapshots are heavily
# throttled and capped (the plugin runs for months, so we must not accumulate);
# only automatic snapshots are auto-pruned — manual ("-manual") and imported
# ("-import") ones are user-initiated and kept until the user deletes them. Every
# helper is best-effort and never raises, so a backup problem can never block or
# corrupt a settings save.
TOTAL_BACKUP_CAP = 10          # max snapshots kept in total (auto + manual + import)
AUTO_MAX_AGE_SECONDS = 7 * 86400  # auto snapshots older than 7 days are dropped
AUTO_THROTTLE_SECONDS = 86400  # min gap between automatic snapshots (24 h)


def _backups_dir() -> str:
    return os.path.join(_settings_dir(), "backups")


def _is_backup_file(name: str) -> bool:
    return name.startswith("settings-") and name.endswith(".json")


def _is_auto_backup(name: str) -> bool:
    # Automatic snapshots carry no origin tag; manual/imported ones do.
    return _is_backup_file(name) and "-manual" not in name and "-import" not in name


def _summarize_settings(data: Dict[str, Any]) -> Dict[str, int]:
    state = data.get("state") if isinstance(data.get("state"), dict) else data
    if not isinstance(state, dict):
        return {"shelves": 0, "smartShelves": 0, "profiles": 0, "filters": 0}

    def _count(key: str) -> int:
        v = state.get(key)
        return len(v) if isinstance(v, list) else 0

    return {
        "shelves": _count("shelves"),
        "smartShelves": _count("smartShelves"),
        "profiles": _count("profiles"),
        "filters": _count("savedFilters"),
    }


def _prune_auto_backups(bdir: str, cap: int = TOTAL_BACKUP_CAP) -> None:
    """Two-stage prune, best-effort:
    1. Drop automatic snapshots older than AUTO_MAX_AGE_SECONDS (7 days).
    2. Cap the TOTAL (auto + manual + import) at `cap`, deleting the oldest —
       but preferring to delete auto snapshots first so manual / imported ones
       are kept as long as possible."""
    def _mtime(name: str) -> float:
        try:
            return os.path.getmtime(os.path.join(bdir, name))
        except Exception:
            return 0.0
    try:
        now = time.time()
        # Stage 1: age out old automatic snapshots.
        for f in list(os.listdir(bdir)):
            if _is_auto_backup(f) and (now - _mtime(f)) > AUTO_MAX_AGE_SECONDS:
                try:
                    os.remove(os.path.join(bdir, f))
                except Exception:
                    pass
        # Stage 2: enforce the total cap, deleting auto (then oldest) first.
        files = [f for f in os.listdir(bdir) if _is_backup_file(f)]
        excess = len(files) - cap
        if excess > 0:
            # Sort so auto snapshots come before manual/imported, oldest first
            # within each group — deleting from the front keeps manuals longest.
            ordered = sorted(files, key=lambda f: (0 if _is_auto_backup(f) else 1, _mtime(f)))
            for f in ordered[:excess]:
                try:
                    os.remove(os.path.join(bdir, f))
                except Exception:
                    pass
    except Exception:
        pass


def _newest_auto_mtime(bdir: str) -> float:
    try:
        times = [os.stat(os.path.join(bdir, f)).st_mtime
                 for f in os.listdir(bdir) if _is_auto_backup(f)]
        return max(times) if times else 0.0
    except Exception:
        return 0.0


def _write_versioned_backup(src_path: str, throttle_seconds: int = 0, tag: str = "") -> None:
    """Snapshot the current settings file into backups/ (timestamped). Automatic
    snapshots (no tag) are throttled vs the newest auto snapshot, aged out after
    AUTO_MAX_AGE_SECONDS, and — with manual/imported ones — kept within a total
    of TOTAL_BACKUP_CAP (autos deleted first). Best-effort — never raises."""
    try:
        if not src_path or not os.path.exists(src_path):
            return
        bdir = _backups_dir()
        os.makedirs(bdir, exist_ok=True)
        if throttle_seconds > 0 and (time.time() - _newest_auto_mtime(bdir)) < throttle_seconds:
            return
        stamp = time.strftime("%Y%m%d-%H%M%S")
        suffix = ("-" + tag) if tag else ""
        dest = os.path.join(bdir, "settings-" + stamp + suffix + ".json")
        if os.path.exists(dest):
            dest = os.path.join(bdir, "settings-" + stamp + suffix + "-" + str(int(time.time() * 1000) % 1000) + ".json")
        # copy (not copy2): a fresh mtime = the snapshot's creation time, so the
        # throttle measures real elapsed time. copy2 would preserve settings.json's
        # mtime and let rapid saves each slip past the throttle.
        shutil.copy(src_path, dest)
        _prune_auto_backups(bdir)
    except Exception:
        try:
            decky.logger.error("Deck Shelves: backup rotation failed")
        except Exception:
            pass


def _is_safe_backup_name(name: str) -> bool:
    return bool(name) and "/" not in name and "\\" not in name and ".." not in name \
        and name.startswith("settings-") and name.endswith(".json")


def _export_backup(name: str, dest: str) -> bool:
    """Copy a backup out to a user-picked path. Best-effort."""
    if not _is_safe_backup_name(name) or not dest:
        return False
    src = os.path.join(_backups_dir(), name)
    if not os.path.exists(src):
        return False
    try:
        d = os.path.dirname(dest)
        if d:
            os.makedirs(d, exist_ok=True)
        shutil.copy2(src, dest)
        return True
    except Exception:
        return False


def _clear_backups() -> int:
    """Delete every backup file. Returns how many were removed."""
    bdir = _backups_dir()
    removed = 0
    try:
        for f in list(os.listdir(bdir)):
            if _is_backup_file(f):
                try:
                    os.remove(os.path.join(bdir, f))
                    removed += 1
                except Exception:
                    pass
    except Exception:
        pass
    return removed


def _delete_backup(name: str) -> bool:
    if not _is_safe_backup_name(name):
        return False
    p = os.path.join(_backups_dir(), name)
    try:
        if os.path.exists(p):
            os.remove(p)
            return True
    except Exception:
        pass
    return False


def _import_backup(src: str) -> bool:
    """Copy an external settings JSON into backups/ as a new snapshot."""
    try:
        if not src or not os.path.exists(src):
            return False
        data = _safe_read_json(src)
        state = data.get("state") if isinstance(data.get("state"), dict) else data
        if not isinstance(state, dict) or not ("enabled" in state or "shelves" in state):
            return False
        bdir = _backups_dir()
        os.makedirs(bdir, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        dest = os.path.join(bdir, "settings-" + stamp + "-import.json")
        shutil.copy(src, dest)
        _prune_auto_backups(bdir)
        return True
    except Exception:
        return False


def _list_backups() -> List[Dict[str, Any]]:
    """Newest-first list of backups with mtime, size, and a small summary."""
    bdir = _backups_dir()
    out: List[Dict[str, Any]] = []
    try:
        names = sorted(
            (f for f in os.listdir(bdir) if f.startswith("settings-") and f.endswith(".json")),
            reverse=True,
        )
    except Exception:
        return out
    for name in names:
        p = os.path.join(bdir, name)
        try:
            st = os.stat(p)
            out.append({
                "name": name,
                "mtime": int(st.st_mtime),
                "size": int(st.st_size),
                "summary": _summarize_settings(_safe_read_json(p)),
            })
        except Exception:
            continue
    return out
