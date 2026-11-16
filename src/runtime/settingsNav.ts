let pendingTab: string | null = null;

export function setPendingSettingsTab(tab: string): void {
  pendingTab = tab;
}

export function consumePendingSettingsTab(): string | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}
