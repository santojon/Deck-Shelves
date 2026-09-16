"""Settings-file storage helpers: discover the Decky-managed plugin
settings directory and read/write the primary `settings.json` safely.

`_settings_dir` honours the Decky env var when set; otherwise falls back
to the conventional `~/.config/decky-loader/settings/deck-shelves` so
local-dev outside Decky still works.
"""
import json
import os
import shutil
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

# Host abstraction — `plugin_host` try-imports the loader module (when present)
# and otherwise falls back to a stderr logger + env-based settings dir, so these
# helpers run unchanged under the plugin loader and under a neutral runner.
from plugin_host import logger, settings_dir, _loader


def _settings_dir() -> str:
    return settings_dir()


def _primary_file() -> str:
    return os.path.join(_settings_dir(), "settings.json")

def _canonical_settings_dir() -> str:
    """Host-agnostic canonical location — authoritative once established,
    independent of which host launched this session. `DECK_SHELVES_SETTINGS_DIR`
    (the same var `settings_dir()` treats as the neutral-runner canonical
    var) wins when set — under a neutral host session that's exactly this
    directory already, so its `_primary_file()` and this agree without a
    second lookup. Only falls back to a per-OS app-data guess when unset,
    e.g. under plain Decky with no other host involved yet."""
    override = os.environ.get("DECK_SHELVES_SETTINGS_DIR")
    if override:
        return override
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, "deck-shelves")


def _loader_settings_dir() -> str:
    """The plugin-loader-managed settings dir, resolved unconditionally —
    unlike `_settings_dir()`, this always points here regardless of which
    env var the current session actually launched under, so mirroring can
    target it even from a neutral-host session. Mirrors `settings_dir()`'s
    own loader-specific fallback chain (env var, then the loader module's
    attribute) minus the canonical-var check, so this always agrees with
    `_primary_file()` when the current session IS the loader."""
    return (
        os.environ.get("DECKY_PLUGIN_SETTINGS_DIR")
        or getattr(_loader, "DECKY_PLUGIN_SETTINGS_DIR", "")
        or os.path.expanduser("~/.config/decky-loader/settings/deck-shelves")
    )


def _mirror_paths() -> Tuple[str, str]:
    """(canonical_file, loader_file) — the two locations kept in sync."""
    return (
        os.path.join(_canonical_settings_dir(), "settings.json"),
        os.path.join(_loader_settings_dir(), "settings.json"),
    )


def _read_wrapped(path: str) -> Optional[Dict[str, Any]]:
    """Read the `{state, rev, updatedAt}` wrapper from `path`. None when
    missing/unreadable/shapeless. A file written before mirroring existed
    has no `rev`/`updatedAt` — defaults to rev 0 so the first mirrored write
    naturally supersedes it."""
    if not path or not os.path.exists(path):
        return None
    data = _safe_read_json(path)
    state = data.get("state") if isinstance(data.get("state"), dict) else None
    if state is None:
        return None
    try:
        rev = int(data.get("rev") or 0)
    except Exception:
        rev = 0
    try:
        updated_at = float(data.get("updatedAt") or 0)
    except Exception:
        updated_at = 0.0
    return {"state": state, "rev": rev, "updatedAt": updated_at}


def _atomic_write_wrapped(path: str, wrapped: Dict[str, Any]) -> None:
    """Same tmp+fsync+rename discipline as the primary writer, generalised
    to any of the two mirrored paths. Best-effort — logs, never raises, so a
    mirror failure (e.g. the other host's directory not writable yet) can
    never block the primary save the caller actually needs to succeed."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(wrapped, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        if os.path.exists(path):
            try:
                os.replace(path, path + ".bak")
            except Exception:
                pass
        os.replace(tmp_path, path)
    except Exception as e:
        try:
            logger.error(f"Deck Shelves: mirror write failed for {path}: {e}")
        except Exception:
            pass


def sync_mirror(state: Dict[str, Any], rev: int, updated_at: float) -> None:
    """Propagate a just-written primary state to the other mirrored
    location. `rev`-gated: never overwrites a mirror that's already at this
    revision or newer (protects against an old/slow host session racing a
    write after a newer one already landed)."""
    try:
        canonical, loader = _mirror_paths()
        primary = _primary_file()
        other = loader if os.path.normpath(primary) == os.path.normpath(canonical) else canonical
        if os.path.normpath(other) == os.path.normpath(primary):
            return  # dev fallback where both resolve to the same path
        existing = _read_wrapped(other)
        if existing and existing["rev"] >= rev:
            return
        _atomic_write_wrapped(other, {"state": state, "rev": rev, "updatedAt": updated_at})
    except Exception:
        pass


def reconcile_settings() -> Optional[Dict[str, Any]]:
    """Resolve the canonical/loader pair before a read: the higher-`rev`
    side wins and is copied over the other (adopt-by-copy — never a move,
    the loser's own file is simply refreshed to match, so no host's data
    is ever deleted by this). Handles every combination: both present
    (LWW), only one present (adopt into the missing side — first-ever run
    of the second host on a machine that already has the other), or
    neither (fresh install, caller falls back to defaults). Best-effort:
    any failure here just means the caller reads from `_primary_file()`
    as it always did, so this can never break settings load."""
    try:
        canonical, loader = _mirror_paths()
        c = _read_wrapped(canonical)
        l = _read_wrapped(loader)
        if c and l:
            winner_path, winner = (canonical, c) if c["rev"] >= l["rev"] else (loader, l)
            loser_path = loader if winner_path == canonical else canonical
            _atomic_write_wrapped(loser_path, winner)
            return winner
        if c and not l:
            _atomic_write_wrapped(loader, c)
            return c
        if l and not c:
            _atomic_write_wrapped(canonical, l)
            return l
        return None
    except Exception:
        return None


def _safe_read_json(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        try:
            logger.error(f"Failed reading json '{path}': {e}")
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
            logger.error("Deck Shelves: backup rotation failed")
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
