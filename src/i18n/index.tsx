/**
 * Minimal i18n: English, French and Kinyarwanda dictionaries (src/i18n/locales/*.json).
 * `t("nav.payroll", "Payroll")` returns the active language, then English, then the fallback.
 * The choice is remembered per browser and saved on the user (users.language).
 */
import * as React from "react";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import rw from "./locales/rw.json";

export type Lang = "en" | "fr" | "rw";
export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "rw", label: "Kinyarwanda", short: "RW" },
];
const DICTS: Record<Lang, Record<string, string>> = { en, fr, rw } as any;
const KEY = "ims.lang";

function initial(): Lang {
  try {
    const v = localStorage.getItem(KEY) as Lang | null;
    if (v && DICTS[v]) return v;
  } catch (_) {}
  return "en";
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, fallback?: string) => string };
const I18nContext = React.createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k, f) => (en as any)[k] || f || k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(initial);
  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch (_) {}
    document.documentElement.lang = l;
  }, []);
  const t = React.useCallback((key: string, fallback?: string) => DICTS[lang][key] || (en as any)[key] || fallback || key, [lang]);
  const value = React.useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = () => React.useContext(I18nContext);
