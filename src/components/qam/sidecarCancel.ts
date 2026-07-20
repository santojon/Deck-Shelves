/* B-button (CANCEL) handling for the QAM sidecar. Extracted from
   DeckQAMSettings.tsx (which is at its line-size limit). onButtonDown must
   ABSORB the event, else Decky's QAM router ALSO navigates back to the plugin
   list; plain onCancelButton doesn't prevent that. Mirrors the ShelfSideNav
   CANCEL pattern. */
import { GamepadButton } from '../../runtime/homeInputBus';

// onCancelButton value for the main tab: close the sidecar when it's open, else
// undefined so a normal B falls through to Decky's default back-nav.
export function sidecarCancelHandler(expanded: boolean, close: () => void): (() => void) | undefined {
  return expanded ? close : undefined;
}

// Close on B and swallow the event so it doesn't reach Decky's router. Bare
// method calls (no `?.`) keep cyclomatic complexity down — the try/catch guards.
// Returns true when it handled B (Steam's onButtonDown treats that as consumed).
export function absorbCancelButton(evt: any, close: () => void): boolean {
  const detail = evt?.detail;
  const btn = detail?.button;
  // 2 = CANCEL (verified live); also accept the imported enum in case it differs.
  if (btn !== 2 && btn !== GamepadButton.CANCEL) return false;
  const inner = detail.event;
  try { evt.preventDefault(); evt.stopImmediatePropagation(); } catch {}
  try { inner.preventDefault(); inner.stopImmediatePropagation(); } catch {}
  close();
  return true;
}

// Main-tab onButtonDown: only intercept B while the sidecar is open.
export function mainCancelButtonDown(evt: any, expanded: boolean, close: () => void): boolean {
  return expanded ? absorbCancelButton(evt, close) : false;
}
