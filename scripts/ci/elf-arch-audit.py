#!/usr/bin/env python3
"""Architecture audit for a packaged plugin: lists every ELF (and Mach-O / PE)
binary inside a zip or directory with its machine type, and fails when one
matches a forbidden architecture. The plugin ships Python sources + a JS
bundle, so the expected answer is "no native binaries at all" — any x86-only
artifact sneaking in (a wheel's .so, a vendored tool) would break an ARM64
install (Steam Frame / ARM SteamOS) without this check.

Usage:
  elf-arch-audit.py <zip-or-dir> [--forbid x86_64] [--forbid i386] [--json]
Exit 1 when a forbidden architecture is found, 2 on a bad path.
"""
import argparse
import json
import os
import struct
import sys
import zipfile
from typing import Iterator, Optional, Tuple

ELF_MACHINES = {0x03: "i386", 0x3E: "x86_64", 0x28: "arm", 0xB7: "aarch64", 0xF3: "riscv"}
MACHO_CPU = {0x7: "i386", 0x1000007: "x86_64", 0xC: "arm", 0x100000C: "aarch64"}
PE_MACHINES = {0x14C: "i386", 0x8664: "x86_64", 0x1C0: "arm", 0xAA64: "aarch64"}


def classify(head: bytes) -> Optional[Tuple[str, str]]:
    """(format, arch) for a binary header, or None for non-binary content."""
    if head[:4] == b"\x7fELF" and len(head) >= 20:
        little = head[5] == 1
        machine = struct.unpack("<H" if little else ">H", head[18:20])[0]
        return ("elf", ELF_MACHINES.get(machine, f"elf-0x{machine:x}"))
    if head[:4] in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe") and len(head) >= 8:
        cpu = struct.unpack("<I", head[4:8])[0]
        return ("mach-o", MACHO_CPU.get(cpu, f"macho-0x{cpu:x}"))
    if head[:4] in (b"\xfe\xed\xfa\xcf", b"\xfe\xed\xfa\xce") and len(head) >= 8:
        cpu = struct.unpack(">I", head[4:8])[0]
        return ("mach-o", MACHO_CPU.get(cpu, f"macho-0x{cpu:x}"))
    if head[:4] == b"\xca\xfe\xba\xbe":
        return ("mach-o", "universal")
    if head[:2] == b"MZ" and len(head) >= 0x40:
        off = struct.unpack("<I", head[0x3C:0x40])[0]
        if off + 6 <= len(head) and head[off:off + 4] == b"PE\0\0":
            machine = struct.unpack("<H", head[off + 4:off + 6])[0]
            return ("pe", PE_MACHINES.get(machine, f"pe-0x{machine:x}"))
    return None


def iter_entries(target: str) -> Iterator[Tuple[str, bytes]]:
    if os.path.isdir(target):
        for root, _dirs, files in os.walk(target):
            for name in files:
                path = os.path.join(root, name)
                try:
                    with open(path, "rb") as fh:
                        yield os.path.relpath(path, target), fh.read(0x200)
                except OSError:
                    continue
        return
    with zipfile.ZipFile(target) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            with zf.open(info) as fh:
                yield info.filename, fh.read(0x200)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="zip file or directory to scan")
    ap.add_argument("--forbid", action="append", default=[], help="architecture that must not appear (repeatable)")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()
    if not os.path.exists(args.target):
        print(f"elf-arch-audit: no such path: {args.target}", file=sys.stderr)
        return 2
    found = []
    scanned = 0
    for name, head in iter_entries(args.target):
        scanned += 1
        kind = classify(head)
        if kind:
            found.append({"path": name, "format": kind[0], "arch": kind[1]})
    forbidden = [f for f in found if f["arch"] in set(args.forbid)]
    if args.json:
        print(json.dumps({"scanned": scanned, "binaries": found, "forbidden": forbidden}, indent=2))
    else:
        print(f"elf-arch-audit: scanned {scanned} files, {len(found)} native binaries")
        for f in found:
            print(f"  {f['format']:7} {f['arch']:10} {f['path']}")
        if forbidden:
            print(f"elf-arch-audit: FAIL — {len(forbidden)} binary(ies) of a forbidden architecture ({', '.join(args.forbid)})")
        else:
            print("elf-arch-audit: OK — no forbidden architectures")
    return 1 if forbidden else 0


if __name__ == "__main__":
    sys.exit(main())
