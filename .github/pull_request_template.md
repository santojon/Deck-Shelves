<!--
  PR title MUST start with one of these tags:
    [FIX]         — Bug fix
    [ENHANCEMENT] — Small improvement
    [PERF]        — Performance improvement
    [QA]          — QA harness / test instrumentation
    [REFACTOR]    — Refactor/restructure
    [CLEANUP]     — Code cleanup
    [FEATURE]     — New feature

  Example: [FIX] Prevent shelf from disappearing on reboot
-->

## Description

<!-- AUTOFILL:DESCRIPTION:START -->
<!-- Describe what this PR does and why. -->
<!-- AUTOFILL:DESCRIPTION:END -->

## Related Issues

<!-- Link issues closed or addressed by this PR (one per line, 0 or more). -->
<!-- Example: Closes #42 -->

## Changelog

<!-- AUTOFILL:CHANGELOG:START -->
<!-- Required. Add entries under ## [Unreleased] in CHANGELOG.md (technical detail). -->
<!-- Example: "- Fixed shelf disappearing after reboot." -->
<!-- AUTOFILL:CHANGELOG:END -->

## Release Notes

<!-- AUTOFILL:RELEASE_NOTES:START -->
<!-- Required. Add entries under ## [Unreleased] in RELEASE_NOTES.md (user-facing, less jargon). -->
<!-- Release bodies are extracted from this file at tag time. -->
<!-- Example: "- Shelves no longer disappear after a reboot." -->
<!-- AUTOFILL:RELEASE_NOTES:END -->

## Type of Change

<!-- At least ONE of the first three rows MUST be checked. The CI validator
     enforces this — a PR with none of the main categories selected fails the
     `pr-checklist` check. -->

- [ ] Refactor / restructure (`[REFACTOR]`)
- [ ] New feature / Code cleanup (`[FEATURE]`, `[CLEANUP]`)
- [ ] Bug fix / Enhancement / QA / Performance update (`[FIX]`, `[ENHANCEMENT]`, `[QA]`, `[PERF]`)
- [ ] Documentation update
- [ ] i18n / localization
- [ ] Build / CI change

## Checklist

<!-- ALL items must be checked. The "i18n keys" line is required only when the
     "i18n / localization" Type of Change is checked above; otherwise it can be
     left unchecked and the validator will skip it. -->

- [ ] My PR title starts with `[FIX]`, `[ENHANCEMENT]`, `[PERF]`, `[QA]`, `[REFACTOR]`, `[CLEANUP]`, or `[FEATURE]`.
- [ ] I added my changes to `CHANGELOG.md` and `RELEASE_NOTES.md` under `## [Unreleased]`.
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
