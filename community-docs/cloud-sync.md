# Sync your settings across devices (experimental)

Got Deck Shelves on more than one device logged into the same Steam
account — a Deck and a gaming PC, say? You can now keep your shelves,
filters, profiles, and every other setting in sync between them, no extra
account or service needed.

## How it works

This uses the same per-account cloud storage Steam's own client already
uses for settings that "follow the account" between machines. It is **not**
Steam Cloud (that system is per-game, and a plugin doesn't have a game of
its own to use it) — there's no sign-up, no quota, and no cost, since it
rides on infrastructure Steam already runs.

Your local settings always stay the real source of truth on each device.
Sync is a mirror on top of that, not a replacement for local storage —
turning it off just stops the mirroring, nothing is deleted.

## How to enable it

1. Open Deck Shelves' settings on the first device, find the sync toggle,
   and turn it on.
2. Do the same on your other device(s).
3. That's it — whichever device has the newest changes wins when two
   devices reconcile (see "How conflicts are handled" below), and a status
   line under the toggle shows you when it last synced.

You'll get a notification whenever a change from another device gets
applied to the one you're using, so it's never a silent surprise.

## When it actually syncs

- **Once, right when you turn the toggle on** (or when the app starts with
  it already on) — pulls whatever's in the cloud, or pushes your local
  settings up if the cloud copy is missing or older.
- **A few seconds after any local change**, while the toggle stays on.
- It does **not** poll continuously in the background — a change made on
  another device while both are running won't show up on this one until
  you next open the app or flip the toggle. This keeps the feature
  lightweight and battery-friendly by design, not a bug.

## How conflicts are handled

This is last-write-wins by timestamp: whichever device made a change more
recently is what "wins" if two devices both changed settings while apart.
There's no per-field merge and no conflict picker — if you edited shelves
on two devices independently before they synced, the older set of edits is
what gets overwritten, not merged in. If that matters to you, sync devices
often rather than letting them drift for a long time.

## What's deliberately excluded from sync

Two kinds of settings never travel between devices, on purpose:
- The sync toggle and its own bookkeeping — turning sync on on one device
  can't remotely flip it on for another.
- A couple of device-specific technical values that would be meaningless
  (or actively wrong) if copied onto a different machine.

## Troubleshooting

- **The status line says "not synced yet" and stays that way.** Make sure
  you're online, and give it a few seconds after toggling — the first sync
  happens right after enabling, not instantly on click. If it's still
  stuck after a minute, try toggling off and back on.
- **I made a change and it's not showing up on my other device.** Sync
  isn't continuous — reopen the app (or toggle sync) on the other device to
  pull the latest.
- **My shelves reverted to an older version after syncing.** That's the
  last-write-wins behavior above — the device with the older change was
  treated as "newest" by clock time. Check both devices' system clocks are
  actually correct if this happens unexpectedly.

Off by default, and still marked experimental while it gets more real-world
mileage — but the core sync mechanism itself has been tested thoroughly,
including a fix for a subtle case where certain settings values could
silently fail to transfer.
