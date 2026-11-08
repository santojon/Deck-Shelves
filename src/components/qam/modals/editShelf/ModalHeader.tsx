import { TitleField } from '../../../ui'

export function ModalHeader({ t, title, onTitleChange, previewCount }: {
  t: (...args: any[]) => any;
  title: string;
  onTitleChange: (next: string) => void;
  previewCount: number | null;
}) {
  return (
    <>
      <TitleField label={t('title')} value={title} onChange={onTitleChange} />
      <div style={{ padding: '0 16px 8px', fontSize: '12px', color: previewCount === 0 ? '#f59e0b' : '#8b949e' }}>
        {previewCount === null ? t('preview_loading') : previewCount === 0 ? `⚠️ ${t('preview_empty')}` : t('preview_count', { count: previewCount })}
      </div>
    </>
  )
}
