# Frame and Machine awareness

*[Leia em português](pt-BR/frame-and-machine.md)*

Deck Shelves runs on more than the Steam Deck. This page describes what the plugin knows about the device it runs on, how that knowledge reaches shelves and cards, and how to test the Frame and Machine paths without owning the hardware.

## Device model

Three things are tracked separately, and the family is never inferred from the CPU architecture (an ARM64 build on a desktop is still a PC):

| Field | Values | Source |
|---|---|---|
| Family | `deck`, `frame`, `machine`, `pc`, `handheld`, `unknown` | OS variant, vendor/product, the host's handshake |
| Architecture | `x86_64`, `aarch64`, `unknown` | the backend's platform probe |
| Capabilities | battery, external display, VR, controller — each `yes`, `no` or `unknown` | the family plus live signals |

Unknown stays unknown: a visibility rule that asks about a signal the device can't answer never hides a shelf.

## Compatibility by device

Steam rates every game for the Deck, and separately for the Steam Machine and the Steam Frame. Deck Shelves reads all three:

- **Card badges** show the rating of the device in use — the Frame rating on a Frame, the Machine rating on a Machine, the Deck rating everywhere else.
- **Filters** `Steam Frame compatibility` and `Steam Machine compatibility` work exactly like `Deck compatibility` (verified / playable / unsupported / unknown).

## VR in three values

The `VR support` filter now distinguishes **VR only**, **VR supported** and **No VR** (from Steam's own store categories, with the older VR tag as a fallback). Pick the first two on a headset, the last one for a flat-screen shelf. Filters saved before this change keep matching any VR title.

## Device setup packs

The setup wizard's "By device" group has starting points for a Frame, a Machine and a play-anywhere setup — see [shelf-templates.md](shelf-templates.md).

## Testing without the hardware

- **Developer simulator** (Settings → Developer): switch the simulated device kind at runtime; visibility rules, badges and filters react immediately.
- **QA build flag:** `DS_QA_FORCE_DEVICE=frame` (or `machine`, `deck`, …) with a development build fakes the device from boot — `pnpm run qa:device-frame` / `pnpm run qa:device-machine` deploy such a build to the test device.
- **Hardware report:** the bug-report hardware block (opt-in) now includes the resolved family, architecture and capabilities, so a tester on real Frame or Machine hardware can show what was detected in one paste.

## ARM64 as a first-class target

CI builds, packages and tests the plugin on a native arm64 runner next to the x86-64 one, audits that every backend dependency has an aarch64 wheel, and scans the packaged zip for native binaries — any x86-only binary fails the build. The plugin ships Python sources and a JavaScript bundle, so the expected result is "no native binaries at all".

Real Frame and Machine hardware has not been validated yet; the Frame path stays experimental until it is.
