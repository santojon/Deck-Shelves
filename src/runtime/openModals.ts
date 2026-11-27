// Counts the plugin's own open modals, so boot focus helpers can wait for them instead of fighting them.
let openCount = 0;

export function modalOpened(): () => void {
  openCount++;
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openCount = Math.max(0, openCount - 1);
  };
}

export function isPluginModalOpen(): boolean {
  return openCount > 0;
}
