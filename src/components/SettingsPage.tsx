import { useEffect, useMemo, useState } from 'react';
import { DialogButton, Focusable } from '../runtime/host/decky';
import { useSettingsController } from '../features/settings/controller';
import { GeneralTab } from './qam/sidecar/GeneralTab';
import { showEditShelfModal, showDeleteConfirm } from './qam/list/ShelfActions';
import { openManagedModal } from './qam/common/openManagedModal';
import { TemplatePickerModal } from './qam/modals/TemplatePickerModal';
import { EditShelfModal } from './qam/modals/EditShelfModal';
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES } from '../domain/templates';
import {
  getExternalSources,
  getExternalSmartSources,
  getExternalFilterTypes,
  getExternalSortOptions,
  getExternalImportTypes,
} from '../core/pluginApi';
import { GearIcon, SlidersIcon, BookmarkIcon, PlusCircleIcon, SparkleIcon, WandIcon } from './icons';
import type { Shelf, ShelfSource } from '../types';

type TabId = 'general' | 'shelves' | 'filters' | 'templates' | 'integrations';

type Tk = (k: string) => string;

interface TabDef {
  id: TabId;
  icon: React.ReactNode;
  labelKey: string;
}

const TABS: TabDef[] = [
  { id: 'general',      icon: <SlidersIcon />,    labelKey: 'settings_tab_general' },
  { id: 'shelves',      icon: <BookmarkIcon />,   labelKey: 'settings_tab_shelves' },
  { id: 'filters',      icon: <WandIcon />,       labelKey: 'settings_tab_filters' },
  { id: 'templates',    icon: <SparkleIcon />,    labelKey: 'settings_tab_templates' },
  { id: 'integrations', icon: <PlusCircleIcon />, labelKey: 'settings_tab_integrations' },
];

// Pt-BR defaults so the page is usable on day one even before the i18n
// JSON files pick up the new keys. Once the key exists in a locale, the
// translation wins — `label()` only falls through when t() returns the
// key unchanged (react-i18next's missing-key behaviour).
const FALLBACK_LABELS: Record<string, string> = {
  settings_fullpage_title: 'Configurações',
  settings_tab_general: 'Geral',
  settings_tab_shelves: 'Prateleiras',
  settings_tab_filters: 'Filtros',
  settings_tab_templates: 'Templates',
  settings_tab_integrations: 'Integrações',
  settings_empty_shelves: 'Nenhuma prateleira criada.',
  settings_empty_filters: 'Nenhum filtro salvo.',
  settings_empty_integrations: 'Nenhuma integração registrada.',
  settings_add_shelf: 'Adicionar prateleira',
  settings_edit_action: 'Editar',
  settings_delete_action: 'Remover',
  settings_use_template: 'Usar template',
  settings_integration_sources: 'Fontes de prateleira',
  settings_integration_smart: 'Prateleiras smart',
  settings_integration_filters: 'Tipos de filtro',
  settings_integration_sorts: 'Opções de ordenação',
  settings_integration_imports: 'Importadores',
};

function label(t: Tk, key: string): string {
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return FALLBACK_LABELS[key] ?? key;
}

export function SettingsPage() {
  const controller = useSettingsController();
  const [tab, setTab] = useState<TabId>('general');
  const t: Tk = (k) => label(controller.t as Tk, k);

  useEffect(() => {
    try { console.info('[DS] SettingsPage mounted'); } catch {}
  }, []);

  if (!controller.settings) return null;

  return (
    <div
      className='deck-shelves-settings-page'
      style={{
        display: 'flex',
        height: '100%',
        boxSizing: 'border-box',
        color: 'inherit',
        background: 'transparent',
      }}
    >
      <SideNav tab={tab} setTab={setTab} t={t} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <Header t={t} />
        <TabContent tab={tab} controller={controller} t={t} />
      </div>
    </div>
  );
}

function Header({ t }: { t: Tk }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <GearIcon size={26} />
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{t('settings_fullpage_title')}</h1>
    </div>
  );
}

function SideNav({ tab, setTab, t }: { tab: TabId; setTab: (t: TabId) => void; t: Tk }) {
  return (
    <Focusable
      style={{
        width: 200,
        padding: '24px 8px',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      flow-children='vertical'
    >
      {TABS.map((entry) => {
        const active = entry.id === tab;
        const select = () => setTab(entry.id);
        return (
          <Focusable
            key={entry.id}
            onClick={select}
            onOKButton={select}
            onActivate={select}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 6,
              background: active ? 'rgba(120, 160, 255, 0.18)' : 'transparent',
              cursor: 'pointer',
              opacity: active ? 1 : 0.85,
            }}
          >
            <span style={{ display: 'inline-flex' }}>{entry.icon}</span>
            <span style={{ fontWeight: active ? 600 : 400 }}>{t(entry.labelKey)}</span>
          </Focusable>
        );
      })}
    </Focusable>
  );
}

type Ctrl = ReturnType<typeof useSettingsController>;

function TabContent({ tab, controller, t }: { tab: TabId; controller: Ctrl; t: Tk }) {
  if (tab === 'general')      return <GeneralTab controller={controller} />;
  if (tab === 'shelves')      return <ShelvesTab controller={controller} t={t} />;
  if (tab === 'filters')      return <FiltersTab controller={controller} t={t} />;
  if (tab === 'templates')    return <TemplatesTab controller={controller} t={t} />;
  if (tab === 'integrations') return <IntegrationsTab t={t} />;
  return null;
}

function ShelvesTab({ controller, t }: { controller: Ctrl; t: Tk }) {
  const shelves = controller.shelves ?? [];
  const handleAdd = () => openManagedModal((close) => <TemplatePickerModal closeModal={close} controller={controller} />);
  return (
    <Section title={t('settings_tab_shelves')}>
      <Focusable flow-children='row' style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <DialogButton onClick={handleAdd} onOKButton={handleAdd}>
          + {t('settings_add_shelf')}
        </DialogButton>
      </Focusable>
      {shelves.length === 0 ? (
        <EmptyState text={t('settings_empty_shelves')} />
      ) : (
        <RowList>
          {shelves.map((shelf: Shelf) => (
            <ShelfRow
              key={shelf.id}
              shelf={shelf}
              onEdit={() => showEditShelfModal(controller, shelf)}
              onDelete={() => showDeleteConfirm(controller, shelf)}
              t={t}
            />
          ))}
        </RowList>
      )}
    </Section>
  );
}

function ShelfRow({ shelf, onEdit, onDelete, t }: { shelf: Shelf; onEdit: () => void; onDelete: () => void; t: Tk }) {
  return (
    <Focusable flow-children='row' style={rowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{shelf.title || '—'}</div>
        <div style={{ opacity: 0.65, fontSize: 13 }}>{describeSource(shelf.source)}</div>
      </div>
      <Focusable flow-children='row' style={{ display: 'flex', gap: 8 }}>
        <DialogButton onClick={onEdit} onOKButton={onEdit}>{t('settings_edit_action')}</DialogButton>
        <DialogButton onClick={onDelete} onOKButton={onDelete}>{t('settings_delete_action')}</DialogButton>
      </Focusable>
    </Focusable>
  );
}

function describeSource(source: ShelfSource | undefined): string {
  if (!source) return '—';
  const s = source as any;
  if (s.type === 'tab')        return `tab: ${s.tab}`;
  if (s.type === 'collection') return `collection: ${s.collectionId}`;
  if (s.type === 'filter')     return 'filter';
  if (s.type === 'external')   return `external: ${s.sourceId}`;
  if (s.type === 'smart')      return `smart: ${s.mode}`;
  return s.type ?? '—';
}

function FiltersTab({ controller, t }: { controller: Ctrl; t: Tk }) {
  const filters: any[] = (controller.settings as any)?.savedFilters ?? [];
  return (
    <Section title={t('settings_tab_filters')}>
      {filters.length === 0 ? (
        <EmptyState text={t('settings_empty_filters')} />
      ) : (
        <RowList>
          {filters.map((f) => (
            <Focusable key={f.id} flow-children='row' style={rowStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{f.name}</div>
                <div style={{ opacity: 0.65, fontSize: 13 }}>
                  {(f.group?.mode ?? 'and')} · {f.group?.items?.length ?? 0} items
                </div>
              </div>
              <DialogButton
                onClick={() => controller.actions.deleteSavedFilter?.(f.id)}
                onOKButton={() => controller.actions.deleteSavedFilter?.(f.id)}
              >
                {t('settings_delete_action')}
              </DialogButton>
            </Focusable>
          ))}
        </RowList>
      )}
    </Section>
  );
}

function TemplatesTab({ controller, t }: { controller: Ctrl; t: Tk }) {
  const allTemplates = useMemo(() => {
    const online = controller.settings?.onlineFeaturesEnabled ? ONLINE_SHELF_TEMPLATES : [];
    return [...SHELF_TEMPLATES, ...online];
  }, [controller.settings?.onlineFeaturesEnabled]);

  const handleUse = (tpl: typeof SHELF_TEMPLATES[number]) => {
    const draft = {
      ...controller.actions.createDraftShelf(),
      title: controller.t(tpl.titleKey as any),
      source: tpl.source,
      ...(tpl.defaultSort ? { sort: tpl.defaultSort } : {}),
    };
    openManagedModal((close) => (
      <EditShelfModal closeModal={close} controller={controller} shelf={draft as Shelf} mode='create' />
    ));
  };

  return (
    <Section title={t('settings_tab_templates')}>
      <RowList>
        {allTemplates.map((tpl) => (
          <Focusable key={tpl.id} flow-children='row' style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{controller.t(tpl.titleKey as any) || tpl.titleKey}</div>
              <div style={{ opacity: 0.65, fontSize: 13 }}>
                {tpl.category}{tpl.requiresOnline ? ' · online' : ''}
              </div>
            </div>
            <DialogButton onClick={() => handleUse(tpl)} onOKButton={() => handleUse(tpl)}>
              + {t('settings_use_template')}
            </DialogButton>
          </Focusable>
        ))}
      </RowList>
    </Section>
  );
}

function IntegrationsTab({ t }: { t: Tk }) {
  // Registries are plugin-boot scoped (no live add/remove from the
  // settings UI), so a one-shot snapshot at mount matches what the user
  // will see. If we add register/unregister UI here later, swap these
  // for useSyncExternalStore-style subscriptions.
  const sources       = useMemo(() => getExternalSources(),      []);
  const smartSources  = useMemo(() => getExternalSmartSources(), []);
  const filterTypes   = useMemo(() => getExternalFilterTypes(),  []);
  const sortOptions   = useMemo(() => getExternalSortOptions(),  []);
  const importTypes   = useMemo(() => getExternalImportTypes(),  []);

  const empty =
    sources.length + smartSources.length + filterTypes.length +
    sortOptions.length + importTypes.length === 0;

  return (
    <Section title={t('settings_tab_integrations')}>
      {empty ? (
        <EmptyState text={t('settings_empty_integrations')} />
      ) : (
        <>
          <RegistryGroup
            title={t('settings_integration_sources')}
            items={sources.map((d) => ({ id: d.id, name: d.displayName, sub: `v${d.version ?? 1}` }))}
          />
          <RegistryGroup
            title={t('settings_integration_smart')}
            items={smartSources.map((d) => ({ id: d.id, name: d.displayName, sub: d.category ?? '' }))}
          />
          <RegistryGroup
            title={t('settings_integration_filters')}
            items={filterTypes.map((d) => ({ id: d.id, name: d.displayName, sub: d.invertible === false ? '' : 'invertible' }))}
          />
          <RegistryGroup
            title={t('settings_integration_sorts')}
            items={sortOptions.map((d) => ({ id: d.id, name: d.displayName, sub: '' }))}
          />
          <RegistryGroup
            title={t('settings_integration_imports')}
            items={importTypes.map((d) => ({ id: d.id, name: d.displayName, sub: d.target ?? 'shelves' }))}
          />
        </>
      )}
    </Section>
  );
}

function RegistryGroup({ title, items }: { title: string; items: Array<{ id: string; name: string; sub: string }> }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, opacity: 0.8, margin: '0 0 8px' }}>{title}</h3>
      <RowList>
        {items.map((entry) => (
          <div key={entry.id} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{entry.name}</div>
              <div style={{ opacity: 0.55, fontSize: 12 }}>{entry.id}{entry.sub ? ` · ${entry.sub}` : ''}</div>
            </div>
          </div>
        ))}
      </RowList>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  );
}

function RowList({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ opacity: 0.55, padding: '16px 12px', fontStyle: 'italic' }}>{text}</div>;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
};
