// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../runtime/host/decky", () => ({
  ConfirmModal: ({ strTitle, strDescription, strOKButtonText, strCancelButtonText, onOK, onCancel, children }: any) =>
    h("div", { "data-testid": "modal" },
      h("h1", null, strTitle),
      h("p", null, strDescription),
      children,
      h("button", { "data-testid": "ok", onClick: onOK }, strOKButtonText),
      h("button", { "data-testid": "cancel", onClick: onCancel }, strCancelButtonText)),
  DialogButton: ({ children, onClick }: any) => h("button", { onClick }, children),
  Focusable: ({ children }: any) => h("div", null, children),
}));
vi.mock("../../../components/ui", () => ({ ModalShell: ({ children }: any) => h("div", null, children) }));
vi.mock("../../../core/statSuggestions", () => ({ resolveStatSuggestions: async () => [{ templateId: "never_played" }] }));

import { SetupWizardModal } from "../../../components/qam/modals/SetupWizardModal";
import { defaultSettings } from "../../../domain/defaults";

function controllerStub(settings: any) {
  const actions = { applySetupPack: vi.fn(async () => true), revertSetupPack: vi.fn(async () => true), setSetupWizardSeen: vi.fn(async () => {}) };
  return { controller: { t: (k: string, o?: any) => (o?.name ? `${k}:${o.name}` : k), settings, actions } as any, actions };
}

async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));

describe("SetupWizardModal — pick → preview → apply, with revert", () => {
  let root: Root; let host: HTMLDivElement;
  beforeEach(() => { document.body.innerHTML = ""; host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });

  it("lists every pack by group, marks recommendations, previews a pack and applies it", async () => {
    const { controller, actions } = controllerStub(defaultSettings());
    const closeModal = vi.fn();
    await act(async () => { root.render(h(SetupWizardModal, { closeModal, controller })); });
    await flush();
    const labels = buttons(host).map((b) => b.textContent ?? "");
    expect(labels.some((b) => b.startsWith("setup_pack_backlog_rescue_title"))).toBe(true);
    expect(labels.some((b) => b.includes("setup_pack_essential_title") && b.includes("setup_recommended"))).toBe(true);
    expect(labels.some((b) => b.includes("setup_pack_backlog_rescue_title") && b.includes("setup_recommended"))).toBe(true);
    expect(labels.includes("setup_revert_last")).toBe(false);
    const backlog = buttons(host).find((b) => (b.textContent ?? "").startsWith("setup_pack_backlog_rescue_title"))!;
    await act(async () => { backlog.click(); });
    expect(host.querySelector("h1")?.textContent).toBe("setup_pack_backlog_rescue_title");
    const text = host.textContent ?? "";
    expect(text).toContain("template_never_played");
    expect(text).toContain("smart_template_backlog_rescue");
    expect(text).toContain("setup_preview_setting:smart_shelves_enabled");
    await act(async () => { (host.querySelector('[data-testid="ok"]') as HTMLButtonElement).click(); });
    await flush();
    expect(actions.applySetupPack).toHaveBeenCalledWith("backlog_rescue");
    expect(actions.setSetupWizardSeen).toHaveBeenCalledWith(true);
    expect(closeModal).toHaveBeenCalled();
  });

  it("offers the one-step revert only when a previous apply is recorded", async () => {
    const settings = { ...defaultSettings(), lastSetupApply: { packId: "essential", at: 1, addedShelfIds: [], addedSmartIds: [], prevSettings: {} } };
    const { controller, actions } = controllerStub(settings);
    await act(async () => { root.render(h(SetupWizardModal, { controller })); });
    await flush();
    const revert = buttons(host).find((b) => b.textContent === "setup_revert_last")!;
    expect(revert).toBeTruthy();
    await act(async () => { revert.click(); });
    await flush();
    expect(actions.revertSetupPack).toHaveBeenCalled();
  });
});
