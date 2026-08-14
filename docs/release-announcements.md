# Release announcements

Community post copy for each release — Reddit first, reusable for Discord.
This is *not* the changelog: [CHANGELOG.md](../CHANGELOG.md) is the complete,
per-change technical record and [RELEASE_NOTES.md](../RELEASE_NOTES.md) is
the user-facing summary linked from the About page. This file is shorter,
punchier, and written to be read in a feed, not a diff.

## When to write one

Draft the post under `## [Unreleased]` (below) as a release's CHANGELOG.md /
RELEASE_NOTES.md entries firm up — same section the version-bump workflow
promotes to a dated entry, so it just needs to be there by the time a release
ships. Reuse the wording — don't reinvent the voice release to release. Post
to [r/DeckShelves](https://www.reddit.com/r/DeckShelves/) using the link the
release-announce CI job generates.

## Template

```
Deck Shelves vX.Y.Z is here!

Deck Shelves X.Y.Z is now available.

This release focuses on <one-sentence theme — the 2-3 things a returning
user would actually notice>:

<emoji> <Bold-ish short label> — <one line, plain language, no jargon>
<emoji> <Bold-ish short label> — <one line>
...
<emoji> A collection of fixes and polish for <2-4 areas touched>.

📖 Full release notes:
https://github.com/santojon/Deck-Shelves/blob/main/RELEASE_NOTES.md

💬 Community & support

🔵 Discord: https://discord.gg/EChuVEDakk
🟠 Reddit: https://www.reddit.com/r/DeckShelves/
🌐 Website: https://santojon.github.io/Deck-Shelves/

Thanks to everyone who has been testing Deck Shelves, reporting bugs and
suggesting improvements. ❤️

Deck Shelves — Your Steam Deck Home Screen. Your Way.
```

**Rules for the highlight bullets:**
- Source them from RELEASE_NOTES.md's "Added"/"Changed" entries for the
  release, not CHANGELOG.md — condense further, don't just re-wrap.
- One emoji per bullet, chosen for what the line is about (not decorative) —
  a tool for filters, a book for docs, a bug for the fixes line, and so on.
- Plain language over feature names: "everything except…" reads better than
  "invertible filters."
- Bug fixes are always one combined bullet ("a collection of fixes and
  polish for…"), never itemized — that's what RELEASE_NOTES.md is for.
- Keep it to what a returning user would notice in five seconds of scrolling.

## Posts

Same `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD` flow as CHANGELOG.md /
RELEASE_NOTES.md: write the draft post for the next release under
`## [Unreleased]` as its highlights firm up, and the version-bump workflow
promotes it to a dated `## [X.Y.Z]` entry the same way it promotes those two
files — same `awk` extraction, same non-fatal skip when `[Unreleased]` is
empty (the announce job then falls back to the raw release body for that
version). Headings use the bracketed `## [X.Y.Z]` format on purpose, to stay
extractable by the identical pattern.

## [Unreleased]

## [3.2.0] - 2026-08-14

```
Deck Shelves v3.2.0 is here!

Deck Shelves 3.2.0 is now available.

This release focuses on making shelves much more flexible and powerful:

🧰 Many more filters & sorts — genre, franchise, VR, multiplayer, achievements, playtime, launch count, install size, storage device, launcher and more.

🔄 Invert any filter — easily build shelves like “everything except…”

📚 New built-in shelf sources — dynamic collections, followed/ignored games, DLC, soundtracks, pinned games, play history, recently updated games, events, Workshop updates and more.

🧩 More powerful filter combinations — combine conditions with at least N, any and none logic.

📝 Release notes inside the plugin — see the notes for your installed version directly from About.

🎨 New Deck Shelves icon — a cleaner shelf-of-books design across Decky, notifications and the browser tab.

⬇️ Easier updates — update notifications can now download the release package directly to your Downloads folder, while keeping installation manual.

🐛 A collection of fixes and polish for shelf visibility, Recents integration, editor layout, profiles, "what's new" loop, notifications and navigation.

📖 Full release notes:
https://github.com/santojon/Deck-Shelves/blob/main/RELEASE_NOTES.md

💬 Community & support

🔵 Discord: https://discord.gg/EChuVEDakk
🟠 Reddit: https://www.reddit.com/r/DeckShelves/
🌐 Website: https://santojon.github.io/Deck-Shelves/

Thanks to everyone who has been testing Deck Shelves, reporting bugs and suggesting improvements. ❤️

Deck Shelves — Your Steam Deck Home Screen. Your Way.
```
