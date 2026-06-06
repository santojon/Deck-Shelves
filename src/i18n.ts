import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// `en-US` is the static fallback — always bundled into the main chunk so
// the first paint has working labels before the user's locale finishes
// loading. Every other locale ships as its own dynamic-import chunk;
// only the chunk matching the detected language is fetched at boot.
import enUS from "../i18n/en-US.json";

// Dynamic loaders. Each `() => import(...)` becomes its own chunk in the
// output. Rollup co-locates the JSON inside the chunk so a locale switch
// is one extra HTTP request instead of inflating the main bundle by
// every translation (~50 KB × 18 ≈ 900 KB savings).
const LOCALE_LOADERS: Record<string, () => Promise<any>> = {
  "pt-BR": () => import("../i18n/pt-BR.json").then((m) => m.default),
  "pt-PT": () => import("../i18n/pt-PT.json").then((m) => m.default),
  "es-ES": () => import("../i18n/es-ES.json").then((m) => m.default),
  "es-419": () => import("../i18n/es-419.json").then((m) => m.default),
  "it-IT": () => import("../i18n/it-IT.json").then((m) => m.default),
  "fr-FR": () => import("../i18n/fr-FR.json").then((m) => m.default),
  "fr-CA": () => import("../i18n/fr-CA.json").then((m) => m.default),
  "de-DE": () => import("../i18n/de-DE.json").then((m) => m.default),
  "ru-RU": () => import("../i18n/ru-RU.json").then((m) => m.default),
  "pl-PL": () => import("../i18n/pl-PL.json").then((m) => m.default),
  "nl-NL": () => import("../i18n/nl-NL.json").then((m) => m.default),
  "tr-TR": () => import("../i18n/tr-TR.json").then((m) => m.default),
  "uk-UA": () => import("../i18n/uk-UA.json").then((m) => m.default),
  "ja-JP": () => import("../i18n/ja-JP.json").then((m) => m.default),
  "ko-KR": () => import("../i18n/ko-KR.json").then((m) => m.default),
  "zh-CN": () => import("../i18n/zh-CN.json").then((m) => m.default),
  "zh-TW": () => import("../i18n/zh-TW.json").then((m) => m.default),
  "en-GB": () => import("../i18n/en-GB.json").then((m) => m.default),
};

function pickLocale(l: string): string {
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
}

export function initI18n() {
  if (i18n.isInitialized) return i18n;

  const lang = ((typeof navigator !== "undefined" && (navigator as any)?.language) ? (navigator as any).language : "en-US").toLowerCase();
  const target = pickLocale(lang);

  // Initialise synchronously with en-US so the first render has labels.
  i18n.use(initReactI18next).init({
    resources: { "en-US": { translation: enUS } },
    lng: "en-US",
    fallbackLng: "en-US",
    interpolation: { escapeValue: false },
  });

  // Asynchronously load + switch to the detected locale. Boot keeps
  // happening; the language flips when the chunk arrives (i18next's
  // changeLanguage triggers a re-render of <Trans> / hook consumers).
  if (target !== "en-US") {
    const loader = LOCALE_LOADERS[target];
    if (loader) {
      loader().then((dict) => {
        if (!dict) return;
        i18n.addResourceBundle(target, "translation", dict, true, true);
        i18n.changeLanguage(target);
      }).catch(() => {});
    }
  }

  return i18n;
}

export default i18n;
