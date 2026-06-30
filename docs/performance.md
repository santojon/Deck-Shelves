# Performance audit

Steam Deck has a tight CPU/battery envelope shared with the running game. This document tracks the measured baselines for the rendering paths that run in our hot loop and the optimizations applied on top.

Optimizations always ship paired with a before/after number, captured from a real Steam Deck OLED (SteamOS 3.7+ stable).

## Method

Numbers come from a mix of:

- **`React.Profiler`** — wraps `DeckRow`, `Shelf`, `GameCard`, `HomeInject`. Logs commit duration + counts re-renders per interaction.
- **`performance.measure` / `performance.mark`** — explicit start/end markers around mount, scroll, and resolver paths.
- **`requestAnimationFrame` deltas** — frame timing during scroll, captured in 60-frame windows.
- **`SteamClient.System.Battery`** — drift over a 30-minute idle window vs. native Steam baseline.
- **`vite build --reporter detailed`** — bundle-size deltas.
- **CDP `console`** in `--duration N` mode — passive stream of warnings / re-render logs across a fixed test window.

Repro fixtures live in `assets/import/` and load via `actions.import` so a measurement run starts from a known shelf set.

## Hot paths and what we look at

| Surface | Metric | Target |
|---------|--------|--------|
| `DeckRow` re-renders per shelf edit | Commit count from React.Profiler | ≤ 1 commit per edited shelf |
| `Shelf` resolver round-trip | `resolveShelfAppIds` ms | < 50 ms cached, < 250 ms cold |
| Home cold mount | `home visible` → `first shelf rendered` | < 500 ms cold, < 200 ms warm |
| Scroll FPS (horizontal) | rAF interval p95 during shelf scroll | ≥ 16.67 ms p95 (≈ 60 fps sustained) |
| Idle battery drift | `Battery.flLevel` delta over 30 min | within ±0.5 pp of native baseline |
| Bundle size | `dist/index.js` gzip | track week-over-week |

## Already-applied wins

- **`generation-id cancellation`** in `Shelf.tsx` — abandons stale resolve promises so a quick re-edit doesn't queue redundant work.
- **`shelf refresh emitter`** in `core/shelfRefresh.ts` — single global event bus instead of per-shelf polling. Settings changes trigger one emit, every shelf listens.
- **`reparent poll throttle 750 → 3000 ms`** — focus-tree splice retried every 3 s instead of every 750 ms; covers React re-mounts without flooding the controller.
- **`memo + stable refs`** on `DeckRow`, `ShelfView`, `GameCard` — props are computed at the parent and passed down by reference; inline lambdas were audited out.
- **`MutationObserver` on `.deck-shelves-root` only** — observers are scoped to the mount, not the whole document body.
- **`webpackCompat.discoverNativeCardDimensions`** caches the result by viewport+DPR key so cold mount avoids a re-measure.
- **`cardsize` localStorage** — persists the last-known dimensions across boots so first paint matches before discovery completes.

## How to repro a measurement

```bash
# 1. Reset to a known fixture (6 representative shelves):
pnpm qa:all-shelves-show-recents
# Wait for re-deploy; restart Steam.

# 2. Open the CDP console for a fixed window:
python3 devkit/cdp.py console --duration 30

# 3. Profile a specific path. Inside the BP devtools console:
performance.mark('home-mount-start')
# ... navigate to home ...
performance.measure('home-mount', 'home-mount-start')
performance.getEntriesByName('home-mount')[0].duration
```

Track findings in PRs with `[PERF]` tag plus before/after numbers in the description so reviewers can validate the delta.

## Open follow-ups

- Re-render audit pass over `EditShelfModal` and `EditSmartShelfModal` — preview row recomputes on every keystroke; debounce candidate.
- Bundle split: lazy-load the About page route. Currently bundled in the main chunk.
- `MutationObserver` budget review — count active observers and consolidate where the same node is watched by two paths.
- Battery measurement long-haul — a 6-hour idle test to rule out slow leaks in the recents-replace patch chain.
