# Smart Shelves

Smart Shelves pick their own games automatically, based on your library —
no manual curation needed. The defining trait: **a smart shelf only shows
up when it actually has something to show.** No empty row, no placeholder
— if nothing matches right now, it's simply not there until something does.

## How to enable them

Turn on **Smart Shelves** in Deck Shelves' settings, then add one from the
template picker.

## The templates

Ready-made heuristics you can drop in, each with its own tuning knobs:
- **Quick Play** — short games you can finish in a sitting.
- **Not Started** — installed, never launched.
- **Deck Picks** — Deck-verified/playable games you haven't gotten to.
- **Rediscover** — games you invested real time in but haven't touched in
  months.
- **Best Unplayed** — highly-rated games sitting in your backlog.
- **Interrupted** — started, played a bit, then stopped — the "pick back
  up" shelf.
- **Time of Day** — different suggestions depending on when you're playing.
- **Daily Pick** — one featured suggestion per day.
- **On Deck** — recently active, still in rotation.
- **Recently Played** — your current rotation.
- **Long Sessions** — games you tend to sink real time into.
- **Roulette** — a random pick, reshuffled with its own refresh card.
- **Non-Steam** — your non-Steam shortcuts and launcher games.
- **Spare Time** — matched to how much time you typically have available.
- **Forgotten** — genuinely old library entries you likely forgot existed.

Most have a couple of adjustable parameters (thresholds like "what counts
as quick," "how many months counts as rediscover-worthy") right in the
edit screen.

## Making your own

Beyond the templates, you can also build a fully **custom** smart shelf —
same heuristic engine, your own filter/sort rules on top of it.

## Scheduling by time of day

Any smart shelf can be restricted to specific hours, specific days of the
week, or both — so a "morning picks" shelf only shows up in the morning,
for example. You can also set different hour ranges per weekday if you
want a genuinely different schedule on, say, weekends.

## Where they sit

By default, smart shelves show up before your regular shelves. There's a
toggle to move them after instead, if you'd rather your manually-curated
shelves come first.

## Troubleshooting

- **A smart shelf never seems to show up.** Check its tuning parameters —
  if the threshold is too strict for your library, it may rarely have
  anything to show. Hiding it (rather than deleting) keeps its position and
  settings if you want to revisit later.
- **It's showing stale results.** Smart shelves cache their results for a
  while (an hour by default, adjustable per shelf) so Home doesn't
  re-crunch your whole library on every render. A couple of modes (Roulette,
  Time of Day, Spare Time, Recently Played) get their own refresh card on
  the row if you want to force a re-roll immediately.
