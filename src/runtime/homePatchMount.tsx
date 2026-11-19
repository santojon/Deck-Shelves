import React from "react";
import i18next from "i18next";
import { logDiagnostic } from "./diagnostics";
import { logError, logInfo, logWarn } from "./logger";
import { notify } from "../components/notify";
import { ROOT_ID, isHomeVisible, getHostContext, getContextSnapshot } from "./homePatchWindow";
import { type Anchor, resolveAnchor } from "./homePatchAnchor";
import { refreshCachedRecentsEl } from "./homePatchRecents";

let noAnchorLogged = false;

let mountFailed = false;
let mountError: string | null = null;
const MAX_BOUNDARY_FAILURES = 3;
let boundaryFailureCount = 0;

if (__DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__) {
  mountFailed = true;
  mountError = "QA: forced shelf render error";
}

export function getMountFailed(): boolean { return mountFailed; }
export function getMountError(): string | null { return mountError; }
export function resetMountFailed(): void { mountFailed = false; mountError = null; boundaryFailureCount = 0; notifyMountFailedChange(); }

const mountFailedListeners = new Set<() => void>();
export function subscribeMountFailed(cb: () => void): () => void {
  mountFailedListeners.add(cb);
  return () => { mountFailedListeners.delete(cb); };
}
function notifyMountFailedChange(): void {
  for (const cb of mountFailedListeners) { try { cb(); } catch {} }
}

function safeResolveAnchor(): Anchor | null | "error" {
  try { return resolveAnchor(); }
  catch (err) {
    const msg = String(err);
    logError("HOME", "resolveAnchor threw — crash protection engaged", msg);
    mountFailed = true;
    mountError = msg;
    return "error";
  }
}

function createMountElement(doc: Document, anchorParent: HTMLElement): HTMLElement {
  const mount = doc.createElement("div");
  mount.id = ROOT_ID;
  mount.className = "Panel";
  Object.assign(mount.style, {
    width: "100%", display: "block", position: "relative",
    zIndex: "0", margin: "0", padding: "0",
  });
  logInfo("HOME", "mount created", { parent: anchorParent.tagName });
  return mount;
}

function reparentMountTo(mount: HTMLElement, anchor: Anchor): boolean {
  try {
    if (mount.parentElement !== anchor.parent || (anchor.before && anchor.before !== mount && mount.nextSibling !== anchor.before)) {
      anchor.parent.insertBefore(mount, anchor.before);
    }
    return true;
  } catch (err) {
    const msg = String(err);
    logError("HOME", "mount insertion threw — crash protection engaged", msg);
    mountFailed = true;
    mountError = msg;
    return false;
  }
}

function clearMountFailureIfRecovered(): void {
  const qaForceShelfError = __DEV__ && typeof __QA_SHELF_ERROR__ !== "undefined" && __QA_SHELF_ERROR__;
  if (!mountFailed || qaForceShelfError) return;
  mountFailed = false;
  mountError = null;
  logInfo("HOME", "mount recovered after previous failure");
}

export function ensureMount(): HTMLElement | null {
  if (!isHomeVisible()) return null;
  const { doc } = getHostContext();
  const anchor = safeResolveAnchor();
  if (anchor === "error") return null;
  if (!anchor || anchor.parent === doc.body) {
    if (!noAnchorLogged) { noAnchorLogged = true; logWarn("HOME", "no mount anchor found yet", getContextSnapshot()); }
    return null;
  }
  noAnchorLogged = false;
  let mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
  if (!mount) mount = createMountElement(doc, anchor.parent);
  if (!reparentMountTo(mount, anchor)) return null;
  clearMountFailureIfRecovered();
  refreshCachedRecentsEl(doc, mount);
  return mount;
}

export class HomeBoundary extends React.Component<{ children: React.ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError(_err: unknown) { return { crashed: true }; }
  componentDidCatch(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    boundaryFailureCount++;
    if (__DEV__) logError("HOME", `shelf render crashed (${boundaryFailureCount}/${MAX_BOUNDARY_FAILURES})`, msg);
    logDiagnostic("error", "Home shelf render crashed", msg);
    if (boundaryFailureCount >= MAX_BOUNDARY_FAILURES) {
      mountFailed = true;
      mountError = msg;
      try {
        const { doc } = getHostContext();
        const mount = doc.getElementById(ROOT_ID) as HTMLElement | null;
        if (mount) { mount.innerHTML = ""; mount.style.display = "none"; }
      } catch {}
      notify("error", { title: i18next.t("mount_crash_title"), body: i18next.t("mount_crash_warning") });
      notifyMountFailedChange();
    } else {
      setTimeout(() => { if (!mountFailed) this.setState({ crashed: false }); }, 500);
    }
  }
  render() { return this.state.crashed ? null : this.props.children; }
}
