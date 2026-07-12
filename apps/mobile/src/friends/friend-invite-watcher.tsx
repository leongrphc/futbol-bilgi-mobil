import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { tr } from "@/i18n";

export function FriendInviteWatcher() {
  const { profile } = useAuth(); const shown = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    const heartbeat = () => { if (AppState.currentState === "active") void supabase.rpc("social_set_presence", { p_state: "ONLINE" }); };
    const check = async () => { heartbeat(); const { data } = await supabase.rpc("social_pending_invites"); const invite = data?.[0]; if (!alive || !invite || shown.current === invite.invite_id) return; shown.current = invite.invite_id; Alert.alert(tr.friends.inviteTitle, `${invite.sender_name} · ${tr.friends.invite}`, [{ text: tr.friends.decline, style: "cancel", onPress: () => { void supabase.rpc("social_respond_invite", { p_invite_id: invite.invite_id, p_accept: false }).then(({ error }) => { if (error) shown.current = undefined; }); } }, { text: tr.friends.accept, onPress: () => { void supabase.rpc("social_respond_invite", { p_invite_id: invite.invite_id, p_accept: true }).then(({ error }) => { if (error) { shown.current = undefined; Alert.alert(tr.friends.errors.fallback); return; } router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: invite.room_key } }); }); } }]); };
    void check(); const timer = setInterval(() => { void check(); }, 5_000); const app = AppState.addEventListener("change", heartbeat);
    return () => { alive = false; clearInterval(timer); app.remove(); };
  }, [profile]);
  return null;
}
