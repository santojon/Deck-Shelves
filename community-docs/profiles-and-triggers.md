# Profiles, auto-switching & context-aware shelves

Save whole configurations as **profiles**, switch between them automatically
based on real conditions (docked, low battery, a specific controller
connected, time of day, and more), and make individual shelves react to
those same conditions without needing a separate profile at all.

## Profiles

A profile is a saved snapshot of your setup. Useful for genuinely different
contexts — a "Docked" layout with bigger shelves for a TV, a minimal
"Handheld" layout for on-the-go, whatever fits how you actually use your
Deck. There's a built-in **Default** profile that's a real factory reset,
not just another save.

Create, switch, import, and export profiles from settings — export is handy
for backing up a setup, or sharing one.

## Auto-switching profiles

Give a profile a trigger condition, turn on the master auto-switch toggle,
and Deck Shelves swaps to it automatically the moment that condition
becomes true — no polling, it reacts to the actual system event (display
connected, battery threshold crossed, etc.). You'll get a toast when it
switches, which you can mute if you'd rather it be silent.

## What conditions are available

A wide set, and any of them can be inverted ("NOT charging", "no controller
connected"):
- **Time** — hour range, day of week, weekend, morning/afternoon/evening/
  night, season, specific date ranges (holidays).
- **Device** — battery percentage, charging state, offline, an external
  display connected (docked), screen resolution, ultrawide.
- **Session** — where you last launched a game from, whether a game is
  currently running.
- **Performance** — high CPU load, low memory, low frame rate.
- **Peripherals** — a controller connected, headphones connected, or a
  specific Bluetooth device by name.

You can combine several conditions with AND/OR logic, same as filters.

## Shelf behaviors (without needing a whole profile)

The same condition system also works on individual shelves, no profile
switch required:
- **Auto-pin** — floats a shelf to the top of Home when its condition is
  true.
- **Auto-collapse** — folds a shelf down to just its header when a
  condition is true, or when it's empty.

## Troubleshooting

- **A trigger didn't fire after my Deck woke from sleep.** Conditions based
  on display/controller/battery changes that happened *during* sleep can be
  missed (nothing runs while suspended) — Deck Shelves re-checks these
  automatically on wake, so it should self-correct within a few seconds of
  waking up. If it's still wrong after that, it's worth a bug report.
- **Auto-switch didn't trigger even though the condition looks true.**
  Double-check the master auto-switch toggle is on — a profile's trigger
  does nothing without it.
