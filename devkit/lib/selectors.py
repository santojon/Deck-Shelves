"""Devkit selector & runtime-key registry.

Centralizes every DOM selector / global var / route the devkit tools poke at,
so they can be swapped per-project via env vars without forking the devkit.

Defaults match the Deck Shelves plugin. Override any of the following:

  DEVKIT_HOME_MOUNT_ID          # default: deck-shelves-home-root
  DEVKIT_QAM_SCOPE_SEL          # default: .deck-shelves-qam-scope
  DEVKIT_ROOT_SEL               # default: .deck-shelves-root
  DEVKIT_SHELF_SEL              # default: .ds-shelf
  DEVKIT_ROW_SEL                # default: .ds-row-scroll
  DEVKIT_CARD_SEL               # default: .ds-card
  DEVKIT_FOCUS_CLASS            # default: gpfocus
  DEVKIT_VIEWPORT_SEL           # default: ._3PhGYbMWIcIaZCfllWN19N
  DEVKIT_NEWS_SEL               # default: .cE1SaW6jrVUDxcqRtyMo1
  DEVKIT_COLLAPSIBLE_HEADER_SEL # default: .ds-collapsible-header
  DEVKIT_ABOUT_ROUTE            # default: /deck-shelves/about
  DEVKIT_CLASS_MAP_GLOBAL       # default: __DS_CLASS_MAP
  DEVKIT_CLASS_MAP_LS_KEY       # default: ds_class_map
"""

import os


def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v if v else default


HOME_MOUNT_ID          = _env("DEVKIT_HOME_MOUNT_ID",          "deck-shelves-home-root")
QAM_SCOPE_SEL          = _env("DEVKIT_QAM_SCOPE_SEL",          ".deck-shelves-qam-scope")
ROOT_SEL               = _env("DEVKIT_ROOT_SEL",               ".deck-shelves-root")
SHELF_SEL              = _env("DEVKIT_SHELF_SEL",              ".ds-shelf")
ROW_SEL                = _env("DEVKIT_ROW_SEL",                ".ds-row-scroll")
CARD_SEL               = _env("DEVKIT_CARD_SEL",               ".ds-card")
FOCUS_CLASS            = _env("DEVKIT_FOCUS_CLASS",            "gpfocus")
VIEWPORT_SEL           = _env("DEVKIT_VIEWPORT_SEL",           "._3PhGYbMWIcIaZCfllWN19N")
NEWS_SEL               = _env("DEVKIT_NEWS_SEL",               ".cE1SaW6jrVUDxcqRtyMo1")
COLLAPSIBLE_HEADER_SEL = _env("DEVKIT_COLLAPSIBLE_HEADER_SEL", ".ds-collapsible-header")
ABOUT_ROUTE            = _env("DEVKIT_ABOUT_ROUTE",            "/deck-shelves/about")
CLASS_MAP_GLOBAL       = _env("DEVKIT_CLASS_MAP_GLOBAL",       "__DS_CLASS_MAP")
CLASS_MAP_LS_KEY       = _env("DEVKIT_CLASS_MAP_LS_KEY",       "ds_class_map")
