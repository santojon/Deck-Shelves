import { ConfirmModal } from '../../../runtime/host/decky'

export function OnlinePrivacyModal({ closeModal, t, onAccept }: { closeModal?: () => void; t: (k: string) => string; onAccept: () => void }) {
  return (
    <ConfirmModal
      strTitle={t('online_privacy_title')}
      strOKButtonText={t('online_privacy_accept')}
      strCancelButtonText={t('close')}
      onOK={() => { closeModal?.(); onAccept(); }}
      onCancel={() => closeModal?.()}
    >
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>{t('online_privacy_body')}</div>
      <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
        <div style={{ marginBottom: 4 }}>📋 {t('online_privacy_item_wishlist')}</div>
        <div style={{ marginBottom: 4 }}>💰 {t('online_privacy_item_price')}</div>
        <div>🌐 {t('online_privacy_item_ping')}</div>
      </div>
    </ConfirmModal>
  );
}
