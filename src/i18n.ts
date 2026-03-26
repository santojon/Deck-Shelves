import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "../i18n/en-US.json";
import ptBR from "../i18n/pt-BR.json";
import esES from "../i18n/es-ES.json";
import itIT from "../i18n/it-IT.json";
import frFR from "../i18n/fr-FR.json";
import deDE from "../i18n/de-DE.json";

export function initI18n() {
  if (i18n.isInitialized) return i18n;

  const lang = ((typeof navigator !== "undefined" && (navigator as any)?.language) ? (navigator as any).language : "en-US").toLowerCase();
  const pick = (l: string) => {
    if (l.startsWith("pt")) return "pt-BR";
    if (l.startsWith("es")) return "es-ES";
    if (l.startsWith("it")) return "it-IT";
    if (l.startsWith("fr")) return "fr-FR";
    if (l.startsWith("de")) return "de-DE";
    return "en-US";
  };

  i18n.use(initReactI18next).init({
    resources: {
      "en-US": { translation: enUS },
      "pt-BR": { translation: ptBR },
      "es-ES": { translation: esES },
      "it-IT": { translation: itIT },
      "fr-FR": { translation: frFR },
      "de-DE": { translation: deDE }
    },
    lng: pick(lang),
    fallbackLng: "en-US",
    interpolation: { escapeValue: false }
  });

  return i18n;
}

export default i18n;
