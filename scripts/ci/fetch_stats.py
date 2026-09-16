#!/usr/bin/env python3
"""Snapshot Deck Shelves' public usage numbers — GitHub traffic for the main
repo and its two published sibling packages, npm downloads for those
packages, and the Decky Store's own install count. Every source is already
free and needs no new account: `gh api` (already authenticated in CI), the
npm registry's public downloads API, and the Decky Store's own public plugin
list (plugins.deckbrew.xyz).

Runs on the weekly CI report's own schedule (persists a history.json entry
for the dashboard trend) and again, read-only, right before every site
deploy (pages.yml) so a deploy never ships numbers from whenever the weekly
run last happened. These numbers change slowly and GitHub's traffic API only
ever reports a 14-day rolling window, so neither caller needs it more often
than that. Never hard-fails: any single source that errors is simply omitted
from the snapshot ('gh api' needs push access to a repo to read its traffic,
so the two sibling repos may be unreachable from a narrower CI token even
when the main repo isn't).

Usage: python3 scripts/ci/fetch_stats.py [--root .]
       python3 scripts/ci/fetch_stats.py --backfill | --backfill-npm | --backfill-github-downloads
Each snapshot also carries an additive per-version breakdown of the GitHub
download total — `versionDownloads: {stable: {...}, beta: {...}}` — plus the
Decky Store's `updates` count (`deckyStoreUpdates`), and its `versions`
array if it ever holds more than the one published version. None of this
changes `githubDownloads` / `deckyStoreInstalls` or the badges below.

Writes:
  site/reports/stats/history.json  — one entry appended per run (dashboard trend)
  site/stats/decky-store.json      — shields.io "endpoint" badge JSON (installs)
  site/stats/traffic.json          — shields.io "endpoint" badge JSON (14-day views)
Both site/stats/*.json are served by GitHub Pages alongside the rest of the
site — not a new external host, just another file in the same publish.

--backfill fills in past points instead of taking a fresh snapshot, for the
two sources that actually support it — GitHub traffic and Decky Store
installs have no historical API at all, nothing to backfill there:
  * npm: the registry's downloads API answers "total from date X to date Y"
    for any past range, so a real (not estimated) weekly history is
    recoverable back to each package's publish date.
  * GitHub release downloads: no true point-in-time total exists (a
    release's count keeps growing after it's superseded), but the repo's
    own release history gives a real cumulative growth curve — the running
    sum of every release's current download count, by release date.
--backfill-npm / --backfill-github-downloads run just one. Safe to re-run;
merges/recomputes by date, doesn't double-count.
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPOS = {"main": "santojon/Deck-Shelves", "api": "santojon/Deck-Shelves-API",
         "host": "santojon/Deck-Shelves-HOST", "shelveshub": "santojon/ShelvesHub"}
NPM_PACKAGES = {"api": "@deck-shelves/api", "host": "@deck-shelves/host"}
DECKY_STORE_URL = "https://plugins.deckbrew.xyz/plugins"
DECKY_PLUGIN_NAME = "Deck Shelves"
MAX_HISTORY = 104  # ~2 years of weekly snapshots


def _root() -> Path:
    if "--root" in sys.argv:
        return Path(sys.argv[sys.argv.index("--root") + 1]).resolve()
    return Path(__file__).resolve().parents[2]


def _get_json(url: str, timeout: float = 10.0):
    req = urllib.request.Request(url, headers={"User-Agent": "deck-shelves-stats"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _gh_api(path: str) -> dict | None:
    try:
        res = subprocess.run(["gh", "api", path], capture_output=True, text=True, timeout=20)
    except Exception:
        return None
    if res.returncode != 0 or not res.stdout.strip():
        return None
    try:
        return json.loads(res.stdout)
    except Exception:
        return None


def _fetch_traffic(repo: str) -> dict | None:
    views = _gh_api(f"repos/{repo}/traffic/views")
    clones = _gh_api(f"repos/{repo}/traffic/clones")
    if not views and not clones:
        return None
    out: dict = {}
    if views:
        out["views"] = views.get("count", 0)
        out["viewsUniques"] = views.get("uniques", 0)
    if clones:
        out["clones"] = clones.get("count", 0)
        out["clonesUniques"] = clones.get("uniques", 0)
    return out or None


def _npm_created_date(package: str) -> str | None:
    try:
        data = _get_json(f"https://registry.npmjs.org/{package}")
        created = data.get("time", {}).get("created")
        return created[:10] if created else None
    except (urllib.error.URLError, ValueError, KeyError, TypeError):
        return None


def _fetch_npm_downloads(package: str) -> int | None:
    """Lifetime total downloads (matches shields.io's npm "dt" badge), not
    just a monthly point — npm has no direct "total" endpoint, so this
    queries the download count from the package's own publish date to
    today. The registry API silently clamps a custom range to ~18 months
    back; both our packages are younger than that today, so this is a true
    lifetime figure for now and will read as "last ~18 months" once they
    age past it — still the best available without our own history."""
    created = _npm_created_date(package)
    if not created:
        return None
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        data = _get_json(f"https://api.npmjs.org/downloads/point/{created}:{today}/{package}")
        return int(data.get("downloads", 0))
    except (urllib.error.URLError, ValueError, KeyError, TypeError):
        return None


def _fetch_decky_plugin() -> dict | None:
    """The Deck Shelves entry from the Decky Store's public plugin list, or
    None. Callers pull whatever fields they need — `downloads` (installs),
    `updates`, and the `versions` array (today it only ever holds the single
    published version, but if the Store ever exposes more than one, the
    per-version breakdown lands in the snapshot automatically)."""
    try:
        plugins = _get_json(DECKY_STORE_URL)
    except (urllib.error.URLError, ValueError):
        return None
    for p in plugins if isinstance(plugins, list) else []:
        if p.get("name") == DECKY_PLUGIN_NAME:
            return p
    return None


def _fetch_decky_store_installs() -> int | None:
    p = _fetch_decky_plugin()
    return p.get("downloads") if p else None


def _gh_releases(repo: str) -> list | None:
    """Raw `repos/{repo}/releases` list (all pages), or None on any failure."""
    try:
        res = subprocess.run(["gh", "api", f"repos/{repo}/releases", "--paginate"],
                             capture_output=True, text=True, timeout=30)
    except Exception:
        return None
    if res.returncode != 0 or not res.stdout.strip():
        return None
    try:
        releases = json.loads(res.stdout)
    except Exception:
        return None
    return releases if isinstance(releases, list) else None


def _fetch_github_downloads(repo: str) -> int | None:
    """Sum every release asset's download_count — the same total the
    README's own shields.io badge shows, fetched here too so the site/
    dashboard can render it as a plain number instead of an embedded badge
    image."""
    releases = _gh_releases(repo)
    if releases is None:
        return None
    return sum(a.get("download_count", 0) for r in releases for a in r.get("assets", []))


def _fetch_github_version_downloads(repo: str) -> dict | None:
    """Per-version download counts, split stable vs beta, newest first — an
    additive breakdown of the same `_fetch_github_downloads` total (this
    sums to that). Downloads only, and only the manually-installed `.zip`:
    a version's count keeps growing after it's superseded, and Decky Store
    installs never touch a GitHub asset, so read it as relative interest
    across versions, not an active-user count. `index.iife.js` assets (the
    standalone-host bundle) are excluded — different audience."""
    releases = _gh_releases(repo)
    if releases is None:
        return None
    out: dict = {"stable": {}, "beta": {}}
    rows = []
    for r in releases:
        tag = r.get("tag_name")
        if not tag:
            continue
        dl = sum(a.get("download_count", 0) for a in r.get("assets", [])
                 if str(a.get("name", "")).endswith(".zip"))
        rows.append((r.get("published_at") or "", tag, bool(r.get("prerelease")), dl))
    rows.sort(key=lambda x: x[0], reverse=True)
    for _pub, tag, is_pre, dl in rows:
        out["beta" if is_pre else "stable"][tag] = dl
    return out if (out["stable"] or out["beta"]) else None


def _decky_snapshot_fields() -> dict:
    """Decky Store fields for a snapshot: installs (`downloads`), `updates`,
    and a per-version list only if the Store ever returns more than one."""
    decky = _fetch_decky_plugin()
    if not decky:
        return {}
    out: dict = {}
    if decky.get("downloads") is not None:
        out["deckyStoreInstalls"] = decky["downloads"]
    if decky.get("updates") is not None:
        out["deckyStoreUpdates"] = decky["updates"]
    versions = decky.get("versions")
    if isinstance(versions, list) and len(versions) > 1:
        out["deckyStoreVersions"] = [
            {"name": v.get("name"), "downloads": v.get("downloads"), "updates": v.get("updates")}
            for v in versions if isinstance(v, dict) and v.get("name")
        ]
    return out


def _build_snapshot() -> dict:
    traffic = {}
    for key, repo in REPOS.items():
        t = _fetch_traffic(repo)
        if t:
            traffic[key] = t
    npm = {}
    for key, package in NPM_PACKAGES.items():
        n = _fetch_npm_downloads(package)
        if n is not None:
            npm[key] = n
    snapshot: dict = {"date": datetime.now(timezone.utc).strftime("%Y-%m-%d")}
    if traffic:
        snapshot["traffic"] = traffic
    if npm:
        snapshot["npm"] = npm
    snapshot.update(_decky_snapshot_fields())
    gh_downloads = _fetch_github_downloads(REPOS["main"])
    if gh_downloads is not None:
        snapshot["githubDownloads"] = gh_downloads
    version_downloads = _fetch_github_version_downloads(REPOS["main"])
    if version_downloads is not None:
        snapshot["versionDownloads"] = version_downloads
    return snapshot


def _fmt_int(n: int) -> str:
    return f"{n:,}"


def _write_history(root: Path, snapshot: dict) -> None:
    path = root / "site" / "reports" / "stats" / "history.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    history = []
    if path.is_file():
        try:
            history = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            history = []
    # Replace today's entry if this already ran today (e.g. a manual re-run)
    # instead of appending a duplicate point.
    history = [e for e in history if e.get("date") != snapshot["date"]]
    history.append(snapshot)
    # Sorted by date, not append order — a backfill run can insert entries
    # dated before the most recent regular snapshot.
    history.sort(key=lambda e: e.get("date", ""))
    history = history[-MAX_HISTORY:]
    path.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"[fetch_stats] wrote {path} ({len(history)} snapshot(s))")


def _npm_backfill_points(package: str, created: str) -> list[tuple[str, int]]:
    """Weekly (created -> today) cumulative-download checkpoints for one
    package, via the registry's own custom-range query. Real historical
    numbers, not estimates: npm's API can directly answer "total downloads
    from date X to date Y", so backfilling here means asking about the
    past rather than approximating it (unlike the code-derived metrics'
    git-archive backfill elsewhere in the CI report)."""
    created_dt = datetime.strptime(created, "%Y-%m-%d")
    today_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    points: list[tuple[str, int]] = []
    cursor = created_dt + timedelta(weeks=1)
    while cursor < today_dt:
        date_str = cursor.strftime("%Y-%m-%d")
        try:
            data = _get_json(f"https://api.npmjs.org/downloads/point/{created}:{date_str}/{package}")
            points.append((date_str, int(data.get("downloads", 0))))
        except (urllib.error.URLError, ValueError, KeyError, TypeError):
            pass
        cursor += timedelta(weeks=1)
    return points


def _github_release_breakdown(repo: str) -> list[tuple[str, int]]:
    """Per-release (date, downloads) pairs, sorted by release date — each
    release's own asset download_count, as measured right now. Not a
    point-in-time historical total (GitHub doesn't expose that: a
    release's count keeps growing long after it's superseded), so this
    only tells us what each release has accumulated by today, not what
    the project's grand total looked like on that release's own date."""
    try:
        res = subprocess.run(["gh", "api", f"repos/{repo}/releases", "--paginate"],
                             capture_output=True, text=True, timeout=30)
    except Exception:
        return []
    if res.returncode != 0 or not res.stdout.strip():
        return []
    try:
        releases = json.loads(res.stdout)
    except Exception:
        return []
    if not isinstance(releases, list):
        return []
    rows: list[tuple[str, int]] = []
    for r in releases:
        date = (r.get("published_at") or "")[:10]
        if not date:
            continue
        downloads = sum(a.get("download_count", 0) for a in r.get("assets", []))
        rows.append((date, downloads))
    rows.sort(key=lambda x: x[0])
    return rows


def backfill_github_downloads_history(root: Path) -> int:
    """One-time, idempotent backfill: cumulative release downloads by
    release date, from the repo's own release history — a genuine growth
    curve across real dates. Each point is the running sum of every
    release's *current* download count up to and including that release,
    since (per _github_release_breakdown) there's no true historical
    snapshot to recover; deterministic, so re-running just recomputes the
    same values rather than double-counting."""
    path = root / "site" / "reports" / "stats" / "history.json"
    history: list[dict] = []
    if path.is_file():
        try:
            history = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            history = []
    by_date = {e["date"]: e for e in history if e.get("date")}
    rows = _github_release_breakdown(REPOS["main"])
    running = 0
    touched = 0
    for date_str, downloads in rows:
        running += downloads
        entry = by_date.setdefault(date_str, {"date": date_str})
        entry["githubDownloads"] = running
        touched += 1
    history = sorted(by_date.values(), key=lambda e: e["date"])[-MAX_HISTORY:]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"[fetch_stats] backfill: {touched} github-downloads data point(s), {len(history)} total snapshot(s)")
    return touched


def backfill_npm_history(root: Path) -> int:
    """One-time, idempotent backfill: weekly npm-download checkpoints from
    each package's own publish date to today, merged into history.json at
    their real dates. Every other field (traffic, Decky Store installs,
    GitHub downloads) has no historical API at all — nothing to backfill
    there, so a backfilled point carries npm only; a date that already has
    a full regular snapshot (today's) keeps its other fields untouched."""
    path = root / "site" / "reports" / "stats" / "history.json"
    history: list[dict] = []
    if path.is_file():
        try:
            history = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            history = []
    by_date = {e["date"]: e for e in history if e.get("date")}
    added = 0
    for key, package in NPM_PACKAGES.items():
        created = _npm_created_date(package)
        if not created:
            continue
        for date_str, downloads in _npm_backfill_points(package, created):
            entry = by_date.setdefault(date_str, {"date": date_str})
            npm = entry.setdefault("npm", {})
            if key not in npm:
                npm[key] = downloads
                added += 1
    history = sorted(by_date.values(), key=lambda e: e["date"])[-MAX_HISTORY:]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"[fetch_stats] backfill: {added} npm data point(s), {len(history)} total snapshot(s)")
    return added


def _write_endpoint_badge(root: Path, rel: str, label: str, message: str, color: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "schemaVersion": 1, "label": label, "message": message, "color": color,
    }, indent=2), encoding="utf-8")
    print(f"[fetch_stats] wrote {path}")


def main() -> int:
    root = _root()

    if "--backfill" in sys.argv or "--backfill-npm" in sys.argv:
        backfill_npm_history(root)
    if "--backfill" in sys.argv or "--backfill-github-downloads" in sys.argv:
        backfill_github_downloads_history(root)
    if {"--backfill", "--backfill-npm", "--backfill-github-downloads"} & set(sys.argv):
        return 0

    snapshot = _build_snapshot()
    if len(snapshot) <= 1:  # only "date" — every source failed
        print("[fetch_stats] WARN: every source failed; nothing written", file=sys.stderr)
        return 0

    _write_history(root, snapshot)

    installs = snapshot.get("deckyStoreInstalls")
    if installs is not None:
        _write_endpoint_badge(root, "site/stats/decky-store.json", "decky store",
                              f"{_fmt_int(installs)} installs", "blue")

    main_traffic = snapshot.get("traffic", {}).get("main")
    if main_traffic and "views" in main_traffic:
        _write_endpoint_badge(root, "site/stats/traffic.json", "views (14d)",
                              _fmt_int(main_traffic["views"]), "blue")

    # One clones badge per tracked repo, all hosted on this repo's own
    # Pages deploy — so the sibling api/host repos, which have no Pages
    # site of their own, can still show a real clones badge on their own
    # README without a Gist workflow. (deckprobe's own clones badge, a
    # separate repo, uses the Gist approach for that same reason: no
    # shared Pages site available to lean on there.)
    for key, clones_file in (("main", "clones-main.json"), ("api", "clones-api.json"),
                             ("host", "clones-host.json"), ("shelveshub", "clones-shelveshub.json")):
        t = snapshot.get("traffic", {}).get(key)
        if t and "clones" in t:
            _write_endpoint_badge(root, f"site/stats/{clones_file}", "clones (14d)",
                                  _fmt_int(t["clones"]), "blue")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
