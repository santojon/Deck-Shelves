import { useEffect, useState } from "react";
import { ConfirmModal, DialogButton, Focusable, Tabs } from "../../../runtime/host/decky";
import { ModalShell } from "../../ui";
import type { SettingsController } from "../../../features/settings/controller";
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES, coveredTemplateIds, type ShelfTemplateCategory } from "../../../domain/templates";
import { resolveStatSuggestions } from "../../../core/statSuggestions";
import { SMART_TEMPLATES } from "./SmartShelfTemplateModal";
import { EditShelfModal } from "./EditShelfModal";
import { EditSmartShelfModal } from "./EditSmartShelfModal";
import { SHELF_TPL_ICON, SMART_TPL_ICON } from "./templateIcons";
import { SparkleIcon } from "../../icons";
import { openManagedModal } from "../common/openManagedModal";
import type { SmartShelfMode } from "../../../types";

export interface CreateShelfModalProps {
  closeModal?: () => void;
  controller: SettingsController;
}

const TPL_CATEGORY_ORDER: ShelfTemplateCategory[] = ["status", "time", "platform", "online"];
const TPL_CATEGORY_KEY: Record<ShelfTemplateCategory, string> = {
  status: "template_category_status",
  time: "template_category_time",
  platform: "template_category_platform",
  online: "template_category_online",
};
const SMART_CATEGORY_ORDER = ["time", "status", "compat", "platform", "other"] as const;
const SMART_CATEGORY_KEY: Record<typeof SMART_CATEGORY_ORDER[number], string> = {
  time: "smart_category_time",
  status: "smart_category_status",
  compat: "smart_category_compat",
  platform: "smart_category_platform",
  other: "smart_category_other",
};
const ONLINE_GATED_MODES: ReadonlySet<string> = new Set(["friends_playing"]);

const btnStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  fontSize: 13,
  padding: "8px 6px",
  whiteSpace: "normal",
  wordBreak: "break-word",
  lineHeight: "18px",
};

const btnInner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  flexWrap: "wrap",
};

export function CreateShelfModal({ closeModal, controller }: CreateShelfModalProps) {
  const { t } = controller;
  const [tab, setTab] = useState<"standard" | "smart">("standard");
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t("create_shelf_modal_title" as any) || "Add shelf"}
        strOKButtonText={t("close")}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <div style={{ height: "min(560px, 65vh)", display: "flex", flexDirection: "column" }}>
          <Tabs
            activeTab={tab}
            onShowTab={(id: string) => setTab(id as "standard" | "smart")}
            tabs={[
              {
                id: "standard",
                title: t("create_shelf_tab_standard" as any) || "Standard",
                content: <StandardPanel controller={controller} closeModal={closeModal} />,
              },
              {
                id: "smart",
                title: t("create_shelf_tab_smart" as any) || "Smart",
                content: <SmartPanel controller={controller} closeModal={closeModal} />,
              },
            ]}
          />
        </div>
      </ConfirmModal>
    </ModalShell>
  );
}

function StandardPanel({ controller, closeModal }: { controller: SettingsController; closeModal?: () => void }) {
  const { t, actions, settings } = controller;
  const [openCat, setOpenCat] = useState<Record<ShelfTemplateCategory, boolean>>({
    status: true, time: true, platform: true, online: true,
  });
  const allTemplates = [
    ...SHELF_TEMPLATES,
    ...(settings?.onlineFeaturesEnabled ? ONLINE_SHELF_TEMPLATES : []),
  ];
  const grouped = TPL_CATEGORY_ORDER
    .map((cat) => ({ cat, items: allTemplates.filter((x) => x.category === cat) }))
    .filter((g) => g.items.length > 0);
  // Stats-derived suggestions at the top — only when the user opted in
  // (Statistics tab toggle), contextual, never duplicating an existing shelf.
  const [suggestedIds, setSuggestedIds] = useState<string[]>([]);
  useEffect(() => {
    if ((settings as any)?.templateSuggestionsEnabled !== true) { setSuggestedIds([]); return; }
    let cancelled = false;
    const seed = Math.floor(Date.now() / 86_400_000);
    const exclude = coveredTemplateIds((settings as any)?.shelves ?? [], ((settings as any)?.smartShelves ?? []).map((s: any) => s.mode));
    resolveStatSuggestions({ seed, max: 5, exclude })
      .then((sgs) => { if (!cancelled) setSuggestedIds(sgs.map((s) => s.templateId).filter(Boolean) as string[]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [settings]);
  const suggested = suggestedIds.map((id) => allTemplates.find((x) => x.id === id)).filter((x): x is typeof SHELF_TEMPLATES[0] => !!x);
  const handleTemplate = (tpl: typeof SHELF_TEMPLATES[0]) => {
    closeModal?.();
    const draft = {
      ...actions.createDraftShelf(),
      title: t(tpl.titleKey as any),
      source: tpl.source,
      ...(tpl.defaultSort ? { sort: tpl.defaultSort } : {}),
    };
    openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={draft} mode="create" />);
  };
  const handleBlank = () => {
    closeModal?.();
    const draft = actions.createDraftShelf();
    openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={draft} mode="create" />);
  };
  return (
    <Focusable style={{ padding: 8, maxHeight: "calc(min(560px, 65vh) - 60px)", overflowY: "auto" }}>
      <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <DialogButton
          style={btnStyle}
          onClick={handleBlank}
          onOKButton={handleBlank}
          onOKActionDescription={t("template_blank")}
        >
          <span style={btnInner}>{SHELF_TPL_ICON.blank}<span>{t("template_blank")}</span></span>
        </DialogButton>
      </div>
      {suggested.length > 0 && (
        <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px 6px", fontSize: 12, opacity: 0.8 }}>
            <SparkleIcon size={12} />{t("settings_statistics_suggestions")}
          </div>
          <Focusable style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {suggested.map((tpl) => (
              <DialogButton
                key={`sg-${tpl.id}`}
                style={btnStyle}
                onClick={() => handleTemplate(tpl)}
                onOKButton={() => handleTemplate(tpl)}
                onOKActionDescription={t(tpl.titleKey as any)}
              >
                <span style={btnInner}>{SHELF_TPL_ICON[tpl.id]}<span>{t(tpl.titleKey as any)}</span></span>
              </DialogButton>
            ))}
          </Focusable>
        </div>
      )}
      {grouped.map(({ cat, items }) => (
        <div key={cat} style={{ marginBottom: 6 }}>
          <Focusable
            onActivate={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
            onOKButton={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
            style={{ padding: "6px 4px", fontSize: 12, opacity: 0.8, cursor: "pointer" }}
          >
            {openCat[cat] ? "▼" : "▶"} {t(TPL_CATEGORY_KEY[cat] as any)}
          </Focusable>
          {openCat[cat] && (
            <Focusable style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 0" }}>
              {items.map((tpl) => (
                <DialogButton
                  key={tpl.id}
                  style={btnStyle}
                  onClick={() => handleTemplate(tpl)}
                  onOKButton={() => handleTemplate(tpl)}
                  onOKActionDescription={t(tpl.titleKey as any)}
                >
                  <span style={btnInner}>{SHELF_TPL_ICON[tpl.id]}<span>{t(tpl.titleKey as any)}</span></span>
                </DialogButton>
              ))}
            </Focusable>
          )}
        </div>
      ))}
    </Focusable>
  );
}

function SmartPanel({ controller, closeModal }: { controller: SettingsController; closeModal?: () => void }) {
  const { t, actions, settings } = controller;
  const [openCat, setOpenCat] = useState<Record<typeof SMART_CATEGORY_ORDER[number], boolean>>({
    time: true, status: true, compat: true, platform: true, other: true,
  });
  const onlineEnabled = settings?.onlineFeaturesEnabled === true;
  const visibleTemplates = onlineEnabled
    ? SMART_TEMPLATES
    : SMART_TEMPLATES.filter((tpl: any) => !ONLINE_GATED_MODES.has(tpl.mode));
  const grouped = SMART_CATEGORY_ORDER
    .map((cat) => ({ cat, items: visibleTemplates.filter((x: any) => x.category === cat) }))
    .filter((g) => g.items.length > 0);
  // Stats-derived smart-shelf suggestions at the top — same opt-in as the
  // Standard tab, but restricted to smart modes the user doesn't have yet.
  const [suggestedModes, setSuggestedModes] = useState<string[]>([]);
  useEffect(() => {
    if ((settings as any)?.templateSuggestionsEnabled !== true) { setSuggestedModes([]); return; }
    let cancelled = false;
    const seed = Math.floor(Date.now() / 86_400_000);
    const exclude = coveredTemplateIds((settings as any)?.shelves ?? [], ((settings as any)?.smartShelves ?? []).map((s: any) => s.mode));
    resolveStatSuggestions({ seed, max: 5, smartEnabled: true, exclude })
      .then((sgs) => { if (!cancelled) setSuggestedModes(sgs.map((s) => s.smartMode).filter(Boolean) as string[]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [settings]);
  const suggested = suggestedModes
    .map((mode) => visibleTemplates.find((x: any) => x.mode === mode))
    .filter(Boolean) as any[];
  const handleSmartTemplate = (tpl: any) => {
    closeModal?.();
    const draft = actions.createDraftSmartShelf(tpl.mode, t(tpl.titleKey as any));
    openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={draft} mode="create" />);
  };
  const handleCustom = () => {
    closeModal?.();
    const draft = actions.createDraftSmartShelf("custom" as SmartShelfMode, t("smart_template_custom" as any));
    openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={draft} mode="create" />);
  };
  return (
    <Focusable style={{ padding: 8, maxHeight: "calc(min(560px, 65vh) - 60px)", overflowY: "auto" }}>
      <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <DialogButton
          style={btnStyle}
          onClick={handleCustom}
          onOKButton={handleCustom}
          onOKActionDescription={t("smart_template_custom" as any)}
        >
          <span style={btnInner}>{SHELF_TPL_ICON.blank}<span>{t("smart_template_custom" as any)}</span></span>
        </DialogButton>
      </div>
      {suggested.length > 0 && (
        <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px 6px", fontSize: 12, opacity: 0.8 }}>
            <SparkleIcon size={12} />{t("settings_statistics_suggestions")}
          </div>
          <Focusable style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {suggested.map((tpl: any) => (
              <DialogButton
                key={`sg-${tpl.mode}`}
                style={btnStyle}
                onClick={() => handleSmartTemplate(tpl)}
                onOKButton={() => handleSmartTemplate(tpl)}
                onOKActionDescription={t(tpl.titleKey as any)}
              >
                <span style={btnInner}>{SMART_TPL_ICON[tpl.mode]}<span>{t(tpl.titleKey as any)}</span></span>
              </DialogButton>
            ))}
          </Focusable>
        </div>
      )}
      {grouped.map(({ cat, items }) => (
        <div key={cat} style={{ marginBottom: 6 }}>
          <Focusable
            onActivate={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
            onOKButton={() => setOpenCat((p) => ({ ...p, [cat]: !p[cat] }))}
            style={{ padding: "6px 4px", fontSize: 12, opacity: 0.8, cursor: "pointer" }}
          >
            {openCat[cat] ? "▼" : "▶"} {t(SMART_CATEGORY_KEY[cat] as any)}
          </Focusable>
          {openCat[cat] && (
            <Focusable style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 0" }}>
              {items.map((tpl: any) => (
                <DialogButton
                  key={tpl.mode}
                  style={btnStyle}
                  onClick={() => handleSmartTemplate(tpl)}
                  onOKButton={() => handleSmartTemplate(tpl)}
                  onOKActionDescription={t(tpl.titleKey as any)}
                >
                  <span style={btnInner}>{SMART_TPL_ICON[tpl.mode]}<span>{t(tpl.titleKey as any)}</span></span>
                </DialogButton>
              ))}
            </Focusable>
          )}
        </div>
      ))}
    </Focusable>
  );
}
