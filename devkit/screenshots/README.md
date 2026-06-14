# `devkit/screenshots` — localised screenshot pipeline

Drives the QAM to take per-locale screenshots used in release
publishing. Until the split, the runner lives at
`scripts/devtools/deck/screenshots/`. The package script

```bash
pnpm screenshots
```

delegates to it.
