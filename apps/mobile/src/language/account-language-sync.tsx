import { useEffect, useRef } from "react";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { useLanguage } from "./language-provider";

export function AccountLanguageSync() {
  const { profile, refreshProfile } = useAuth();
  const { locale, setLocale } = useLanguage();
  const seededProfile = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!profile) return;
    if (profile.preferredLocale) {
      if (profile.preferredLocale !== locale) void setLocale(profile.preferredLocale);
      return;
    }
    if (seededProfile.current === profile.id) return;
    seededProfile.current = profile.id;
    void supabase.from("profiles").update({ preferred_locale: locale }).eq("id", profile.id).then(({ error }) => {
      if (error) seededProfile.current = undefined;
      else void refreshProfile();
    });
  }, [locale, profile, refreshProfile, setLocale]);

  return null;
}
