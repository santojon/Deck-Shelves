# AI Usage

Deck Shelves is designed and maintained by its author. In line with the growing
community practice of being transparent about tooling, this is a statement of **where AI assists the project — and where it does not**.

## Where AI is used

AI is used as a **supporting tool**, the same way a linter, a formatter, or a
search engine is — never as the author of the plugin's behaviour. It helps
with:

- **Auxiliary scripts** — build, packaging, CI, and developer/diagnostic
  tooling (the helpers under `scripts/` and the `deckprobe` debug utilities).
- **Internationalization** — drafting and maintaining translations across the
  supported locales under `i18n/`.
- **Debugging** — reproducing issues, narrowing them down, and proposing fixes.
- **Documentation** — drafting and tidying docs, code comments, and notes.

## What AI is **not** used for

- **Features are conceived and authored by the
  maintainer.** AI does not decide what the plugin does or how it should work.
- Everything AI proposes — code, translations, scripts, or docs — is
  **reviewed, tested, and adjusted by hand** before it ships. The maintainer is
  accountable for every line in this repository.

## Why this file exists

Transparency. If you're evaluating, contributing to, or forking Deck Shelves,
you deserve to know how it's made. Questions are welcome on the
[Discord](https://discord.gg/EChuVEDakk) or in the
[discussions](https://github.com/santojon/Deck-Shelves/discussions).
