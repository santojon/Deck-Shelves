# Security Policy

## Supported versions

| Version                 | Supported |
| ----------------------- | --------- |
| Latest `main` branch    | ✅         |
| Previous tagged release | ✅         |
| Older releases          | ❌         |

Fixes ship in a new release, so the safest place to be is the latest one.

## Reporting a vulnerability

Report it privately through GitHub Security Advisories:
[github.com/santojon/Deck-Shelves/security/advisories](https://github.com/santojon/Deck-Shelves/security/advisories).
If that isn't available to you, contact me directly before saying anything in
public. Please don't open a public issue for a vulnerability.

Include what you can of:

- the kind of vulnerability and its impact
- steps to reproduce, ideally a minimal case
- expected vs actual behaviour
- logs or screenshots
- a suggested fix (optional)

I look into reports as soon as I can, and may suggest a temporary mitigation
before a full fix ships. Please keep the details private until the fix is
released. Once it is, the fix is noted in the release notes or an advisory,
and I credit the reporter unless they prefer to stay anonymous.

## Scope

In scope:

- handling of plugin settings, imports and exports
- file parsing and metadata processing
- network requests and integrations with other plugins
- local filesystem access by the Python backend
- the update check and update download
- UI injection into Steam
- vulnerabilities in dependencies that affect what ships

Usually out of scope, unless they lead to a practical exploit:

- denial of service caused by unsupported modifications
- problems that only exist in outdated third-party environments
- attacks that need physical access to the device
- theoretical attacks without a realistic path

## How the plugin handles data

- **Local first.** Everything works offline. Online features (wishlist,
  store, prices, friends) are off by default and only talk to Steam's own
  endpoints. The update check only talks to GitHub's releases API, and an
  update download is accepted only from this repository's release assets.
- **TLS is always verified** for outbound requests, and no secret appears in a
  URL or in a log line.
- **Filesystem access is confined.** The backend writes only to its own
  settings folder and the user folders it needs (such as Downloads for exports
  and updates). Beyond those it reads only the Steam and plugin files it
  integrates with (non-Steam shortcuts, library folders, TabMaster and CSS
  Loader data). Paths are checked against an allowlist, and imports and
  exports reject symlinks.
- **Your Steam account ID is never stored or sent.** To keep settings per
  account, only a salted 16-character key of it is kept. The salt stays on the
  device (in a file beside the settings file, never inside it, and in the Steam
  client's local storage), so no file that carries settings (the settings file,
  snapshots, exports, the cloud copy, reports) can lead back to the account.
- **No analytics, and no external code is executed.** Other plugins interact
  only through the public plugin API, inside the same Steam process.
- **Few dependencies.** The frontend ships React, i18next and Zod; the backend
  uses the Python standard library, plus `psutil` for performance readings when
  the system already has it. Dependencies are reviewed for known CVEs,
  supply-chain risk and maintenance status when they are updated.

## Limits

Deck Shelves runs inside Steam with the permissions Decky Loader gives every
plugin. Its security can't exceed that of SteamOS, Decky Loader and the other
plugins you install. Keep them updated, install plugins from sources you
trust, and avoid modified builds of this one.
