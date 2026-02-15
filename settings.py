import json
import os
from pathlib import Path
from typing import Any, Optional

class SettingsManager:
    """Minimal Decky-style settings helper.

    Stores a single JSON file under DECKY_PLUGIN_SETTINGS_DIR.
    """

    def __init__(self, name: str = "settings", settings_directory: str = "."):
        self.name = name
        self.settings_directory = Path(settings_directory)
        self.path = self.settings_directory / f"{self.name}.json"
        self._data: dict[str, Any] = {}

    def read(self) -> dict[str, Any]:
        self.settings_directory.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            try:
                self._data = json.loads(self.path.read_text(encoding="utf-8"))
            except Exception:
                # Corrupted file or invalid JSON -> keep empty
                self._data = {}
        return self._data

    def commit(self) -> bool:
        self.settings_directory.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)
        return True

    def getSetting(self, key: str, defaults: Optional[Any] = None) -> Any:
        return self._data.get(key, defaults)

    def setSetting(self, key: str, value: Any) -> None:
        self._data[key] = value
