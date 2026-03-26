<!--
  PR title MUST start with one of these tags:
    [FIX]     — Bug fix         → patch version bump (e.g. 0.1.0 → 0.1.1)
    [REFACTOR] — Refactor/cleanup → minor version bump (e.g. 0.1.0 → 0.2.0)
    [FEATURE] — New feature     → major version bump (e.g. 0.1.0 → 1.0.0)

  Example: [FIX] Prevent shelf from disappearing on reboot
-->

## Description

<!-- Describe what this PR does and why. Link related issues with "Closes #123". -->

## Changelog

<!-- Add your changes under the appropriate heading in CHANGELOG.md → ## [Unreleased]. -->
<!-- Example entry: "- Fixed shelf disappearing after reboot." -->

## Type of Change

- [ ] Bug fix (`[FIX]`)
- [ ] New feature (`[FEATURE]`)
- [ ] Refactor / code cleanup (`[REFACTOR]`)
- [ ] Documentation update
- [ ] i18n / localization
- [ ] Build / CI change

## Checklist

- [ ] My PR title starts with `[FIX]`, `[REFACTOR]`, or `[FEATURE]`.
- [ ] I added my changes to `CHANGELOG.md` under `## [Unreleased]`.
- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md).
- [ ] My code follows the project's code style (2 spaces, semicolons, double quotes).
- [ ] I ran `pnpm run build:plugin` with no errors.
- [ ] I ran `bash scripts/build/validate-compat.sh` and all checks pass.
- [ ] I tested on a Steam Deck (or explained why this isn't needed).
- [ ] If I added i18n keys, I added them to **all** locale files.

## Screenshots / Videos

<!-- If applicable, add screenshots or videos showing the change on Steam Deck. -->

## Additional Notes

<!-- Anything else reviewers should know. -->
