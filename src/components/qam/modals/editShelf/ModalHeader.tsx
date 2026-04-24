import { LabeledTextField } from '../../../ui'

/**
 * Shared modal header used by both edit modals — title input + resolved
 * preview count indicator. Amber when the current configuration resolves
 * to zero games, neutral otherwise.
 */
export function ModalHeader({ t, title, onTitleChange, previewCount }: {
  t: (k: any, opts?: any) => string;
  title: string;
  onTitleChange: (next: string) => void;
  previewCount: number | null;
}) {
  return (
    <>
      <div style={{ padding: '4px 16px 1px' }} className='name-field'>
        <LabeledTextField label={t('title')} value={title} onChange={onTitleChange} />
      </div>
      <div style={{ padding: '0 16px 8px', fontSize: '12px', color: previewCount === 0 ? '#f59e0b' : '#8b949e' }}>
        {previewCount === null ? t('preview_loading') : previewCount === 0 ? `⚠️ ${t('preview_empty')}` : t('preview_count', { count: previewCount })}
      </div>
    </>
  )
}
