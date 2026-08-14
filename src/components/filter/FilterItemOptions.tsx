import type { ReactNode } from "react";
import { DropdownItem, Field, TextField, ToggleField } from "../../runtime/host/decky";
import type { FilterItem } from "../../types";
import type { SettingsController } from "../../features/settings/controller";
import i18n from "../../i18n";
import DeveloperFilterOptions from "./DeveloperFilterOptions";
import PublisherFilterOptions from "./PublisherFilterOptions";
import MergeFilterOptions from "./MergeFilterOptions";
import CompositeFilterOptions from "./CompositeFilterOptions";
import { COMPAT_LEVELS } from "./utils";
import { APP_STATUS_GROUP_KEYS } from "../../steam/appDisplayStatus";
import { DSSliderField } from '../ui'

type Tfn = (k: any, opts?: any) => string;

interface OptCtx {
  item: FilterItem;
  p: Record<string, any>;
  t: Tfn;
  patchParams: (patch: Record<string, any>) => void;
  onChange: (patch: Partial<FilterItem>) => void;
  controller?: SettingsController;
  allowOnlineFilters: boolean;
}

// Mirror Steam's EAppType — see the resolver's `shortcutType` branch. Ordered
// roughly by how often a user would actually pick each kind.
const SHORTCUT_KINDS = [
  "game", "software", "tool", "demo", "dlc",
  "music", "video", "comic", "guide",
  "driver", "config", "hardware", "beta",
  "link",
] as const;

const readVal = (val: any) => (typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "");

const dimHint = (text: string) => (
  <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12, lineHeight: 1.4 }}>{text}</div>
);

// The identical toggle-set pattern shared by deckCompatibility / shortcutType /
// appStatus: one toggle per key, backed by an array param.
function toggleSet(keys: readonly string[], current: string[], labelFor: (k: string) => string, commit: (next: string[]) => void): ReactNode {
  const set = new Set(current);
  return (
    <>
      {keys.map((k) => (
        <div key={k}>
          <ToggleField
            label={labelFor(k)}
            checked={set.has(k)}
            onChange={(val: boolean) => {
              const next = new Set(set);
              if (val) next.add(k); else next.delete(k);
              commit(Array.from(next));
            }}
            bottomSeparator="none"
          />
        </div>
      ))}
    </>
  );
}

// A single dropdown option row (remotePlayLocation / hidden pattern).
function dropdownRow(label: string, description: string | undefined, options: { data: string; label: string }[], selected: string, commit: (v: string) => void): ReactNode {
  return (
    <div>
      <DropdownItem
        label={label}
        description={description}
        rgOptions={options}
        selectedOption={selected}
        onChange={(opt: any) => commit((opt?.data ?? opt) as string)}
        bottomSeparator="none"
      />
    </div>
  );
}

// A single labelled text field (nameIncludes / nameRegex / storeTag / appIdList).
function textRow(label: string, description: string | undefined, value: string, commit: (raw: string) => void): ReactNode {
  return (
    <div>
      <Field label={label} description={description} bottomSeparator="none">
        <div style={{ minWidth: 250 }}>
          <TextField value={value} onChange={(val: any) => commit(readVal(val))} />
        </div>
      </Field>
    </div>
  );
}

function daysSlider(label: string, days: number, min: number, max: number, commit: (v: number) => void, sep: 'none' | 'standard' = 'none'): ReactNode {
  return (
    <div>
      <DSSliderField label={label} value={days} unit='d' min={min} max={max} step={1} bottomSeparator={sep} onChange={commit} />
    </div>
  );
}

// Comma-separated text → trimmed, de-blanked string list (genres / tags / …).
const splitList = (raw: string): string[] => raw.split(",").map((s) => s.trim()).filter(Boolean);

// A min/max numeric slider pair. The max slider at 0 means "no upper bound" and
// commits `undefined` so the evaluator's `?? Infinity` fallback applies.
function rangeRows(t: Tfn, min: number, max: any, lo: number, hi: number, step: number, unit: string, commit: (min: number, max: number | undefined) => void): ReactNode {
  const maxVal = typeof max === "number" && max > 0 ? max : 0;
  return (
    <>
      <DSSliderField label={t("filter_min")} value={min} unit={unit || undefined} min={lo} max={hi} step={step} bottomSeparator="none" onChange={(v: number) => commit(v, maxVal > 0 ? maxVal : undefined)} />
      <DSSliderField label={t("filter_max")} value={maxVal} valueLabel={maxVal > 0 ? `${maxVal}${unit}` : t("filter_playtime_any")} min={lo} max={hi} step={step} bottomSeparator="none" onChange={(v: number) => commit(min, v > 0 ? v : undefined)} />
    </>
  );
}

function collectionOptions(ctx: OptCtx): ReactNode {
  const { t, p, patchParams, controller } = ctx;
  const collections = controller?.collections ?? [];
  const currentId = String(p.collectionId ?? "");
  const options = collections.map((c) => ({ data: String(c.id), label: c.name }));
  const placeholder = { data: "", label: t("select_placeholder" as any) };
  const hasCurrent = currentId !== "" && options.some((o) => o.data === currentId);
  const rgOptions = options.length === 0
    ? [placeholder]
    : (currentId === "" || hasCurrent ? options : [placeholder, ...options]);
  return dropdownRow(t("filter_collection_label"), undefined, rgOptions, hasCurrent ? currentId : "", (v) => patchParams({ collectionId: String(v ?? "") }));
}

function priceRange(ctx: OptCtx): ReactNode {
  const { t, p, patchParams } = ctx;
  const parse = (raw: string) => { const n = Number(String(raw).replace(",", ".").trim()); return Number.isFinite(n) && n >= 0 ? n : undefined; };
  return (
    <>
      <Field label={t("filter_price_min")} bottomSeparator="none">
        <div style={{ minWidth: 120 }}>
          <TextField value={p.minPrice != null ? String(p.minPrice) : ""} onChange={(v: any) => patchParams({ minPrice: parse(readVal(v)) })} />
        </div>
      </Field>
      <Field label={t("filter_price_max")} description={t("filter_price_hint")} bottomSeparator="none">
        <div style={{ minWidth: 120 }}>
          <TextField value={p.maxPrice != null ? String(p.maxPrice) : ""} onChange={(v: any) => patchParams({ maxPrice: parse(readVal(v)) })} />
        </div>
      </Field>
    </>
  );
}

function discountRange(ctx: OptCtx): ReactNode {
  const { t, p, patchParams } = ctx;
  const minDisc = Number(p.minDiscount ?? 10);
  const maxDisc = Number(p.maxDiscount ?? 100);
  return (
    <>
      <DSSliderField label={t("filter_discount_min")} value={minDisc} unit='%' min={0} max={100} step={5} bottomSeparator="none" onChange={(v: number) => patchParams({ minDiscount: v, maxDiscount: Math.max(v, maxDisc) })} />
      <DSSliderField label={t("filter_discount_max")} value={maxDisc} unit='%' min={0} max={100} step={5} bottomSeparator="none" onChange={(v: number) => patchParams({ maxDiscount: v, minDiscount: Math.min(v, minDisc) })} />
    </>
  );
}

function playtimeRange(ctx: OptCtx): ReactNode {
  const { t, p, patchParams } = ctx;
  const minH = Number(p.minHours ?? 0);
  const maxH = Number(p.maxHours ?? 0);
  return (
    <>
      <div>
        <DSSliderField label={t("filter_playtime_min")} value={minH} unit='h' min={0} max={500} step={5} bottomSeparator='none' onChange={(v: number) => patchParams({ minHours: v > 0 ? v : undefined })} />
      </div>
      <div>
        <DSSliderField label={t("filter_playtime_max")} value={maxH} valueLabel={maxH > 0 ? `${maxH}h` : t("filter_playtime_any")} min={0} max={500} step={5} bottomSeparator='none' onChange={(v: number) => patchParams({ maxHours: v > 0 ? v : undefined })} />
      </div>
    </>
  );
}

// type → renderer. Absent types (installed / favorites / nonSteam / …) render
// nothing. Each entry is its own function so the dispatcher stays trivial.
const RENDERERS: Record<string, (c: OptCtx) => ReactNode> = {
  remotePlayLocation: ({ t, p, patchParams }) => dropdownRow(
    t("filter_type_remote_play"), t("filter_remote_play_hint"),
    [
      { data: "local", label: t("filter_remote_play_local") },
      { data: "remote", label: t("filter_remote_play_remote") },
      { data: "remote-only", label: t("filter_remote_play_remote_only") },
      { data: "both", label: t("filter_remote_play_both") },
    ],
    p.mode ?? "remote-only", (v) => patchParams({ mode: v })),
  hidden: ({ t, p, patchParams }) => dropdownRow(
    t("filter_type_hidden"), undefined,
    [
      { data: "any", label: t("filter_hidden_any") },
      { data: "only", label: t("filter_hidden_only") },
      { data: "exclude", label: t("filter_hidden_exclude") },
    ],
    p.mode ?? "exclude", (v) => patchParams({ mode: v })),
  collection: collectionOptions,
  deckCompatibility: ({ t, p, patchParams }) => toggleSet(COMPAT_LEVELS, Array.isArray(p.levels) ? p.levels : [], (k) => t(`compat_${k}`), (next) => patchParams({ levels: next })),
  shortcutType: ({ t, p, patchParams }) => toggleSet(SHORTCUT_KINDS, Array.isArray(p.kinds) ? p.kinds : ["game"], (k) => t(`shortcut_kind_${k}` as any), (next) => patchParams({ kinds: next })),
  appStatus: ({ t, p, patchParams }) => toggleSet(APP_STATUS_GROUP_KEYS, Array.isArray(p.groups) ? p.groups : ["downloading", "queued"], (g) => t(`app_status_${g}` as any), (next) => patchParams({ groups: next })),
  playedWithinDays: ({ t, p, patchParams }) => daysSlider(t("filter_days"), Number(p.days ?? 30), 1, 365, (v) => patchParams({ days: v })),
  neglected: ({ t, p, patchParams }) => daysSlider(t("filter_neglected_days"), Number(p.days ?? 30), 1, 365, (v) => patchParams({ days: v })),
  recentlyActive: ({ t, p, patchParams }) => (
    <div>
      <DSSliderField label={t("filter_recent_min_minutes")} value={Number(p.minMinutes ?? 1)} unit='min' min={1} max={300} step={1} bottomSeparator='none' onChange={(v: number) => patchParams({ minMinutes: v })} />
    </div>
  ),
  playtimeRange,
  nameIncludes: ({ t, p, patchParams }) => textRow(t("filter_type_name_includes"), undefined, String(p.text ?? ""), (text) => patchParams({ text })),
  nameRegex: ({ t, p, patchParams }) => textRow(t("filter_type_name_regex"), undefined, String(p.pattern ?? ""), (pattern) => patchParams({ pattern })),
  storeTag: ({ t, p, patchParams }) => textRow(t("filter_type_store_tag"), t("filter_tags_hint"), (Array.isArray(p.tags) ? p.tags : []).join(", "), (raw) => patchParams({ tags: raw.split(",").map((s: string) => s.trim()).filter(Boolean) })),
  appIdList: ({ t, p, patchParams }) => textRow(t("filter_type_app_id_list"), t("filter_app_id_list_hint"), (Array.isArray(p.appIds) ? p.appIds : []).join(", "), (raw) => patchParams({ appIds: raw.split(",").map((s: string) => Number(s.trim())).filter((n: number) => Number.isFinite(n) && n > 0) })),
  developer: ({ p, patchParams }) => <DeveloperFilterOptions selected={Array.isArray(p.developers) ? p.developers : []} onChange={(devs) => patchParams({ developers: devs })} />,
  publisher: ({ p, patchParams }) => <PublisherFilterOptions selected={Array.isArray(p.publishers) ? p.publishers : []} onChange={(pubs) => patchParams({ publishers: pubs })} />,
  friends: ({ t }) => <div>{dimHint(t("filter_friends_info"))}</div>,
  achievements: ({ t }) => <div>{dimHint(t("filter_achievements_info"))}</div>,
  familySharing: ({ t }) => <div>{dimHint(t("filter_family_sharing_info"))}</div>,
  friendsPlayingNow: ({ t }) => <div>{dimHint(t("filter_friends_playing_now_info"))}</div>,
  friendsPlayedRecently: ({ t, p, patchParams }) => (
    <>
      <DSSliderField label={t("filter_friends_played_recently_days")} value={Number(p.days ?? 14)} unit='d' min={1} max={30} step={1} onChange={(v: number) => patchParams({ days: v })} />
      {dimHint(t("filter_friends_played_recently_info"))}
    </>
  ),
  priceRange,
  discount: discountRange,
  // ---- Filter v3 parameterized editors ------------------------------------
  genres: ({ t, p, patchParams }) => textRow(t("filter_type_genres"), t("filter_comma_hint"), (Array.isArray(p.genres) ? p.genres : []).join(", "), (raw) => patchParams({ genres: splitList(raw) })),
  categories: ({ t, p, patchParams }) => textRow(t("filter_type_categories"), t("filter_comma_hint"), (Array.isArray(p.categories) ? p.categories : []).join(", "), (raw) => patchParams({ categories: splitList(raw) })),
  franchise: ({ t, p, patchParams }) => textRow(t("filter_type_franchise"), undefined, String(p.franchise ?? ""), (raw) => patchParams({ franchise: raw })),
  multiplayerType: ({ t, p, patchParams }) => dropdownRow(
    t("filter_type_multiplayer_type"), undefined,
    [
      { data: "any", label: t("filter_mp_any") },
      { data: "single", label: t("filter_mp_single") },
      { data: "multi", label: t("filter_mp_multi") },
      { data: "coop", label: t("filter_mp_coop") },
      { data: "online", label: t("filter_mp_online") },
    ],
    String(p.kind ?? "any"), (v) => patchParams({ kind: v })),
  dlcOwned: ({ t, p, patchParams }) => (
    <DSSliderField label={t("filter_dlc_min_count")} value={Number(p.minCount ?? 1)} min={1} max={20} step={1} bottomSeparator="none" onChange={(v: number) => patchParams({ minCount: v })} />
  ),
  launchCount: ({ t, p, patchParams }) => rangeRows(t, Number(p.min ?? 0), p.max, 0, 500, 5, "", (min, max) => patchParams({ min, max })),
  avgSessionMinutes: ({ t, p, patchParams }) => rangeRows(t, Number(p.min ?? 0), p.max, 0, 240, 5, "min", (min, max) => patchParams({ min, max })),
  achievementPercentRange: ({ t, p, patchParams }) => (
    <>
      <DSSliderField label={t("filter_min")} value={Number(p.min ?? 0)} unit="%" min={0} max={100} step={5} bottomSeparator="none" onChange={(v: number) => patchParams({ min: v, max: Math.max(v, Number(p.max ?? 100)) })} />
      <DSSliderField label={t("filter_max")} value={Number(p.max ?? 100)} unit="%" min={0} max={100} step={5} bottomSeparator="none" onChange={(v: number) => patchParams({ max: v, min: Math.min(v, Number(p.min ?? 0)) })} />
    </>
  ),
  recentlyAbandoned: ({ t, p, patchParams }) => (
    <>
      {daysSlider(t("filter_abandoned_min_days"), Number(p.minDaysAgo ?? 7), 1, 365, (v) => patchParams({ minDaysAgo: v }))}
      {daysSlider(t("filter_abandoned_max_days"), Number(p.maxDaysAgo ?? 60), 1, 365, (v) => patchParams({ maxDaysAgo: v }))}
    </>
  ),
  playedOnce: ({ t, p, patchParams }) => (
    <DSSliderField label={t("filter_played_once_max")} value={Number(p.maxMinutes ?? 60)} unit="min" min={1} max={300} step={1} bottomSeparator="none" onChange={(v: number) => patchParams({ maxMinutes: v })} />
  ),
  storageDevice: ({ t, p, patchParams }) => dropdownRow(
    t("filter_type_storage_device"), undefined,
    [
      { data: "ssd", label: t("filter_storage_internal") },
      { data: "sd", label: t("filter_storage_sd") },
    ],
    String(p.device ?? "ssd"), (v) => patchParams({ device: v })),
  installedSizeRange: ({ t, p, patchParams }) => {
    const toGb = (mb: any) => (typeof mb === "number" && mb > 0 ? Math.round(mb / 1024) : 0);
    const fromGb = (gb: number) => (gb > 0 ? gb * 1024 : undefined);
    return (
      <>
        <DSSliderField label={t("filter_min")} value={toGb(p.minMB)} unit="GB" min={0} max={500} step={5} bottomSeparator="none" onChange={(v: number) => patchParams({ minMB: fromGb(v) ?? 0 })} />
        <DSSliderField label={t("filter_max")} value={toGb(p.maxMB)} valueLabel={toGb(p.maxMB) > 0 ? `${toGb(p.maxMB)}GB` : t("filter_playtime_any")} min={0} max={500} step={5} bottomSeparator="none" onChange={(v: number) => patchParams({ maxMB: fromGb(v) })} />
      </>
    );
  },
  executableType: ({ t, p, patchParams }) => textRow(t("filter_type_executable_type"), t("filter_executable_hint"), String(p.ext ?? ""), (raw) => patchParams({ ext: raw.trim() })),
  launchOptionTags: ({ t, p, patchParams }) => textRow(t("filter_type_launch_option_tags"), t("filter_comma_hint"), (Array.isArray(p.tags) ? p.tags : []).join(", "), (raw) => patchParams({ tags: splitList(raw) })),
  customTags: ({ t, p, patchParams }) => textRow(t("filter_type_custom_tags"), t("filter_comma_hint"), (Array.isArray(p.tags) ? p.tags : []).join(", "), (raw) => patchParams({ tags: splitList(raw) })),
  parserCategories: ({ t, p, patchParams }) => textRow(t("filter_type_parser_categories"), t("filter_comma_hint"), (Array.isArray(p.tags) ? p.tags : []).join(", "), (raw) => patchParams({ tags: splitList(raw) })),
  merge: ({ item, onChange, controller, allowOnlineFilters }) => <MergeFilterOptions item={item} onChange={onChange} controller={controller} allowOnlineFilters={allowOnlineFilters} />,
  weightedFilter: ({ item, onChange, controller, allowOnlineFilters }) => <CompositeFilterOptions item={item} onChange={onChange} controller={controller} allowOnlineFilters={allowOnlineFilters} />,
  priorityFilter: ({ item, onChange, controller, allowOnlineFilters }) => <CompositeFilterOptions item={item} onChange={onChange} controller={controller} allowOnlineFilters={allowOnlineFilters} />,
  exclusionGroup: ({ item, onChange, controller, allowOnlineFilters }) => <CompositeFilterOptions item={item} onChange={onChange} controller={controller} allowOnlineFilters={allowOnlineFilters} />,
};

export default function FilterItemOptions({ item, onChange, controller, allowOnlineFilters = false }: { item: FilterItem; onChange: (patch: Partial<FilterItem>) => void; controller?: SettingsController; allowOnlineFilters?: boolean }) {
  const t = i18n.t.bind(i18n) as Tfn;
  const p = item.params ?? {};
  const patchParams = (patch: Record<string, any>) => onChange({ params: { ...p, ...patch } });
  const render = RENDERERS[item.type];
  if (!render) return null;
  return <>{render({ item, p, t, patchParams, onChange, controller, allowOnlineFilters })}</>;
}
