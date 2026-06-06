#!/usr/bin/env python3
"""Unified CDP CLI for Steam Deck debugging.

A small dependency-free wrapper around Chrome DevTools Protocol that covers
the common debugging flow: list targets, eval JS, capture screenshots, and
read console output. Designed to be ergonomic for the debug-by-CDP loop the
plugin's development relies on (find target → run a probe → check the
result), without the verbosity of writing a one-off Python script for
every probe.

Pre-requisites:
- `DECK_HOST` and `DECK_CDP_PORT` set in the repo's `.env` (or env vars).
- The `websocket-client` package on the host (`pip install websocket-client`).

Common surfaces and what they cover:
- `bp` (Big Picture)         — the Steam UI you see on the Deck. Renders
                                shelves, modals, native recents.
- `qam` (Quick Access Menu)  — the right-side panel where the plugin's
                                settings UI lives.
- `sjc` (SharedJSContext)    — the React tree behind both BP and QAM. Best
                                surface for store/state/router probes.
- `mainmenu`                 — the Big Picture main-menu popup.

Subcommands:
- targets             List all CDP targets with friendly aliases.
- eval                Evaluate a JS expression in a target.
- screenshot          Save a PNG of a target's viewport.
- console             Stream `console.{log,warn,error}` and uncaught
                      exceptions from a target until Ctrl-C.

Examples:
- python3 scripts/devtools/deck/cdp.py targets
- python3 scripts/devtools/deck/cdp.py eval bp 'document.title'
- echo 'JSON.stringify({n: document.querySelectorAll(".ds-card").length})' \\
    | python3 scripts/devtools/deck/cdp.py eval bp -
- python3 scripts/devtools/deck/cdp.py screenshot bp /tmp/bp.png
- python3 scripts/devtools/deck/cdp.py console sjc
"""
from __future__ import annotations
import argparse
import base64
import json
import os
import sys
import time
import urllib.request
from typing import Any


def _load_dotenv() -> None:
    """Minimal `.env` parser — populates `os.environ` from the repo's `.env`
    if the user hasn't already exported the variables. Repo root is three
    levels up from this script.
    """
    here = os.path.dirname(__file__)
    env_path = os.path.abspath(os.path.join(here, "..", "..", "..", ".env"))
    if not os.path.isfile(env_path):
        return
    try:
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass


_load_dotenv()
HOST = os.environ.get("DECK_HOST", "127.0.0.1")
PORT = int(os.environ.get("DECK_CDP_PORT", "8081"))


def list_targets() -> list[dict[str, Any]]:
    with urllib.request.urlopen(f"http://{HOST}:{PORT}/json", timeout=5) as r:
        return json.load(r)


# Title fragments the runtime uses to identify each surface — these change
# between Steam builds rarely enough that hard-coding them is acceptable.
ALIASES = {
    "bp":       lambda t: "Big Picture" in (t.get("title") or ""),
    "qam":      lambda t: (t.get("title") or "").startswith("QuickAccess"),
    "sjc":      lambda t: t.get("title") == "SharedJSContext",
    "mainmenu": lambda t: (t.get("title") or "").startswith("MainMenu"),
}


def resolve_target(spec: str) -> dict[str, Any]:
    """Resolve a target ID OR alias (`bp`/`qam`/`sjc`/`mainmenu`) to the
    full target metadata. Raises if no match — listing the alternatives
    so the next call can be a copy-paste away.
    """
    targets = list_targets()
    if spec in ALIASES:
        match = next((t for t in targets if ALIASES[spec](t)), None)
        if not match:
            available = ", ".join(t.get("title", "?")[:30] for t in targets)
            raise SystemExit(f"alias '{spec}' did not match any target. Available: {available}")
        return match
    # Treat as raw target ID — case-insensitive prefix match for ergonomics.
    spec_lower = spec.lower()
    match = next((t for t in targets if (t.get("id", "")).lower().startswith(spec_lower)), None)
    if not match:
        raise SystemExit(f"no target matched '{spec}'. Try: targets")
    return match


def _ws_connect(target: dict[str, Any]):
    # Lazy-import websocket-client so plain `targets` calls work without it.
    try:
        from websocket import create_connection
    except ImportError:
        raise SystemExit("websocket-client not installed. Run: pip install websocket-client")
    return create_connection(target["webSocketDebuggerUrl"], timeout=15)


def cmd_targets(args: argparse.Namespace) -> int:
    """List targets with their alias (if any) for quick copy-paste."""
    targets = list_targets()
    print(f"{'ALIAS':10} {'ID':38} TITLE")
    for t in targets:
        alias = next((a for a, fn in ALIASES.items() if fn(t)), "-")
        title = (t.get("title") or "")[:50]
        print(f"{alias:10} {t.get('id', '?'):38} {title}")
    return 0


def cmd_eval(args: argparse.Namespace) -> int:
    """Evaluate a JS expression and print the returned value as JSON."""
    expr = args.expression
    if expr == "-":
        expr = sys.stdin.read()
    target = resolve_target(args.target)
    ws = _ws_connect(target)
    try:
        ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        ws.recv()
        ws.send(json.dumps({
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True, "awaitPromise": True},
        }))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == 2:
                result = msg.get("result", {}).get("result", {})
                if "value" in result:
                    value = result["value"]
                    if isinstance(value, (dict, list)):
                        print(json.dumps(value, indent=2, ensure_ascii=False, default=str))
                    else:
                        print(value)
                elif "description" in result:
                    print(result["description"], file=sys.stderr)
                    return 1
                else:
                    # Promise rejected without value, or other shape.
                    print(json.dumps(msg, indent=2, ensure_ascii=False), file=sys.stderr)
                    return 1
                break
    finally:
        ws.close()
    return 0


def cmd_screenshot(args: argparse.Namespace) -> int:
    """Save a PNG of the target's viewport to the given path."""
    target = resolve_target(args.target)
    ws = _ws_connect(target)
    try:
        ws.send(json.dumps({"id": 1, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == 1:
                data = msg.get("result", {}).get("data")
                if not data:
                    print(f"capture failed: {msg}", file=sys.stderr)
                    return 1
                with open(args.output, "wb") as f:
                    f.write(base64.b64decode(data))
                print(args.output)
                break
    finally:
        ws.close()
    return 0


def cmd_console(args: argparse.Namespace) -> int:
    """Stream console output and uncaught exceptions from a target.
    Useful while reproducing a UI bug — leave this running, trigger the
    bug in the UI, watch the messages flow.
    """
    target = resolve_target(args.target)
    ws = _ws_connect(target)
    seen = 0
    try:
        ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        ws.send(json.dumps({"id": 2, "method": "Log.enable"}))
        print(f"console for {target.get('title')} — Ctrl-C to stop", file=sys.stderr)
        ws.settimeout(args.duration if args.duration > 0 else None)
        deadline = time.time() + args.duration if args.duration > 0 else None
        while True:
            if deadline and time.time() > deadline:
                break
            try:
                msg = json.loads(ws.recv())
            except Exception:
                break
            method = msg.get("method", "")
            params = msg.get("params", {})
            if method == "Runtime.consoleAPICalled":
                kind = params.get("type", "log")
                if kind not in ("error", "warning", "assert") and not args.all:
                    continue
                args_list = params.get("args", [])
                texts = [a.get("value") or a.get("description") or "" for a in args_list if isinstance(a, dict)]
                print(f"[{kind}] {' | '.join(str(t) for t in texts)[:300]}")
                seen += 1
            elif method == "Runtime.exceptionThrown":
                d = params.get("exceptionDetails", {})
                ex = d.get("exception", {}) if isinstance(d.get("exception"), dict) else {}
                print(f"[exception] {d.get('text', '')} :: {ex.get('description', '')[:300]}")
                seen += 1
            elif method == "Log.entryAdded":
                e = params.get("entry", {})
                level = e.get("level", "log")
                if level in ("error", "warning") or args.all:
                    print(f"[log/{level}] {e.get('text', '')[:300]} {e.get('url', '')[:150]}")
                    seen += 1
    except KeyboardInterrupt:
        pass
    finally:
        ws.close()
    print(f"({seen} message{'s' if seen != 1 else ''} captured)", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Unified CDP CLI for the Steam Deck.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("targets", help="List CDP targets with aliases.").set_defaults(func=cmd_targets)

    p_eval = sub.add_parser("eval", help="Evaluate a JS expression in a target.")
    p_eval.add_argument("target", help="Alias (bp/qam/sjc/mainmenu) or target ID prefix.")
    p_eval.add_argument("expression", help="JS expression. Use '-' to read from stdin.")
    p_eval.set_defaults(func=cmd_eval)

    p_shot = sub.add_parser("screenshot", help="Save a PNG of a target's viewport.")
    p_shot.add_argument("target", help="Alias or target ID prefix.")
    p_shot.add_argument("output", help="Output PNG path.")
    p_shot.set_defaults(func=cmd_screenshot)

    p_log = sub.add_parser("console", help="Stream console output from a target.")
    p_log.add_argument("target", help="Alias or target ID prefix.")
    p_log.add_argument("--duration", type=int, default=0, help="Stop after N seconds (0 = until Ctrl-C).")
    p_log.add_argument("--all", action="store_true", help="Include log/info messages, not just warnings/errors.")
    p_log.set_defaults(func=cmd_console)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
