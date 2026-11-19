import { useEffect, useRef } from 'react'
import { devTrace } from '../../runtime/devStamps'
import { resolveBindings, parseRawCombo, matchEvent, createMatcherState, DEFAULT_BINDINGS } from '../../runtime/buttonBindings'
import { resolveKeyboardBindings, parseKeyCombo, matchKeyEvent, createKeyMatcherState, isEditableKeyTarget, heldModifiers, type KeyModifierFlags } from '../../runtime/keyboardBindings'
import { subscribeControllerInput } from '../../runtime/controllerInput'
import { getCurrentSettings } from '../../store/settingsStore'
import { getQamWindow } from './sidecarActiveTab'
import { fireQamExpand } from './sidecar/SidecarPanel'

function traceRawInput(button: number, pressed: boolean): void {
  devTrace("__ds_input_trace", { t: Date.now(), button, pressed }, 40);
}

export function useSidecarShortcuts({ dsScopeRef, setQamExpanded, isActiveTab }: { dsScopeRef: { current: HTMLDivElement | null }; setQamExpanded: (v: boolean) => void; isActiveTab: boolean }): void {
  const openMatcherRef = useRef(createMatcherState());
  const closeMatcherRef = useRef(createMatcherState());
  useEffect(() => {
    if (!isActiveTab) return;
    return subscribeControllerInput((e) => {
      traceRawInput(e.button, e.pressed);
      if (!e.pressed) return;
      const s = getCurrentSettings();
      const b = resolveBindings(s?.buttonBindings as any, (s as any)?.buttonBindingsDisabled);
      if (b.navSidecarOpen && b.navSidecarOpen !== DEFAULT_BINDINGS.navSidecarOpen
        && matchEvent({ button: e.button }, parseRawCombo(b.navSidecarOpen), openMatcherRef.current)) {
        fireQamExpand(getQamWindow(), true, setQamExpanded); return;
      }
      if (b.navSidecarClose && b.navSidecarClose !== DEFAULT_BINDINGS.navSidecarClose
        && matchEvent({ button: e.button }, parseRawCombo(b.navSidecarClose), closeMatcherRef.current)) {
        fireQamExpand(getQamWindow(), false, setQamExpanded);
      }
    });
  }, [setQamExpanded, isActiveTab]);
  const openKeyMatcherRef = useRef(createKeyMatcherState());
  const closeKeyMatcherRef = useRef(createKeyMatcherState());
  useEffect(() => {
    if (!isActiveTab) return;
    const matchSidecarKey = (code: string | null, kb: ReturnType<typeof resolveKeyboardBindings>, held: KeyModifierFlags) => {
      const now = Date.now();
      const open = !!kb.navSidecarOpen && matchKeyEvent(code, parseKeyCombo(kb.navSidecarOpen), openKeyMatcherRef.current, now, held);
      const close = !open && !!kb.navSidecarClose && matchKeyEvent(code, parseKeyCombo(kb.navSidecarClose), closeKeyMatcherRef.current, now, held);
      return { open, close };
    };
    const resolveQamWin = () => dsScopeRef.current?.ownerDocument?.defaultView ?? getQamWindow();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isEditableKeyTarget((e.target as HTMLElement | null)?.tagName)) return;
      const s = getCurrentSettings();
      const kb = resolveKeyboardBindings(s?.keyboardBindings as any, (s as any)?.keyboardBindingsDisabled);
      const { open, close } = matchSidecarKey(e.code, kb, heldModifiers(e));
      if (!open && !close) return;
      fireQamExpand(resolveQamWin(), open, setQamExpanded);
    };
    // Key events only reach the QAM's own document; never preventDefault or stopPropagation here.
    const doc = dsScopeRef.current?.ownerDocument ?? document;
    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, [setQamExpanded, isActiveTab]);
}
