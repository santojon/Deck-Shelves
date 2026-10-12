// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../runtime/host/decky", () => ({
  ConfirmModal: ({ strTitle, strDescription, strOKButtonText, strCancelButtonText, bOKDisabled, onOK, onCancel, children }: any) =>
    h("div", { "data-testid": "modal" },
      h("h1", null, strTitle),
      h("p", null, strDescription),
      children,
      h("button", { "data-testid": "ok", disabled: !!bOKDisabled, onClick: onOK }, strOKButtonText),
      h("button", { "data-testid": "cancel", onClick: onCancel }, strCancelButtonText)),
  DialogButton: ({ children, onClick }: any) => h("button", { onClick }, children),
  // Tiles are Focusables with onActivate — render those as buttons so the test can click them.
  Focusable: ({ children, onActivate, className }: any) => onActivate ? h("button", { className, onClick: onActivate }, children) : h("div", { className }, children),
}));
vi.mock("../../../components/ui", () => ({ ModalShell: ({ children }: any) => h("div", null, children) }));
vi.mock("../../../core/statSuggestions", () => ({ resolveStatSuggestions: async () => [{ templateId: "never_played" }] }));
vi.mock("../../../features/settings/controller", () => ({ useSettingsController: () => { throw new Error("standalone controller must not be created when one is given"); } }));

import { SetupWizardModal } from "../../../features/setup/SetupWizardModal";
import { defaultSettings } from "../../../domain/defaults";

function controllerStub(settings: any) {
  const actions = { applySetupPack: vi.fn(async () => true), revertSetupPack: vi.fn(async () => true), setSetupWizardSeen: vi.fn(async () => {}) };
  return { controller: { t: (k: string, o?: any) => (o?.name ? `${k}:${o.name}` : o?.count !== undefined ? `${k}:${o.count}` : k), settings, actions } as any, actions };
}

async function flush() { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));
const text = (b: Element) => (b.textContent ?? "").trim();

describe("SetupWizardModal — tiles → review → done, with undo", () => {
  let root: Root; let host: HTMLDivElement;
  beforeEach(() => { document.body.innerHTML = ""; host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });

  it("shows every pack as a tile under its group, marks recommendations, reviews a pack and lands on the done screen after apply", async () => {
    const { controller, actions } = controllerStub(defaultSettings());
    const closeModal = vi.fn();
    await act(async () => { root.render(h(SetupWizardModal, { closeModal, controller })); });
    await flush();
    const tiles = buttons(host).filter((b) => b.className === "ds-setup-tile");
    expect(tiles.length).toBe(9);
    expect(host.textContent).toContain("setup_group_quick");
    expect(host.textContent).toContain("setup_group_device");
    const titles = tiles.map(text);
    expect(titles.some((s) => s.includes("setup_pack_essential_title") && s.includes("setup_recommended_short"))).toBe(true);
    expect(titles.some((s) => s.includes("setup_pack_backlog_rescue_title") && s.includes("setup_recommended_short"))).toBe(true);
    expect(buttons(host).some((b) => text(b) === "setup_revert_last")).toBe(false);
    // Step indicator on the first screen.
    expect(host.textContent).toContain("setup_step_choose");

    const backlog = tiles.find((b) => text(b).includes("setup_pack_backlog_rescue_title"))!;
    await act(async () => { backlog.click(); });
    const body = host.textContent ?? "";
    expect(body).toContain("setup_pack_backlog_rescue_title");
    expect(body).toContain("template_never_played");
    expect(body).toContain("smart_template_backlog_rescue");
    expect(body).toContain("setup_preview_setting:smart_shelves_enabled");
    expect(body).toContain("setup_count_shelves:1");
    expect(body).toContain("setup_count_smart:2");
    expect(body).toContain("setup_count_settings:1");
    expect((host.querySelector('[data-testid="ok"]') as HTMLButtonElement).disabled).toBe(false);

    await act(async () => { (host.querySelector('[data-testid="ok"]') as HTMLButtonElement).click(); });
    await flush();
    expect(actions.applySetupPack).toHaveBeenCalledWith("backlog_rescue");
    expect(actions.setSetupWizardSeen).toHaveBeenCalledWith(true);
    // Done screen: stays open with the undo offer; OK closes.
    expect(closeModal).not.toHaveBeenCalled();
    expect(host.textContent).toContain("setup_done_title");
    expect(buttons(host).some((b) => text(b) === "setup_undo")).toBe(true);
    await act(async () => { (host.querySelector('[data-testid="ok"]') as HTMLButtonElement).click(); });
    expect(closeModal).toHaveBeenCalled();
  });

  it("disables Apply when the pack adds nothing the install does not already have", async () => {
    const s: any = defaultSettings();
    // Essential = the default trio, which a default install already has.
    const { controller } = controllerStub({ ...s, shelves: s.shelves?.length ? s.shelves : [] });
    await act(async () => { root.render(h(SetupWizardModal, { controller })); });
    await flush();
    const essential = buttons(host).find((b) => b.className === "ds-setup-tile" && text(b).includes("setup_pack_essential_title"))!;
    await act(async () => { essential.click(); });
    const ok = host.querySelector('[data-testid="ok"]') as HTMLButtonElement;
    const nothing = (host.textContent ?? "").includes("setup_nothing_to_add");
    // Either the default install already covers the trio (Apply disabled) or it does not (Apply enabled) — the two must agree.
    expect(ok.disabled).toBe(nothing);
  });

  it("offers the one-step undo only when a previous apply is recorded", async () => {
    const settings = { ...defaultSettings(), lastSetupApply: { packId: "essential", at: 1, addedShelfIds: [], addedSmartIds: [], prevSettings: {} } };
    const { controller, actions } = controllerStub(settings);
    await act(async () => { root.render(h(SetupWizardModal, { controller })); });
    await flush();
    const revert = buttons(host).find((b) => text(b) === "setup_revert_last")!;
    expect(revert).toBeTruthy();
    await act(async () => { revert.click(); });
    await flush();
    expect(actions.revertSetupPack).toHaveBeenCalled();
  });
});
