#!/usr/bin/env python3
"""Packs the production build into the installable zip and checks it.

Same layout as the store's packer: root files, dist/, py_modules/ and the
contents of defaults/ at the plugin root.

  package.py                 build the zip from an existing `pnpm run build`
  package.py --verify [zip]  only check a zip; add --store for one made by the
                             store's packer, which leaves main.py non-executable
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PKG = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
SLUG, VERSION = PKG["name"], PKG["version"]
ZIP = ROOT / f"{SLUG}-v{VERSION}.zip"
ROOT_FILES = ["LICENSE", "README.md", "main.py", "package.json", "plugin.json"]
REQUIRED = ROOT_FILES + [
    "dist/index.js", "NOTICE.md", "assets/tab-icon.svg",
    "py_modules/paths.py", "py_modules/storage.py", "py_modules/sanitizer.py",
    "py_modules/plugin_host.py",
]


def build_problem() -> str:
    dist = ROOT / "dist"
    if not (dist / "index.js").is_file():
        return "dist/index.js is missing"
    if any(dist.rglob("*.map")):
        return "dist/ is a development build"
    for d in ("py_modules", "defaults"):
        if not (ROOT / d).is_dir():
            return f"{d}/ is missing"
    return ""


def entries() -> list[tuple[str, Path]]:
    out = [(f, ROOT / f) for f in ROOT_FILES]
    out += [(p.name, p) for p in sorted(ROOT.glob("*.py")) if p.name != "main.py"]
    for d in ("dist", "py_modules"):
        out += [(p.relative_to(ROOT).as_posix(), p) for p in sorted((ROOT / d).rglob("*")) if p.is_file() and "__pycache__" not in p.parts]
    defaults = ROOT / "defaults"
    out += [(p.relative_to(defaults).as_posix(), p) for p in sorted(defaults.rglob("*")) if p.is_file()]
    return out


def file_bytes(name: str, path: Path) -> bytes:
    if name != "plugin.json":
        return path.read_bytes()
    plugin = json.loads(path.read_text(encoding="utf-8"))
    flags = plugin.get("flags")
    plugin["flags"] = [f for f in flags if f != "debug"] if isinstance(flags, list) else []
    return json.dumps(plugin, indent=2).encode("utf-8")


def make_zip() -> None:
    ZIP.unlink(missing_ok=True)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name, path in entries():
            info = zipfile.ZipInfo(f"{SLUG}/{name}")
            info.external_attr = (0o755 if name == "main.py" else 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, file_bytes(name, path))
    print(f"[package] Created installable archive: {ZIP.name}")


def check_manifest(zf: zipfile.ZipFile, top: str, names: set) -> list[str]:
    try:
        plugin = json.loads(zf.read(f"{top}/plugin.json"))
    except Exception as e:  # noqa: BLE001 - report any malformed json
        return [f"plugin.json parse error: {e}"]
    errors = []
    flags = plugin.get("flags")
    if not isinstance(flags, list) or "debug" in flags:
        errors.append("plugin.json flags must be an array without 'debug'")
    icon = plugin.get("icon")
    if not icon or f"{top}/{icon}" not in names:
        errors.append(f"plugin.json icon '{icon}' is not in the package")
    return errors


def verify(zip_path: Path, store: bool = False) -> int:
    errors = []
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        top = sorted(names)[0].split("/")[0] if names else ""
        errors += [f"missing {rel}" for rel in REQUIRED if f"{top}/{rel}" not in names]
        main = f"{top}/main.py"
        if not store and main in names and not (zf.getinfo(main).external_attr >> 16) & 0o111:
            errors.append("main.py is not executable")
        if f"{top}/plugin.json" in names:
            errors += check_manifest(zf, top, names)
        if any(n.endswith(".map") for n in names):
            errors.append("the package carries sourcemaps (development build)")
        if f"{top}/package.json" in names and zf.read(f"{top}/package.json").decode("utf-8") != (ROOT / "package.json").read_text(encoding="utf-8"):
            errors.append("package.json differs from the repo")
    for e in errors:
        print(f"[verify] {e}", file=sys.stderr)
    if errors:
        return 3
    print(f"[verify] Package OK: {zip_path.name}")
    return 0


def main(argv: list[str]) -> int:
    if argv and argv[0] == "--verify":
        paths = [a for a in argv[1:] if a != "--store"]
        zip_path = Path(paths[0]) if paths else ZIP
        if not zip_path.is_file():
            print(f"[verify] {zip_path} not found", file=sys.stderr)
            return 2
        return verify(zip_path, store="--store" in argv)
    problem = build_problem()
    if problem:
        print(f"[package] {problem}: run `pnpm run build` first", file=sys.stderr)
        return 2
    make_zip()
    return verify(ZIP)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
