import re
from typing import Any, Dict, List, Optional

_ACCOUNT_KEY = re.compile(r"^[0-9a-f]{16}$")
_ACCOUNT_FIELDS = ("shelves", "smartShelves", "allShelvesOrder", "savedFilters", "savedSmartFilters",
                   "profiles", "activeProfileName", "syncTombstones", "showcaseShelfIds")
_MAX_ACCOUNT_BUCKETS = 16


def _sanitize_account_settings(raw: Any) -> Optional[Dict[str, Any]]:
    """Settings per Steam account: the owner key, the shared mode flag and the other
    accounts' own fields. Keys are the frontend's salted 16-hex hashes (or "legacy"),
    never an account id; bucket values keep only the per-account fields."""
    if not isinstance(raw, dict):
        return None
    out: Dict[str, Any] = {}
    if raw.get("mode") == "shared":
        out["mode"] = "shared"
    owner = raw.get("owner")
    if isinstance(owner, str) and _ACCOUNT_KEY.match(owner):
        out["owner"] = owner
    buckets = raw.get("buckets")
    if isinstance(buckets, dict):
        kept: Dict[str, Any] = {}
        for key, value in buckets.items():
            if len(kept) >= _MAX_ACCOUNT_BUCKETS:
                break
            if not isinstance(key, str) or not (key == "legacy" or _ACCOUNT_KEY.match(key)) or not isinstance(value, dict):
                continue
            kept[key] = {f: value[f] for f in _ACCOUNT_FIELDS if f in value}
        out["buckets"] = kept
    return out


def _sanitize_setup_apply(raw: Any) -> Optional[Dict[str, Any]]:
    """The setup wizard's last apply record (pack id, when, what it added and
    the settings it changed) — kept so the wizard can revert exactly that."""
    if not isinstance(raw, dict) or not isinstance(raw.get("packId"), str):
        return None

    def ids(v: Any) -> List[str]:
        return [str(x)[:64] for x in v if isinstance(x, str)][:64] if isinstance(v, list) else []

    prev_raw = raw.get("prevSettings")
    prev = {str(k)[:64]: v for k, v in prev_raw.items() if isinstance(k, str)} if isinstance(prev_raw, dict) else {}
    at = float(raw["at"]) if isinstance(raw.get("at"), (int, float)) else 0.0
    return {"packId": raw["packId"][:64], "at": at, "addedShelfIds": ids(raw.get("addedShelfIds")), "addedSmartIds": ids(raw.get("addedSmartIds")), "prevSettings": prev}


_HUB_CONFIG_MAX_KEYS = 64


def _sanitize_hub_config(raw: Any) -> Optional[Dict[str, Any]]:
    """A neutral host's own config entity, carried opaquely on the plugin's
    sync: scalar values only, one `updatedAt` clock per key, bounded size."""
    if not isinstance(raw, dict):
        return None
    values_raw = raw.get("values")
    clocks_raw = raw.get("updatedAt")
    if not isinstance(values_raw, dict):
        return None
    values: Dict[str, Any] = {}
    for k, v in values_raw.items():
        if not isinstance(k, str) or not isinstance(v, (bool, int, float, str)) or v is None:
            continue
        values[k[:64]] = v if not isinstance(v, str) else v[:256]
        if len(values) >= _HUB_CONFIG_MAX_KEYS:
            break
    clocks = {str(k)[:64]: float(t) for k, t in clocks_raw.items() if isinstance(k, str) and isinstance(t, (int, float))} if isinstance(clocks_raw, dict) else {}
    return {"values": values, "updatedAt": {k: t for k, t in clocks.items() if k in values}}


def merge_hub_config(current: Any, incoming: Any) -> Optional[Dict[str, Any]]:
    """Per-key last-writer-wins between the on-disk entity and an incoming
    save, so a frontend write that carries a stale copy never rolls back a
    key the host updated meanwhile (ties keep the current one). Either side
    missing → the other; an empty incoming never erases the current."""
    cur = _sanitize_hub_config(current)
    new = _sanitize_hub_config(incoming)
    if new is None or not new["values"]:
        return cur
    if cur is None:
        return new
    values = dict(cur["values"])
    clocks = dict(cur["updatedAt"])
    for k, v in new["values"].items():
        t_new = new["updatedAt"].get(k, 0.0)
        if k not in values or t_new > clocks.get(k, 0.0):
            values[k] = v
            clocks[k] = t_new
    return {"values": values, "updatedAt": clocks}
