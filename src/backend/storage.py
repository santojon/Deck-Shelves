"""Settings-file storage helpers: discover the Decky-managed plugin
settings directory and read/write the primary `settings.json` safely.

`_settings_dir` honours the Decky env var when set; otherwise falls back
to the conventional `~/.config/decky-loader/settings/deck-shelves` so
local-dev outside Decky still works.
"""
import json
import os
import re
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


def _loader_home() -> str:
    """The plugin loader's own directory (`DECKY_HOME`, else `~/homebrew`)."""
    return os.environ.get("DECKY_HOME") or os.path.expanduser("~/homebrew")


def _loader_installed() -> bool:
    """A cheap, honest signal that a plugin loader is installed on this
    machine: Linux only (no loader exists on macOS or Windows, even where an
    earlier backend version left its settings directory behind), with the
    loader's plugins directory present AND either its service binary or its
    version marker."""
    if not sys.platform.startswith("linux"):
        return False
    home = _loader_home()
    if not os.path.isdir(os.path.join(home, "plugins")):
        return False
    services = os.path.join(home, "services")
    return os.path.exists(os.path.join(services, "PluginLoader")) or os.path.exists(os.path.join(services, ".loader.version"))


def _loader_absent(loader_file: str) -> bool:
    """True from a session other than the loader's own when no loader is
    installed here (see `_loader_installed`): nothing would ever read a copy
    placed at `loader_file`, so the loader-side path stays out of the mirrored
    pair and its directory is never created from this side. The loader's own
    session is exempt because that directory is its primary."""
    if os.path.normpath(loader_file) == os.path.normpath(_primary_file()):
        return False
    return not _loader_installed()


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
        # Per-process tmp name: on a dual-host install the other host's backend
        # mirrors into this same directory, and a shared ".tmp" lets the two
        # renames race (one of them finds its tmp already gone).
        tmp_path = f"{path}.{os.getpid()}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(wrapped, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        if _is_corrupt_json(path):
            # Never rotate a broken file over the last known-good `.bak`.
            _quarantine_corrupt_primary(path)
        elif os.path.exists(path):
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
        # Same as the primary writer: no leftover of a failed write.
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
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
        if _loader_absent(loader):
            return
        existing = _read_wrapped(other)
        if existing and existing["rev"] >= rev:
            return
        _atomic_write_wrapped(other, {"state": state, "rev": rev, "updatedAt": updated_at})
    except Exception:
        pass


# Set when a reconcile replaced an unreadable copy with the other side's good
# one; the RPC layer reads it once to tell the user settings were recovered.
_reconcile_recovered = False


def take_reconcile_recovery() -> bool:
    global _reconcile_recovered
    was, _reconcile_recovered = _reconcile_recovered, False
    return was


def _adopt_into(path: str, winner: Dict[str, Any]) -> None:
    global _reconcile_recovered
    if _is_corrupt_json(path):
        _reconcile_recovered = True
    _atomic_write_wrapped(path, winner)


def reconcile_settings() -> Optional[Dict[str, Any]]:
    """Resolve the canonical/loader pair before a read: the higher-`rev`
    side wins and is copied over the other (adopt-by-copy — never a move,
    the loser's own file is simply refreshed to match, so no host's data
    is ever deleted by this). Handles every combination: both present
    (LWW), only one present (adopt into the missing side — first-ever run
    of the second host on a machine that already has the other; on a machine
    without a loader the loader-side path stays out of the pair, see
    `_loader_absent`), or neither (fresh install, caller falls back to
    defaults). Best-effort: any failure here just means the caller reads from
    `_primary_file()` as it always did, so this can never break settings load."""
    try:
        canonical, loader = _mirror_paths()
        absent = _loader_absent(loader)
        c = _read_wrapped(canonical)
        l = None if absent else _read_wrapped(loader)
        if c and l:
            if c["rev"] == l["rev"] and c["state"] == l["state"]:
                return c  # already in step — no write, no `.bak` churn
            winner_path, winner = (canonical, c) if c["rev"] >= l["rev"] else (loader, l)
            loser_path = loader if winner_path == canonical else canonical
            _adopt_into(loser_path, winner)
            return winner
        if c and not l:
            if not absent:
                _adopt_into(loader, c)
            return c
        if l and not c:
            _adopt_into(canonical, l)
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


def _is_corrupt_json(path: str) -> bool:
    """True only when `path` exists but fails to parse as JSON — a missing
    file is normal (fresh install), not corruption. Used by the primary
    settings read/write path to tell "nothing here yet" apart from "there
    IS something here and it's broken", which need very different
    responses: the former is fine with defaults, the latter must never let
    the broken file overwrite a good `.bak` on the next save."""
    if not path or not os.path.exists(path):
        return False
    try:
        with open(path, "r", encoding="utf-8") as f:
            json.load(f)
        return False
    except Exception:
        return True


def _recover_wrapped(primary_path: str) -> Optional[Dict[str, Any]]:
    """Primary is corrupted — try `.bak`, then every `backups/*` snapshot
    newest-first, returning the first one that actually parses and carries
    a non-empty `state`. None if nothing is recoverable (falls back to
    defaults, same as before this existed)."""
    candidates = [primary_path + ".bak"]
    try:
        bdir = _backups_dir()
        if os.path.isdir(bdir):
            named = [f for f in os.listdir(bdir) if _is_backup_file(f)]
            named.sort(key=lambda f: os.path.getmtime(os.path.join(bdir, f)), reverse=True)
            candidates += [os.path.join(bdir, f) for f in named]
    except Exception:
        pass
    for cand in candidates:
        wrapped = _read_wrapped(cand)
        if wrapped and isinstance(wrapped.get("state"), dict) and wrapped["state"]:
            return wrapped
    return None


def _quarantine_corrupt_primary(primary_path: str) -> None:
    """Copy an unreadable primary aside as forensic evidence instead of
    silently discarding it — never into `.bak` (that slot is for the last
    known-GOOD write) and never blocking the caller (best-effort)."""
    try:
        if not primary_path or not os.path.exists(primary_path):
            return
        bdir = _backups_dir()
        os.makedirs(bdir, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        dest = os.path.join(bdir, "settings-" + stamp + "-corrupt.json")
        shutil.copy(primary_path, dest)
        _prune_quarantine(bdir)
    except Exception:
        pass


def _is_quarantine_file(name: str) -> bool:
    return name.startswith("settings-") and name.endswith(".json") and "-corrupt" in name


def _prune_quarantine(bdir: str) -> None:
    """Quarantined copies expire like automatic snapshots and at most QUARANTINE_CAP
    stay (newest kept). A quota of their own: they never count against snapshots."""
    try:
        now = time.time()
        files = []
        for f in os.listdir(bdir):
            if not _is_quarantine_file(f):
                continue
            path = os.path.join(bdir, f)
            if now - os.path.getmtime(path) > QUARANTINE_MAX_AGE_SECONDS:
                _remove_quietly(path)
            else:
                files.append((os.path.getmtime(path), path))
        for _, path in sorted(files, reverse=True)[QUARANTINE_CAP:]:
            _remove_quietly(path)
    except Exception:
        pass


def _remove_quietly(path: str) -> bool:
    try:
        os.remove(path)
        return True
    except Exception:
        return False


def _is_settings_tmp(name: str) -> bool:
    # settings.json.tmp (older builds) and settings.json.<pid>.tmp (per writer).
    if name == "settings.json.tmp":
        return True
    middle = name[len("settings.json."):-len(".tmp")] if name.startswith("settings.json.") and name.endswith(".tmp") else ""
    return middle.isdigit()


def _settings_dirs() -> List[str]:
    """This session's settings folder and both mirrored ones (loader and canonical)."""
    dirs: List[str] = []
    for path in (_primary_file(), *_mirror_paths()):
        d = os.path.normpath(os.path.dirname(path))
        if d not in dirs and os.path.isdir(d):
            dirs.append(d)
    return dirs


def _sweep_stale_tmps(folder: str, min_age: Optional[float] = None) -> int:
    """Remove settings write leftovers older than `min_age` — never this process's
    own (a write of ours may be under way) nor a recent one (maybe the other host's)."""
    removed = 0
    own = f"settings.json.{os.getpid()}.tmp"
    limit = TMP_STALE_SECONDS if min_age is None else min_age
    try:
        now = time.time()
        for f in os.listdir(folder):
            if not _is_settings_tmp(f) or f == own:
                continue
            path = os.path.join(folder, f)
            if now - os.path.getmtime(path) >= limit and _remove_quietly(path):
                removed += 1
    except Exception:
        pass
    return removed


def sweep_leftovers() -> None:
    """Stale write leftovers and expired or excess quarantined copies, in every
    settings folder. Run at start and after each successful save; best-effort."""
    for folder in _settings_dirs():
        _sweep_stale_tmps(folder)
        bdir = os.path.join(folder, "backups")
        if os.path.isdir(bdir):
            _prune_quarantine(bdir)


def sweep_export_tmps(dest: str) -> None:
    """Before an export: leftovers of earlier exports in that same folder only
    (`<name>.json.tmp`), when their `.json` exists or they are stale. Other folders
    are never scanned."""
    folder = os.path.dirname(dest)
    try:
        now = time.time()
        for f in os.listdir(folder):
            if not f.endswith(".json.tmp") or os.path.join(folder, f) == dest + ".tmp":
                continue
            path = os.path.join(folder, f)
            age = now - os.path.getmtime(path)
            finished = os.path.exists(path[:-len(".tmp")])
            # A few seconds of grace: a tmp that young may be another export still writing.
            if age >= TMP_STALE_SECONDS or (finished and age >= 30):
                _remove_quietly(path)
    except Exception:
        pass


def count_quarantined() -> int:
    """How many unreadable settings copies are kept (for diagnostics; never their content)."""
    total = 0
    for folder in _settings_dirs():
        try:
            total += sum(1 for f in os.listdir(os.path.join(folder, "backups")) if _is_quarantine_file(f))
        except Exception:
            pass
    return total


# The salt behind the per-account keys, kept in its own small file beside the settings
# file, never inside it: snapshots, exports, imports and the mirrored settings copy never
# carry it, and a reset leaves it. The frontend keeps a mirror of it in local storage.
ACCOUNT_FILE = "account.json"
_SALT_RE = re.compile(r"^[0-9a-f]{32}$")


def _is_salt(value: Any) -> bool:
    return isinstance(value, str) and bool(_SALT_RE.match(value))


def _read_salt(folder: str) -> str:
    salt = _safe_read_json(os.path.join(folder, ACCOUNT_FILE)).get("salt")
    return salt if _is_salt(salt) else ""


def _write_salt(folder: str, salt: str) -> bool:
    path = os.path.join(folder, ACCOUNT_FILE)
    tmp = f"{path}.{os.getpid()}.tmp"
    try:
        os.makedirs(folder, exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"salt": salt}, f)
            f.flush()
            os.fsync(f.fileno())
        try:
            os.chmod(tmp, 0o600)
        except Exception:
            pass
        os.replace(tmp, path)
        return True
    except Exception as e:
        try:
            logger.error(f"Deck Shelves: could not keep the account salt in {folder}: {type(e).__name__}")
        except Exception:
            pass
        _remove_quietly(tmp)
        return False


def keep_account_salt(candidate: Any) -> str:
    """The salt this device keeps: the first one found (this session's folder first, then
    the other existing settings folder), else `candidate` when it is a valid salt. Folders
    without it get a copy; a salt already kept is never replaced. "" when none is kept."""
    primary = os.path.normpath(_settings_dir())
    folders = [primary] + [d for d in _settings_dirs() if d != primary]
    found = [_read_salt(d) for d in folders]
    salt = next((s for s in found if s), "") or (candidate if _is_salt(candidate) else "")
    if not salt:
        return ""
    kept = any(found)
    for folder, have in zip(folders, found):
        if not have:
            kept = _write_salt(folder, salt) or kept
    return salt if kept else ""


# Versioned settings backups: a rolling history under `<settings>/backups/` so a
# bad edit or a destructive action can be rolled back. Automatic snapshots are
# throttled, expire and go first when the total cap is reached; manual and
# import ones are kept until the user deletes them. Every helper is best-effort
# and never raises, so a backup problem can never block or corrupt a save.
TOTAL_BACKUP_CAP = 10          # max snapshots kept in total (auto + manual + import)
# Taken by the plugin on its own right before a profile switch or an account
# change: automatic for pruning (they expire and go first), never for the daily throttle.
AUTO_SAFETY_TAGS = ("pre-profile", "account-switch")
# Unreadable settings copied aside, and write leftovers: separate quotas from snapshots.
QUARANTINE_CAP = 3
TMP_STALE_SECONDS = 600
AUTO_MAX_AGE_SECONDS = 7 * 86400  # auto snapshots older than 7 days are dropped
QUARANTINE_MAX_AGE_SECONDS = AUTO_MAX_AGE_SECONDS  # a broken copy lasts no longer than a good one
AUTO_THROTTLE_SECONDS = 86400  # min gap between automatic snapshots (24 h)


def _backups_dir() -> str:
    return os.path.join(_settings_dir(), "backups")


def _is_backup_file(name: str) -> bool:
    # Quarantined unreadable files (`-corrupt`) are evidence, not restorable
    # backups: never listed, counted, pruned or tried during recovery.
    return name.startswith("settings-") and name.endswith(".json") and "-corrupt" not in name


def _backup_tag(name: str) -> str:
    # settings-YYYYmmdd-HHMMSS[-tag][-ms].json -> tag ("" for an automatic one)
    parts = name[len("settings-"):-len(".json")].split("-")[2:]
    if parts and parts[-1].isdigit():
        parts = parts[:-1]
    return "-".join(parts)


def _is_auto_backup(name: str) -> bool:
    # Automatic for pruning: the daily snapshot (no tag) and the ones the plugin
    # takes before a profile switch or an account change.
    return _is_backup_file(name) and (_backup_tag(name) == "" or _backup_tag(name) in AUTO_SAFETY_TAGS)


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


def _newest_mtime(bdir: str, tag: str = "") -> float:
    try:
        times = [os.stat(os.path.join(bdir, f)).st_mtime
                 for f in os.listdir(bdir) if _is_backup_file(f) and _backup_tag(f) == tag]
        return max(times) if times else 0.0
    except Exception:
        return 0.0


def _newest_auto_mtime(bdir: str) -> float:
    return _newest_mtime(bdir, "")


def _write_versioned_backup(src_path: str, throttle_seconds: int = 0, tag: str = "",
                            tag_throttle_seconds: int = 0) -> None:
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
        # A tagged kind can carry its own minimum gap (a flapping profile trigger).
        if tag and tag_throttle_seconds > 0 and (time.time() - _newest_mtime(bdir, tag)) < tag_throttle_seconds:
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
    """Delete all: every snapshot (any kind), every quarantined copy and every write
    leftover, in each settings folder (loader and canonical). The live settings and
    their `.bak` stay. Returns how many files were removed."""
    removed = 0
    for folder in _settings_dirs():
        bdir = os.path.join(folder, "backups")
        try:
            for f in list(os.listdir(bdir)):
                if (_is_backup_file(f) or _is_quarantine_file(f)) and _remove_quietly(os.path.join(bdir, f)):
                    removed += 1
        except Exception:
            pass
        # Except this process's own and any written in the last seconds: a write may be under way.
        removed += _sweep_stale_tmps(folder, min_age=5)
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
