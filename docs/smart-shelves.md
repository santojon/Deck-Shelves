# Smart Shelves

Smart shelves are a shelf type whose content is generated automatically by library heuristics. They differ from normal shelves in a fundamental way: **they appear on the home screen only when the heuristic returns results**. When no games match, the shelf simply does not render — no CSS hiding, no placeholder row.

## Behaviour

- Controlled by the `smartShelvesEnabled` global toggle in the QAM.
- Each smart shelf has `enabled` (active in the system) and `hidden` (manually hidden by the user). Both must be false for the shelf to render on home.
- Results are **memoized per (mode, limit, params, ttl)** to avoid re-running on every home render cycle. Default TTL is 60 minutes; per-shelf override via `refreshIntervalMinutes` (1 minute to 30 days).
- Smart shelves **are editable** via the **Edit smart shelf** modal — sort override (`sort`), additional filters (`filterGroup`), per-mode tuning knobs (`smartParams`), refresh interval, and the same visual options as regular shelves (`matchNativeSize`, `highlightFirst`/`highlightAll`/`highlightedAppIds`, `hideStatusLine`, `hideNewBadge`, `hideCompatIcons`, `hideNonSteamBadge`, `hideShelfTitle`, `hideGameNames`, `hideInstallIndicator`).

> **Tip:** if a smart shelf appears too rarely or never matches your library, prefer **hiding** it over deleting — a hidden shelf can be re-enabled later from the QAM without losing its position in the list.

### Per-mode parameters (`smartParams`)

Each heuristic exposes a small set of numeric tuning knobs editable in the smart-shelf edit modal. They are mode-specific and override the resolver's hardcoded defaults when set:

| Mode | Param | Default | Effect |
|---|---|---:|---|
| `quick_play` | `maxPlaytimeMinutes` | 120 | Upper bound for "quick" — games above this are excluded |
| `interrupted` | `minPlaytimeMinutes` | 30 | Lower bound of the "started but not committed" window |
| `interrupted` | `maxPlaytimeMinutes` | 180 | Upper bound of the same window |
| `recently_played` | `daysAgo` | 30 | Sliding cutoff for "recent" |
| `long_session` | `minPlaytimeMinutes` | 180 | Threshold for "long" |
| `rediscover` | `monthsAgo` | 6 | "Haven't touched it for at least this many months" |
| `rediscover` | `minPlaytimeMinutes` | 60 | Minimum invested time to count as "rediscover-worthy" |
| `forgotten` | `yearsAgo` | 3 | Library age threshold for "forgotten" |

Missing entries always fall back to the defaults — partial overrides are valid.

### Refresh card on the row

Smart shelves whose result can change between two clicks of the trailing card get a **Refresh** card instead of "view more in library":

- **`REFRESHABLE_SMART_MODES`** (in `src/components/shelf/types.ts`): `random_pick`, `time_of_day`, `spare_time`, `recently_played`. Clicking the refresh card invalidates the resolver cache and re-resolves only that shelf.
- **Deterministic modes** (the remaining 11) drop the trailing card entirely — view-more would mislead (smart resolvers can't be opened in the library directly), and refresh would be a no-op against stable app data.

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

> **Note:** `time_of_day` and `spare_time` do not run on a background timer — the transition between time slots happens on the next natural refresh, which may be a few minutes after the clock boundary.

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

### On Deck — `on_deck`

**When it appears:** you have installed games that are Deck Verified or Playable.

**Criteria:**
- `installed = true`
- `deck_compatibility_category ∈ {Verified, Playable}`

**Sort:** Verified before Playable; within the same tier, most recently played first.

**When it disappears:** when no compatible game is installed.

**Use case:** your active Deck-ready rotation — installed and ready to go, with the best-supported titles first.

---

### Recently Played — `recently_played`

**When it appears:** you have played any game in the last 30 days.

**Criteria:**
- `last_played > (now − 30 days)`

**Sort:** most recently played first.

**When it disappears:** when no game has been played in the last 30 days (rare for active users).

**Use case:** your current active rotation — what you've actually been playing this month.

---

### Long Sessions — `long_session`

**When it appears:** you have installed games with more than 3 hours of playtime.

**Criteria:**
- `installed = true`
- `playtime_forever > 180 min`

**Sort:** most played first.

**When it disappears:** when no installed game has more than 3 hours of playtime.

**Use case:** the games you've committed to — good picks when you have time for a real session.

---

### Roulette — `random_pick`

**When it appears:** whenever there are any games in the library.

**Criteria:** all library games are eligible.

**Sort:** random (Fisher-Yates shuffle using `Math.random()`).

**Cache:** results are memoized for 5 minutes (same TTL as all smart shelves). The selection refreshes automatically after 5 minutes.

**When it disappears:** only when the library is completely empty.

**Use case:** pure serendipity — surfaces anything from the library, useful when you can't decide what to play.

---

### Non-Steam — `non_steam`

**When it appears:** you have non-Steam shortcuts in your library (emulators, other launchers).

**Criteria:**
- `is_non_steam = true`

**Sort:** most recently played first.

**When it disappears:** when there are no non-Steam entries.

**Use case:** quick access to emulators and other launchers without browsing the full library.

---

### Spare Time — `spare_time`

**When it appears:** only during three daily time windows — morning (6:00–8:59), lunch (12:00–13:59), and evening (19:00–21:59) — when you have installed games with ≤2 hours of playtime.

**Criteria:**
- Current hour ∈ {6–8, 12–13, 19–21}
- `installed = true`
- `playtime_forever ≤ 120 min`

**Sort:** Deck Verified before Playable; within the same tier, most recently played first.

**When it disappears:** outside the defined time windows (always empty), or when no installed game has ≤2 h of playtime.

**Note:** the time is evaluated at resolve time. Outside the three windows the resolver returns an empty list immediately, so no shelf row is rendered.

**Use case:** short-session suggestions during natural break points in the day — morning coffee, lunch, or after dinner.

---

### Forgotten — `forgotten`

**When it appears:** you have Steam games (non-Steam shortcuts excluded) that have been in your library for more than 3 years and have never been launched.

**Criteria:**
- `is_non_steam = false`
- `app_type = 1` (game) or unknown — excludes tools, Proton, redistributables, servers, SDKs
- `playtime_forever = 0`
- `last_played = 0` (never opened)
- `rt_purchased_time` (or `user_added_ts`) > 0 AND < (now − 3 years)

**Sort:** oldest acquisition date first (ascending by `rt_purchased_time`).

**When it disappears:** when every game in the "never played" backlog was acquired less than 3 years ago, or when all games have been started at least once.

**Reliability: Low.** Requires at least 3 years of library history with unplayed games. New accounts and active players will rarely see this shelf.

**Use case:** surfaces the deepest backlog — games bought long ago and completely forgotten.

---

## Appearance Reliability Summary

| Template | Disappears when… | Reliability |
|---|---|---|
| `daily_pick` | library is completely empty | **Very High** |
| `deck_picks` | no Deck Verified games in library | High |
| `on_deck` | no compatible game is installed | High |
| `recently_played` | no game played in last 30 days | High |
| `long_session` | no installed game has >3 h playtime | High |
| `not_started` | every game has been launched at least once | Medium |
| `best_unplayed` | all installed games have been played | Medium |
| `quick_play` | all Deck-compat installed games >2 h played | Medium |
| `interrupted` | no game in the 30–180 min range | Medium |
| `random_pick` | library is completely empty | **Very High** |
| `non_steam` | no non-Steam shortcuts in library | Medium |
| `spare_time` | outside active windows, or no installed game ≤2 h | Medium (in-window) |
| `time_of_day` | delegate for current hour is empty | Inherits |
| `rediscover` | no compat game with >1 h untouched for 6 months | Low–Medium |
| `forgotten` | no 3+ year old unplayed game in library | Low |

> `daily_pick`, `deck_picks`, `on_deck`, `recently_played`, and `random_pick` are the most likely to always be visible. The template picker lists templates from highest to lowest probability.

---

## Surprise Me

When **Surprise Me** is enabled (sub-toggle under Smart Shelves in the QAM), the manual smart shelf list is hidden entirely. Instead, the system picks a set of smart shelf templates automatically each day using a deterministic daily seed — same day, same selection.

**Count:** the slider sets how many templates appear (1–5). When set to 0, the system decides: `1 + (dayIndex % 3)`, cycling 2, 3, or 4 shelves per day.

> **Note:** the count is the **maximum** number of shelves, not a guarantee. Templates that return no games for your library follow the normal null-render path and simply don't appear — the actual number of visible shelves may be lower.

**Selection:** all 13 templates are shuffled with the daily seed. The first `count` entries from the shuffled list are used. Templates that return no games still follow the natural null-render path and disappear from the home screen — the count is the maximum, not a guarantee.

**Reset time:** the seed is derived from the local calendar date (`YYYYMMDD`). The selection resets at **local midnight** — when the device clock rolls over to a new day.

**Use case:** hands-off mode — let the plugin decide what to surface each day without any configuration.
