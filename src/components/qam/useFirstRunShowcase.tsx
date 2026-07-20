import { useEffect, useRef } from 'react';
import { openManagedModal } from './common/openManagedModal';
import { ShowcaseModal } from './modals/ShowcaseModal';

/* Open the first-run feature showcase once — the first time the QAM mounts with
   settings loaded and the tour not yet seen. Marking it seen (Skip/Finish) keeps
   it from reappearing; the AboutPage replay button clears the flag to bring it
   back. Extracted from DeckQAMSettings to keep that file under the line cap. */
export function useFirstRunShowcase(settings: any, actions: any): void {
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !settings || settings.showcaseSeen === true) return;
    opened.current = true;
    openManagedModal((close) => <ShowcaseModal closeModal={close} onComplete={() => void actions?.setShowcaseSeen?.(true)} />);
  }, [settings, actions]);
}
