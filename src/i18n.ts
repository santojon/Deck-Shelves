/* eslint-disable complexity */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "../i18n/en-US.json";
import ptBR from "../i18n/pt-BR.json";
import ptPT from "../i18n/pt-PT.json";
import esES from "../i18n/es-ES.json";
import es419 from "../i18n/es-419.json";
import itIT from "../i18n/it-IT.json";
import frFR from "../i18n/fr-FR.json";
import deDE from "../i18n/de-DE.json";
import ruRU from "../i18n/ru-RU.json";
import plPL from "../i18n/pl-PL.json";
import nlNL from "../i18n/nl-NL.json";
import trTR from "../i18n/tr-TR.json";
import ukUA from "../i18n/uk-UA.json";
import jaJP from "../i18n/ja-JP.json";
import koKR from "../i18n/ko-KR.json";
import zhCN from "../i18n/zh-CN.json";
import zhTW from "../i18n/zh-TW.json";
import enGB from "../i18n/en-GB.json";
import frCA from "../i18n/fr-CA.json";

export function initI18n() {
  if (i18n.isInitialized) return i18n;

  const lang = ((typeof navigator !== "undefined" && (navigator as any)?.language) ? (navigator as any).language : "en-US").toLowerCase();
  const pick = (l: string) => {
    if (l.startsWith("pt-pt")) return "pt-PT";
    if (l.startsWith("pt")) return "pt-BR";
    if (l === "es-es" || l.startsWith("es-es")) return "es-ES";
    if (l.startsWith("es")) return "es-419";
    if (l.startsWith("it")) return "it-IT";
    if (l === "fr-ca" || l.startsWith("fr-ca")) return "fr-CA";
    if (l.startsWith("fr")) return "fr-FR";
    if (l.startsWith("de")) return "de-DE";
    if (l.startsWith("ru")) return "ru-RU";
    if (l.startsWith("pl")) return "pl-PL";
    if (l.startsWith("nl")) return "nl-NL";
    if (l.startsWith("tr")) return "tr-TR";
    if (l.startsWith("uk")) return "uk-UA";
    if (l.startsWith("ja")) return "ja-JP";
    if (l.startsWith("ko")) return "ko-KR";
    if (l.startsWith("zh-tw") || l.startsWith("zh-hant")) return "zh-TW";
    if (l.startsWith("zh")) return "zh-CN";
    if (l.startsWith("en-gb")) return "en-GB";
    return "en-US";
  };

  i18n.use(initReactI18next).init({
    resources: {
      "en-US": { translation: enUS },
      "pt-BR": { translation: ptBR },
      "pt-PT": { translation: ptPT },
      "es-ES": { translation: esES },
      "es-419": { translation: es419 },
      "it-IT": { translation: itIT },
      "fr-FR": { translation: frFR },
      "de-DE": { translation: deDE },
      "ru-RU": { translation: ruRU },
      "pl-PL": { translation: plPL },
      "nl-NL": { translation: nlNL },
      "tr-TR": { translation: trTR },
      "uk-UA": { translation: ukUA },
      "ja-JP": { translation: jaJP },
      "ko-KR": { translation: koKR },
      "zh-CN": { translation: zhCN },
      "zh-TW": { translation: zhTW },
      "en-GB": { translation: enGB },
      "fr-CA": { translation: frCA },
    },
    lng: pick(lang),
    fallbackLng: "en-US",
    interpolation: { escapeValue: false }
  });

  return i18n;
}

export default i18n;
