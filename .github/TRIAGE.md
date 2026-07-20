# Issue Triage

Triage is automated by GitHub Actions workflows. This document is the source of
truth for the labels and the rules that apply them — keep it in sync with the
workflows under `.github/workflows/`.

## Label families

| Family | Labels |
|---|---|
| `type::` | `bug`, `feature`, `enhancement`, `duplicated`, `invalid`, `wontfix` |
| `priority::` | `critical`, `high`, `medium`, `low` |
| `OS::` | `SteamOS`, `Bazzite`, `Chimera`, `MacOS`, `Windows`, `OtherHoloISO` |
| `mode::` | `BigPicture`, `GameMode` |
| `release::` | `stable`, `beta` |
| control | `keep-open`, `needs-info`, `stale` |

## 1. Type — from the issue title

Workflow: `Triage · Label type (title)` (`issue-auto-labeler.yml`). Runs on
`issues`. The **title prefix** decides the type (case-insensitive, optional
`[ ]`):

- `fix` / `bug` / `hotfix` → **`type::bug`**
- `feat` / `feature` → **`type::feature`**
- `enh` / `enhance` / `enhancement` / `improve` → **`type::enhancement`**

No match → no type label (left for a maintainer). Existing type labels are never
overwritten.

## 2. OS / mode / release channel — from title + body

Workflow: `Triage · Label OS/mode` (`issue-os-labeler.yml`). Runs on `issues`.
Case-insensitive regex over `title\nbody`:

- **OS:** `bazzite` → `OS::Bazzite`; `chimera(os)` → `OS::Chimera`;
  `mac os` / `macos` / `darwin` / `osx` → `OS::MacOS`;
  `windows` / `win10|11|7|8` → `OS::Windows`; `steamos` (+ variants) → `OS::SteamOS`;
  `holoiso` → `OS::OtherHoloISO`.
- **Mode:** `big picture` / `bpbm` → `mode::BigPicture`;
  `game mode` / `gamepad ui` / `steam deck home|ui` → `mode::GameMode`.
- **Release channel** (only when explicit, from the bug-report form dropdown):
  `pre-release` → `release::beta`; `release channel … stable` → `release::stable`.
  A SteamOS-beta signal applies `OS::SteamOS` + `release::beta`.
- **Fallback:** if nothing matched but the text mentions `decky` / `gamepad ui` /
  `steam deck` / `homebrew` (and not Windows/Mac) → `OS::OtherHoloISO`, so the
  issue is never left unrouted.

## 3. Priority — derived

Workflow: `Triage · Label priority` (`issue-priority-labeler.yml`). Runs on
`issues` (`opened`, `edited`, `reopened`, `labeled`, `unlabeled`). Uses the
`type::` / `OS::` labels (with a title/body fallback for OS, since the OS labeler
runs in parallel):

| Condition | Priority |
|---|---|
| SteamOS **bug** (BigPicture / unspecified) | **`priority::high`** |
| non-SteamOS **bug** | **`priority::medium`** |
| SteamOS **enhancement / feature / docs** | **`priority::low`** |
| non-SteamOS (anything) | **`priority::low`** |

Manual priority overrides are preserved: only an auto-set `priority::low` is
re-evaluated on later `labeled` events, and when it upgrades, the old
`priority::low` label is removed first (so an issue never carries two buckets).

## 4. Stale policy

Workflow: `Triage · Stale issues` (`stale.yml`). Schedule: **Mondays 09:00 UTC**.
Three buckets (serialized), all exempting `keep-open`, `priority::critical`,
`priority::high`:

| Bucket | Applies to | Stale after | Auto-close |
|---|---|---|---|
| **awaiting-reporter** | `needs-info` | 21 days | +14 days (≈ 35d) |
| **untriaged-idle** | no `type::*` / `priority::*` yet | 30 days | +30 days (≈ 60d) |
| **confirmed-accepted** | `type::bug/feature/enhancement` or `priority::medium/low` | 60 days | **never** (label only, no comment) |

Stale/close comments ask the reporter for an update; a maintainer can add
`keep-open` (or a `type::*` / `priority::*` label) to exempt an issue.

## 5. Release notifications

Workflow: `Release · Notify issue reporters` (`notify-issue-reporters.yml`).
Fires on `release: published` (stable only — pre-releases are handled by
`prerelease.yml`). Comments on every issue referenced by the release's PRs,
pinging the original reporter to verify the fix.
