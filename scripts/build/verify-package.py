#!/usr/bin/env python3
"""Cross-platform package verifier (stdlib `zipfile`; no unzip CLI).

Checks the installable zip has the required files (incl. every backend
module main.py imports), main.py is executable, plugin.json drops the
debug flag, and package.json matches the repo. Replaces verify-package.sh.
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PKG = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
SLUG, VERSION = PKG["name"], PKG["version"]

REQUIRED = [
    "plugin.json", "package.json", "main.py",
    "paths.py", "storage.py", "sanitizer.py", "launchers.py",
    "dist/index.js", "i18n/en-US/settings.json",
    "assets/icon.svg",
]


def check_plugin_manifest(plugin: dict, top: str, names: set) -> int:
    """Validate the bundled plugin.json: flags array without 'debug', and an
    icon path that resolves to a packaged file. Returns the failure count."""
    fail = 0
    flags = plugin.get("flags")
    if not isinstance(flags, list):
        print("[verify] plugin.json.flags missing or not an array", file=sys.stderr)
        fail += 1
    elif "debug" in flags:
        print('[verify] plugin.json.flags must not include "debug"', file=sys.stderr)
        fail += 1
    else:
        print("[verify] plugin.json flags OK (no debug)")
    # The icon path must resolve to a bundled file so loaders can read it.
    icon_ref = plugin.get("icon")
    if icon_ref and f"{top}/{icon_ref}" in names:
        print(f"[verify] plugin.json icon resolves ({icon_ref})")
    else:
        print(f"[verify] plugin.json icon '{icon_ref}' is missing from the package", file=sys.stderr)
        fail += 1
    return fail


def resolve_zip() -> Path | None:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    exact = ROOT / f"{SLUG}-v{VERSION}.zip"
    if exact.exists():
        return exact
    zips = sorted(ROOT.glob(f"{SLUG}-v*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    return zips[0] if zips else None


def main() -> int:
    zip_path = resolve_zip()
    if not zip_path or not zip_path.exists():
        print(f"Usage: verify-package.py <zip> (or run with {SLUG}-v*.zip present)", file=sys.stderr)
        return 2

    fail = 0
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        top = sorted(names)[0].split("/")[0] if names else ""
        for rel in REQUIRED:
            if f"{top}/{rel}" in names:
                print(f"[verify] Found: {rel}")
            else:
                print(f"[verify] Missing: {rel}", file=sys.stderr)
                fail += 1

        mp = f"{top}/main.py"
        if mp in names and (zf.getinfo(mp).external_attr >> 16) & 0o111:
            print("[verify] main.py is executable")
        else:
            print("[verify] main.py is NOT executable", file=sys.stderr)
            fail += 1

        try:
            plugin = json.loads(zf.read(f"{top}/plugin.json"))
            fail += check_plugin_manifest(plugin, top, names)
        except Exception as e:  # noqa: BLE001 - report any malformed json
            print(f"[verify] plugin.json parse error: {e}", file=sys.stderr)
            fail += 1

        if zf.read(f"{top}/package.json").decode("utf-8") == (ROOT / "package.json").read_text(encoding="utf-8"):
            print("[verify] package.json matches repo")
        else:
            print("[verify] package.json in ZIP differs from repo", file=sys.stderr)
            fail += 1

    if fail:
        print("[verify] Package verification failed", file=sys.stderr)
        return 3
    print(f"[verify] Package OK: {zip_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
