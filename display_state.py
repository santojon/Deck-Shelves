"""External-display / dock detection via the Linux DRM connectors.

On SteamOS/Linux each output is `/sys/class/drm/<card>-<CONNECTOR>/status`
("connected" | "disconnected" | "unknown"). The internal Deck panel is `eDP`;
any OTHER connected connector (DP / HDMI) is an external display — i.e. the Deck
is docked. `Writeback` connectors are virtual and ignored.

Cross-platform + fail-soft: on Windows / macOS the DRM sysfs path is absent, so
`supported` is False and `external` is False (the frontend treats external-display
rules as inert there rather than mis-classifying). Read-only.
"""
import glob
import os
from typing import Any, Dict

DRM_ROOT = "/sys/class/drm"


def read_display_state(drm_root: str = DRM_ROOT) -> Dict[str, Any]:
    paths = glob.glob(os.path.join(drm_root, "*", "status"))
    if not paths:
        return {"external": False, "supported": False}
    external = False
    for path in paths:
        name = os.path.basename(os.path.dirname(path)).lower()  # e.g. "card0-dp-1"
        if "edp" in name or "writeback" in name:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                if f.read().strip().lower() == "connected":
                    external = True
                    break
        except Exception:
            continue
    return {"external": external, "supported": True}
