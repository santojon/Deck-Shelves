import { useEffect, useRef } from 'react';
import { openManagedModal } from '../../components/qam/common/openManagedModal';
import { ShowcaseModal } from './ShowcaseModal';
import { openSetupWizard } from './SetupWizardEntry';
import { getCurrentSettings } from '../../store/settingsStore';

// A panel remount while the tour is open must not stack another.
let tourOpen = false;

export function useFirstRunShowcase(settings: any, actions: any, controller?: any): void {
  const opened = useRef(false);
  useEffect(() => {
    // Gate on loaded settings: the initial default has no `showcaseSeen` and would reopen the tour.
    const loaded = getCurrentSettings();
    if (opened.current || tourOpen || !loaded || (loaded as any).showcaseSeen === true) return;
    opened.current = true;
    tourOpen = true;
    openManagedModal((close) => (
      <ShowcaseModal
        closeModal={() => { tourOpen = false; close(); }}
        onComplete={() => void actions?.setShowcaseSeen?.(true)}
        onConfigure={controller ? () => openSetupWizard(controller) : undefined}
        onDefault={actions?.createDefaultShelves ? () => void actions.createDefaultShelves() : undefined}
      />
    ));
  }, [settings, actions, controller]);
}
