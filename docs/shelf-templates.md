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

## Notes

- Tab-based templates (`favorites`, `recent`, `installed`) delegate ordering entirely to Steam. The shelf limit still applies — only the first N games from the tab are shown.
- Filter-based templates (`most_played`, `recently_added`, `awaiting_update`) use the plugin's own resolver and support all per-shelf display options (highlight first, match native size, etc.).
- All templates produce fully editable shelves. Source type, sort order, limit, and display options can all be changed after creation.
