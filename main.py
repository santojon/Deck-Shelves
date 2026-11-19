import asyncio
import hashlib
import json
import os
import sqlite3
import time
import urllib.request
import urllib.error
import urllib.parse
from typing import Any, Dict, List, Optional

import sys
_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
for _p in (_PLUGIN_DIR, os.path.join(_PLUGIN_DIR, "py_modules"), os.path.join(_PLUGIN_DIR, "src", "backend")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from plugin_host import logger

from paths import _steam_install_candidates, _normalize_path as _normalize_path, _validate_json_export_path
from storage import _settings_dir, _primary_file, _safe_read_json, _backups_dir, _write_versioned_backup, _list_backups, _is_safe_backup_name, _export_backup, _import_backup, _delete_backup, _clear_backups, AUTO_THROTTLE_SECONDS, _read_wrapped, sync_mirror, reconcile_settings, _is_corrupt_json, _recover_wrapped, _quarantine_corrupt_primary, take_reconcile_recovery, sweep_leftovers, sweep_export_tmps, count_quarantined, keep_account_salt
from sanitizer import _sanitize_settings, merge_hub_config
from css_themes import read_css_loader_themes
from display_state import read_display_state
from perf_probe import read_perf_snapshot
from host_os import get_host_os as _host_os
from hardware_info import get_hardware_info as _hardware_info, get_device_identity as _device_identity
from library_location import get_library_locations as _library_locations
from peripherals import get_bluetooth_state as _bt_state, get_audio_state as _audio_state
from shortcuts import shortcut_tags as _shortcut_tags
from ttl_cache import TtlCache, wants_force
from secure_http import _SSL_CTX, _fetch_json_page, _redact_secrets, _build_ssl_context as _build_ssl_context
from release_download import _is_github_asset_url, _is_release_download_url, _safe_zip_name, _RELEASE_ASSET_HOSTS as _RELEASE_ASSET_HOSTS, _RELEASE_DOWNLOAD_PREFIX as _RELEASE_DOWNLOAD_PREFIX
from tabmaster import get_tabmaster_tabs as _tabmaster_tabs
from user_files import _json_export_roots, read_image_b64 as _read_image_b64, read_json_file as _read_json_file, write_json_file as _write_json_file
from steam_session import _STEAM_ID64_BASE, _requested_steam_id64, aes_128_cbc, bcrypt_aes_gcm_decrypt, dpapi_unprotect, get_steam_id64, macos_safe_storage_password

# Cached briefly: the visibility rules call these probes on every shelf evaluation.
_PERF_CACHE = TtlCache(5.0, read_perf_snapshot)
_BLUETOOTH_CACHE = TtlCache(10.0, _bt_state)
_AUDIO_CACHE = TtlCache(10.0, _audio_state)

DEFAULT_SETTINGS: Dict[str, Any] = {"enabled": False, "hideRecents": False, "recentsReplaceSource": False, "hideHomeTabs": False, "shelfHeroBackground": False, "globalMatchNativeSize": False, "globalHighlightFirst": False, "globalHighlightAll": False, "globalHideStatusLine": False, "globalHideNewBadge": False, "globalHideDiscountBadge": False, "globalHideCompatIcons": False, "globalHideNonSteamBadge": False, "globalHideShelfTitle": False, "globalHideGameNames": False, "globalHideInstallIndicator": False, "globalHideSeeMore": False, "globalHideRefreshCard": False, "shelves": [], "smartShelvesEnabled": False, "smartShelvesAtBottom": False, "smartShelves": [], "smartSurpriseMe": False, "smartSurpriseMeCount": 0}


_DOWNLOAD_MAX_BYTES = 200 * 1024 * 1024


def _stream_to(resp, f) -> None:
    total = 0
    while True:
        chunk = resp.read(65536)
        if not chunk:
            return
        total += len(chunk)
        if total > _DOWNLOAD_MAX_BYTES:
            raise ValueError("download exceeds the size cap")
        f.write(chunk)


def _download_to(url: str, dest: str) -> str:
    """Blocking download (run off the asyncio loop). Streams to a .part file then
    atomically renames, so a partial download never looks complete; the final
    URL after redirects must still be a release host, and the size is capped."""
    req = urllib.request.Request(url, headers={"Accept": "application/octet-stream", "User-Agent": "Deck-Shelves"})
    tmp = dest + ".part"
    try:
        with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp, open(tmp, "wb") as f:
            if not _is_github_asset_url(resp.geturl()):
                raise ValueError("download redirected off the release hosts")
            _stream_to(resp, f)
        os.replace(tmp, dest)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
    return dest


class Plugin:
    settings_dir: str = ""

    def _ensure_dirs(self):
        Plugin.settings_dir = _settings_dir()
        os.makedirs(Plugin.settings_dir, exist_ok=True)

    # Set when a corrupt primary was recovered; cleared on first read.
    _corruption_recovered: bool = False

    def _read_state(self) -> Dict[str, Any]:
        self._ensure_dirs()
        reconciled = reconcile_settings()
        if take_reconcile_recovery():
            Plugin._corruption_recovered = True
        if reconciled is not None:
            return _sanitize_settings(reconciled["state"])
        path = _primary_file()
        if not path or not os.path.exists(path):
            return dict(DEFAULT_SETTINGS)
        if _is_corrupt_json(path):
            # An unreadable primary must never rotate into .bak; recover from a backup and quarantine it.
            recovered = _recover_wrapped(path)
            try:
                logger.error(
                    f"Deck Shelves: primary settings file is corrupted ({path}); "
                    + ("recovered from a backup" if recovered else "no backup was recoverable, using defaults")
                )
            except Exception:
                pass
            _quarantine_corrupt_primary(path)
            Plugin._corruption_recovered = True
            if recovered is not None:
                return _sanitize_settings(recovered["state"])
            return dict(DEFAULT_SETTINGS)
        data = _safe_read_json(path)
        state = data.get("state") if isinstance(data.get("state"), dict) else data
        # No shelves with the master toggle off is a normal fresh install, not corruption.
        return _sanitize_settings(state)

    def _write_state(self, state: Dict[str, Any]) -> None:
        self._ensure_dirs()
        clean = _sanitize_settings(state)
        path = _primary_file()
        # Revision metadata lives in the wrapper so the sanitizer allowlist never sees it.
        prev = _read_wrapped(path)
        rev = (prev["rev"] if prev else 0) + 1
        updated_at = time.time()
        wrapped = {"state": clean, "rev": rev, "updatedAt": updated_at}
        tmp_path = f"{path}.{os.getpid()}.tmp"
        bak_path = path + ".bak"
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(wrapped, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            # An unreadable current primary is quarantined instead of becoming the new .bak.
            if os.path.exists(path):
                if _is_corrupt_json(path):
                    _quarantine_corrupt_primary(path)
                else:
                    _write_versioned_backup(path, throttle_seconds=AUTO_THROTTLE_SECONDS)
                    try:
                        os.replace(path, bak_path)
                    except Exception:
                        pass
            os.replace(tmp_path, path)
        except Exception as e:
            try:
                logger.error(f"Failed writing settings to {path}: {e}")
            except Exception:
                pass
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
            raise
        sync_mirror(clean, rev, updated_at)
        sweep_leftovers()

    def _extract_settings(self, settings: Any = None, *args, **kwargs) -> Dict[str, Any]:
        candidates = [settings]
        if args:
            candidates.extend(args)
        if kwargs:
            candidates.append(kwargs.get("settings"))
            candidates.append(kwargs.get("payload"))
            candidates.append(kwargs)
        for candidate in candidates:
            if isinstance(candidate, dict):
                if isinstance(candidate.get("settings"), dict):
                    return candidate["settings"]
                if isinstance(candidate.get("payload"), dict):
                    return candidate["payload"]
                if "enabled" in candidate or "shelves" in candidate:
                    return candidate
        return {}

    async def get_settings(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(self._read_state)

    async def was_settings_recovered(self, *args, **kwargs) -> bool:
        was = Plugin._corruption_recovered
        Plugin._corruption_recovered = False
        return was

    async def keep_account_salt(self, salt: Any = "", *args, **kwargs) -> Dict[str, Any]:
        # The salt is kept beside the settings file, never inside it.
        if isinstance(salt, dict):
            salt = salt.get("salt", "")
        return {"salt": await asyncio.to_thread(keep_account_salt, salt)}

    async def get_css_loader_themes(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(read_css_loader_themes)

    async def get_display_state(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(read_display_state)

    async def get_host_os(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(_host_os)

    async def get_hardware_info(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(_hardware_info)

    async def get_device_identity(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(_device_identity)

    async def get_library_locations(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(_library_locations)

    async def get_perf_snapshot(self, force: Any = False, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(_PERF_CACHE.get, wants_force(force, **kwargs))

    async def get_bluetooth_state(self, force: Any = False, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(_BLUETOOTH_CACHE.get, wants_force(force, **kwargs))

    async def get_audio_state(self, force: Any = False, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(_AUDIO_CACHE.get, wants_force(force, **kwargs))

    def _save_pipeline(self, data: Dict[str, Any], snapshot_kind: str = "") -> bool:
        clean = _sanitize_settings(data)
        try:
            current = self._read_state()
            # The host config entity merges per key with disk, since the frontend may hold a stale copy.
            if isinstance(current, dict) and (current.get("hubConfig") or clean.get("hubConfig")):
                clean["hubConfig"] = merge_hub_config(current.get("hubConfig"), clean.get("hubConfig"))
            if json.dumps(current, sort_keys=True) == json.dumps(clean, sort_keys=True):
                return True
        except Exception:
            pass
        # Snapshot taken here so nothing can be written between it and the save.
        if snapshot_kind in self._SAFETY_KINDS:
            tag, gap = self._SAFETY_KINDS[snapshot_kind]
            _write_versioned_backup(_primary_file(), tag=tag, tag_throttle_seconds=gap)
        self._write_state(clean)
        return True

    async def set_settings(self, settings: Optional[Dict[str, Any]] = None, *args, **kwargs) -> bool:
        data = self._extract_settings(settings, *args, **kwargs)
        if not isinstance(data, dict):
            try:
                logger.error("Deck Shelves set_settings: received non-dict data")
            except Exception:
                pass
            return False
        snapshot_kind = self._extract_snapshot_kind(settings, *args, **kwargs)
        try:
            return await asyncio.to_thread(self._save_pipeline, data, snapshot_kind)
        except Exception as e:
            try:
                logger.error(f"Failed saving settings: {e}")
            except Exception:
                pass
            return False

    def _extract_snapshot_kind(self, settings: Any = None, *args, **kwargs) -> str:
        for candidate in (settings, *args, kwargs):
            if isinstance(candidate, dict) and isinstance(candidate.get("settings"), dict):
                kind = candidate.get("snapshot")
                return kind if isinstance(kind, str) else ""
        return ""

    async def reset_settings(self) -> Dict[str, Any]:
        self._write_state(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)

    async def list_backups(self, *args, **kwargs) -> Dict[str, Any]:
        return await asyncio.to_thread(lambda: {"backups": _list_backups(), "quarantined": count_quarantined()})

    def _extract_name(self, name: Any, *args, **kwargs) -> str:
        # Decky delivers a single-object frontend arg as a positional dict.
        if isinstance(name, dict):
            name = name.get("name", "")
        elif not name and kwargs.get("name"):
            name = kwargs.get("name")
        return str(name or "")

    def _restore_backup(self, name: str) -> Dict[str, Any]:
        if not _is_safe_backup_name(name):
            return {"ok": False, "error": "invalid_name"}
        bpath = os.path.join(_backups_dir(), name)
        if not os.path.exists(bpath):
            return {"ok": False, "error": "not_found"}
        data = _safe_read_json(bpath)
        state = data.get("state") if isinstance(data.get("state"), dict) else data
        if not isinstance(state, dict) or not state:
            return {"ok": False, "error": "invalid_backup"}
        # Goes through the normal save, which snapshots first, so a restore can be undone.
        self._write_state(state)
        return {"ok": True, "state": self._read_state()}

    async def restore_backup(self, name: Any = "", *args, **kwargs) -> Dict[str, Any]:
        resolved = self._extract_name(name, *args, **kwargs)
        return await asyncio.to_thread(self._restore_backup, resolved)

    async def create_backup(self, *args, **kwargs) -> Dict[str, Any]:
        def _do():
            _write_versioned_backup(_primary_file(), tag="manual")
            return {"ok": True, "backups": _list_backups()}
        return await asyncio.to_thread(_do)

    # Kind -> (tag, min seconds between two); tags are fixed so no frontend text reaches a file name.
    _SAFETY_KINDS = {
        "import": ("pre-import", 0),
        "profile": ("pre-profile", 60),
        "account": ("account-switch", 0),
    }

    async def create_pre_import_backup(self, kind: Any = "import", *args, **kwargs) -> Dict[str, Any]:
        # Decky delivers a single-object frontend arg as a positional dict.
        if isinstance(kind, dict):
            kind = kind.get("kind", "import")
        tag, gap = self._SAFETY_KINDS.get(str(kind or "import"), self._SAFETY_KINDS["import"])

        def _do():
            _write_versioned_backup(_primary_file(), tag=tag, tag_throttle_seconds=gap)
            return {"ok": True, "backups": _list_backups()}
        return await asyncio.to_thread(_do)

    async def export_backup(self, name: Any = "", *args, **kwargs) -> bool:
        payload = name if isinstance(name, dict) else {"name": name, **kwargs}
        nm = str(payload.get("name", "") or "")
        dest_raw = str(payload.get("dest") or payload.get("dest_path") or "")
        # Same path allowlist, .json-only and symlink checks as the other JSON export/import RPCs.
        dest = _validate_json_export_path(dest_raw, _json_export_roots())
        if not dest:
            return False
        return await asyncio.to_thread(_export_backup, nm, dest)

    async def delete_backup(self, name: Any = "", *args, **kwargs) -> Dict[str, Any]:
        resolved = self._extract_name(name, *args, **kwargs)

        def _do():
            return {"ok": _delete_backup(resolved), "backups": _list_backups()}
        return await asyncio.to_thread(_do)

    async def clear_backups(self, *args, **kwargs) -> Dict[str, Any]:
        def _do():
            return {"ok": True, "removed": _clear_backups(), "backups": _list_backups()}
        return await asyncio.to_thread(_do)

    async def import_backup(self, src_path: Any = "", *args, **kwargs) -> Dict[str, Any]:
        payload = src_path if isinstance(src_path, dict) else {"src_path": src_path, **kwargs}
        src_raw = str(payload.get("src_path") or payload.get("src") or "")
        # Same path validation as export.
        src = _validate_json_export_path(src_raw, _json_export_roots())

        def _do():
            if not src:
                return {"ok": False, "backups": _list_backups()}
            return {"ok": _import_backup(src), "backups": _list_backups()}
        return await asyncio.to_thread(_do)

    async def get_tabmaster_tabs(self, *args, **kwargs):
        return await asyncio.to_thread(self._get_tabmaster_tabs_sync, *args, **kwargs)

    def _get_tabmaster_tabs_sync(self) -> Dict[str, Any]:  # noqa: C901
        return _tabmaster_tabs()

    async def get_user_home(self) -> str:
        return os.path.expanduser("~")

    async def get_user_desktop(self) -> str:
        for candidate in [os.path.expanduser("~/Downloads"), os.path.expanduser("~/Desktop"), os.path.expanduser("~")]:
            if os.path.exists(candidate):
                return candidate
        return os.path.expanduser("~")

    async def get_user_pictures(self) -> str:
        for candidate in [os.path.expanduser("~/Pictures"), os.path.expanduser("~")]:
            if os.path.exists(candidate):
                return candidate
        return os.path.expanduser("~")

    async def download_release(self, url: str = "", filename: str = "", *args, **kwargs) -> Dict[str, Any]:
        # Only this project's GitHub release assets are accepted, and the name is reduced to a safe basename.
        _ = (args, kwargs)
        if isinstance(url, dict):
            filename = filename or str(url.get("filename") or "")
            url = str(url.get("url") or "")
        if not filename and isinstance(kwargs.get("filename"), str):
            filename = kwargs.get("filename")
        if not isinstance(url, str) or not _is_release_download_url(url):
            return {"ok": False, "error": "untrusted url"}
        safe_name = _safe_zip_name(filename)
        if not safe_name:
            return {"ok": False, "error": "bad filename"}
        dest = os.path.join(await self.get_user_desktop(), safe_name)
        try:
            loop = asyncio.get_event_loop()
            saved = await loop.run_in_executor(None, _download_to, url, dest)
            try:
                logger.info(f"download_release saved: {saved}")
            except Exception:
                pass
            return {"ok": True, "path": saved}
        except Exception as e:
            msg = _redact_secrets(str(e))
            try:
                logger.error(f"download_release failed: {msg}")
            except Exception:
                pass
            return {"ok": False, "error": msg}

    async def get_shortcut_tags(self, *args, **kwargs) -> Dict[str, Any]:
        """Tags on the logged-in account's non-Steam shortcuts, `{appid: [tag]}`."""
        requested = _requested_steam_id64(args[0] if args else kwargs)
        return await asyncio.to_thread(self._get_shortcut_tags_sync, requested)

    def _get_shortcut_tags_sync(self, requested: Optional[str] = None) -> Dict[str, Any]:
        sid64 = self._get_steam_id64(requested)
        if not sid64:
            return {"ok": False, "error": "no Steam account found"}
        account = str(int(sid64) - _STEAM_ID64_BASE)
        for root in _steam_install_candidates():
            path = os.path.join(root, "userdata", account, "config", "shortcuts.vdf")
            if not os.path.isfile(path):
                continue
            try:
                return {"ok": True, "tags": _shortcut_tags(path)}
            except Exception as e:
                logger.info(f"get_shortcut_tags: unreadable shortcuts file ({type(e).__name__})")
                return {"ok": False, "error": "unreadable shortcuts file"}
        return {"ok": True, "tags": {}}

    async def export_settings(self, *args, **kwargs):
        return await asyncio.to_thread(self._export_settings_sync, *args, **kwargs)

    def _export_settings_sync(self, dest_path: Any = None, *args, **kwargs) -> bool:
        path = _validate_json_export_path(dest_path if dest_path is not None else (args[0] if args else kwargs), _json_export_roots())
        if not path:
            return False
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            state = dict(self._read_state())
            # The settings kept for other Steam accounts on this device never leave it.
            state.pop("accountSettings", None)
            export_data = {"state": state}
            sweep_export_tmps(path)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
            return True
        except Exception as e:
            try:
                logger.error(f"Failed exporting settings to {path}: {e}")
            except Exception:
                pass
            return False

    async def import_settings(self, *args, **kwargs):
        return await asyncio.to_thread(self._import_settings_sync, *args, **kwargs)

    def _import_settings_sync(self, src_path: Any = None, *args, **kwargs) -> Dict[str, Any]:
        path = _validate_json_export_path(src_path if src_path is not None else (args[0] if args else kwargs), _json_export_roots())
        if not path or not os.path.exists(path):
            return self._read_state()
        try:
            raw = _safe_read_json(path)
            imported = _sanitize_settings(raw.get("state") if isinstance(raw.get("state"), dict) else raw)
            self._write_state(imported)
            return imported
        except Exception as e:
            try:
                logger.error(f"Failed importing settings from {path}: {e}")
            except Exception:
                pass
            return self._read_state()

    async def write_json_file(self, *args, **kwargs):
        return await asyncio.to_thread(self._write_json_file_sync, *args, **kwargs)

    def _write_json_file_sync(self, path: str = "", content: str = "", *args, **kwargs) -> bool:
        return _write_json_file(path, content, *args, **kwargs)

    async def read_json_file(self, *args, **kwargs):
        return await asyncio.to_thread(self._read_json_file_sync, *args, **kwargs)

    def _read_json_file_sync(self, path: str = "", *args, **kwargs) -> Dict[str, Any]:
        return _read_json_file(path, *args, **kwargs)

    async def read_image_b64(self, *args, **kwargs):
        return await asyncio.to_thread(self._read_image_b64_sync, *args, **kwargs)

    def _read_image_b64_sync(self, path: str = "", *args, **kwargs) -> Dict[str, Any]:
        return _read_image_b64(path, *args, **kwargs)

    def _get_steam_cookie(self, name: str) -> str:
        """Read and decrypt a named cookie from Steam's Chromium cookie store.
        Decryption is OS-dispatched in `_decrypt_chromium_cookie` (Linux + macOS
        implemented; Windows falls back to the public path). Fail-soft — returns
        '' when nothing is readable so callers use the unauthenticated path."""
        cookie_paths = [
            os.path.join(root, "config", "htmlcache", "Default", "Cookies")
            for root in _steam_install_candidates()
        ]
        for path in cookie_paths:
            if not os.path.exists(path):
                continue
            try:
                con = sqlite3.connect(f"file:{path}?immutable=1", uri=True, timeout=3)
                cur = con.execute(
                    "SELECT encrypted_value FROM cookies WHERE name=? AND (host_key LIKE '%steamcommunity%' OR host_key LIKE '%steampowered%') LIMIT 1",
                    (name,),
                )
                row = cur.fetchone()
                con.close()
                if not row or not row[0]:
                    continue
                dec = self._decrypt_chromium_cookie(bytes(row[0]))
                if dec:
                    return dec
            except Exception:
                pass
        return ""

    def _decrypt_chromium_cookie(self, ev: bytes) -> str:
        """Decrypt a Chromium `encrypted_value`, dispatched by OS (Steam's CEF
        stores cookies exactly like Chrome). Linux (SteamOS / Deck) is the
        primary path; macOS derives the key from the Keychain "Safe Storage"
        password; Windows (v10 = AES-256-GCM with a DPAPI-wrapped key in Local
        State — a different scheme) is not yet implemented and returns '' so the
        caller uses the public, unauthenticated path. Always fail-soft."""
        try:
            if not ev:
                return ""
            if ev[:3] not in (b"v10", b"v11"):
                return ev.decode("utf-8", errors="replace")
            body = ev[3:]
            if sys.platform.startswith("linux"):
                key = hashlib.pbkdf2_hmac("sha1", b"peanuts", b"saltysalt", 1, 16)
                return self._aes_128_cbc(key, body)
            if sys.platform == "darwin":
                pw = self._macos_safe_storage_password()
                if not pw:
                    return ""
                key = hashlib.pbkdf2_hmac("sha1", pw, b"saltysalt", 1003, 16)
                return self._aes_128_cbc(key, body)
            if sys.platform == "win32":
                return self._decrypt_windows_gcm(body)
            return ""
        except Exception:
            return ""

    @staticmethod
    def _aes_128_cbc(key: bytes, body: bytes) -> str:
        return aes_128_cbc(key, body)

    @staticmethod
    def _macos_safe_storage_password() -> Optional[bytes]:
        return macos_safe_storage_password()

    @staticmethod
    def _decrypt_windows_gcm(body: bytes) -> str:
        """Windows v10 cookie = AES-256-GCM: nonce(12) + ciphertext + tag(16),
        keyed by a DPAPI-wrapped key in the profile's Local State. Uses native CNG
        via ctypes (no crypto dependency). Fail-soft — '' → public path. NOTE:
        implemented from the Chromium spec but not verified on a real Windows Steam
        install; the '' fallback keeps online features safe if anything is off."""
        try:
            if len(body) < 12 + 16:
                return ""
            key = Plugin._windows_aes_key()
            if not key:
                return ""
            nonce, ciphertext, tag = body[:12], body[12:-16], body[-16:]
            pt = Plugin._bcrypt_aes_gcm_decrypt(key, nonce, ciphertext, tag)
            return pt.decode("utf-8", errors="replace") if pt else ""
        except Exception:
            return ""

    @staticmethod
    def _windows_aes_key() -> bytes:
        """AES key from the CEF profile's Local State: base64 `os_crypt.
        encrypted_key`, minus the b'DPAPI' prefix, unwrapped via CryptUnprotectData."""
        try:
            import base64
            for root in _steam_install_candidates():
                local_state = os.path.join(root, "config", "htmlcache", "Local State")
                if not os.path.exists(local_state):
                    continue
                try:
                    with open(local_state, encoding="utf-8") as f:
                        enc = json.load(f).get("os_crypt", {}).get("encrypted_key")
                    if not enc:
                        continue
                    raw = base64.b64decode(enc)
                    if raw[:5] != b"DPAPI":
                        continue
                    key = Plugin._dpapi_unprotect(raw[5:])
                    if key:
                        return key
                except Exception:
                    continue
        except Exception:
            pass
        return b""

    @staticmethod
    def _dpapi_unprotect(data: bytes) -> bytes:
        return dpapi_unprotect(data)

    @staticmethod
    def _bcrypt_aes_gcm_decrypt(key: bytes, nonce: bytes, ciphertext: bytes, tag: bytes) -> bytes:
        return bcrypt_aes_gcm_decrypt(key, nonce, ciphertext, tag)

    def _get_steam_id64(self, requested: Optional[str] = None) -> Optional[str]:
        return get_steam_id64(requested)

    async def get_wishlist(self, community_url: str = "", *args, **kwargs) -> Dict[str, Any]:  # noqa: C901
        """Fetch the current user's Steam wishlist appids.

        Uses IWishlistService/GetWishlist/v1/ with the account's SteamID64 (from the
        running client, else the userdata/ directory) — no cookie or login required for public profiles.
        Falls back to the JWT from the Chromium cookie store if the public call fails.
        """
        try:
            steam_id64 = self._get_steam_id64(_requested_steam_id64(community_url) or _requested_steam_id64(kwargs))
            if not steam_id64:
                return {"ok": False, "error": "could not determine SteamID64 from userdata"}

            base_url = f"https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid={steam_id64}"

            for attempt, url in enumerate([base_url, None]):
                headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}
                if attempt == 1:
                    # Retry with the cookie JWT for private wishlists.
                    raw_cookie = await asyncio.to_thread(self._get_steam_cookie, "steamLoginSecure")
                    if not raw_cookie:
                        break
                    # The cookie value is URL-encoded, so decode before splitting on ||.
                    cookie = urllib.parse.unquote(raw_cookie)
                    parts = cookie.split("||", 1)
                    jwt = parts[1].strip() if len(parts) > 1 else ""
                    if not jwt:
                        break
                    # This endpoint ignores Bearer auth and only honours access_token as a query param; error paths redact it.
                    url = f"{base_url}&access_token={urllib.parse.quote(jwt)}"

                req = urllib.request.Request(url, headers=headers)
                status, data = await asyncio.to_thread(_fetch_json_page, req)
                if status != 200:
                    continue
                items = data.get("response", {}).get("items", [])
                if not items and attempt == 0:
                    continue
                ids: List[int] = [int(it["appid"]) for it in items if it.get("appid")]
                return {"ok": True, "ids": ids, "count": len(ids), "authed": attempt > 0}

            return {"ok": False, "error": "wishlist empty or private (no auth)"}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": f"HTTP {e.code}"}
        except Exception as e:
            msg = _redact_secrets(str(e))
            try:
                logger.error(f"get_wishlist failed: {msg}")
            except Exception:
                pass
            return {"ok": False, "error": msg}

    async def _main(self):
        self._ensure_dirs()
        if not os.path.exists(_primary_file()):
            self._write_state(self._read_state())
        await asyncio.to_thread(sweep_leftovers)
        try:
            logger.info(f"Deck Shelves backend loaded. Settings dir: {Plugin.settings_dir}")
        except Exception:
            pass

    async def _unload(self):
        try:
            wrapped = _read_wrapped(_primary_file())
            if wrapped:
                sync_mirror(wrapped["state"], wrapped["rev"], wrapped["updatedAt"])
        except Exception:
            pass
        try:
            logger.info("Deck Shelves backend unloaded")
        except Exception:
            pass

    async def _uninstall(self):
        try:
            logger.info("Deck Shelves backend uninstalled")
        except Exception:
            pass

    async def _migration(self):
        pass
