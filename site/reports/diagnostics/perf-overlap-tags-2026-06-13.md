# Overlap-tag perf audit — 2026-06-13

Phase A baseline taken via `scripts/devtools/deck/diag/diag_overlap_perf.cjs`
against `192.168.1.15:8081` (Steam BP target
`4E7E85848FF2D1BA51BCC5CC0FDF8EFA`). Sample window: 5 s, home route,
user idle, hero ON, 4 hero-enabled shelves, 102 cards in DOM.

Raw output: [perf-overlap-tags-2026-06-13-idle.json](perf-overlap-tags-2026-06-13-idle.json).

## Footprint

| Metric                    | Value     |
|---------------------------|-----------|
| Cards in DOM              | 102       |
| Hero images mounted       | 4         |
| Hero-enabled shelves      | 4         |
| Total nodes under root    | 1473      |

## Metrics (5 s wall window, idle home)

| Metric                | Before        | After          | Delta            |
|-----------------------|---------------|----------------|------------------|
| `TaskDuration` (s)    | 0.001254      | 0.908853       | **+0.9076**      |
| `LayoutDuration` (s)  | 0             | 0.000639       | +0.0006          |
| `RecalcStyleDuration` | 0             | 0.003388       | +0.0034          |
| `JSHeapUsedSize` (B)  | 85 163 148    | 86 540 332     | +1 377 184       |
| `Nodes`               | 4281          | 4281           | 0                |
| `JSEventListeners`    | 5240          | 5240           | 0                |

CPU during idle: roughly **15%** (0.908 s task duration on a 5.93 s wall
window). Heap grew by ~1.4 MB across the window — most likely GC / image
buffer noise, not a leak (node + listener counts are stable).

## Hot self-time (top frames)

| #  | Function           | Self time (µs) |
|----|--------------------|----------------|
| 1  | `(idle)`           | 5 004 338      |
| 2  | `(program)`        |   843 938      |
| 3  | `querySelector`    |     4 300      |
| 4  | `debug` (chunk)    |     1 246      |
| 5  | `send`             |     1 109      |

84% of the wall time is `(idle)`, 14% is `(program)` (V8 / browser
internals), the rest is microseconds-scale.

## Findings

- **No dominant in-script hot spot during idle.** The hottest JS frame
  (`querySelector`, 4.3 ms / 5 s window) is too small to explain the
  ~15% task duration. The cost is broadly distributed across browser
  internals — consistent with the badge portal + per-shelf hero pipeline
  paying small, frequent costs across the listener fan-out (5240
  listeners across 102 cards = ~50 listeners / card on average).
- **No leak signal.** Node + listener counts are stable; heap growth
  is small enough to be GC churn from the hero image decode pipeline.
- **The originally-suspected MutationObserver + scroll-listener
  pyramid is below the noise floor at idle.** The cost would surface
  during focus movement, not in a 5 s idle sample.

## Phase B — recommendation

Hold off on the speculative collapse of per-card observers / listeners.
Without a clear idle hot spot, the structural rework
(delegated focusin/focusout on `.deck-shelves-root`,
`window`-level scroll delegation) carries a real regression risk for
focus tracking and badge visibility that isn't justified by the data.

Targeted next steps (in order):

1. **Re-run with focus actively moving** through cards — that exercises
   the per-card MutationObserver + the rAF zoom loop, where the
   architectural cost lives. Use:

   ```bash
   DECK_CDP_HOST=192.168.1.15 DECK_CDP_PORT=8081 DECK_PERF_SAMPLE_MS=8000 \
     node scripts/devtools/deck/diag/diag_overlap_perf.cjs <bp-target>
   ```

   While the script samples, manually D-pad across one shelf end-to-end.

2. **A/B compare hero ON vs hero OFF** at the same focus-moving load.
   Toggle `globalHeroEnabled` between runs. Sustained 5%+ delta
   localises the cost to the hero observer pipeline; smaller deltas
   point at the badge portal.

3. **Only then ship the Phase B fix** the original plan sketched
   (delegated focus / scroll listeners in `GameCard.tsx` or
   `PerShelfHero.tsx`), scoped to whichever pipeline the A/B isolated.

## Notes

- The probe itself is reusable — re-running it post-fix gives a clean
  delta against this baseline. Keep this report as the reference number
  for future regressions.
- The 5240 listener count is high in absolute terms but stable, which
  means Steam's `Focusable` wrapper is the largest source per card.
  Collapsing those would require monkey-patching `Focusable`, which is
  out of scope.
