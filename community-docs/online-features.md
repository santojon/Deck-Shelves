# Online features

*[Leia em português](pt-BR/online-features.md)*

Wishlist rows, "On Sale" shelves, price sorting, and a handful of
store-metadata filters (genre, review score, release date, and more) —
all opt-in, all off until you turn them on.

## What's behind the master toggle

Nothing here ever touches the network until you turn on **Online
features**. With it off:
- No connectivity checks, no store requests — genuinely zero network
  probes, not just hidden results.
- Every online-only shelf template and filter type (wishlist, on-sale,
  discount range, price range, genre, category, franchise, review score,
  release date, "coming soon", friends-related filters) disappears from
  the picker entirely, so there's nothing to accidentally trigger.

## Enabling it

1. Open Deck Shelves' settings, find **Online features**, and turn on the
   master toggle. You'll see a short privacy disclosure the first time —
   it lists exactly which URLs get contacted.
2. Sub-toggles let you enable wishlist and price-sorting independently, if
   you want one without the other.

## What you get

- **Wishlist as a shelf source**, own or combined with your library.
- **"On Sale" shelves**, sourced from Steam's own sale catalogue.
- **Price/discount sorting**, and filters for discount range and price
  range.
- **Owned-game filtering** on wishlist/store shelves — hide games you
  already have (including non-Steam shortcuts, and an option for whether
  cloud-play entries like Xbox Cloud Gaming count as "owned").
- **Store metadata as filters/sorts everywhere**, not just on online
  shelves — genre, category, franchise, review score, release date, and
  "coming soon" all work on your regular library shelves too, since your
  own library doesn't carry that data locally either.
- **Friends' activity filters** — who's playing now, who played recently.

## Privacy specifics

- Wishlist syncs at most once a day, cached locally.
- Prices are cached for 6 hours per game, and only fetched for games a
  shelf is actually about to show — nothing is pre-fetched speculatively.
- Nothing is uploaded anywhere; the only outbound requests are read-only
  calls to Steam's own store, and they only happen for features you've
  actually turned on.

## Troubleshooting

- **A shelf/filter I want isn't in the picker.** Check the master Online
  features toggle first — every online-dependent option is hidden, not
  just disabled, while it's off.
- **Genre/review-score/release-date filters show nothing at first.** On a
  large library, this data fills in gradually over a few refreshes rather
  than all at once on the first run — give it a moment.
