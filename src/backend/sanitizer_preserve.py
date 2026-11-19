import json
from typing import Any, Dict, Optional

# Caps for unknown newer-build fields so a hostile document can't bloat the settings file.
_MAX_UNKNOWN_KEYS = 64
_MAX_UNKNOWN_BYTES = 64 * 1024


def _preserve_unknown(raw: Dict[str, Any], known: Dict[str, Any], recognized: Optional[set] = None) -> Dict[str, Any]:
    """Merge fields present in `raw` but not in the validated `known` dict back
    in, so a version that doesn't recognise a field keeps rather than deletes it.
    Bounded by key count, key length and JSON size; non-serialisable values are
    skipped. Known-but-invalid fields are already in `known`, so never touched.

    `recognized`, when given, is an additional set of field names to treat as
    "known" even when absent from `known`'s own keys — needed by callers
    (e.g. the per-shelf loop) that OMIT a recognized field's key entirely
    when its sanitized value would be empty (`visibility`, `sortReverse`,
    …), unlike the root settings dict where every known field is always
    present as a key regardless of value. Without this, an omitted-because-
    empty field would be mistaken for genuinely unknown and its raw,
    unsanitized value spliced back in."""
    if not isinstance(raw, dict):
        return known
    kept = 0
    for key, value in raw.items():
        if not isinstance(key, str) or key in known or (recognized and key in recognized) or len(key) > 64:
            continue
        if kept >= _MAX_UNKNOWN_KEYS:
            break
        try:
            blob = json.dumps(value)
        except (TypeError, ValueError):
            continue
        if len(blob) > _MAX_UNKNOWN_BYTES:
            continue
        known[key] = value
        kept += 1
    return known


def _with_clock(entry: Dict[str, Any], raw: Dict[str, Any]) -> Dict[str, Any]:
    """Carry the per-entity sync clock (`updatedAt`) over when it is a valid
    non-negative integer; the cross-device merge picks the newer copy by it."""
    clock = raw.get("updatedAt")
    if isinstance(clock, (int, float)) and not isinstance(clock, bool) and clock >= 0:
        entry["updatedAt"] = int(clock)
    return entry
