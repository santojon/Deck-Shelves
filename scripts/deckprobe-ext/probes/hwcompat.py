#!/usr/bin/env python3
"""
Deck Shelves — hardware/compat-category probe.

Reports the current device's `SteamClient.System.GetSystemInfo()` fields and
decodes `steam_hw_compat_category_packed` for a sample of owned apps, cross-
checking the decode against the named getters when present.

Bit layout and the one confirmed `eGamingDeviceType` value are from a live
D1 (SSH grep)/D2 (CDP) discovery pass — see `.roadmaps/FRAME-FACTS.md`. Only
Deck LCD (544) has ever been confirmed against real hardware; every other
device type is left unmapped on purpose rather than guessed — filling those
in for real needs either physical Machine/Frame/Deck OLED hardware or a
public Valve SDK header confirming the enum's other numeric values.

Usage:
    python3 scripts/deckprobe-ext/probes/hwcompat.py
    python3 scripts/deckprobe-ext/probes/hwcompat.py --app-count 20
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from deckprobe.probes._base import connect, ev, sep  # noqa: E402

# eGamingDeviceType → human name. Only entries confirmed against a real,
# physical unit belong here — see the module docstring. Add a new one only
# after confirming its value live, the same way 544 was confirmed.
GAMING_DEVICE_TYPES: dict[int, str] = {
    544: "Steam Deck LCD",
    # 545 etc.: Deck OLED / Steam Machine / Steam Frame — unconfirmed, TODO
    # once that hardware (or a public SDK header) is available.
}


def device_type_name(value: int | None) -> str:
    if value is None:
        return "unavailable"
    return GAMING_DEVICE_TYPES.get(value, f"unknown ({value}) — TODO: confirm against real hardware")


def check_system_info(sjc) -> dict:
    sep("SteamClient.System.GetSystemInfo()")
    raw = ev(sjc, """
    (async function() {
      try {
        // GetSystemInfo() is async (resolves over IPC) — must be awaited,
        // not just called, or every field reads back undefined.
        var info = await SteamClient.System.GetSystemInfo();
        return JSON.stringify({
          eGamingDeviceType: info.eGamingDeviceType,
          bIsDeckOled: info.bIsDeckOled,
          sOSVariantId: info.sOSVariantId,
          sProductVendor: info.sProductVendor,
          eHardwareVariant_DoNotUse: info.eHardwareVariant_DoNotUse,
        });
      } catch (e) { return JSON.stringify({ error: String(e) }); }
    })()
    """)
    data = json.loads(raw) if isinstance(raw, str) else raw
    print(json.dumps(data, indent=2))
    if isinstance(data, dict) and "eGamingDeviceType" in data:
        print(f"\n  eGamingDeviceType {data['eGamingDeviceType']} -> {device_type_name(data['eGamingDeviceType'])}")
    return data if isinstance(data, dict) else {}


def decode_packed(packed: int) -> dict:
    """Confirmed bit layout (FRAME-FACTS.md D2): bits 0-1 deck, 2-3 unused,
    4-5 os, 6-7 machine, 8-9 frame — same math as src/steam/index.ts."""
    return {
        "deck": (packed >> 0) & 0x3,
        "os": (packed >> 4) & 0x3,
        "machine": (packed >> 6) & 0x3,
        "frame": (packed >> 8) & 0x3,
    }


def check_compat_categories(sjc, app_count: int) -> None:
    sep(f"steam_hw_compat_category_packed — {app_count} owned apps")
    raw = ev(sjc, """
    JSON.stringify((function() {
      var coll = collectionStore.allAppsCollection || collectionStore.allGamesCollection;
      var raw = coll ? (coll.allApps || coll.visibleApps || coll.apps) : null;
      var list = !raw ? [] : Array.isArray(raw) ? raw
        : (typeof raw.values === 'function' ? Array.from(raw.values()) : Object.values(raw));
      var apps = list.slice(0, %d);
      return apps.map(function(a) {
        return {
          appid: a.appid,
          name: (a.display_name || '').slice(0, 40),
          packed: a.steam_hw_compat_category_packed,
          deck_named: a.steam_deck_compat_category,
          os_named: a.steam_os_compat_category,
          machine_named: a.steam_machine_compat_category,
          frame_named: a.steam_frame_compat_category,
        };
      });
    })())
    """ % app_count)
    apps = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(apps, list):
        print(json.dumps(apps, indent=2))
        return

    mismatches = 0
    for a in apps:
        packed = a.get("packed")
        if packed is None:
            continue
        decoded = decode_packed(packed)
        named = {
            "deck": a.get("deck_named"),
            "os": a.get("os_named"),
            "machine": a.get("machine_named"),
            "frame": a.get("frame_named"),
        }
        ok = all(named[k] is None or named[k] == decoded[k] for k in decoded)
        if not ok:
            mismatches += 1
        flag = "OK" if ok else "MISMATCH"
        print(f"  [{flag}] {a['appid']:>8} {a['name']:<40} packed={packed:<4} decoded={decoded} named={named}")

    print(f"\n  {len(apps)} apps checked, {mismatches} mismatch(es) against the named getters.")


def run(app_count: int) -> int:
    sjc, host, port = connect()
    print(f"Connected: {host}:{port}\n")
    check_system_info(sjc)
    check_compat_categories(sjc, app_count)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-count", type=int, default=15, help="How many owned apps to sample (default 15)")
    args = parser.parse_args()
    sys.exit(run(args.app_count))
