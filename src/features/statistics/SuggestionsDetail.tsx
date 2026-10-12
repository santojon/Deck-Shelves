import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Focusable, ToggleField } from "../../runtime/host/decky";
import { getUsageSummary, flushUsage } from "../../steam/usageTracking";
import type { useSettingsController } from "../settings/controller";
import { getExternalStatisticsProviders, type StatisticsEntry } from "../../core/pluginApi";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { deriveSuggestions, deriveRemovalSuggestions, type StatSuggestion } from "../../domain/statistics";
import { confirmAction } from "../../components/qam/modals/ConfirmActionModal";
import { SHELF_TEMPLATES, coveredTemplateIds } from "../../domain/templates";
import { SHELF_TPL_ICON, SMART_TPL_ICON } from "../../components/qam/modals/templateIcons";
import { PlusCircleIcon, StackIcon, CheckIcon, RefreshIcon, SparkleIcon, TrashIcon } from "../../components/icons";
import { subscribeShelfRefresh } from "../../core/shelfRefresh";
import { isSuggestionNew, markSuggestionsSeen } from "../../runtime/suggestionNotifier";

// How long the tab waits after a library/usage signal before re-deriving.
const REACT_DEBOUNCE_MS = 1500;

export interface SuggestionsDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

interface ProviderGroup { id: string; displayName: string; entries: StatisticsEntry[] }

const SUGGESTION_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  first_shelf: PlusCircleIcon, backlog: StackIcon, deck_verified: CheckIcon, updates: RefreshIcon,
};

const SUGGESTION_STYLE = `
.ds-stat-sg{background:var(--ds-surface,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:14px 10px;flex:1 1 calc(20% - 8px);max-width:calc(20% - 8px);min-width:120px;min-height:128px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;cursor:pointer;box-sizing:border-box;transition:transform .12s,border-color .12s,background .12s}
.ds-stat-sg:hover{border-color:var(--ds-accent,#1a9fff);background:var(--ds-surface-hi,rgba(255,255,255,0.10))}
.ds-stat-sg[aria-disabled="true"]{opacity:.55}
.ds-stat-sg{position:relative}
.ds-stat-sg-new{position:absolute;top:6px;right:6px;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--ds-accent,#1a9fff);color:#fff}
`;

function entriesFor(groups: ProviderGroup[], id: string): StatisticsEntry[] {
  return groups.find((g) => g.id === id)?.entries ?? [];
}

// Prefer the shelf/smart template's own line icon (monochrome, follows
// text colour); fall back to a generic glyph only when none is mapped.
function suggestionIcon(sg: StatSuggestion): React.ReactNode {
  if (sg.removeShelfId) return <TrashIcon size={24} />;
  const tplIcon = sg.templateId ? SHELF_TPL_ICON[sg.templateId] : sg.smartMode ? SMART_TPL_ICON[sg.smartMode] : undefined;
  if (tplIcon) return React.cloneElement(tplIcon as React.ReactElement<React.SVGProps<SVGSVGElement>>, { width: 26, height: 26 });
  const Fallback = SUGGESTION_ICON[sg.id] ?? (sg.smartMode ? SparkleIcon : PlusCircleIcon);
  return <Fallback size={26} />;
}

/* Derive the display name + the apply/done i18n keys for one suggestion
   (template shelf, smart shelf, or a remove-shelf action). */
function suggestionLabels(t: (k: string) => string, sg: StatSuggestion) {
  const tpl = sg.templateId ? SHELF_TEMPLATES.find((x) => x.id === sg.templateId) : undefined;
  const name = tpl ? t(tpl.titleKey) : sg.smartMode ? t(`smart_template_${sg.smartMode}`) : sg.removeShelfId ? String(sg.params.name ?? "") : "";
  const actionKey = sg.removeShelfId ? "settings_statistics_suggestion_remove" : "settings_statistics_suggestion_apply";
  const doneKey = sg.removeShelfId ? "settings_statistics_suggestion_removed" : "settings_statistics_suggestion_added";
  return { name, actionKey, doneKey };
}

function SuggestionBlock(
  { t, sg, why, applied, isNew, onApply }:
  { t: (k: string) => string; sg: StatSuggestion; why: string; applied: boolean; isNew: boolean; onApply: () => void },
) {
  const { name, actionKey, doneKey } = suggestionLabels(t, sg);
  return (
    <Focusable
      className="ds-stat-sg"
      focusWithinClassName="gpfocuswithin"
      aria-disabled={applied ? "true" : "false"}
      onActivate={onApply}
      onOKButton={onApply}
      onOKActionDescription={t(actionKey)}
    >
      {isNew && !applied ? <span className="ds-stat-sg-new">{t("settings_suggestions_new")}</span> : null}
      {suggestionIcon(sg)}
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        {applied ? t(doneKey) : t(actionKey)}
      </div>
      {name ? <div style={{ fontSize: 12, opacity: 0.9 }}>{name}</div> : null}
      <div style={{ fontSize: 10, opacity: 0.55, lineHeight: 1.2 }}>{why}</div>
    </Focusable>
  );
}

function SuggestionList({ t, items, applied, fresh, whyOf, onApply }: {
  t: (k: string) => string;
  items: StatSuggestion[];
  applied: Set<string>;
  fresh: Set<string>;
  whyOf: (sg: StatSuggestion) => string;
  onApply: (sg: StatSuggestion) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
      {items.map((sg) => (
        <SuggestionBlock key={sg.id} t={t} sg={sg} why={whyOf(sg)} applied={applied.has(sg.id)} isNew={fresh.has(sg.id)} onApply={() => onApply(sg)} />
      ))}
    </Focusable>
  );
}

/* Re-derive while the tab is open: the library (overview changes, installs,
   collection edits) and the usage ledger move under it, so a library/usage
   signal re-resolves the providers after a short debounce. Nothing runs once
   the tab unmounts. */
function useReactiveTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeShelfRefresh(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; setTick((n) => n + 1); }, REACT_DEBOUNCE_MS);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);
  return tick;
}

export function SuggestionsDetail({ controller, t }: SuggestionsDetailProps) {
  const [groups, setGroups] = useState<ProviderGroup[] | null>(null);
  const [applied, setApplied] = useState<Set<string>>(() => new Set());
  const tick = useReactiveTick();
  // Which suggestions were new when the tab opened — frozen for the visit, so a
  // chip does not vanish under the user's eyes; the ledger is updated on close.
  const [fresh] = useState<Set<string>>(() => new Set());

  // Resolve the built-in stat providers on mount and again after a library /
  // usage signal — they feed the suggestion heuristics (library composition +
  // per-shelf usage).
  useEffect(() => {
    let cancelled = false;
    /* The library provider runs a heavy library enumeration (getAllAppOverviews
       DOM walk) that blocks the main thread. Defer it off the mount commit so
       opening the tab paints immediately instead of freezing; suggestions
       populate a moment later. */
    const timer = setTimeout(() => {
      void Promise.all(
        getExternalStatisticsProviders().map(async (p) => {
          const entries = await Promise.resolve().then(() => p.resolve()).catch(() => [] as StatisticsEntry[]);
          return { id: p.id, displayName: p.displayName, entries: [...entries] };
        }),
      ).then((g) => { if (!cancelled) setGroups(g); });
    }, 60);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tick]);

  const suggestions = useMemo<StatSuggestion[]>(() => {
    if (!groups) return [];
    const seed = Math.floor(Date.now() / 86_400_000); // day index → daily rotation
    const smartEnabled = (controller.settings as any)?.smartShelvesEnabled === true;
    const exclude = coveredTemplateIds(
      (controller.settings as any)?.shelves ?? [],
      ((controller.settings as any)?.smartShelves ?? []).map((s: any) => s.mode),
    );
    return deriveSuggestions(
      entriesFor(groups, "deck-shelves.library"),
      entriesFor(groups, "deck-shelves.shelf-stats"),
      { seed, smartEnabled, exclude },
    );
  }, [groups, controller]);

  // Usage-derived "remove this unused shelf" suggestions — opt-in, only once
  // there's enough tracked usage to tell "unused" from "no data yet".
  const removalSuggestions = useMemo<StatSuggestion[]>(() => {
    if (!groups || (controller.settings as any)?.removalSuggestionsEnabled !== true) return [];
    flushUsage();
    const summary = getUsageSummary();
    const shelves = [...((controller.settings as any)?.shelves ?? []), ...((controller.settings as any)?.smartShelves ?? [])]
      .filter((s: any) => s?.id).map((s: any) => ({ id: s.id, title: s.title }));
    return deriveRemovalSuggestions(shelves, summary.shelfViews, { trackedDays: summary.totalDays });
  }, [groups, controller]);

  const applySuggestion = useCallback((sg: StatSuggestion) => {
    if (applied.has(sg.id)) return;
    const done = () => setApplied((prev) => new Set(prev).add(sg.id));
    if (sg.removeShelfId) {
      const shelfId = sg.removeShelfId;
      const name = String(sg.params.name ?? "");
      confirmAction({
        title: t("settings_statistics_remove_confirm_title"),
        body: name ? `${name}\n\n${t("settings_statistics_remove_confirm_body")}` : t("settings_statistics_remove_confirm_body"),
        okText: t("settings_statistics_suggestion_remove"),
        cancelText: t("cancel"),
        onConfirm: () => { void Promise.resolve((controller.actions as any).removeShelf?.(shelfId)).then(done).catch(() => {}); },
      });
      return;
    }
    if (sg.smartMode) {
      void Promise.resolve(controller.actions.addSmartShelf(sg.smartMode as any, t(`smart_template_${sg.smartMode}`))).then(done).catch(() => {});
      return;
    }
    const tpl = sg.templateId ? SHELF_TEMPLATES.find((x) => x.id === sg.templateId) : undefined;
    if (!tpl) return;
    void Promise.resolve(controller.actions.addShelfWith(t(tpl.titleKey), tpl.source)).then(done).catch(() => {});
  }, [applied, controller, t]);

  const whyOf = useCallback((sg: StatSuggestion) => {
    return (controller.t as unknown as (k: string, o?: any) => string)(sg.messageKey, sg.params);
  }, [controller]);

  // New = never notified or shown before; everything shown this visit is
  // recorded as seen when the tab closes.
  useEffect(() => {
    for (const sg of suggestions) if (isSuggestionNew(sg.id)) fresh.add(sg.id);
  }, [suggestions, fresh]);
  useEffect(() => () => { markSuggestionsSeen([...fresh]); }, [fresh]);

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <style>{SUGGESTION_STYLE}</style>
      <div style={{ fontSize: 12, opacity: 0.6, padding: "0 4px 8px" }}>{t("settings_suggestions_desc")}</div>

      <CollapsibleSection id="sg-create" title={t("settings_suggestions_creation")} count={suggestions.length} icon={<SparkleIcon size={14} />} initialOpen>
        <ToggleField
          label={t("settings_statistics_suggest_on_create")}
          checked={(controller.settings as any)?.templateSuggestionsEnabled === true}
          onChange={(v: boolean) => (controller.actions as any).setTemplateSuggestionsEnabled?.(v)}
        />
        <SuggestionList t={t} items={suggestions} applied={applied} fresh={fresh} whyOf={whyOf} onApply={applySuggestion} />
      </CollapsibleSection>

      <CollapsibleSection id="sg-removal" title={t("settings_suggestions_cleanup")} count={removalSuggestions.length} icon={<TrashIcon size={14} />} initialOpen>
        <ToggleField
          label={t("settings_statistics_suggest_removal")}
          checked={(controller.settings as any)?.removalSuggestionsEnabled === true}
          onChange={(v: boolean) => (controller.actions as any).setRemovalSuggestionsEnabled?.(v)}
        />
        <SuggestionList t={t} items={removalSuggestions} applied={applied} fresh={fresh} whyOf={whyOf} onApply={applySuggestion} />
      </CollapsibleSection>
    </Focusable>
  );
}
