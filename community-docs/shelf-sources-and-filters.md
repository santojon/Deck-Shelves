# Shelf sources & filters

*[Leia em português](pt-BR/shelf-sources-and-filters.md)*

Every shelf needs a **source** — where its games come from — and, if you
want more control, **filters** on top of that source to narrow it down.
This is the deepest part of Deck Shelves; here's the map of what's
available.

## Sources: where a shelf's games come from

Pick one when creating or editing a shelf:
- **A Steam collection** you already made.
- **A library tab** (All Games, Favorites, Installed, and any custom tabs
  you have, including ones from TabMaster if it's installed).
- **A filter** — build a query from scratch (see below) instead of
  pointing at something that already exists.
- **Online sources** — your wishlist, or "On Sale" from the store (needs
  Online features on — see [Online Features](online-features.md)).
- **Built-in sources** — over a dozen ready-made ones covering things like
  recently-updated games, games with workshop updates, your pinned games,
  and non-Steam launcher libraries (EmuDeck, RetroDECK, Heroic, Lutris,
  Moonlight, Chiaki), if those are installed.

### Combining more than one source

A shelf isn't limited to one source. Add a second (or third) and choose how
they combine:
- **Union** — games that appear in *any* of the sources (e.g. Favorites +
  Wishlist, so both show up together).
- **Intersection** — only games that appear in *every* source (e.g.
  Installed ∩ your "Roguelikes" collection).

## Filters: narrowing a source down

Once you've got a source, filters let you narrow it further — by
installed/playtime/genre/compatibility/price and dozens more. There are
around 70 filter types across a few groups:

- **Library basics** — installed, favorites, hidden, non-Steam, Deck/SteamOS
  compatibility rating, demo, playtime range, name match.
- **Store metadata** — genre, category, franchise, VR support, multiplayer
  type, review score, release date, "coming soon". These work on games you
  don't own yet too (wishlist/store cards), and need Online features on
  since the data isn't local.
- **Usage & progress** — launch count, session length, achievement
  completion, "played once and abandoned", "installed but never played".
- **Storage** — internal vs. SD card, install size range.
- **Non-Steam / launchers** — filter shortcuts by which launcher they
  belong to (EmuDeck, Heroic, Lutris, …), executable type, launch options.
- **Online-only** — discount range, price range, friends playing now,
  friends played recently.

Combine filters with **AND** (every condition must match) or **OR** (any
one is enough), and invert any individual filter to mean "not this." You
can nest a sub-group inside a filter too, for cases like "(genre is RPG OR
Strategy) AND installed."

## Sorting

Around 40 sort options, covering alphabetical, last played, playtime,
release date, size on disk, review score, deck compatibility, price/
discount (online), and usage-pattern sorts like "most ignored" or "closest
to completion." You can also chain two sort keys — a primary and a
tiebreaker — and reverse any of them independently. **Manual** order (drag
your own arrangement) and **Random** (a stable shuffle that refreshes daily)
are both available as the primary sort too.

## Composite & multi-source shelves

Beyond combining sources, you can stack multiple **filters** the same way
— a shelf can be "installed AND (genre RPG OR Strategy) AND NOT hidden," all
built visually in the editor, no manual JSON needed for any of this (the
examples above show the underlying shape only for reference).

## Where to look in the app

The shelf editor shows every filter/sort/source option live as you build,
with the exact parameters each one takes — this doc is the map, the editor
is the full menu.
