import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Focusable, ToggleField } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { getExternalStatisticsProviders, type StatisticsEntry } from "../../../core/pluginApi";
import { SettingsSection } from "../../ui/SettingsSection";
import { deriveSuggestions, type StatSuggestion } from "../../../domain/statistics";
import { SHELF_TEMPLATES, coveredTemplateIds } from "../../../domain/templates";
import { SHELF_TPL_ICON, SMART_TPL_ICON } from "../../qam/modals/templateIcons";
import { PlusCircleIcon, StackIcon, CheckIcon, RefreshIcon, SparkleIcon } from "../../icons";

export interface StatisticsDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

interface ProviderGroup { id: string; displayName: string; entries: StatisticsEntry[] }

const CATEGORY_ORDER = [
  "library", "status", "time", "compat",
  "shelves", "shelf_types", "card_types", "over_time", "other",
] as const;

const PROVIDER_KEY: Record<string, string> = {
  "deck-shelves.library": "settings_statistics_provider_library",
  "deck-shelves.shelf-stats": "settings_statistics_provider_shelf",
};

const SUGGESTION_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  first_shelf: PlusCircleIcon, backlog: StackIcon, deck_verified: CheckIcon, updates: RefreshIcon,
};

const SUGGESTION_STYLE = `
.ds-stat-sg{background:var(--ds-surface,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:14px 10px;flex:1 1 0;min-width:0;min-height:128px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;cursor:pointer;box-sizing:border-box;transition:transform .12s,border-color .12s,background .12s}
.ds-stat-sg:hover{border-color:var(--ds-accent,#1a9fff);background:var(--ds-surface-hi,rgba(255,255,255,0.10))}
.ds-stat-sg[aria-disabled="true"]{opacity:.55}
`;

// Built-in stat ids carry a `stat_<id>` translation; external providers
// supply their own (already-localized) label, so fall back to it.
function localizeLabel(t: (k: string) => string, e: StatisticsEntry): string {
  const key = `stat_${e.id}`;
  const v = t(key);
  return v === key ? e.label : v;
}

function formatValue(e: StatisticsEntry): string {
  return e.unit ? `${e.value} ${e.unit}` : String(e.value);
}

function categoryOf(e: StatisticsEntry): string {
  return e.category && (CATEGORY_ORDER as readonly string[]).includes(e.category) ? e.category : "other";
}

function providerLabel(t: (k: string) => string, g: ProviderGroup): string {
  const key = PROVIDER_KEY[g.id];
  if (key) { const v = t(key); if (v !== key) return v; }
  return g.displayName;
}

function entriesFor(groups: ProviderGroup[], id: string): StatisticsEntry[] {
  return groups.find((g) => g.id === id)?.entries ?? [];
}

const CELL_STYLE: React.CSSProperties = {
  flex: "1 1 120px", minWidth: 110, padding: "10px 12px",
  background: "var(--ds-surface, rgba(255,255,255,0.05))",
  border: "1px solid var(--ds-border, rgba(255,255,255,0.1))",
  borderRadius: 8,
};

// Gamepad nav skips passive Focusables — read-only cells need an
// activation handler to become focus stops the page can scroll to.
const NOOP = () => {};

function StatCell({ t, entry }: { t: (k: string) => string; entry: StatisticsEntry }) {
  return (
    <Focusable style={CELL_STYLE} focusWithinClassName="gpfocuswithin" onActivate={NOOP}>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{formatValue(entry)}</div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{localizeLabel(t, entry)}</div>
    </Focusable>
  );
}

function CategorySection({ t, cat, entries }: { t: (k: string) => string; cat: string; entries: StatisticsEntry[] }) {
  return (
    <SettingsSection title={t(`settings_statistics_cat_${cat}`)}>
      <Focusable style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {entries.map((e) => <StatCell key={e.id} t={t} entry={e} />)}
      </Focusable>
    </SettingsSection>
  );
}

function ProviderArea({ t, group }: { t: (k: string) => string; group: ProviderGroup }) {
  const cats = CATEGORY_ORDER.filter((c) => group.entries.some((e) => categoryOf(e) === c));
  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, margin: "12px 4px 4px", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {providerLabel(t, group)}
      </div>
      {cats.map((cat) => (
        <CategorySection key={cat} t={t} cat={cat} entries={group.entries.filter((e) => categoryOf(e) === cat)} />
      ))}
    </Focusable>
  );
}

// Prefer the shelf/smart template's own line icon (monochrome, follows
// text colour); fall back to a generic glyph only when none is mapped.
function suggestionIcon(sg: StatSuggestion): React.ReactNode {
  const tplIcon = sg.templateId ? SHELF_TPL_ICON[sg.templateId] : sg.smartMode ? SMART_TPL_ICON[sg.smartMode] : undefined;
  if (tplIcon) return React.cloneElement(tplIcon as React.ReactElement<React.SVGProps<SVGSVGElement>>, { width: 26, height: 26 });
  const Fallback = SUGGESTION_ICON[sg.id] ?? (sg.smartMode ? SparkleIcon : PlusCircleIcon);
  return <Fallback size={26} />;
}

function SuggestionBlock(
  { t, sg, why, applied, onApply }:
  { t: (k: string) => string; sg: StatSuggestion; why: string; applied: boolean; onApply: () => void },
) {
  const tpl = sg.templateId ? SHELF_TEMPLATES.find((x) => x.id === sg.templateId) : undefined;
  const name = tpl ? t(tpl.titleKey) : (sg.smartMode ? t(`smart_template_${sg.smartMode}`) : "");
  return (
    <Focusable
      className="ds-stat-sg"
      focusWithinClassName="gpfocuswithin"
      aria-disabled={applied ? "true" : "false"}
      onActivate={onApply}
      onOKButton={onApply}
      onOKActionDescription={t("settings_statistics_suggestion_apply")}
    >
      {suggestionIcon(sg)}
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        {applied ? t("settings_statistics_suggestion_added") : t("settings_statistics_suggestion_apply")}
      </div>
      {name ? <div style={{ fontSize: 12, opacity: 0.9 }}>{name}</div> : null}
      <div style={{ fontSize: 10, opacity: 0.55, lineHeight: 1.2 }}>{why}</div>
    </Focusable>
  );
}

export function StatisticsDetail({ controller, t }: StatisticsDetailProps) {
  const [groups, setGroups] = useState<ProviderGroup[] | null>(null);
  const [applied, setApplied] = useState<Set<string>>(() => new Set());

  // Resolve each registered provider, grouped so every one renders its
  // own area. Same registry the public API exposes; once on mount.
  useEffect(() => {
    let cancelled = false;
    const providers = getExternalStatisticsProviders();
    Promise.all(
      providers.map(async (p) => {
        const entries = await Promise.resolve().then(() => p.resolve()).catch(() => [] as StatisticsEntry[]);
        return { id: p.id, displayName: p.displayName, entries: [...entries] };
      }),
    ).then((g) => { if (!cancelled) setGroups(g.filter((x) => x.entries.length > 0)); });
    return () => { cancelled = true; };
  }, []);

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

  const applySuggestion = useCallback((sg: StatSuggestion) => {
    if (applied.has(sg.id)) return;
    const done = () => setApplied((prev) => new Set(prev).add(sg.id));
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

  if (groups && groups.length === 0 && suggestions.length === 0) {
    return <div style={{ fontSize: 12, opacity: 0.6, padding: "8px 4px" }}>{t("settings_statistics_empty")}</div>;
  }

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <style>{SUGGESTION_STYLE}</style>
      <div style={{ fontSize: 12, opacity: 0.6, padding: "0 4px 8px" }}>{t("settings_statistics_desc")}</div>

      {groups && (
        <SettingsSection title={t("settings_statistics_suggestions")}>
          <ToggleField
            label={t("settings_statistics_suggest_on_create")}
            checked={(controller.settings as any)?.templateSuggestionsEnabled === true}
            onChange={(v: boolean) => (controller.actions as any).setTemplateSuggestionsEnabled?.(v)}
          />
          {suggestions.length > 0 && (
            <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, marginTop: 8 }}>
              {suggestions.map((sg) => (
                <SuggestionBlock
                  key={sg.id}
                  t={t}
                  sg={sg}
                  why={whyOf(sg)}
                  applied={applied.has(sg.id)}
                  onApply={() => applySuggestion(sg)}
                />
              ))}
            </Focusable>
          )}
        </SettingsSection>
      )}

      {(groups ?? []).map((g) => <ProviderArea key={g.id} t={t} group={g} />)}
    </Focusable>
  );
}
