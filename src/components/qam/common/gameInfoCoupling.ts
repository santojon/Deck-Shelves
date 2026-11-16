import { confirmAction } from '../modals/ConfirmActionModal'

type T = (k: string) => string

export function applyGameInfoAboveToggle(opts: {
  next: boolean;
  hideTitle: boolean;
  t: T;
  setGameInfoAbove: (v: boolean) => void;
  setHideTitle: (v: boolean) => void;
}): void {
  const { next, hideTitle, t, setGameInfoAbove, setHideTitle } = opts
  if (next && !hideTitle) {
    confirmAction({
      title: t('couple_info_above_title' as any),
      body: t('couple_info_above_body' as any),
      okText: t('confirm_continue' as any),
      cancelText: t('cancel'),
      onConfirm: () => { setGameInfoAbove(true); setHideTitle(true) },
    })
    return
  }
  setGameInfoAbove(next)
}

export function applyHideTitleToggle(opts: {
  next: boolean;
  infoAbove: boolean;
  t: T;
  setHideTitle: (v: boolean) => void;
  setGameInfoAbove: (v: boolean) => void;
}): void {
  const { next, infoAbove, t, setHideTitle, setGameInfoAbove } = opts
  if (!next && infoAbove) {
    confirmAction({
      title: t('couple_show_title_title' as any),
      body: t('couple_show_title_body' as any),
      okText: t('confirm_continue' as any),
      cancelText: t('cancel'),
      onConfirm: () => { setHideTitle(false); setGameInfoAbove(false) },
    })
    return
  }
  setHideTitle(next)
}
