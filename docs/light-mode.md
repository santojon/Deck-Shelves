# Light mode

A single toggle in the QAM sidecar that trims the plugin surface down to
its essentials, so users who don't want to tinker get a focused,
uncluttered experience.

## What it does

When **on**, Deck Shelves hides advanced controls and complex flows
from every panel that exposes them. Nothing is uninstalled or reset —
values you previously set are preserved, just out of sight. Flipping the
toggle off restores every hidden control with its previous value.

### What gets hidden

**QAM sidecar — Settings tab** ([`GeneralTab.tsx`](../src/components/qam/sidecar/GeneralTab.tsx))

- "Force CSS Loader themes" advanced toggle
- "Smart shelves at bottom"
- "Surprise me" smart-shelf master + count slider
- Global logo size + top-offset sliders
- Global description height + description/logo gap sliders

**QAM sidecar — Visual Global section**

- All sliders listed above stay hidden under their parent toggle even
  when the parent is on.

**Settings page**

- The "Advanced tools" card is hidden from the deep-destinations grid
  (no diagnostic log access, no reset shortcuts). Reset stays reachable
  via the QAM if needed.
- The "Integrations" card is hidden — third-party descriptor enable /
  disable is power-user territory.
- The "Shortcuts" card is hidden — button rebinding stays at defaults.

**Edit shelf / Smart shelf modals**

- Multi-key sort UI collapses to single-key only. Existing multi-key
  shelves keep their stored sort; the editor just hides the row builder.
- Composite source type is hidden from the source-type dropdown.
- Manual sort + drag-to-reorder is hidden — the "manual" sort option
  drops out of the dropdown.

**Create shelf picker**

- Only the simpler templates remain visible in the smart-shelf tab
  (Quick Play, Deck Picks, Recently Played, Recently Added, Not started,
  On Deck, Custom / Blank). Advanced templates (Time of day, Long
  session, Random pick / Roulette, Forgotten, Spare time, Interrupted)
  are hidden.

## Why

The plugin's surface grew significantly across 2.3.x and 2.4.x. Most
users want "shelves on the home, occasionally tweak one or two visual
options". Light mode reflects that majority case: one click, the rest
of the noise disappears.

It also serves as a "demo mode" when introducing the plugin to someone
new — start in light mode, the panel reads as a small focused list;
flip it off later when they want to dig in.

## What it does NOT do

- Disable any feature. Everything still runs in the background.
- Reset values. Hidden toggles keep their stored state.
- Affect the home rendering. Shelves on the home look identical with
  light mode on or off.
- Migrate settings. There is no "light mode preset" — the toggle is
  purely a visibility filter.

## How to enable

QAM → Settings tab → Smart Shelves section → "Light mode" toggle.
Persists across reboots. Per-profile (saved profiles include the value).

## Implementation

[`useLightMode()`](../src/components/ui/lightMode.ts) is the hook every
surface checks. Subscribes to `settings.lightModeEnabled` and re-renders
consumers on flip. Component code uses the pattern:

```tsx
const lightMode = useLightMode();
// ...
{!lightMode && (
  <AdvancedToggle ... />
)}
```

To gate a new surface, import the hook and wrap the advanced parts in
`!lightMode &&`. No need to plumb the setting through props.
