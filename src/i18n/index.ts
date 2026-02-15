import { callable } from "@decky/api";
import { createStore } from "../state/store";
import { useEffect, useState } from "react";

type Dict = Record<string, string>;

const get_i18n = callable<[lang: string], Dict>("get_i18n");

const dictStore = createStore<Dict>({});
const langStore = createStore<string>("en-US");
const readyStore = createStore<boolean>(false);

function normalizeLang(raw?: string): string {
  if (!raw) return "en-US";
  const v = raw.replace("_", "-").trim();

  // If it's already a BCP-47-ish code
  if (v.includes("-")) {
    const [a, b] = v.split("-");
    const norm = `${a.toLowerCase()}-${b.toUpperCase()}`;
    return mapToSupported(norm);
  }
  return mapToSupported(v.toLowerCase());
}

function mapToSupported(v: string): string {
  const lower = v.toLowerCase();

  // Steam often returns language names (e.g. "english", "brazilian", "schinese")
  const nameMap: Record<string, string> = {
    "english": "en-US",
    "american": "en-US",
    "brazilian": "pt-BR",
    "portuguese-brazil": "pt-BR",
    "pt-br": "pt-BR",
    "portuguese": "pt-PT",
    "pt-pt": "pt-PT",
    "spanish": "es-ES",
    "latam": "es-419",
    "spanish-latam": "es-419",
    "es-419": "es-419",
    "es-es": "es-ES",
    "schinese": "zh-CN",
    "zh-cn": "zh-CN",
    "zh-hans": "zh-Hans",
    "japanese": "ja-JP",
    "ja-jp": "ja-JP",
    "koreana": "ko-KR",
    "korean": "ko-KR",
    "ko-kr": "ko-KR",
    "french": "fr-FR",
    "fr-fr": "fr-FR",
    "italian": "it-IT",
    "it-it": "it-IT",
    "russian": "ru-RU",
    "ru-ru": "ru-RU",
  };

  const direct = nameMap[lower];
  if (direct) return direct;

  // Prefix mapping
  if (lower.startsWith("pt")) return lower.includes("br") ? "pt-BR" : "pt-PT";
  if (lower.startsWith("es")) return lower in ["es-419", "es_419"] ? "es-419" : "es-ES";
  if (lower.startsWith("zh")) return "zh-CN";

  // Supported set
  const supported = new Set([
    "en-US","pt-BR","pt-PT","es-ES","es-419","zh-CN","zh-Hans","fr-FR","it-IT","ja-JP","ko-KR","ru-RU",
  ]);
  return supported.has(v) ? v : "en-US";
}

function getSteamLangRaw(): string | undefined {
  try {
    const sc: any = (window as any).SteamClient;
    const s = sc?.Settings;
    // Try common API shapes
    const raw =
      (typeof s?.GetCurrentLanguage === "function" ? s.GetCurrentLanguage() : undefined) ??
      (typeof s?.GetLanguage === "function" ? s.GetLanguage() : undefined) ??
      (typeof sc?.System?.GetLanguage === "function" ? sc.System.GetLanguage() : undefined);
    if (typeof raw === "string") return raw;
  } catch {
    // ignore
  }
  // Fallback to browser
  return (navigator as any)?.language;
}

export async function loadI18n() {
  const raw = getSteamLangRaw();
  const lang = normalizeLang(raw);
  langStore.set(lang);
  try {
    const dict = await get_i18n(lang);
    dictStore.set(dict || {});
  } catch (e) {
    console.error("Deck Shelves: i18n load failed", e);
    dictStore.set({});
  } finally {
    readyStore.set(true);
  }
}

export function t(key: string, fallback?: string): string {
  const dict = dictStore.get();
  return dict[key] ?? fallback ?? key;
}

export function useI18n() {
  const [dict, setDict] = useState(dictStore.get());
  const [lang, setLang] = useState(langStore.get());
  const [ready, setReady] = useState(readyStore.get());

  useEffect(() => dictStore.subscribe(setDict), []);
  useEffect(() => langStore.subscribe(setLang), []);
  useEffect(() => readyStore.subscribe(setReady), []);

  return { t: (k: string, fb?: string) => (dict[k] ?? fb ?? k), lang, ready };
}
