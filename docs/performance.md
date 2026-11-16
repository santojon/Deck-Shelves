# Performance

The plugin shares a handheld's CPU and battery with whatever game is running,
and its Home code runs inside Steam's own UI. A wasted re-render or a timer
that never stops costs frame time and battery on every device it is installed
on. This page lists the rules the code follows and the tools available to
measure it.

## Rules

- **No polling where an event exists.** Settings changes reach shelves through
  one refresh emitter (`src/core/shelfRefresh.ts`); hardware, session and
  time-based visibility rules re-evaluate on Steam events or on a one-shot
  timer set to the next boundary.
- **Every timer, observer and subscription is disposed.** Effects clean up on
  unmount; observers watch the plugin's own mount, not the whole document.
  The performance panel counts the active ones, so a leak shows up as a number
  that only grows.
- **Stable props on cards and rows.** `Shelf`, `DeckRow` and `GameCard` are
  memoized; values are computed by the parent and passed by reference.
- **Stale work is dropped.** Each shelf resolve carries a generation id; a slow
  resolve that finishes after a newer one started is ignored.
- **No endless animations.** An infinite CSS animation keeps the compositor
  busy even on an idle Home. Animations run on focus or on a single trigger,
  and the hero zoom pauses after 60 seconds without input.
- **Nothing heavy at boot.** Artwork and online data load on demand, never as
  a parallel pre-warm at startup.

## Tools

### Performance panel and debug overlay

Settings → Developer (turn on Advanced mode, then Developer mode in Advanced
tools):

- **Performance** shows a read-only snapshot of the Home layer: critical boot
  time and mount time, cards processed and fetches during mount, active
  timers / observers / subscriptions, reconciles, DOM callbacks and renders
  per minute, long tasks, JS heap and the smart-shelf cache hit rate. It reads
  the counters when you open or refresh it; nothing samples in the background.
- **On-Home debug overlay** draws FPS and shelf / render counters over the
  Home, optionally per shelf, with the focused element and outlines.

### Battery, CPU and sleep test

```bash
pnpm run deck:perf            # 5 minutes
pnpm run deck:perf 15         # 15 minutes
bash scripts/deck/perf-test.sh --compare 10   # baseline run, then plugin run
```

Samples battery level, power draw, total CPU, the Decky process's CPU and
sleep inhibitors over SSH every 30 seconds, then prints a table and a
pass/fail summary. It fails when the drain exceeds 10 %/h or when the plugin
holds a sleep or idle inhibitor (which would keep the screen from locking).
`--compare` pauses between a baseline run (disable the plugin first) and a
plugin run, and prints the difference. Needs `DECK_HOST`, `DECK_USER` and
SSH access; unplug the charger for meaningful battery numbers.

### Scroll stress

```bash
bash scripts/deck/perf-stress-scroll.sh 5   # minutes
```

Drives gamepad navigation on the Home through the debug protocol, zig-zagging
across every shelf for the given time. Run it alongside `deck:perf` to see the
cost under sustained input. Needs remote debugging (see [cdp.md](./cdp.md))
and `pip install websocket-client` on the machine running it.

### Fixtures

Development builds can seed shelves so a measurement starts from a known
state (see [qa-manual.md](./qa-manual.md#qa-harness-flags)):

- `pnpm run qa:stress-fixture`: 30 regular and 17 smart shelves at the
  50-card limit with varied sources and display options.

Fixture data is never written to the device's settings file. Deploy a normal
build afterwards (`pnpm run deploy:deck:hard`).

### DevTools

The Performance tab on the `SharedJSContext` and Big Picture pages records
scripting and layout cost of a Home interaction; the Memory tab shows whether
heap grows across repeated Home visits. Development builds also log
`[perf]` timings from `src/core/perf.ts` to the console.

## Reporting a change

Measure on a device, not on a desktop client: the Deck's CPU budget is the one
that matters. For a `[PERF]` pull request, put before/after numbers in the
description, and say which tool and fixture produced them.

## Known costs

- The About pages are bundled with the main chunk rather than loaded on demand.
- On a very large library, the first resolve of a store-metadata filter
  (genres, categories, franchise) covers part of the games and fills in the
  rest over the next refreshes.
