import { useEffect, useState } from "react";
import { DialogButton, ToggleField } from "../../runtime/host/decky";
import { SettingsSection } from "../../components/ui/SettingsSection";
import { isPerAccount, otherAccountCount } from "../../domain/accountBuckets";
import { onPendingAccountChange, pendingAccountQuestion } from "../../runtime/accountSettings";
import type { useSettingsController } from "../settings/controller";
import { openAccountChoice } from "./AccountChoiceModal";

/* Backup tab: settings per Steam account (on by default), how many other accounts
   keep their own here, and a choice still waiting for the signed-in account. */
export function AccountsSection({ controller, t }: { controller: ReturnType<typeof useSettingsController>; t: (key: string) => string }) {
  const settings = controller.settings;
  const [question, setQuestion] = useState(pendingAccountQuestion);
  useEffect(() => onPendingAccountChange(() => setQuestion(pendingAccountQuestion())), []);
  const perAccount = isPerAccount(settings);
  const others = otherAccountCount(settings);
  const choose = () => { if (question) openAccountChoice(question); };
  return (
    <SettingsSection title={t("account_per_account_title")} description={t("account_per_account_desc")}>
      <ToggleField
        label={t("account_per_account_label")}
        checked={perAccount}
        onChange={(v: boolean) => void (controller.actions as any).setPerAccountSettings?.(v)}
      />
      {perAccount && others > 0 ? (
        <div style={{ fontSize: 12, opacity: 0.65, padding: "4px 16px" }}>{t("account_others_count").replace("{{count}}", String(others))}</div>
      ) : null}
      {perAccount && question ? (
        <div style={{ padding: "6px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{t("account_choice_pending")}</div>
          <DialogButton onClick={choose} onOKButton={choose}>{t("account_choice_open")}</DialogButton>
        </div>
      ) : null}
    </SettingsSection>
  );
}
