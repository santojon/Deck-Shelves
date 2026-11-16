import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// en-US ships eagerly for first-paint labels; other locales load lazily.
const EN_MODULES = import.meta.glob("../i18n/en-US/*.json", { eager: true, import: "default" });
const enUS: Record<string, string> = Object.assign({}, ...Object.values(EN_MODULES));

const AREA_LOADERS = import.meta.glob<Record<string, string>>(
  ["../i18n/*/*.json", "!../i18n/en-US/*.json"],
  { import: "default" },
);
const LOCALE_AREA_LOADERS: Record<string, Array<() => Promise<Record<string, string>>>> = {};
for (const [path, loader] of Object.entries(AREA_LOADERS)) {
  const m = /\/i18n\/([^/]+)\/[^/]+\.json$/.exec(path);
  if (!m) continue;
  (LOCALE_AREA_LOADERS[m[1]] ??= []).push(loader);
}

async function loadLocaleDict(locale: string): Promise<Record<string, string>> {
  const loaders = LOCALE_AREA_LOADERS[locale] ?? [];
  const dicts = await Promise.all(loaders.map((l) => l().catch(() => ({}))));
  return Object.assign({}, ...dicts);
}

// First match wins, so specific variants come before their language prefix.
const LOCALE_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["pt-pt", "pt-PT"], ["pt", "pt-BR"],
  ["es-es", "es-ES"], ["es", "es-419"],
  ["it", "it-IT"],
  ["fr-ca", "fr-CA"], ["fr", "fr-FR"],
  ["de", "de-DE"], ["ru", "ru-RU"], ["pl", "pl-PL"], ["nl", "nl-NL"],
  ["tr", "tr-TR"], ["uk", "uk-UA"], ["ja", "ja-JP"], ["ko", "ko-KR"],
  ["zh-tw", "zh-TW"], ["zh-hant", "zh-TW"], ["zh", "zh-CN"],
  ["en-gb", "en-GB"],
];

function pickLocale(l: string): string {
  for (const [prefix, locale] of LOCALE_PREFIXES) {
    if (l.startsWith(prefix)) return locale;
  }
  return "en-US";
}

export function initI18n() {
  if (i18n.isInitialized) return i18n;

  const lang = ((typeof navigator !== "undefined" && (navigator as any)?.language) ? (navigator as any).language : "en-US").toLowerCase();
  const target = pickLocale(lang);

  void i18n.use(initReactI18next).init({
    resources: { "en-US": { translation: enUS } },
    lng: "en-US",
    fallbackLng: "en-US",
    interpolation: { escapeValue: false },
  });

  if (target !== "en-US") {
    loadLocaleDict(target).then((dict) => {
      if (!dict || Object.keys(dict).length === 0) return;
      i18n.addResourceBundle(target, "translation", dict, true, true);
      void i18n.changeLanguage(target);
    }).catch(() => {});
  }

  return i18n;
}

// overwrite: false protects built-in keys.
export function registerTranslations(locale: string, dict: Record<string, string>): void {
  if (!locale || !dict) return;
  try { i18n.addResourceBundle(locale, "translation", dict, true, false); } catch {}
}

export default i18n;
