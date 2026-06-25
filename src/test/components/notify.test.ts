import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("i18next", () => ({ default: { t: (k: string) => k } }));

import {
  buildNotification,
  notify,
  NOTIFICATION_ICONS,
  type NotificationType,
} from "../../components/notify";
import { DeckShelvesLogo, DownloadIcon, UploadIcon, SparkleIcon, CheckIcon, BanIcon, RefreshIcon, CopyIcon } from "../../components/icons";

const ALL_TYPES: NotificationType[] = [
  "update", "suggestion", "success", "error", "warning", "info", "export", "import", "reset", "copy",
];

describe("notify — payload builder", () => {
  it("every notification type maps to an icon", () => {
    for (const t of ALL_TYPES) expect(typeof NOTIFICATION_ICONS[t]).toBe("function");
  });

  it("always carries the branded logo + body + a per-type icon", () => {
    const p = buildNotification("success", { body: "Saved" });
    expect((p.logo as any).type).toBe(DeckShelvesLogo);
    expect(p.body).toBe("Saved");
    expect((p.icon as any).type).toBe(CheckIcon);
  });

  it("uses the conventional icon for each type", () => {
    const icon = (t: NotificationType) => (buildNotification(t, { body: "x" }).icon as any).type;
    expect(icon("update")).toBe(DownloadIcon);
    expect(icon("import")).toBe(DownloadIcon);
    expect(icon("export")).toBe(UploadIcon);
    expect(icon("suggestion")).toBe(SparkleIcon);
    expect(icon("error")).toBe(BanIcon);
    expect(icon("reset")).toBe(RefreshIcon);
    expect(icon("copy")).toBe(CopyIcon);
  });

  it("passes title, onClick and duration through", () => {
    const onClick = () => {};
    const p = buildNotification("update", { body: "b", title: "T", onClick, durationMs: 5000 });
    expect(p.title).toBe("T");
    expect(p.onClick).toBe(onClick);
    expect(p.duration).toBe(5000);
  });
});

describe("notify — dispatch", () => {
  let toastSpy: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    const decky = await import("../../shims/decky-api");
    toastSpy = vi.fn();
    vi.spyOn(decky.toaster, "toast").mockImplementation(toastSpy as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("fires one toast with the built payload and defaults the title", () => {
    notify("reset", { body: "Reset done" });
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const arg = toastSpy.mock.calls[0][0];
    expect(arg.body).toBe("Reset done");
    expect((arg.icon as any).type).toBe(RefreshIcon);
    expect((arg.logo as any).type).toBe(DeckShelvesLogo);
    expect(typeof arg.title).toBe("string"); // plugin-name fallback
  });
});
