/* One-shot hand-off for deep-linking the Settings page to a specific tab.
   `openSettingsPage(tab)` stashes the tab id here before navigating; the
   SettingsPage consumes it once on mount, then clears it so a later plain
   navigation doesn't re-land on the same tab. */
let pendingTab: string | null = null;

export function setPendingSettingsTab(tab: string): void {
  pendingTab = tab;
}

export function consumePendingSettingsTab(): string | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}
