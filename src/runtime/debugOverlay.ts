/* Dev-only overlay gate. The overlay turns on when Advanced mode is enabled AND
   either the Developer-mode `debugOverlayEnabled` toggle is on, or a legacy flag
   is set (localStorage `ds-debug=1` / `?debug=1`). Off by default, so the overlay
   component is never mounted and schedules no work. */

export function isDebugOverlayEnabled(
  settings: { advancedModeEnabled?: boolean; debugOverlayEnabled?: boolean } | null | undefined,
): boolean {
  if (settings?.advancedModeEnabled !== true) return false;
  if (settings?.debugOverlayEnabled === true) return true;
  try {
    if (localStorage.getItem("ds-debug") === "1") return true;
  } catch { /* private mode */ }
  try {
    if (typeof location !== "undefined" && /[?&]debug=1(&|$)/.test(location.search)) return true;
  } catch { /* no location */ }
  return false;
}
