# Shelf Templates

Shelf templates are preset configurations available in the template picker when creating a new shelf. Each template has a predefined source (library tab or filter) and a suggested title. The user can rename and edit any shelf after creation — templates are just starting points.

## Default shelves

When the user clicks **Create default shelves** on the first-run banner, three shelves are created automatically:

| Template | Source |
|---|---|
| Favorites | Library tab `favorites` |
| Recently Played | Library tab `recent` |
| Recently Added | Filter — sort by `added` |

---

## All available templates

### Favorites — `favorites`

**Source:** library tab `favorites`

Shows games the user has marked as favorites in the Steam library. Ordering follows Steam's own favorites list.

---

### Recently Played — `recent`

**Source:** library tab `recent`

Shows the most recently played games. Ordering is provided by Steam's native recents tab.

---

### Installed Games — `installed`

**Source:** library tab `installed`

Shows all games currently installed on the device.

---

### Most Played — `most_played`

**Source:** filter — `installed: true`, sort by `playtime` (descending)

Shows installed games ordered by total playtime. Only installed games are included so the list reflects what is playable right now.

---

### Recently Added — `recently_added`

**Source:** filter — sort by `added` (descending)

Shows games ordered by when they were added to the library, newest first. Includes all library games regardless of install state.

---

### Awaiting Update — `awaiting_update`

**Source:** filter — `installed: true`, `updatePending: true`, sort `alphabetical`

Shows installed games that have a pending update or download queued. Useful as a housekeeping shelf to track what needs downloading.

---

### Non-Steam / Emulators — `non_steam`

**Source:** filter — `nonSteam: true`, sort by `recent`

Shows non-Steam shortcuts (emulators, other launchers, manually added games) sorted by most recently played. The shelf is empty when no non-Steam entries exist.

---

### Long Sessions — `long_session`

**Source:** filter — `installed: true`, `minPlaytimeMinutes: 180`, sort by `playtime` (descending)

Shows installed games where the user has put in more than 3 hours — the titles they've genuinely committed to. Ordered by total playtime so the most-played entries surface first.

---

## Notes

> **Tip:** if none of the templates fit your use case, choose **Start blank** — it opens the edit modal directly so you can configure the source and filters from scratch without any preset defaults getting in the way.

> **Note:** tab-based templates (`favorites`, `recent`, `installed`) delegate ordering entirely to Steam. The sort option in the shelf editor has no effect on these — the order is determined by Steam's own internal list. Only the limit (max number of cards) applies.

- The template picker shows **Start blank** first, followed by all templates in a 2-column grid. Starting blank opens the Edit modal immediately.
- Tab-based templates (`favorites`, `recent`, `installed`) delegate ordering entirely to Steam. The shelf limit still applies — only the first N games from the tab are shown.
- Filter-based templates (`most_played`, `recently_added`, `awaiting_update`, `non_steam`, `long_session`) use the plugin's own resolver and support all per-shelf display options (highlight first, match native size, etc.).
- All templates produce fully editable shelves. Source type, sort order, limit, and display options can all be changed after creation.
