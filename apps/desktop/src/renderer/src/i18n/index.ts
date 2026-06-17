import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { enUS } from "./resources/en-US";
import { zhCN } from "./resources/zh-CN";

export const supportedLocales = ["en-US", "zh-CN"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const STORAGE_KEY = "yui.locale";
const DEFAULT_LOCALE: SupportedLocale = "en-US";

function localeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

function initialLocale(): SupportedLocale {
  const stored = localeStorage()?.getItem(STORAGE_KEY);
  return isSupportedLocale(stored) ? stored : DEFAULT_LOCALE;
}

function applyDocumentLanguage(locale: SupportedLocale): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

void i18n.use(initReactI18next).init({
  resources: {
    "en-US": { translation: enUS },
    "zh-CN": { translation: zhCN },
  },
  lng: initialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

applyDocumentLanguage(i18n.resolvedLanguage as SupportedLocale);
i18n.on("languageChanged", (locale) => {
  if (!isSupportedLocale(locale)) return;
  localeStorage()?.setItem(STORAGE_KEY, locale);
  applyDocumentLanguage(locale);
});

export async function changeLocale(locale: SupportedLocale): Promise<void> {
  await i18n.changeLanguage(locale);
}

export function currentLocale(): SupportedLocale {
  return isSupportedLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
}

export default i18n;
