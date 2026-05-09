# Security Policy

## Supported Versions

The following versions of Deck Shelves currently receive security updates and vulnerability fixes.

| Version                 | Supported |
| ----------------------- | --------- |
| Latest main branch      | ✅         |
| Previous tagged release | ✅         |
| Older releases          | ❌         |

> Because Deck Shelves is under active development, users are encouraged to always stay on the latest release.

---

## Reporting a Vulnerability

If you discover a security vulnerability in Deck Shelves, please report it responsibly.

### Preferred Contact

Open a private security report through GitHub Security Advisories:

* GitHub: [https://github.com/santojon/Deck-Shelves/security/advisories](https://github.com/santojon/Deck-Shelves/security/advisories)

If private advisories are unavailable, contact the maintainer directly before publicly disclosing the issue.

---

## What to Include

Please include as much information as possible:

* Vulnerability type
* Steps to reproduce
* Expected vs actual behavior
* Impact assessment
* Screenshots or logs (if applicable)
* Suggested mitigation or patch (optional)

Providing a minimal reproduction case is highly appreciated.

---

## Disclosure Policy

To help protect users:

* Do not publicly disclose vulnerabilities before a fix is available.
* Security issues will be investigated as quickly as possible.
* Once resolved, fixes may be documented in release notes or advisories.

Depending on severity, temporary mitigations may be recommended before a full patch is released.

---

## Scope

The following areas are considered in scope:

* Plugin configuration handling
* File parsing and metadata processing
* Network requests and external integrations
* Local filesystem access
* Update and loading mechanisms
* UI injection or webview-related vulnerabilities
* Dependency vulnerabilities affecting shipped functionality

The following are generally considered out of scope unless they lead to a practical exploit:

* Denial of service caused by unsupported modifications
* Vulnerabilities caused exclusively by outdated third-party environments
* Issues requiring physical access to the device
* Theoretical-only attacks without realistic exploitation paths

---

## Security Goals

Deck Shelves aims to:

* Avoid unnecessary data collection
* Operate fully locally whenever possible
* Minimize filesystem permissions and access scope
* Avoid executing arbitrary external code
* Keep third-party dependencies minimal and auditable
* Maintain compatibility with Steam Deck security expectations

---

## Dependency Management

Dependencies are reviewed periodically for:

* Known CVEs
* Supply-chain risks
* Unmaintained packages
* Excessive permissions or unsafe behaviors

Automated dependency updates may be used when appropriate.

---

## Hardening Recommendations for Users

Users are encouraged to:

* Keep Deck Shelves updated
* Install plugins only from trusted sources
* Avoid modified or unofficial builds unless they trust the maintainer
* Review permissions granted to external integrations
* Keep SteamOS and Decky Loader updated

---

## Compatibility Notice

Deck Shelves integrates with third-party environments such as Decky Loader and SteamOS. Security guarantees are limited by the security posture of those platforms and any installed plugins.

---

## Acknowledgements

Responsible disclosures may be acknowledged in release notes or a dedicated credits section, unless anonymity is requested.
