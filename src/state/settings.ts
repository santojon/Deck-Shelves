import { useEffect, useState } from "react";
import { callable } from "@decky/api";
import type { DeckShelvesSettings } from "../types";
import { createStore } from "./store";

export const SETTINGS_KEY = "deck_shelves.settings";

export const DEFAULT_SETTINGS: DeckShelvesSettings = {
  enabled: true,
  shelves: [
    {
      id: "recently_played",
      name: "Recent",
      enabled: true,
      limit: 20,
      sourceType: "tab",
      tab: "recently_played",
    },
    {
      id: "favorites",
      name: "Favorites",
      enabled: true,
      limit: 20,
      sourceType: "tab",
      tab: "favorites",
    },
  ],
};

const settings_getSetting = callable<[key: string, defaults: any], any>("settings_getSetting");
const settings_setSetting = callable<[key: string, value: any], void>("settings_setSetting");
const settings_commit = callable<[], void>("settings_commit");

const store = createStore<DeckShelvesSettings>(DEFAULT_SETTINGS);

let loadedOnce = false;
let savingTimer: number | undefined;

export function getSettings() {
  return store.get();
}

export function setSettings(next: DeckShelvesSettings) {
  store.set(next);

  // Persist debounced (also triggers hot reload of shelves, because store notifies immediately)
  if (!loadedOnce) return;
  if (savingTimer) window.clearTimeout(savingTimer);
  savingTimer = window.setTimeout(async () => {
    try {
      await settings_setSetting(SETTINGS_KEY, store.get());
      await settings_commit();
    } catch (e) {
      console.error("Deck Shelves: failed to save settings", e);
    }
  }, 300);
}

export function subscribeSettings(listener: (s: DeckShelvesSettings) => void) {
  return store.subscribe(listener);
}

export function useDeckShelvesSettings() {
  const [settings, setLocal] = useState(store.get());
  const [loaded, setLoaded] = useState(loadedOnce);

  useEffect(() => subscribeSettings(setLocal), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (loadedOnce) {
        if (alive) setLoaded(true);
        return;
      }
      try {
        const s = await settings_getSetting(SETTINGS_KEY, DEFAULT_SETTINGS);
        loadedOnce = true;
        store.set((s ?? DEFAULT_SETTINGS) as DeckShelvesSettings);
      } catch (e) {
        console.error("Deck Shelves: failed to load settings", e);
        loadedOnce = true;
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { settings, setSettings, loaded };
}
