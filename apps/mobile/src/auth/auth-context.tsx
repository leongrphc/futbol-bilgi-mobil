import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { supabase } from "./supabase";
import type { Locale } from "@/i18n";
import { unregisterCurrentPushToken } from "@/notifications/push";

export interface Profile {
  id: string;
  displayName: string;
  playerCode: string;
  preferredLocale: Locale | null;
  avatarUrl: string | null;
  trophies: number;
  blitzTrophies: number;
  rankedTrophies: number;
  coins: number;
  dollars: number;
  tutorialCompletedAt: string | null;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const asCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
};

const asText = (value: unknown): string | null => (typeof value === "string" ? value : null);

// The wallet, locale and tutorial columns are no longer table-readable, so the
// owner's full profile comes from the profile_self RPC as a jsonb payload.
export function normalizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = asText(row.id);
  if (!id) return null;
  const locale = row.preferred_locale;
  return {
    id,
    displayName: asText(row.display_name) ?? "Player",
    playerCode: asText(row.player_code) ?? "",
    preferredLocale: locale === "tr" || locale === "en" ? locale : null,
    avatarUrl: asText(row.avatar_url),
    trophies: asCount(row.trophies),
    blitzTrophies: asCount(row.blitz_trophies),
    rankedTrophies: asCount(row.ranked_trophies),
    coins: asCount(row.coins),
    dollars: asCount(row.dollars),
    tutorialCompletedAt: asText(row.tutorial_completed_at),
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (activeSession: Session | null) => {
    if (!activeSession) { setProfile(null); return; }
    const { data, error } = await supabase.rpc("profile_self");
    if (error) { setProfile(null); return; }
    setProfile(normalizeProfile(data));
  };

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted) setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setTimeout(() => { void loadProfile(nextSession).finally(() => { if (mounted) setLoading(false); }); }, 0);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    loading,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await unregisterCurrentPushToken().catch(() => undefined);
      await supabase.auth.signOut();
    },
  }), [session, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  return value;
}
