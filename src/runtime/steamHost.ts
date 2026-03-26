let preferredSteamWindow: Window | null = null;

export function setPreferredSteamWindow(win: Window | null | undefined) {
  preferredSteamWindow = win ?? null;
}

export function getPreferredSteamWindow(): Window {
  return preferredSteamWindow ?? window;
}

export function getPreferredSteamDocument(): Document {
  return getPreferredSteamWindow().document ?? document;
}