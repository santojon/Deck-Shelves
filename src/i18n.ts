import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Locales are sliced into i18n/<locale>/<area>.json; the loader merges
// every area file per locale. en-US ships eagerly (first-paint labels);
// other locales stay lazy chunks, fetched + merged for the detected lang.
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
  // happening; the language flips when the chunks arrive (i18next's
  // changeLanguage triggers a re-render of <Trans> / hook consumers).
  if (target !== "en-US") {
    loadLocaleDict(target).then((dict) => {
      if (!dict || Object.keys(dict).length === 0) return;
      i18n.addResourceBundle(target, "translation", dict, true, true);
      i18n.changeLanguage(target);
    }).catch(() => {});
  }

  // Release-screenshot hook: force the UI to a specific locale so captures are
  // deterministic (the pipeline forces en-US, whose bundle is always loaded
  // eagerly). Harmless in normal use — it only flips the display language.
  try {
    (globalThis as any).__dsSetLocale = (loc?: string) => {
      const l = loc || "en-US";
      const apply = () => { try { i18n.changeLanguage(l); } catch {} };
      if (l !== "en-US" && !i18n.hasResourceBundle(l, "translation")) {
        loadLocaleDict(l).then((dict) => {
          if (dict && Object.keys(dict).length) i18n.addResourceBundle(l, "translation", dict, true, true);
          apply();
        }).catch(apply);
      } else {
        apply();
      }
    };
  } catch { /* no globalThis */ }

  return i18n;
}

// Runtime i18n for external integrations — they register strings in
// onMount(api), no PR needed. overwrite:false protects built-in keys;
// authors should namespace theirs (`acme.*`) to avoid plugin collisions.
export function registerTranslations(locale: string, dict: Record<string, string>): void {
  if (!locale || !dict) return;
  try { i18n.addResourceBundle(locale, "translation", dict, true, false); } catch {}
}

export default i18n;
