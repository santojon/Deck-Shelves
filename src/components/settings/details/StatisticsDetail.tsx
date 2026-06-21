import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Focusable } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { getExternalStatisticsProviders, type StatisticsEntry } from "../../../core/pluginApi";
import { SettingsSection } from "../../ui/SettingsSection";
import { deriveSuggestions, type StatSuggestion } from "../../../domain/statistics";
import { SHELF_TEMPLATES } from "../../../domain/templates";
import { PlusCircleIcon, StackIcon, CheckIcon, RefreshIcon } from "../../icons";

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
.ds-stat-sg{background:var(--ds-card,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:14px 10px;width:132px;min-height:128px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;cursor:pointer;box-sizing:border-box;transition:transform .12s,border-color .12s,background .12s}
.ds-stat-sg.gpfocuswithin,.ds-stat-sg:hover{border-color:var(--ds-accent,#1a9fff);background:var(--ds-card-hover,rgba(255,255,255,0.10));transform:translateY(-2px)}
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
  background: "var(--ds-card, rgba(255,255,255,0.05))",
  border: "1px solid var(--ds-border, rgba(255,255,255,0.1))",
  borderRadius: 8,
};

// Steam's gamepad nav skips passive Focusables — a node needs an activation
// handler to become a real focus stop (and to let the page scroll to it).
// Stats are read-only, so onActivate is an intentional no-op.
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

function SuggestionBlock(
  { t, sg, why, applied, onApply }:
  { t: (k: string) => string; sg: StatSuggestion; why: string; applied: boolean; onApply: () => void },
) {
  const Icon = SUGGESTION_ICON[sg.id] ?? PlusCircleIcon;
  const tpl = sg.templateId ? SHELF_TEMPLATES.find((x) => x.id === sg.templateId) : undefined;
  const name = tpl ? t(tpl.titleKey) : "";
  return (
    <Focusable
      className="ds-stat-sg"
      focusWithinClassName="gpfocuswithin"
      aria-disabled={applied ? "true" : "false"}
      onActivate={onApply}
      onOKButton={onApply}
      onOKActionDescription={t("settings_statistics_suggestion_apply")}
    >
      <Icon size={34} />
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

  /* Resolve every registered statistics provider, kept grouped per
     provider so each (built-in or third-party) renders as its own area.
     Read through the same registry the public API exposes; resolve once
     on mount, no polling, cancelled on unmount. */
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
    return deriveSuggestions(entriesFor(groups, "deck-shelves.library"), entriesFor(groups, "deck-shelves.shelf-stats"));
  }, [groups]);

  const applySuggestion = useCallback((sg: StatSuggestion) => {
    if (applied.has(sg.id)) return;
    const tpl = sg.templateId ? SHELF_TEMPLATES.find((x) => x.id === sg.templateId) : undefined;
    if (!tpl) return;
    void Promise.resolve(controller.actions.addShelfWith(t(tpl.titleKey), tpl.source))
      .then(() => setApplied((prev) => new Set(prev).add(sg.id)))
      .catch(() => {});
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

      {suggestions.length > 0 && (
        <SettingsSection title={t("settings_statistics_suggestions")}>
          <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
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
        </SettingsSection>
      )}

      {(groups ?? []).map((g) => <ProviderArea key={g.id} t={t} group={g} />)}
    </Focusable>
  );
}
