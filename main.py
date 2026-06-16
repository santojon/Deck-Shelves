import asyncio
import hashlib
import json
import os
import sqlite3
import ssl
from subprocess import run as _sp_run
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

# SteamOS ships with an incomplete CA bundle; urllib fails SSL verification
# for steam.* and steamcommunity.* URLs. Since we only call trusted
# first-party Steam endpoints, disabling cert verification is acceptable here.
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

import decky

# Settings-shape normaliser, path discovery + validation, and
# settings.json read helpers — extracted in 2.7.x. Re-exported by name
# so `from main import _sanitize_settings, _normalize_path` continues to
# work for existing pytest suites + any external callers.
from paths import _steam_install_candidates, _normalize_path
from storage import _settings_dir, _primary_file, _safe_read_json
from sanitizer import _sanitize_settings
from launchers import list_launcher_games as _list_launcher_games, list_available_launchers as _list_available_launchers

DEFAULT_SETTINGS: Dict[str, Any] = {"enabled": False, "hideRecents": False, "recentsReplaceSource": False, "hideHomeTabs": False, "shelfHeroBackground": False, "globalMatchNativeSize": False, "globalHighlightFirst": False, "globalHighlightAll": False, "globalHideStatusLine": False, "globalHideNewBadge": False, "globalHideDiscountBadge": False, "globalHideCompatIcons": False, "globalHideNonSteamBadge": False, "globalHideShelfTitle": False, "globalHideGameNames": False, "globalHideInstallIndicator": False, "globalHideSeeMore": False, "globalHideRefreshCard": False, "shelves": [], "smartShelvesEnabled": False, "smartShelvesAtBottom": False, "smartShelves": [], "smartSurpriseMe": False, "smartSurpriseMeCount": 0}


class Plugin:
    settings_dir: str = ""

    def _ensure_dirs(self):
        Plugin.settings_dir = _settings_dir()
        os.makedirs(Plugin.settings_dir, exist_ok=True)

    def _read_state(self) -> Dict[str, Any]:
        self._ensure_dirs()
        path = _primary_file()
        if not path or not os.path.exists(path):
            return dict(DEFAULT_SETTINGS)
        data = _safe_read_json(path)
        state = data.get("state") if isinstance(data.get("state"), dict) else data
        clean = _sanitize_settings(state)
        if clean.get("shelves") or clean.get("enabled"):
            return clean
        return dict(DEFAULT_SETTINGS)

    def _write_state(self, state: Dict[str, Any]) -> None:
        self._ensure_dirs()
        clean = _sanitize_settings(state)
        wrapped = {"state": clean}
        path = _primary_file()
        tmp_path = path + ".tmp"
        bak_path = path + ".bak"
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            # Atomic write: write to .tmp first, then rename over the real file.
            # This guarantees settings.json is never left in a half-written state.
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(wrapped, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            # Keep a backup of the previous good write before replacing it.
            if os.path.exists(path):
                try:
                    os.replace(path, bak_path)
                except Exception:
                    pass
            os.replace(tmp_path, path)
        except Exception as e:
            try:
                decky.logger.error(f"Failed writing settings to {path}: {e}")
            except Exception:
                pass
            # Clean up orphaned .tmp on failure
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
            raise

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
        # `_read_state` opens + parses the settings JSON synchronously; move
        # it off the event loop so a slow read doesn't block every other
        # plugin RPC behind it.
        return await asyncio.to_thread(self._read_state)

    def _save_pipeline(self, data: Dict[str, Any]) -> bool:
        # Whole save pipeline runs in a single worker thread so neither the
        # sanitizer (CPU-bound; ~600 lines of mapping for a large settings
        # blob) nor the disk write blocks the asyncio loop. Returns True
        # when the write either succeeded or was skipped as a no-op.
        clean = _sanitize_settings(data)
        try:
            current = self._read_state()
            if json.dumps(current, sort_keys=True) == json.dumps(clean, sort_keys=True):
                return True
        except Exception:
            pass
        self._write_state(clean)
        return True

    async def set_settings(self, settings: Optional[Dict[str, Any]] = None, *args, **kwargs) -> bool:
        data = self._extract_settings(settings, *args, **kwargs)
        if not isinstance(data, dict):
            try:
                decky.logger.error("Deck Shelves set_settings: received non-dict data")
            except Exception:
                pass
            return False
        try:
            return await asyncio.to_thread(self._save_pipeline, data)
        except Exception as e:
            try:
                decky.logger.error(f"Failed saving settings: {e}")
            except Exception:
                pass
            return False

    async def reset_settings(self) -> Dict[str, Any]:
        self._write_state(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)

    async def get_tabmaster_tabs(self) -> Dict[str, Any]:  # noqa: C901
        """
        Reads TabMaster's settings.json and returns its tab list.
        TabMaster does not expose tabs via React context or IPC — the only
        reliable source is its settings file on disk.
        Returns { tabs: [{ id, title, position, filters, filtersMode }] }
        """
        try:
            decky.logger.info("get_tabmaster_tabs: invoked")
        except Exception:
            pass
        decky_home = os.environ.get("DECKY_HOME") or os.path.expanduser("~/homebrew")
        settings_path = os.path.join(decky_home, "settings", "TabMaster", "settings.json")
        try:
            if not os.path.exists(settings_path):
                try:
                    decky.logger.info(f"get_tabmaster_tabs: file not found at {settings_path}")
                except Exception:
                    pass
                return {"tabs": [], "error": "file_not_found"}
            data = _safe_read_json(settings_path)
            users_dict = data.get("usersDict", {})
            if not users_dict:
                try:
                    decky.logger.info("get_tabmaster_tabs: usersDict empty")
                except Exception:
                    pass
                return {"tabs": [], "error": "no_users"}
            # Use the first (and usually only) user entry
            user_data = next(iter(users_dict.values()))
            raw_tabs = user_data.get("tabs", {})
            tabs = []
            for tab_id, tab in raw_tabs.items():
                if not isinstance(tab, dict):
                    continue
                tabs.append({
                    "id": str(tab.get("id", tab_id)),
                    "title": str(tab.get("title", tab_id)),
                    "position": int(tab.get("position", -1)),
                    "filters": tab.get("filters", []),
                    "filtersMode": str(tab.get("filtersMode", "and")),
                })
            # Sort by position: visible (>= 0) first ascending, then hidden (-1)
            tabs.sort(key=lambda t: (t["position"] < 0, t["position"]))
            try:
                visible = sum(1 for t in tabs if t["position"] >= 0)
                decky.logger.info(f"get_tabmaster_tabs: returning {len(tabs)} tabs ({visible} visible)")
            except Exception:
                pass
            return {"tabs": tabs}
        except Exception as e:
            try:
                decky.logger.error(f"get_tabmaster_tabs failed: {e}")
            except Exception:
                pass
            return {"tabs": [], "error": str(e)}

    async def get_user_home(self) -> str:
        return os.path.expanduser("~")

    async def get_user_desktop(self) -> str:
        for candidate in [os.path.expanduser("~/Desktop"), os.path.expanduser("~/Downloads"), os.path.expanduser("~")]:
            if os.path.exists(candidate):
                return candidate
        return os.path.expanduser("~")

    async def list_launcher_games(self, launcher_id: str = "", *args, **kwargs) -> List[Dict[str, Any]]:
        _ = (args, kwargs)
        if not isinstance(launcher_id, str) or not launcher_id:
            return []
        try:
            return _list_launcher_games(launcher_id)
        except Exception:
            return []

    async def list_available_launchers(self, *args, **kwargs) -> List[str]:
        _ = (args, kwargs)
        try:
            return _list_available_launchers()
        except Exception:
            return []

    async def export_settings(self, dest_path: Any = None, *args, **kwargs) -> bool:
        path = _normalize_path(dest_path if dest_path is not None else (args[0] if args else kwargs))
        if not path:
            return False
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            export_data = {"state": self._read_state()}
            with open(path, "w", encoding="utf-8") as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            try:
                decky.logger.error(f"Failed exporting settings to {path}: {e}")
            except Exception:
                pass
            return False

    async def import_settings(self, src_path: Any = None, *args, **kwargs) -> Dict[str, Any]:
        path = _normalize_path(src_path if src_path is not None else (args[0] if args else kwargs))
        if not path or not os.path.exists(path):
            return self._read_state()
        try:
            raw = _safe_read_json(path)
            imported = _sanitize_settings(raw.get("state") if isinstance(raw.get("state"), dict) else raw)
            self._write_state(imported)
            return imported
        except Exception as e:
            try:
                decky.logger.error(f"Failed importing settings from {path}: {e}")
            except Exception:
                pass
            return self._read_state()

    async def write_json_file(self, path: str = "", content: str = "", *args, **kwargs) -> bool:
        path = _normalize_path(path if path else (args[0] if args else kwargs.get("path")))
        if not path or not isinstance(content, str):
            return False
        try:
            d = os.path.dirname(path)
            if d:
                os.makedirs(d, exist_ok=True)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
            return True
        except Exception as e:
            try:
                decky.logger.error(f"Failed writing json to {path}: {e}")
            except Exception:
                pass
            return False

    async def read_json_file(self, path: str = "", *args, **kwargs) -> Dict[str, Any]:
        path = _normalize_path(path if path else (args[0] if args else kwargs.get("path")))
        if not path or not os.path.exists(path):
            return {"ok": False}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return {"ok": True, "content": f.read()}
        except Exception as e:
            try:
                decky.logger.error(f"Failed reading json from {path}: {e}")
            except Exception:
                pass
            return {"ok": False}

    async def read_image_b64(self, path: str = "", *args, **kwargs) -> Dict[str, Any]:
        # Reads a local image as a base64 data URL so the frontend can
        # render it directly via `<img src="data:...">`. CEF blocks
        # bare `file://` urls under the home shelf, and the decoration
        # editor lets the user pick any image from `~/Pictures` etc.
        # Returns `{ok: true, dataUrl}` on success; `{ok: false}` when
        # the file is missing, oversized, or outside the home dir.
        # Size cap: 8 MiB — anything larger is almost certainly a
        # mistake (Steam Deck card art ranges 30-300 KiB).
        import base64
        path = _normalize_path(path if path else (args[0] if args else kwargs.get("path")))
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
                decky.logger.error(f"Failed reading image from {path}: {e}")
            except Exception:
                pass
            return {"ok": False}

    def _get_steam_cookie(self, name: str) -> str:
        """Read and decrypt a named cookie from Steam's Chromium cookie store.

        Chromium on Linux stores cookies with AES-128-CBC (v10 prefix),
        key derived via PBKDF2-SHA1 from b"peanuts" + salt b"saltysalt", 1 iteration.
        """
        # Path discovery is centralised in `_steam_install_candidates()` so
        # adding a new platform (Windows / macOS / new Flatpak variant) is a
        # one-line change in that helper.
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
                ev = bytes(row[0])
                if ev[:3] != b"v10":
                    return ev.decode("utf-8", errors="replace")
                key = hashlib.pbkdf2_hmac("sha1", b"peanuts", b"saltysalt", 1, 16)
                iv = b" " * 16
                result = _sp_run(
                    ["openssl", "enc", "-aes-128-cbc", "-d",
                     "-K", key.hex(), "-iv", iv.hex(), "-nopad"],
                    input=ev[3:], capture_output=True, timeout=5,
                )
                if result.returncode == 0:
                    dec = result.stdout
                    pad = dec[-1] if dec else 0
                    if 0 < pad <= 16:
                        dec = dec[:-pad]
                    return dec.decode("utf-8", errors="replace")
            except Exception:
                pass
        return ""

    def _get_steam_id64(self) -> Optional[str]:
        """Derive the user's SteamID64 from the Steam userdata directory.

        Steam creates a per-user directory under userdata/ named by SteamID3
        (the lower 32 bits of SteamID64). SteamID64 = SteamID3 + 76561197960265728.
        No cookie or authentication needed — just a directory listing.
        """
        # Same install-root list as `_get_steam_cookie` — first match wins.
        userdata_candidates = [
            os.path.join(root, "userdata") for root in _steam_install_candidates()
        ]
        try:
            userdata = next((p for p in userdata_candidates if os.path.isdir(p)), None)
            if not userdata:
                return None
            candidates = [
                d for d in os.listdir(userdata)
                if d.isdigit() and d != "0" and os.path.isdir(os.path.join(userdata, d))
            ]
            if not candidates:
                return None
            steam_id3 = int(candidates[0])
            return str(76561197960265728 + steam_id3)
        except Exception:
            return None

    async def get_wishlist(self, community_url: str = "", *args, **kwargs) -> Dict[str, Any]:  # noqa: C901
        """Fetch the current user's Steam wishlist appids.

        Uses IWishlistService/GetWishlist/v1/ with the SteamID64 derived from the
        local userdata/ directory — no cookie or login required for public profiles.
        Falls back to the JWT from the Chromium cookie store if the public call fails.
        """
        try:
            steam_id64 = self._get_steam_id64()
            if not steam_id64:
                return {"ok": False, "error": "could not determine SteamID64 from userdata"}

            base_url = f"https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid={steam_id64}"

            for attempt, url in enumerate([base_url, None]):
                if attempt == 1:
                    # Second attempt: try with JWT from cookie (for private wishlists)
                    raw_cookie = self._get_steam_cookie("steamLoginSecure")
                    if not raw_cookie:
                        break
                    parts = raw_cookie.split("||", 1)
                    jwt = parts[1].strip() if len(parts) > 1 else ""
                    if not jwt:
                        break
                    url = f"{base_url}&access_token={jwt}"

                req = urllib.request.Request(
                    url,
                    headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
                )
                with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
                    if resp.status != 200:
                        continue
                    body = resp.read().decode("utf-8")
                    data = json.loads(body)
                    items = data.get("response", {}).get("items", [])
                    if not items and attempt == 0:
                        continue  # might be private, try with auth
                    ids: List[int] = [int(it["appid"]) for it in items if it.get("appid")]
                    return {"ok": True, "ids": ids, "count": len(ids), "authed": attempt > 0}

            return {"ok": False, "error": "wishlist empty or private (no auth)"}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": f"HTTP {e.code}"}
        except Exception as e:
            try:
                decky.logger.error(f"get_wishlist failed: {e}")
            except Exception:
                pass
            return {"ok": False, "error": str(e)}

    async def _main(self):
        self._ensure_dirs()
        if not os.path.exists(_primary_file()):
            self._write_state(self._read_state())
        try:
            decky.logger.info(f"Deck Shelves backend loaded. Settings dir: {Plugin.settings_dir}")
        except Exception:
            pass

    async def _unload(self):
        try:
            decky.logger.info("Deck Shelves backend unloaded")
        except Exception:
            pass

    async def _uninstall(self):
        try:
            decky.logger.info("Deck Shelves backend uninstalled")
        except Exception:
            pass

    async def _migration(self):
        pass
