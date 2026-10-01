#!/usr/bin/env python3
"""Prints `{keys, enabled}` for `_sanitize_settings({})` as JSON: the sorted
key list plus the bare `enabled` default.

Used by `src/test/settingsParity.test.ts` (ROADMAP Sprint 2.2) to compare
against the Zod `SettingsSchema`'s own key list — the two must match except
for a small, explicitly-justified exception list the test itself keeps.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "backend"))

from sanitizer import _sanitize_settings  # noqa: E402

out = _sanitize_settings({})
print(json.dumps({"keys": sorted(out.keys()), "enabled": out.get("enabled")}))
