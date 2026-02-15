import {
  ButtonItem,
  Dropdown,
  PanelSection,
  PanelSectionRow,
  TextField,
  ToggleField,
  Field,
  Focusable,
} from "@decky/ui";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type {
  CollectionShelfDefinition,
  DeckShelvesSettings,
  FilterMode,
  FilterType,
  ShelfDefinition,
  ShelfSourceType,
  ShelfTabType,
} from "../types";
import { getCollections } from "../lib/steam";
import { requestRefreshNow } from "../state/refresh";

function uuid(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

type Screen =
  | { name: "list" }
  | { name: "edit"; shelfId: string; draft: ShelfDefinition };

function makeNewShelf(): ShelfDefinition {
  return {
    id: uuid("shelf"),
    name: "New shelf",
    enabled: true,
    limit: 20,
    sourceType: "filter",
    mode: "all",
    filters: [],
  } as any;
}

function normalizeShelfForType(prev: ShelfDefinition, nextType: ShelfSourceType, collections: { id: string; name: string }[]): ShelfDefinition {
  const base: any = { ...prev, sourceType: nextType };
  if (nextType === "collection") {
    return {
      ...base,
      sourceType: "collection",
      collectionId: (base.collectionId ?? collections[0]?.id ?? ""),
    } as any;
  }
  if (nextType === "tab") {
    return {
      ...base,
      sourceType: "tab",
      tab: (base.tab ?? "recently_played"),
    } as any;
  }
  // filter
  return {
    ...base,
    sourceType: "filter",
    mode: (base.mode ?? "all") as FilterMode,
    filters: Array.isArray(base.filters) ? base.filters : [],
  } as any;
}

export function SettingsView(props: { settings: DeckShelvesSettings; setSettings: (s: DeckShelvesSettings) => void }) {
  const { settings, setSettings } = props;
  const { t } = useI18n();

  // Keep navigation local so it never resets when settings are saved.
  const [screen, setScreen] = useState<Screen>({ name: "list" });

  // Collections (Steam) for dropdown
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cols = await getCollections();
        if (alive) setCollections(cols ?? []);
      } catch {
        if (alive) setCollections([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sourceTypeOptions = useMemo(
    () =>
      [
        { label: t("source.collection", "Collection"), data: "collection" as const },
        { label: t("source.tab", "Library tab"), data: "tab" as const },
        { label: t("source.filters", "Filters"), data: "filter" as const },
      ] as { label: string; data: ShelfSourceType }[],
    [t]
  );

  const tabOptions = useMemo(
    () =>
      [
        { label: t("tab.recently_played", "Recently played"), data: "recently_played" as const },
        { label: t("tab.favorites", "Favorites"), data: "favorites" as const },
        { label: t("tab.installed", "Installed"), data: "installed" as const },
        { label: t("tab.not_played", "Not played"), data: "not_played" as const },
        { label: t("tab.non_steam", "Non-Steam"), data: "non_steam" as const },
        { label: t("tab.hidden", "Hidden"), data: "hidden" as const },
      ] as { label: string; data: ShelfTabType }[],
    [t]
  );

  const matchOptions = useMemo(
    () =>
      [
        { label: t("match.all", "ALL"), data: "all" as const },
        { label: t("match.any", "ANY"), data: "any" as const },
      ] as { label: string; data: FilterMode }[],
    [t]
  );

  const listShelves = settings.shelves ?? [];

  function commitShelf(draft: ShelfDefinition) {
    const next = { ...settings, shelves: (settings.shelves ?? []).map((s) => (s.id === draft.id ? draft : s)) };
    setSettings(next);
  }

  function addShelf() {
    const shelf = makeNewShelf();
    setSettings({ ...settings, shelves: [...(settings.shelves ?? []), shelf] });
    setScreen({ name: "edit", shelfId: shelf.id, draft: shelf });
  }

  function removeShelf(id: string) {
    const nextShelves = (settings.shelves ?? []).filter((s) => s.id !== id);
    setSettings({ ...settings, shelves: nextShelves });
    setScreen({ name: "list" });
  }

  function openEdit(s: ShelfDefinition) {
    setScreen({ name: "edit", shelfId: s.id, draft: JSON.parse(JSON.stringify(s)) });
  }

  const refreshNow = () => requestRefreshNow();

  // -------- Screens --------
  if (screen.name === "edit") {
    const draft = screen.draft;
    const setDraft = (patch: Partial<ShelfDefinition>) => setScreen({ ...screen, draft: { ...draft, ...patch } as any });

    const selectedSourceOpt = sourceTypeOptions.find((o) => o.data === draft.sourceType) ?? sourceTypeOptions[0];
    const selectedTabOpt =
      tabOptions.find((o) => o.data === (draft as any).tab) ?? tabOptions[0];

    const collectionOptions = collections.map((c) => ({ label: c.name, data: c.id }));
    const selectedCollectionOpt =
      collectionOptions.find((o) => o.data === (draft as any).collectionId) ?? collectionOptions[0];

    const selectedMatchOpt =
      matchOptions.find((o) => o.data === (draft as any).mode) ?? matchOptions[0];

    return (
      <PanelSection title={t("settings.edit", "Edit shelf")}>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => setScreen({ name: "list" })}>
            {t("settings.back", "Back")}
          </ButtonItem>
        </PanelSectionRow>

        <PanelSectionRow>
          <ToggleField
            label={t("shelf.enabled", "Enabled")}
            checked={!!draft.enabled}
            onChange={(v) => setDraft({ enabled: v })}
          />
        </PanelSectionRow>

        <PanelSectionRow>
          <Field label={t("shelf.name", "Name")}>
            <TextField
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ name: e.target.value })}
            />
          </Field>
        </PanelSectionRow>

        <PanelSectionRow>
          <Field label={t("shelf.limit", "Limit (max games)")}>
            <TextField
              value={String(draft.limit ?? 20)}
              onChange={(e) => setDraft({ limit: clampInt(parseInt(e.target.value || "0", 10), 1, 200) })}
            />
          </Field>
        </PanelSectionRow>

        <PanelSectionRow>
          <Field label={t("shelf.source", "Source")}>
            <Dropdown
              rgOptions={sourceTypeOptions}
              selectedOption={selectedSourceOpt}
              onChange={(opt) => {
                const next = normalizeShelfForType(draft, opt.data, collections);
                setDraft(next as any);
              }}
            />
          </Field>
        </PanelSectionRow>

        {draft.sourceType === "collection" && (
          <PanelSectionRow>
            <Field label={t("source.collection", "Collection")}>
              <Dropdown
                rgOptions={collectionOptions}
                selectedOption={selectedCollectionOpt}
                onChange={(opt) => setDraft({ collectionId: opt.data } as any)}
              />
            </Field>
          </PanelSectionRow>
        )}

        {draft.sourceType === "tab" && (
          <PanelSectionRow>
            <Field label={t("source.tab", "Library tab")}>
              <Dropdown
                rgOptions={tabOptions}
                selectedOption={selectedTabOpt}
                onChange={(opt) => setDraft({ tab: opt.data } as any)}
              />
            </Field>
          </PanelSectionRow>
        )}

        {draft.sourceType === "filter" && (
          <>
            <PanelSectionRow>
              <Field label={t("filter.match", "Match")}>
                <Dropdown
                  rgOptions={matchOptions}
                  selectedOption={selectedMatchOpt}
                  onChange={(opt) => setDraft({ mode: opt.data } as any)}
                />
              </Field>
            </PanelSectionRow>

            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={() => {
                  // Add a simple default filter (installed)
                  const f = { id: uuid("filter"), type: "installed" as FilterType, enabled: true, installed: true } as any;
                  setDraft({ filters: [...(((draft as any).filters ?? []) as any[]), f] } as any);
                }}
              >
                {t("filter.add", "Add filter")}
              </ButtonItem>
            </PanelSectionRow>

            <PanelSectionRow>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                {(((draft as any).filters ?? []) as any[]).map((f) => (
                  <Focusable
                    key={f.id}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {t(`filter.type.${f.type}`, f.type)}
                    </div>

                    {f.type === "collection" && (
                      <Dropdown
                        rgOptions={collectionOptions}
                        selectedOption={collectionOptions.find((o) => o.data === f.collectionId) ?? collectionOptions[0]}
                        onChange={(opt) => {
                          const nextFilters = (((draft as any).filters ?? []) as any[]).map((x) =>
                            x.id === f.id ? { ...x, collectionId: opt.data } : x
                          );
                          setDraft({ filters: nextFilters } as any);
                        }}
                      />
                    )}

                    {f.type === "regex" && (
                      <TextField
                        value={f.pattern ?? ""}
                        onChange={(e) => {
                          const nextFilters = (((draft as any).filters ?? []) as any[]).map((x) =>
                            x.id === f.id ? { ...x, pattern: e.target.value } : x
                          );
                          setDraft({ filters: nextFilters } as any);
                        }}
                      />
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <ButtonItem
                        style={{ flex: 1 }}
                        onClick={() => {
                          const nextFilters = (((draft as any).filters ?? []) as any[]).map((x) =>
                            x.id === f.id ? { ...x, enabled: !x.enabled } : x
                          );
                          setDraft({ filters: nextFilters } as any);
                        }}
                      >
                        {f.enabled ? t("enabled", "Enabled") : t("disabled", "Disabled")}
                      </ButtonItem>
                      <ButtonItem
                        style={{ flex: 1 }}
                        onClick={() => {
                          const nextFilters = (((draft as any).filters ?? []) as any[]).filter((x) => x.id !== f.id);
                          setDraft({ filters: nextFilters } as any);
                        }}
                      >
                        {t("filter.remove", "Remove")}
                      </ButtonItem>
                    </div>
                  </Focusable>
                ))}
              </div>
            </PanelSectionRow>
          </>
        )}

        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => {
              commitShelf(screen.draft);
              setScreen({ name: "list" });
            }}
          >
            {t("settings.save", "Save")}
          </ButtonItem>
        </PanelSectionRow>

        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => removeShelf(draft.id)}>
            {t("settings.remove_shelf", "Remove shelf")}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  // list
  return (
    <PanelSection title={t("settings.title", "Deck Shelves")}>
      <PanelSectionRow>
        <ToggleField
          label={t("settings.enable_home", "Enable shelves on Home")}
          checked={!!settings.enabled}
          onChange={(v) => setSettings({ ...settings, enabled: v })}
        />
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout="below" onClick={refreshNow}>
          {t("settings.refresh_now", "Refresh now")}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem layout="below" onClick={addShelf}>
          {t("settings.add_shelf", "Add shelf")}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          {listShelves.map((s) => (
            <Focusable
              key={s.id}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {t("shelf.source", "Source")}: {t(`source.${s.sourceType}`, s.sourceType)} • {t("shelf.limit", "Limit")}: {s.limit}
                  </div>
                </div>
                <ToggleField checked={!!s.enabled} onChange={(v) => commitShelf({ ...s, enabled: v } as any)} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <ButtonItem style={{ flex: 1 }} onClick={() => openEdit(s)}>
                  {t("settings.edit", "Edit")}
                </ButtonItem>
                <ButtonItem style={{ flex: 1 }} onClick={() => removeShelf(s.id)}>
                  {t("settings.remove_shelf", "Remove")}
                </ButtonItem>
              </div>
            </Focusable>
          ))}
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {t("settings.note_tags", "Tags and filters reflect your current library state.")}
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}
