import { DropdownItem, Field, TextField, ToggleField } from "../../runtime/host/decky";
import type { FilterItem } from "../../types";
import i18n from "../../i18n";
import DeveloperFilterOptions from "./DeveloperFilterOptions";
import PublisherFilterOptions from "./PublisherFilterOptions";
import MergeFilterOptions from "./MergeFilterOptions";
import { COMPAT_LEVELS } from "./utils";
import { APP_STATUS_GROUP_KEYS } from "../../steam/appDisplayStatus";
import { DSSliderField } from '../ui'

export default function FilterItemOptions({ item, onChange, controller, allowOnlineFilters = false }: { item: FilterItem; onChange: (patch: Partial<FilterItem>) => void; controller?: import("../../features/settings/controller").SettingsController; allowOnlineFilters?: boolean }) {
  const t = i18n.t.bind(i18n);
  const p = item.params ?? {};
  const patchParams = (patch: Record<string, any>) => onChange({ params: { ...p, ...patch } });

  const HIDDEN_OPTIONS = [
    { data: "any", label: t("filter_hidden_any") },
    { data: "only", label: t("filter_hidden_only") },
    { data: "exclude", label: t("filter_hidden_exclude") },
  ];

  switch (item.type) {
    case "installed":
    case "favorites":
    case "nonSteam":
    case "updatePending":
    case "isNew":
    case "cloudAvailable":
    case "controllerSupport":
      return null;

    case "hidden":
      return (
        <div>
          <DropdownItem
            label={t("filter_type_hidden")}
            rgOptions={HIDDEN_OPTIONS}
            selectedOption={p.mode ?? "exclude"}
            onChange={(opt: any) => patchParams({ mode: (opt?.data ?? opt) as string })}
            bottomSeparator="none"
          />
        </div>
      );

    case "deckCompatibility": {
      const levels: string[] = Array.isArray(p.levels) ? p.levels : [];
      const compatSet = new Set(levels);
      return (
        <>
          {COMPAT_LEVELS.map((key) => (
            <div key={key}>
              <ToggleField
                label={t(`compat_${key}`)}
                checked={compatSet.has(key)}
                onChange={(val: boolean) => {
                  const next = new Set(compatSet);
                  if (val) next.add(key); else next.delete(key);
                  patchParams({ levels: Array.from(next) });
                }}
                bottomSeparator="none"
              />
            </div>
          ))}
        </>
      );
    }

    case "shortcutType": {
      // Mirror Steam's EAppType — see the resolver's `shortcutType`
      // branch for the full mapping. Ordered roughly by how often a
      // user would actually pick each kind.
      const KINDS = [
        "game", "software", "tool", "demo", "dlc",
        "music", "video", "comic", "guide",
        "driver", "config", "hardware", "beta",
        "link",
      ] as const;
      const kinds: string[] = Array.isArray(p.kinds) ? p.kinds : ["game"];
      const kindSet = new Set(kinds);
      return (
        <>
          {KINDS.map((k) => (
            <div key={k}>
              <ToggleField
                label={t(`shortcut_kind_${k}` as any)}
                checked={kindSet.has(k)}
                onChange={(val: boolean) => {
                  const next = new Set(kindSet);
                  if (val) next.add(k); else next.delete(k);
                  patchParams({ kinds: Array.from(next) });
                }}
                bottomSeparator="none"
              />
            </div>
          ))}
        </>
      );
    }

    case "appStatus": {
      const groups: string[] = Array.isArray(p.groups) ? p.groups : ["downloading", "queued"];
      const groupSet = new Set(groups);
      return (
        <>
          {APP_STATUS_GROUP_KEYS.map((g) => (
            <div key={g}>
              <ToggleField
                label={t(`app_status_${g}` as any)}
                checked={groupSet.has(g)}
                onChange={(val: boolean) => {
                  const next = new Set(groupSet);
                  if (val) next.add(g); else next.delete(g);
                  patchParams({ groups: Array.from(next) });
                }}
                bottomSeparator="none"
              />
            </div>
          ))}
        </>
      );
    }

    case "playedWithinDays": {
      const days = Number(p.days ?? 30);
      return (
        <div>
          <DSSliderField
            label={t("filter_days")}
            value={days}
            unit='d'
            min={1}
            max={365}
            step={1}
            bottomSeparator='none'
            onChange={(v: number) => patchParams({ days: v })}
          />
        </div>
      );
    }

    case "playtimeRange": {
      const minH = Number(p.minHours ?? 0);
      const maxH = Number(p.maxHours ?? 0);
      return (
        <>
          <div>
            <DSSliderField
              label={t("filter_playtime_min")}
              value={minH}
              unit='h'
              min={0}
              max={500}
              step={5}
              bottomSeparator='none'
              onChange={(v: number) => patchParams({ minHours: v > 0 ? v : undefined })}
            />
          </div>
          <div>
            <DSSliderField
              label={t("filter_playtime_max")}
              value={maxH}
              valueLabel={maxH > 0 ? `${maxH}h` : t("filter_playtime_any")}
              min={0}
              max={500}
              step={5}
              bottomSeparator='none'
              onChange={(v: number) => patchParams({ maxHours: v > 0 ? v : undefined })}
            />
          </div>
        </>
      );
    }

    case "nameIncludes":
      return (
        <div>
          <Field label={t("filter_type_name_includes")} bottomSeparator="none">
            <div style={{ minWidth: 250 }}>
                <TextField
                value={String(p.text ?? "")}
                onChange={(val: any) => {
                  const text = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                  patchParams({ text });
                }}
              />
            </div>
          </Field>
        </div>
      );

    case "nameRegex":
      return (
        <div>
          <Field label={t("filter_type_name_regex")} bottomSeparator="none">
            <div style={{ minWidth: 250 }}>
              <TextField
                value={String(p.pattern ?? "")}
                onChange={(val: any) => {
                  const pattern = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                  patchParams({ pattern });
                }}
              />
            </div>
          </Field>
        </div>
      );

    case "collection": {
      // Dropdown sourced from the same `controller.collections` the source
      // picker uses — id-based matching so name lookups (which are unreliable
      // across SteamOS / Bazzite collectionStore shapes) are bypassed entirely.
      /* Inversion still flows through `item.inverted` in the evaluator, and
         the prefetch pass keys on `params.collectionId` — both untouched here.
         Uses DropdownItem's own `label` slot (same pattern as the `hidden`
         filter above) instead of wrapping in a Field — Field adds extra
         gutter between the label and the control. */
      const collections = controller?.collections ?? [];
      const currentId = String(p.collectionId ?? "");
      const collectionOptions = collections.map((c) => ({ data: String(c.id), label: c.name }));
      const placeholder = { data: "", label: t("select_placeholder" as any) };
      const hasCurrent = currentId !== "" && collectionOptions.some((o) => o.data === currentId);
      const rgOptions = collectionOptions.length === 0
        ? [placeholder]
        : (currentId === "" || hasCurrent ? collectionOptions : [placeholder, ...collectionOptions]);
      const selected = hasCurrent ? currentId : "";
      return (
        <div>
          <DropdownItem
            label={t("filter_collection_label")}
            rgOptions={rgOptions}
            selectedOption={selected}
            onChange={(opt: any) => {
              const collectionId = String(opt?.data ?? opt ?? "");
              patchParams({ collectionId });
            }}
            bottomSeparator="none"
          />
        </div>
      );
    }

    case "storeTag": {
      const tags: string[] = Array.isArray(p.tags) ? p.tags : [];
      return (
        <div>
          <Field label={t("filter_type_store_tag")} description={t("filter_tags_hint")} bottomSeparator="none">
            <div style={{ minWidth: 250 }}>
              <TextField
                value={tags.join(", ")}
                onChange={(val: any) => {
                  const raw = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                  patchParams({ tags: raw.split(",").map((s: string) => s.trim()).filter(Boolean) });
                }}
              />
            </div>
          </Field>
        </div>
      );
    }

    case "developer":
      return <DeveloperFilterOptions selected={Array.isArray(p.developers) ? p.developers : []} onChange={(devs) => patchParams({ developers: devs })} />;

    case "publisher":
      return <PublisherFilterOptions selected={Array.isArray(p.publishers) ? p.publishers : []} onChange={(pubs) => patchParams({ publishers: pubs })} />;

    case "appIdList": {
      const ids: number[] = Array.isArray(p.appIds) ? p.appIds : [];
      return (
        <div>
          <Field label={t("filter_type_app_id_list")} description={t("filter_app_id_list_hint")} bottomSeparator="none">
            <div style={{ minWidth: 250 }}>
              <TextField
                value={ids.join(", ")}
                onChange={(val: any) => {
                  const raw = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                  const parsed = raw.split(",").map((s: string) => Number(s.trim())).filter((n: number) => Number.isFinite(n) && n > 0);
                  patchParams({ appIds: parsed });
                }}
              />
            </div>
          </Field>
        </div>
      );
    }

    case "friends":
    case "achievements":
      return (
        <div>
          <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12, lineHeight: 1.4 }}>
            {t(item.type === "friends" ? "filter_friends_info" : "filter_achievements_info")}
          </div>
        </div>
      );

    case "friendsPlayingNow":
      // No params — just an info hint so the user knows the data source.
      return (
        <div>
          <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12, lineHeight: 1.4 }}>
            {t("filter_friends_playing_now_info")}
          </div>
        </div>
      );

    case "friendsPlayedRecently": {
      const days = Number(p.days ?? 14);
      return (
        <>
          <DSSliderField
            label={t("filter_friends_played_recently_days")}
            value={days}
            unit='d'
            min={1}
            max={30}
            step={1}
            onChange={(v: number) => patchParams({ days: v })}
          />
          <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12, lineHeight: 1.4 }}>
            {t("filter_friends_played_recently_info")}
          </div>
        </>
      );
    }

    case "discount": {
      const minDisc = Number(p.minDiscount ?? 10);
      const maxDisc = Number(p.maxDiscount ?? 100);
      return (
        <>
          <DSSliderField
            label={t("filter_discount_min")}
            value={minDisc}
            unit='%'
            min={0}
            max={100}
            step={5}
            onChange={(v: number) => patchParams({ minDiscount: v, maxDiscount: Math.max(v, maxDisc) })}
            bottomSeparator="none"
          />
          <DSSliderField
            label={t("filter_discount_max")}
            value={maxDisc}
            unit='%'
            min={0}
            max={100}
            step={5}
            onChange={(v: number) => patchParams({ maxDiscount: v, minDiscount: Math.min(v, minDisc) })}
            bottomSeparator="none"
          />
        </>
      );
    }
    case "merge":
      return <MergeFilterOptions item={item} onChange={onChange} controller={controller} allowOnlineFilters={allowOnlineFilters} />;

    default:
      return null;
  }
}
