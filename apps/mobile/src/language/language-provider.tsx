import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyLocale, locale as deviceLocale, type Locale } from "@/i18n";

const STORAGE_KEY = "football-link:language";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (nextLocale: Locale) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (!active || (value !== "tr" && value !== "en")) return;
        applyLocale(value);
        setLocaleState(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  const setLocale = useCallback(async (nextLocale: Locale) => {
    applyLocale(nextLocale);
    setLocaleState(nextLocale);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {
      // Keep the in-session choice even if device storage is temporarily unavailable.
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  if (!ready) return null;
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
