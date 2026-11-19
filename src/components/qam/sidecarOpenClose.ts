import { useCallback, useEffect, useRef } from 'react'
import type { SettingsController } from '../../features/settings/controller'
import { useQamExpanded, resetQamExpanded } from './qamExpandedStore'
import { getQamWindow, useQamCompositorSync, useIsActiveQamTab, shouldRenderSidecar } from './sidecarActiveTab'
import { useDpadExpandBridge, fireQamExpand } from './sidecar/SidecarPanel'
import { useSidecarMenu } from './sidecar/sidecarMenu'

export function useSidecarOpenClose(controller: SettingsController) {
  const [qamExpanded, setQamExpanded] = useQamExpanded();
  const dsScopeRef = useRef<HTMLDivElement>(null);
  // Only the on-screen instance drives the sidecar, so two mounted panels never fight over it.
  const isActiveTab = useIsActiveQamTab(dsScopeRef);
  useQamCompositorSync(qamExpanded, isActiveTab);
  useDpadExpandBridge(dsScopeRef, setQamExpanded, isActiveTab);
  const closeSidecar = useCallback(() => {
    // getQamWindow() can resolve a window whose opener doesn't post through to the compositor.
    const win = dsScopeRef.current?.ownerDocument?.defaultView ?? getQamWindow();
    fireQamExpand(win, false, setQamExpanded);
  }, [setQamExpanded]);
  const openSidecar = useCallback(() => {
    fireQamExpand(dsScopeRef.current?.ownerDocument?.defaultView ?? getQamWindow(), true, setQamExpanded);
  }, [setQamExpanded]);
  const inlineSidecar = useSidecarMenu({ scopeRef: dsScopeRef, open: shouldRenderSidecar(isActiveTab, qamExpanded), controller, onCollapse: closeSidecar, onOpen: openSidecar });
  const toggleSidecar = useCallback(() => {
    const win = dsScopeRef.current?.ownerDocument?.defaultView ?? getQamWindow();
    fireQamExpand(win, !qamExpanded, setQamExpanded);
  }, [qamExpanded, setQamExpanded]);
  useEffect(() => {
    if (!isActiveTab) return;
    resetQamExpanded();
    // A host's own tab can remount while the compositor is still wide, so narrow it explicitly.
    const win = dsScopeRef.current?.ownerDocument?.defaultView ?? getQamWindow();
    fireQamExpand(win, false, setQamExpanded);
    return () => setQamExpanded(false);
  }, [setQamExpanded, isActiveTab]);
  return { qamExpanded, setQamExpanded, dsScopeRef, isActiveTab, closeSidecar, inlineSidecar, toggleSidecar };
}

export function useSidecarAutoCollapse({ dsScopeRef, qamExpanded, setQamExpanded, isActiveTab }: { dsScopeRef: { current: HTMLDivElement | null }; qamExpanded: boolean; setQamExpanded: (v: boolean) => void; isActiveTab: boolean }): void {
  // The tab stays mounted across QAM open/close and no single signal covers every way Steam hides it.
  useEffect(() => {
    if (!isActiveTab) return;
    const scope = dsScopeRef.current;
    const doc = scope?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    // Collapsing on visibilitychange feeds a compositor loop, so the return signal is focus while hidden.
    const collapse = () => setQamExpanded(false);
    const collapseOnReturn = () => { if (doc.hidden) fireQamExpand(win, false, setQamExpanded); };
    const onVis = () => { if (doc.hidden) collapse(); };
    doc.addEventListener("visibilitychange", onVis);
    win.addEventListener("focus", collapseOnReturn);
    win.addEventListener("pagehide", collapse);
    doc.addEventListener("freeze", collapse);
    doc.addEventListener("resume", collapseOnReturn);
    return () => {
      doc.removeEventListener("visibilitychange", onVis);
      win.removeEventListener("focus", collapseOnReturn);
      win.removeEventListener("pagehide", collapse);
      doc.removeEventListener("freeze", collapse);
      doc.removeEventListener("resume", collapseOnReturn);
    };
  }, [setQamExpanded, isActiveTab]);

  // m_eOpenSideMenu changes when Steam opens an overlay over the QAM; polled only while expanded.
  useEffect(() => {
    if (!isActiveTab || !qamExpanded) return;
    const doc = dsScopeRef.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const getMenuState = (): number | null => {
      try {
        const opener = (win as any).opener;
        const ms = opener?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.m_MenuStore;
        return typeof ms?.m_eOpenSideMenu === "number" ? ms.m_eOpenSideMenu : null;
      } catch { return null; }
    };
    const refValue = getMenuState();
    let lastTick = Date.now();
    const id = window.setInterval(() => {
      try {
        const now = Date.now();
        const gap = now - lastTick;
        lastTick = now;
        const menuState = getMenuState();
        const menuChanged = refValue !== null && menuState !== null && menuState !== refValue;
        // doc.hasFocus() is useless here: the QAM document never holds DOM focus in GamepadUI.
        const resumedFromBackground = gap > 1500 && doc.visibilityState !== "visible";
        if (menuChanged || resumedFromBackground) {
          setQamExpanded(false);
          window.clearInterval(id);
        }
      } catch {}
    }, 300);
    return () => window.clearInterval(id);
  }, [qamExpanded, setQamExpanded, isActiveTab]);
}
