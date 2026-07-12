import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { supabase } from "./supabase";

export interface Profile {
  id: string;
  displayName: string;
  playerCode: string;
  avatarUrl: string | null;
  trophies: number;
  blitzTrophies: number;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (activeSession: Session | null) => {
    if (!activeSession) { setProfile(null); return; }
    const { data, error } = await supabase.from("profiles").select("id,display_name,player_code,avatar_url,trophies,blitz_trophies").eq("id", activeSession.user.id).single();
    if (error) { setProfile(null); return; }
    setProfile({ id: data.id, displayName: data.display_name, playerCode: data.player_code, avatarUrl: data.avatar_url, trophies: data.trophies, blitzTrophies: data.blitz_trophies ?? 0 });
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
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  return value;
}
