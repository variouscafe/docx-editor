import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ko from "./locales/ko.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import es from "./locales/es.json";
import ptBR from "./locales/pt-BR.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";

/** 지원 언어(코드 → 표시명은 i18n 의 language.name 키로 제공). UI 스위처·감지에 사용. */
export const LANGUAGES = ["ko", "en", "ja", "zh-CN", "zh-TW", "es", "pt-BR", "de", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "ko";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
      "zh-CN": { translation: zhCN },
      "zh-TW": { translation: zhTW },
      es: { translation: es },
      "pt-BR": { translation: ptBR },
      de: { translation: de },
      fr: { translation: fr },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...LANGUAGES],
    interpolation: { escapeValue: false }, // React 가 이스케이프.
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
    returnEmptyString: false, // 빈 문자열 값도 fallback 처리.
  });

// <html lang> 동기화(스크린리더·SEO). 정규화("en-US" → 지원 코드 매핑).
export function normalizeLanguage(lng: string | undefined): Language {
  if (!lng) return DEFAULT_LANGUAGE;
  if ((LANGUAGES as readonly string[]).includes(lng)) return lng as Language;
  const base = lng.toLowerCase();
  // zh-TW / zh-Hant → zh-TW, 그외 zh → zh-CN
  if (base.startsWith("zh")) return base.includes("tw") || base.includes("hant") ? "zh-TW" : "zh-CN";
  const primary = base.split("-")[0];
  const match = (LANGUAGES as readonly string[]).find((l) => l.startsWith(primary));
  return (match as Language) ?? DEFAULT_LANGUAGE;
}

export function applyHtmlLang(lng: string | undefined) {
  document.documentElement.lang = normalizeLanguage(lng);
}

// 초기 언어 결정 후 <html lang> 설정 + 언어 변경 시마다 갱신.
applyHtmlLang(i18n.language);
i18n.on("languageChanged", applyHtmlLang);

export default i18n;
