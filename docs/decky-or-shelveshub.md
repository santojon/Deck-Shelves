# Decky Loader or ShelvesHub?

*[Leia em português](pt-BR/decky-or-shelveshub.md)*

Deck Shelves runs on two hosts. Both deliver the same plugin build and the same
settings; they differ in how the plugin gets onto the device, how it updates,
and what else is around it. Pick by platform first, then by what you already have.

| | Decky Loader | ShelvesHub (standalone host) |
|---|---|---|
| **Platforms** | SteamOS / Steam Deck and Linux distributions that ship Decky (Bazzite) | Steam Deck, Linux, macOS, Windows; ARM64 experimental |
| **Install** | Install Decky Loader, then the plugin from the Decky Store (or the zip / URL paths) | One-click installer per platform; no loader step |
| **Updates** | Decky Store updates; pre-release only via the testing flag | Updates itself and the plugin, each with its own optional pre-release channel |
| **Backend** | Python backend runs inside the loader's plugin process | The host runs the same Python backend as its own service |
| **Quick Access tab** | Decky's plugin tab | Its own native-styled Quick Access tab with the full settings editor |
| **Other plugins** | Works next to every other Decky plugin, including CSS Loader themes | No plugin loader on the device — CSS Loader themes need Decky to be present |
| **Both at once** | Supported: the first copy to mount owns the home, the other stands down | Same; settings are mirrored between the two installs |
| **Settings & profiles** | Stored under the loader's settings directory | Stored under the host's data directory; mirrored to the loader's when both are present |
| **Remove** | Uninstall from the Decky Store | Uninstaller / remove the user service |
| **Best when** | You already run Decky and other plugins, or you want CSS Loader themes | Fresh device, no Decky, a non-SteamOS platform, or you want automatic plugin updates |

Install guides: the [README](../README.md#installation) covers both paths; the community
write-up on the standalone host is in [community-docs/shelveshub-install.md](../community-docs/shelveshub-install.md).
Which setups have been exercised for the current release: [validation-matrix.md](validation-matrix.md).
