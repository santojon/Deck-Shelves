#!/usr/bin/env python3
"""Cross-platform packager (Linux / macOS / Windows; no bash or zip CLI).

Builds the release bundle, stages the plugin, and writes the installable
zip — every backend `.py` module main.py imports is included and main.py
is marked executable in the archive. Replaces the bash package.sh.
"""
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PKG = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
SLUG, VERSION = PKG["name"], PKG["version"]
STAGE = ROOT / "build" / "package" / SLUG
ZIP = ROOT / f"{SLUG}-v{VERSION}.zip"


def stage() -> None:
    if (ROOT / "build").exists():
        shutil.rmtree(ROOT / "build")
    if ZIP.exists():
        ZIP.unlink()
    STAGE.mkdir(parents=True)
    # plugin.json: drop the debug flag, keep the flags array.
    plugin = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))
    flags = plugin.get("flags")
    plugin["flags"] = [f for f in flags if f != "debug"] if isinstance(flags, list) else []
    (STAGE / "plugin.json").write_text(json.dumps(plugin, indent=2), encoding="utf-8")
    # Backend: every root-level .py module (main.py + paths/storage/sanitizer/
    # launchers/…) plus metadata. The old package.sh shipped only main.py,
    # which crashed on import for installs from the store package.
    for f in ROOT.glob("*.py"):
        shutil.copy(f, STAGE / f.name)
    for f in ("package.json", "LICENSE"):
        shutil.copy(ROOT / f, STAGE / f)
    shutil.copytree(ROOT / "dist", STAGE / "dist", dirs_exist_ok=True)
    if (ROOT / "i18n").is_dir():
        shutil.copytree(ROOT / "i18n", STAGE / "i18n", dirs_exist_ok=True)
    # Plugin icon referenced by plugin.json ("icon": "assets/tab-icon.svg"). Only
    # the designated icon is bundled — the store screenshots stay GitHub-hosted
    # (via publish.image) and the colourful assets/icon.svg is site-only.
    icon = ROOT / "assets" / "tab-icon.svg"
    if icon.is_file():
        (STAGE / "assets").mkdir(exist_ok=True)
        shutil.copy(icon, STAGE / "assets" / "tab-icon.svg")


def make_zip() -> None:
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(STAGE.rglob("*")):
            if p.is_dir():
                continue
            mode = 0o755 if p.name == "main.py" else 0o644
            zi = zipfile.ZipInfo(f"{SLUG}/{p.relative_to(STAGE).as_posix()}")
            zi.external_attr = mode << 16
            zi.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(zi, p.read_bytes())


def main() -> int:
    os.chdir(ROOT)
    subprocess.run(["pnpm", "run", "build:release"], cwd=ROOT, check=True, shell=(os.name == "nt"))
    stage()
    make_zip()
    print(f"[package] Created installable archive: {ZIP.name}")
    return subprocess.run([sys.executable, str(ROOT / "scripts" / "build" / "verify-package.py"), str(ZIP)]).returncode


if __name__ == "__main__":
    raise SystemExit(main())
