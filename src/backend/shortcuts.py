"""Tags on non-Steam shortcuts, read from Steam's binary `shortcuts.vdf`.

The tools that add shortcuts (ROM managers, launcher integrations) write their
categories into each entry's `tags` map; the Parser categories filter reads
them. Read-only, bounded in file size and output.
"""
from typing import Any, Callable, Dict, List, Tuple

_MAX_FILE_BYTES = 16 * 1024 * 1024
_MAX_TAGS_PER_APP = 32
_MAX_TAG_LEN = 64
_MAX_DEPTH = 8


def _cstring(data: bytes, i: int) -> Tuple[str, int]:
    end = data.index(b"\x00", i)
    return data[i:end].decode("utf-8", "replace"), end + 1


def _int32(data: bytes, i: int) -> Tuple[Any, int]:
    return int.from_bytes(data[i:i + 4], "little", signed=True), i + 4


def _float32(data: bytes, i: int) -> Tuple[Any, int]:
    return None, i + 4


def _uint64(data: bytes, i: int) -> Tuple[Any, int]:
    return int.from_bytes(data[i:i + 8], "little"), i + 8


_SCALARS: Dict[int, Callable[[bytes, int], Tuple[Any, int]]] = {0x01: _cstring, 0x02: _int32, 0x03: _float32, 0x07: _uint64}


def parse_binary_vdf(data: bytes, i: int = 0, depth: int = 0) -> Tuple[Dict[str, Any], int]:
    """One binary-VDF map starting at `i`; returns it and the offset after its end marker."""
    if depth > _MAX_DEPTH:
        raise ValueError("binary VDF nested too deep")
    out: Dict[str, Any] = {}
    while i < len(data):
        kind = data[i]
        i += 1
        if kind == 0x08:
            return out, i
        key, i = _cstring(data, i)
        if kind == 0x00:
            out[key], i = parse_binary_vdf(data, i, depth + 1)
        elif kind in _SCALARS:
            out[key], i = _SCALARS[kind](data, i)
        else:
            raise ValueError(f"unknown binary VDF type {kind}")
    return out, i


def _entry_tags(entry: Dict[str, Any]) -> Tuple[int, List[str]]:
    fields = {str(k).lower(): v for k, v in entry.items()}
    appid, tags = fields.get("appid"), fields.get("tags")
    if not isinstance(appid, int) or not isinstance(tags, dict):
        return 0, []
    names = [v[:_MAX_TAG_LEN] for v in tags.values() if isinstance(v, str) and v.strip()]
    # Shortcut ids are stored signed; Steam reports them as unsigned 32-bit.
    return appid & 0xFFFFFFFF, names[:_MAX_TAGS_PER_APP]


def shortcut_tags(path: str) -> Dict[str, List[str]]:
    """{appid: [tag, ...]} for every shortcut in `path` that carries tags."""
    with open(path, "rb") as f:
        data = f.read(_MAX_FILE_BYTES + 1)
    if len(data) > _MAX_FILE_BYTES:
        return {}
    root, _ = parse_binary_vdf(data)
    shortcuts = next((v for k, v in root.items() if str(k).lower() == "shortcuts"), {})
    out: Dict[str, List[str]] = {}
    for entry in (shortcuts.values() if isinstance(shortcuts, dict) else []):
        if not isinstance(entry, dict):
            continue
        appid, names = _entry_tags(entry)
        if appid and names:
            out[str(appid)] = names
    return out
