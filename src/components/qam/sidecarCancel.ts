// onButtonDown must absorb B, or Decky's QAM router also navigates back.
import { GamepadButton } from '../../runtime/homeInputBus';

export function sidecarCancelHandler(expanded: boolean, close: () => void): (() => void) | undefined {
  return expanded ? close : undefined;
}

export function absorbCancelButton(evt: any, close: () => void): boolean {
  const detail = evt?.detail;
  const btn = detail?.button;
  // 2 = CANCEL; the imported enum is accepted too in case it differs.
  if (btn !== 2 && btn !== GamepadButton.CANCEL) return false;
  const inner = detail.event;
  try { evt.preventDefault(); evt.stopImmediatePropagation(); } catch {}
  try { inner.preventDefault(); inner.stopImmediatePropagation(); } catch {}
  close();
  return true;
}

export function mainCancelButtonDown(evt: any, expanded: boolean, close: () => void): boolean {
  return expanded ? absorbCancelButton(evt, close) : false;
}
