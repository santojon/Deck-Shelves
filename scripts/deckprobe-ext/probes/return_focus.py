#!/usr/bin/env python3
"""
Deck Shelves — back from a game page to the same card (run from the dev machine).

Opens a card's game page the way the A button does (the card's own activation
handler, read off its React props) and comes back the way the B button does
(a vgp_oncancel on the focused element). The Home must land on that same card,
also for a shelf below the fold whose row was not mounted when the page opened.

Usage:
    python3 scripts/deckprobe-ext/probes/return_focus.py [--shelves 0,2,3] [--card 2] [--back cancel] [--label before] [--out DIR]

Needs DECK_HOST / DECK_CDP_PORT in .env. Read-only for settings; refuses to run
while a game is running. Exit codes: 0 every return landed, 1 one did not, 2 precondition.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from deckprobe.screenshots.lib.cdp import open_session  # noqa: E402

ROUTE = "SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_history.location.pathname"

PICK_JS = r"""((shelfIdx, cardIdx) => {
  const shelves = [...document.querySelectorAll('.ds-shelf[data-shelfid]')];
  const shelf = shelves[shelfIdx]; if (!shelf) return JSON.stringify({ err: 'no shelf', shelves: shelves.length });
  const cards = [...shelf.querySelectorAll('.ds-card[data-appid]')];
  const card = cards[Math.min(cardIdx, cards.length - 1)]; if (!card) return JSON.stringify({ err: 'no card', shelfId: shelf.getAttribute('data-shelfid') });
  const r = card.getBoundingClientRect();
  return JSON.stringify({ shelfId: shelf.getAttribute('data-shelfid'), appid: card.getAttribute('data-appid'), belowFold: r.top > innerHeight, top: Math.round(r.top), cards: cards.length });
})(%d, %d)"""

ACTIVATE_JS = r"""((shelfId, appid) => {
  const card = document.querySelector(`.ds-card[data-shelfid="${shelfId}"][data-appid="${appid}"]`) || document.querySelector(`.ds-shelf[data-shelfid="${shelfId}"] .ds-card[data-appid="${appid}"]`);
  if (!card) return 'no card';
  const fk = Object.keys(card).find(k => k.startsWith('__reactFiber$'));
  for (let f = fk && card[fk], d = 0; f && d < 14; f = f.return, d++) {
    const p = f.memoizedProps;
    if (p && typeof p.onActivate === 'function') { p.onActivate(); return 'activated'; }
  }
  return 'no onActivate';
})(%s, %s)"""

FOCUS_JS = r"""(() => { const a = document.activeElement; const card = a && a.closest && a.closest('.ds-card'); const shelf = card && card.closest('.ds-shelf');
  return JSON.stringify({ appid: card ? card.getAttribute('data-appid') : null, shelfId: shelf ? shelf.getAttribute('data-shelfid') : null, tag: a && !card ? a.tagName + '.' + String(a.className).slice(0, 24) : null, cards: document.querySelectorAll('#deck-shelves-home-root .ds-card').length }); })()"""

# The B button: a cancel event on the focused element, which is what runs Steam's own focus handling.
CANCEL_JS = "(() => { const a = document.activeElement || document.body; a.dispatchEvent(new CustomEvent('vgp_oncancel', { bubbles: true, cancelable: true })); return a.tagName; })()"


def env() -> tuple[str, int]:
    host = os.environ.get("DECK_HOST", "")
    port = int(os.environ.get("DECK_CDP_PORT", "8081") or "8081")
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                v = v.strip().strip("\"'")
                if k.strip() == "DECK_HOST" and not host:
                    host = v
                if k.strip() == "DECK_CDP_PORT" and v:
                    port = int(v)
    return host, port


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shelves", default="0,2")
    ap.add_argument("--card", type=int, default=2)
    ap.add_argument("--label", default="run")
    ap.add_argument("--out", default="")
    ap.add_argument("--back", default="cancel", choices=["cancel", "dfl", "history"], help="how to go back: the B button event on the focused element (what the controller does), Decky's NavigateBack, or Steam's history.goBack (the last two skip Steam's own focus handling)")
    return ap.parse_args()


def wait_route(sjc, prefix: str, timeout_s: float) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if str(sjc.evaluate(ROUTE, timeout=8)).startswith(prefix):
            return True
        time.sleep(0.3)
    return False


def go_back(sjc, bp, mode: str) -> None:
    if mode == "dfl":
        sjc.evaluate("DFL.Navigation.NavigateBack()", timeout=10)
    elif mode == "history":
        sjc.evaluate("SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_history.goBack()", timeout=10)
    else:
        bp.evaluate(CANCEL_JS, timeout=10)


def focus_timeline(bp, pick: dict, seconds: float = 6.0) -> tuple[int | None, list]:
    t0 = time.time()
    timeline: list = []
    while time.time() - t0 < seconds:
        f = json.loads(bp.evaluate(FOCUS_JS, timeout=8))
        entry = (round((time.time() - t0) * 1000), f["appid"], f["shelfId"], f["tag"])
        if not timeline or timeline[-1][1:] != entry[1:]:
            timeline.append(entry)
        if f["appid"] == pick["appid"] and f["shelfId"] == pick["shelfId"]:
            return entry[0], timeline
        time.sleep(0.25)
    return None, timeline


def trial(sjc, bp, idx: int, card: int, back: str) -> dict:
    pick = json.loads(bp.evaluate(PICK_JS % (idx, card), timeout=10))
    if "err" in pick:
        print(f"shelf {idx}: skipped {pick}")
        return {"shelf": idx, "skipped": pick}
    act = bp.evaluate(ACTIVATE_JS % (json.dumps(pick["shelfId"]), json.dumps(pick["appid"])), timeout=10)
    opened = act == "activated" and wait_route(sjc, "/library/app/", 6)
    time.sleep(1.5)
    go_back(sjc, bp, back)
    home = wait_route(sjc, "/library/home", 10)
    landed, timeline = focus_timeline(bp, pick)
    print(f"shelf {idx} ({pick['shelfId']}, card {pick['appid']}, belowFold={pick['belowFold']}): opened={opened} back={home} landed={landed} ms timeline={timeline}")
    time.sleep(2)
    return {"shelf": idx, "pick": pick, "activate": act, "opened": opened, "backHome": home, "landedMs": landed, "timeline": timeline, "final": timeline[-1] if timeline else None}


def ready(sjc) -> str | None:
    if int(sjc.evaluate("SteamUIStore.RunningApps.length", timeout=8)) > 0:
        return "a game is running"
    if str(sjc.evaluate(ROUTE, timeout=8)).startswith("/library/home"):
        return None
    sjc.evaluate("DFL.Navigation.Navigate('/library/home')", timeout=10)
    if not wait_route(sjc, "/library/home", 10):
        return "could not reach the Home"
    time.sleep(3)
    return None


def main() -> int:
    args = parse_args()
    host, port = env()
    if not host:
        print("DECK_HOST missing")
        return 2
    sjc = open_session(host, port, "SharedJSContext")
    bp = open_session(host, port, "Big Picture")
    results = []
    try:
        err = ready(sjc)
        if err:
            print(err)
            return 2
        for idx in [int(x) for x in args.shelves.split(",") if x.strip()]:
            results.append(trial(sjc, bp, idx, args.card, args.back))
    finally:
        bp.close()
        sjc.close()
    judged = [r for r in results if "skipped" not in r]
    ok = bool(judged) and all(r.get("landedMs") is not None for r in judged)
    out_dir = Path(args.out) if args.out else ROOT / ".deploy"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"return-focus-{args.label}.json").write_text(json.dumps({"label": args.label, "back": args.back, "results": results, "ok": ok}, indent=2))
    print("verdict:", "all returns landed" if ok else "a return did not land")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
