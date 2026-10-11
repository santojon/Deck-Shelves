# Help validate Deck Shelves 3.3.4 on your platform

*[Leia em português](pt-BR/call-for-validators.md)*

3.3.4 is the stability release: return to Home in under a second, your selected
card kept, idle home that no longer keeps the CPU busy, automatic Safe Mode for
bad starts, and a set of on-device gates that now run every release (restart
soak, sleep/wake soak, plugin reload, battery). All of that was measured on a
Steam Deck LCD on the Steam Client Beta and on a Mac — which leaves a lot of
real-world setups unverified.

**Looking for one named validator each for:**

- Steam Deck **OLED** (any Steam channel)
- SteamOS **Stable** and **Preview**
- **Bazzite** (Decky Loader and the standalone host)
- **Windows** (standalone host)
- Linux desktop other than SteamOS (standalone host)
- **ARM64** (the experimental standalone-host build)

**What it takes:** ten minutes, three shelves, the six checks in
[docs/validation-matrix.md](../docs/validation-matrix.md#how-to-validate-a-cell)
(cold boot, return to Home, reload, sleep/wake, Home with a game running, idle),
then the bug-report copy from Settings → About → Diagnostics in a GitHub issue
titled with your platform and host — or a message in the validation channel on
Discord.

**What you get:** your name on the validation matrix, thanks in the release notes,
and first access to the next beta of the host you validated on.
