# Smart Shelves

Smart shelves are a shelf type whose content is generated automatically by library heuristics. They differ from normal shelves in a fundamental way: **they appear on the home screen only when the heuristic returns results**. When no games match, the shelf simply does not render — no CSS hiding, no placeholder row.

## Behaviour

- Controlled by the `smartShelvesEnabled` global toggle in the QAM.
- Each smart shelf has `enabled` (active in the system) and `hidden` (manually hidden by the user). Both must be false for the shelf to render on home.
- Results are **memoized per (mode, limit) for 5 minutes** to avoid re-running on every home render cycle.
- Smart shelves are **not editable** — they have no source filter to configure. Only reordering, hiding, and deleting are supported.

## Position

By default, smart shelves appear **before** normal shelves. The `smartShelvesAtBottom` toggle moves them after. Exception: when `hideRecents` is active and `smartShelvesAtBottom` is off, smart shelves are inserted after the **first** normal shelf (which replaces the native recents slot).

---

## Templates

### Quick Play — `quick_play`

**When it appears:** you have installed games that are Deck Verified or Playable and have less than 2 hours of playtime.

**Criteria:**
- `installed = true`
- `deck_compatibility_category ∈ {Verified, Playable}` (categories 3 and 2)
- `playtime_forever < 120 min`

**Sort:** Verified before Playable; within the same tier, most recently played first.

**When it disappears:** when every installed Deck-compatible game has been played for 2 h or more, or when no Deck-compatible games are installed.

**Use case:** games you own, can run well on the Deck, and have barely touched — perfect for a quick session.

---

### Not Started — `not_started`

**When it appears:** you have Steam games (non-Steam shortcuts excluded) with zero playtime and that have never been launched.

**Criteria:**
- `is_non_steam = false`
- `playtime_forever = 0`
- `last_played = 0` (never opened)

**Sort:** Deck Verified first, then Playable, then others.

**When it disappears:** when all games in the library have been started at least once.

**Use case:** the ever-growing backlog of games you bought but never opened.

---

### Deck Picks — `deck_picks`

**When it appears:** you have at least one Deck Verified game in the library.

**Criteria:**
- `deck_compatibility_category = Verified` (category 3)

**Sort:** most recently played first (highlights games you actively use on Deck).

**When it disappears:** when the library has no Deck Verified games at all.

**Reliability:** high for most Steam Deck users; Valve certifies many popular titles.

**Use case:** the curated shortlist of titles that work best on Deck hardware.

---

### Rediscover — `rediscover`

**When it appears:** you have Deck-compatible games with meaningful playtime that you haven't touched in over 6 months.

**Criteria:**
- `last_played > 0` (has been played)
- `last_played < (now − 6 months)`
- `playtime_forever > 60 min` (at least 1 h invested)
- `deck_compatibility_category ∈ {Verified, Playable}`

**Sort:** most played first (resurfaces the titles you spent the most time on).

**When it disappears:** when no compatible game with >1 h playtime was last played more than 6 months ago (e.g. a new library, or an active player who revisits everything regularly).

**Use case:** games you genuinely enjoyed but drifted away from — good for a nostalgia session.

---

### Best Unplayed — `best_unplayed`

**When it appears:** you have installed games that have never been played.

**Criteria:**
- `installed = true`
- `playtime_forever = 0`
- `last_played = 0`

**Sort:** Deck Verified first, then Playable, then others.

**When it disappears:** when all installed games have been played at least once.

**Difference from Not Started:** restricts to installed games only; Not Started includes all library games regardless of install state.

**Use case:** games sitting on the SSD waiting to be tried.

---

### Interrupted — `interrupted`

**When it appears:** you have games with a modest amount of playtime — enough to have started but not enough to have finished or committed.

**Criteria:**
- `playtime_forever ∈ [30 min, 180 min]`

**Sort:** most recently played first.

**When it disappears:** when no game has playtime in that 30–180 min range (every game is either untouched or deeply played).

**Use case:** games you started, played for an hour or two, then put down — good candidates for a second look.

---

### Time of Day — `time_of_day`

**When it appears:** whenever the delegate mode for the current time of day returns results.

**Schedule:**

| Time | Delegate mode |
|---|---|
| 05:00 – 11:59 | Quick Play |
| 12:00 – 17:59 | Deck Picks |
| 18:00 – 04:59 | Rediscover |

**Criteria:** inherits entirely from the delegate; no additional filtering.

**When it disappears:** when the delegate for the current time slot returns an empty list.

**Note:** the time is evaluated at resolve time (no background timer). The shelf updates naturally on the next home render / refresh cycle when the hour crosses a boundary.

**Use case:** a single adaptive shelf that suggests different things depending on when you play.

---

### Daily Pick — `daily_pick`

**When it appears:** whenever you have any game that is installed or has been played at all.

**Criteria:**
- `installed = true` OR `playtime_forever > 0`

**Selection:** deterministic rotation based on `floor(Date.now() / 86400000) % eligibleCount`. The rotation advances by one slot each calendar day. No state is persisted — the same day always returns the same games.

**When it disappears:** only when the library is completely empty.

**Reliability: very high.** This shelf will appear for virtually every user with any library content. If you don't want it to show unconditionally, use the **hide** option.

**Use case:** a different curated suggestion every day, without any randomness or server dependency.

---

## Appearance Reliability Summary

| Template | Disappears when… | Reliability |
|---|---|---|
| `quick_play` | all Deck-compat installed games >2 h played | Medium |
| `not_started` | every game has been launched at least once | Medium |
| `deck_picks` | no Deck Verified games in library | High |
| `rediscover` | no compat game with >1 h untouched for 6 months | Low–Medium |
| `best_unplayed` | all installed games have been played | Medium |
| `interrupted` | no game in the 30–180 min range | Medium |
| `time_of_day` | delegate for current hour is empty | Inherits |
| `daily_pick` | library is completely empty | **Very High** |

> `daily_pick` and `deck_picks` are the most likely to always be visible. Consider using the **hide** action on them if you prefer the slot to be empty rather than always occupied.
