import { useEffect, useRef } from 'react';
import { openManagedModal } from '../../components/qam/common/openManagedModal';
import { ShowcaseModal } from './ShowcaseModal';
import { openSetupWizard } from './SetupWizardEntry';
import { getCurrentSettings } from '../../settingsStore';
import { isHomeOwner } from '../../runtime/host/ownerGuard';

// One tour at a time: a panel remount while it is open must not stack another.
let tourOpen = false;

/* Open the first-run feature showcase once — the first time the QAM mounts with
   settings loaded and the tour not yet seen. Marking it seen (Skip/Finish) keeps
   it from reappearing; the About page's replay opens the tour directly, without
   touching the flag. The closing screen's choices act through the controller: "configure
   now" opens the setup wizard, "default" creates the default shelves. */
export function useFirstRunShowcase(settings: any, actions: any, controller?: any): void {
  const opened = useRef(false);
  useEffect(() => {
    /* Gate on the LOADED settings (getCurrentSettings() is null until the first
       fetch): the controller's initial state is a default WITHOUT `showcaseSeen`,
       so triggering off `settings` alone re-opens the tour on every boot where
       the QAM mounts before settings load — the reported "tutorial loop". */
    const loaded = getCurrentSettings();
    if (opened.current || tourOpen || !loaded || (loaded as any).showcaseSeen === true) return;
    /* Only the owning instance opens it (the modal is global anyway): a stood-down
       instance of a dual-host install cannot persist "seen", so its tour would
       come back on every mount of its panel — a second tour after the first. */
    if (!isHomeOwner()) return;
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
