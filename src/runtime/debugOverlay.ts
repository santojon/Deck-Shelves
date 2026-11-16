export function isDebugOverlayEnabled(
  settings: { advancedModeEnabled?: boolean; debugOverlayEnabled?: boolean } | null | undefined,
): boolean {
  if (settings?.advancedModeEnabled !== true) return false;
  if (settings?.debugOverlayEnabled === true) return true;
  try {
    if (localStorage.getItem("ds-debug") === "1") return true;
  } catch {}
  try {
    if (typeof location !== "undefined" && /[?&]debug=1(&|$)/.test(location.search)) return true;
  } catch {}
  return false;
}
