<!--
  Start the title with a tag; it decides the version bump:
    patch: [FIX] [ENHANCEMENT] [PERF] [QA]
    minor: [FEATURE] [CLEANUP]
    major: [REFACTOR]
  Example: [FIX] Prevent shelf from disappearing on reboot
-->

## What and why

<!-- What this PR changes and why. Add "Closes #123" for issues it fixes, and screenshots for UI changes. -->

## Checklist

- [ ] Entry under `## [Unreleased]` in `RELEASE_NOTES.md` (and in `CHANGELOG.md` with `(#123)` for a fixed issue or technical detail).
- [ ] `pnpm run validate:ci` passes.
- [ ] Tested on a device, or explained why it isn't needed.
