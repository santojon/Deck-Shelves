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

// Feed the focused-window and the GamepadUI main-window BrowserWindows to `push`.
function pushFocusedAndMain(push: (candidate: any) => void): void {
  try { push((window as any).SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow); } catch {}
  try { push((window as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow); } catch {}
}

// Feed every BrowserWindow in the SteamUIStore window list to `push`.
function pushAllSteamUIWindows(push: (candidate: any) => void): void {
  try {
    const steamWindows = (window as any).SteamUIStore?.WindowStore?.SteamUIWindows;
    if (Array.isArray(steamWindows)) {
      for (const entry of steamWindows) push(entry?.BrowserWindow);
    }
  } catch {}
}

export function getAllSteamDocuments(): Document[] {
  const docs: Document[] = [];
  const seen = new Set<Document>();
  const push = (candidate: any) => {
    try {
      const d: Document | undefined = candidate?.document ?? candidate;
      if (!d || typeof (d as Document).querySelector !== "function") return;
      if (seen.has(d as Document)) return;
      seen.add(d as Document);
      docs.push(d as Document);
    } catch {}
  };
  push(preferredSteamWindow);
  push(window);
  try { push((window as any).opener); } catch {}
  pushFocusedAndMain(push);
  pushAllSteamUIWindows(push);
  return docs;
}