from __future__ import annotations

import configparser
import json
import os
import sqlite3
import sys
from typing import Any, Dict, List, Optional


def _exists_first(candidates: List[str]) -> Optional[str]:
    for c in candidates:
        if not c:
            continue
        try:
            if os.path.exists(c):
                return c
        except Exception:
            continue
    return None


def _home(*parts: str) -> str:
    return os.path.join(os.path.expanduser("~"), *parts)


def _safe_listdir(path: str) -> List[str]:
    try:
        return os.listdir(path) if path and os.path.isdir(path) else []
    except Exception:
        return []


def _safe_json(path: str) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _emudeck_games() -> List[Dict[str, str]]:
    base = _exists_first([
        _home("Emulation/roms"),
        _home(".var/app/com.valvesoftware.Steam/config/EmuDeck/roms"),
        "/run/media/mmcblk0p1/Emulation/roms",
    ])
    if not base:
        return []
    out: List[Dict[str, str]] = []
    for system in _safe_listdir(base):
        sys_dir = os.path.join(base, system)
        for fname in _safe_listdir(sys_dir):
            if fname.startswith(".") or fname.endswith((".m3u.txt", ".bak")):
                continue
            stem, _ext = os.path.splitext(fname)
            if not stem:
                continue
            out.append({"name": stem, "category": system, "id": f"emudeck:{system}:{stem}"})
    return out


def _retrodeck_games() -> List[Dict[str, str]]:
    base = _exists_first([
        _home("retrodeck/roms"),
        _home(".var/app/net.retrodeck.retrodeck/data/retrodeck/roms"),
        _home(".var/app/net.retrodeck.retrodeck/config/retrodeck/roms"),
    ])
    if not base:
        return []
    out: List[Dict[str, str]] = []
    for system in _safe_listdir(base):
        sys_dir = os.path.join(base, system)
        for fname in _safe_listdir(sys_dir):
            if fname.startswith(".") or fname.endswith((".m3u.txt", ".bak")):
                continue
            stem, _ext = os.path.splitext(fname)
            if not stem:
                continue
            out.append({"name": stem, "category": system, "id": f"retrodeck:{system}:{stem}"})
    return out


def _heroic_base() -> Optional[str]:
    return _exists_first([
        _home(".config/heroic"),
        _home(".var/app/com.heroicgameslauncher.hgl/config/heroic"),
    ])


def _heroic_games() -> List[Dict[str, str]]:
    base = _heroic_base()
    if not base:
        return []
    out: List[Dict[str, str]] = []
    for store, fname in (
        ("epic",   "store_cache/legendary_library.json"),
        ("gog",    "store_cache/gog_library.json"),
        ("amazon", "store_cache/nile_library.json"),
    ):
        data = _safe_json(os.path.join(base, fname))
        games = data.get("library") if isinstance(data, dict) else None
        if not isinstance(games, list):
            continue
        for g in games:
            if not isinstance(g, dict):
                continue
            title = g.get("title") or g.get("app_title")
            if not isinstance(title, str) or not title.strip():
                continue
            app_name = g.get("app_name") or g.get("appName")
            out.append({
                "name": title.strip(),
                "category": store,
                "id": f"heroic:{store}:{app_name or title.strip()}",
            })
    return out


def _lutris_db_path() -> Optional[str]:
    return _exists_first([
        _home(".local/share/lutris/pga.db"),
        _home(".var/app/net.lutris.Lutris/data/lutris/pga.db"),
    ])


def _lutris_games() -> List[Dict[str, str]]:
    db = _lutris_db_path()
    if not db:
        return []
    try:
        conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        try:
            rows = conn.execute(
                "SELECT id, slug, name, runner FROM games WHERE hidden = 0 OR hidden IS NULL",
            ).fetchall()
        finally:
            conn.close()
    except Exception:
        return []
    out: List[Dict[str, str]] = []
    for row in rows:
        _id, slug, name, runner = row
        if not isinstance(name, str) or not name.strip():
            continue
        out.append({
            "name": name.strip(),
            "category": str(runner or "lutris"),
            "id": f"lutris:{slug or name.strip()}",
        })
    return out


def _moonlight_games() -> List[Dict[str, str]]:
    base = _exists_first([
        _home(".config/Moonlight Game Streaming Project"),
        _home(".var/app/com.moonlight_stream.Moonlight/config/Moonlight Game Streaming Project"),
    ])
    if not base:
        return []
    cfg = os.path.join(base, "Moonlight.conf")
    if not os.path.exists(cfg):
        return []
    out: List[Dict[str, str]] = []
    try:
        parser = configparser.ConfigParser(strict=False)
        parser.read(cfg, encoding="utf-8")
        for section in parser.sections():
            if not section.startswith("Hosts_"):
                continue
            host_name = parser.get(section, "name", fallback="").strip()
            if not host_name:
                continue
            out.append({
                "name": f"{host_name} (Moonlight)",
                "category": "stream",
                "id": f"moonlight:host:{host_name}",
            })
    except Exception:
        return []
    return out


def _chiaki_games() -> List[Dict[str, str]]:
    base = _exists_first([
        _home(".config/Chiaki"),
        _home(".var/app/re.chiaki.Chiaki/config/Chiaki"),
        _home(".config/chiaki-ng"),
    ])
    if not base:
        return []
    cfg = _exists_first([
        os.path.join(base, "Chiaki.conf"),
        os.path.join(base, "chiaki-ng.conf"),
    ])
    if not cfg:
        return []
    out: List[Dict[str, str]] = []
    try:
        parser = configparser.ConfigParser(strict=False)
        parser.read(cfg, encoding="utf-8")
        for section in parser.sections():
            if "registered_host" not in section.lower():
                continue
            for key, value in parser.items(section):
                if not isinstance(value, str):
                    continue
                if "nickname" in key.lower() and value.strip():
                    out.append({
                        "name": f"{value.strip()} (Chiaki)",
                        "category": "stream",
                        "id": f"chiaki:host:{value.strip()}",
                    })
    except Exception:
        return []
    return out


_DISPATCH = {
    "emudeck":   _emudeck_games,
    "retrodeck": _retrodeck_games,
    "heroic":    _heroic_games,
    "lutris":    _lutris_games,
    "moonlight": _moonlight_games,
    "chiaki":    _chiaki_games,
}


def list_launcher_games(launcher_id: str) -> List[Dict[str, str]]:
    fn = _DISPATCH.get(launcher_id)
    if fn is None:
        return []
    try:
        return fn()[:5000]
    except Exception:
        return []


def list_available_launchers() -> List[str]:
    available: List[str] = []
    for key, fn in _DISPATCH.items():
        try:
            if fn():
                available.append(key)
        except Exception:
            continue
    return available


_ = sys
