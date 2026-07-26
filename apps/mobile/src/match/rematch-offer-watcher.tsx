import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/auth/supabase";
import { useAuth } from "@/auth/auth-context";
import { tr } from "@/i18n";
import { normalizeRematchMode } from "@/match/rematch-mode";

export function RematchOfferWatcher() {
  const { profile } = useAuth();
  const shown = useRef<string | undefined>(undefined);
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    const check = async () => {
      const now = new Date().toISOString();
      const [{ data: incoming }, { data: accepted }] = await Promise.all([
        supabase.from("rematch_offers").select("id,next_match_key,match_mode").eq("recipient_id", profile.id).eq("status", "PENDING").gt("expires_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("rematch_offers").select("id,next_match_key,match_mode").eq("requester_id", profile.id).eq("status", "ACCEPTED").gt("expires_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!alive) return;
      if (accepted && opened.current !== accepted.id) {
        opened.current = accepted.id;
        const mode = normalizeRematchMode(accepted.match_mode);
        router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: accepted.next_match_key, ...(mode ? { mode } : {}) } });
        return;
      }
      if (incoming && shown.current !== incoming.id) {
        shown.current = incoming.id;
        Alert.alert(tr.rematch.offerTitle, tr.rematch.offerCopy, [
          { text: tr.rematch.decline, style: "cancel", onPress: () => { void supabase.from("rematch_offers").update({ status: "DECLINED" }).eq("id", incoming.id); } },
          {
            text: tr.rematch.accept,
            onPress: () => {
              const mode = normalizeRematchMode(incoming.match_mode);
              void supabase.from("rematch_offers").update({ status: "ACCEPTED" }).eq("id", incoming.id)
                .then(() => router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: incoming.next_match_key, ...(mode ? { mode } : {}) } }));
            },
          },
        ]);
      }
    };
    void check(); const timer = setInterval(() => { void check(); }, 2_000);
    return () => { alive = false; clearInterval(timer); };
  }, [profile]);
  return null;
}
