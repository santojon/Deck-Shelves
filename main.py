import os
import json
import logging

import decky
from settings import SettingsManager

logger = decky.logger

settings_dir = os.environ["DECKY_PLUGIN_SETTINGS_DIR"]
settings = SettingsManager(name="settings", settings_directory=settings_dir)
settings.read()


class Plugin:
    async def settings_read(self):
        return settings.read()

    async def settings_commit(self):
        return settings.commit()

    async def settings_getSetting(self, key: str, defaults=None):
        return settings.getSetting(key, defaults)

    async def settings_setSetting(self, key: str, value):
        settings.setSetting(key, value)
        return True


    async def get_i18n(self, lang: str = "en-US"):
        """Return i18n dictionary for the requested language (falls back to en-US)."""
        try:
            plugin_dir = os.environ.get("DECKY_PLUGIN_DIR", os.path.dirname(__file__))
            i18n_dir = os.path.join(plugin_dir, "i18n")
            def load(code):
                p = os.path.join(i18n_dir, f"{code}.json")
                if not os.path.exists(p):
                    return None
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
            data = load(lang) or load(lang.split("-")[0]) or load("en-US") or {}
            return data
        except Exception as e:
            logger.error(f"get_i18n failed: {e}")
            return {}

    async def _main(self):
        logger.info("Deck Shelves backend started")

    async def _unload(self):
        logger.info("Deck Shelves backend unloaded")
