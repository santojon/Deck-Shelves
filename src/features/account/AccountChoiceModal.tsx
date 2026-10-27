import i18next from "i18next";
import { ConfirmModal, DialogButton, Focusable } from "../../runtime/host/decky";
import { ModalShell } from "../../components/ui";
import { notify } from "../../components/notify";
import { openManagedModal } from "../../components/qam/common/openManagedModal";
import { applyAccountChoice, type AccountQuestion } from "../../runtime/accountSettings";

const t = (key: string) => i18next.t(key);

/* Whose settings a Steam account gets on this device: keep what is shown (the
   device's earlier settings, or a copy of the previous account's) or start fresh.
   "Decide later" changes nothing; the cloud sync keeps waiting until a choice. */
export function AccountChoiceModal({ closeModal, question }: { closeModal?: () => void; question: AccountQuestion }) {
  const legacy = question === "ask-legacy";
  const choose = (choice: "keep" | "fresh") => {
    closeModal?.();
    void applyAccountChoice(choice);
  };
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t(legacy ? "account_choice_legacy_title" : "account_choice_new_title")}
        strOKButtonText={t(legacy ? "account_choice_keep_legacy" : "account_choice_keep_new")}
        strCancelButtonText={t("account_choice_later")}
        onOK={() => choose("keep")}
        onCancel={closeModal}
        onEscKeypress={closeModal}
      >
        <Focusable style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{t(legacy ? "account_choice_legacy_body" : "account_choice_new_body")}</div>
          <DialogButton onClick={() => choose("fresh")} onOKButton={() => choose("fresh")}>{t("account_choice_fresh")}</DialogButton>
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  );
}

export function openAccountChoice(question: AccountQuestion): void {
  openManagedModal((close) => <AccountChoiceModal closeModal={close} question={question} />);
}

export function notifyAccountRestored(): void {
  notify("info", { body: t("account_restored_toast") });
}
