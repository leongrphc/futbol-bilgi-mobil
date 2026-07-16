import { useEffect } from "react";
import { router, Tabs, useLocalSearchParams } from "expo-router";
import { StadiumTabBar } from "@/navigation/bottom-nav";
import { preloadSounds, startLobbyMusic, stopLobbyMusic } from "@/audio/sounds";
import { useAuth } from "@/auth/auth-context";

export default function TabsLayout() {
  const { profile, loading } = useAuth();
  const { room } = useLocalSearchParams<{ room?: string }>();
  useEffect(() => {
    if (loading || !profile || profile.tutorialCompletedAt) return;
    router.replace({
      pathname: "/match",
      params: {
        playerId: profile.id,
        matchId: `bot-${profile.id}-${Date.now()}`,
        mode: "bot",
        tutorial: "1",
        ...(room ? { nextRoom: room } : {}),
      },
    });
  }, [loading, profile, room]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await preloadSounds();
      if (!cancelled) await startLobbyMusic();
    })();
    // Pause only when leaving the whole tab shell (e.g. match). Keep position.
    return () => {
      cancelled = true;
      void stopLobbyMusic();
    };
  }, []);

  if (!loading && profile && !profile.tutorialCompletedAt) return null;

  return (
    <Tabs
      initialRouteName="lobby"
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={props => <StadiumTabBar {...props} />}
    >
      <Tabs.Screen name="lobby" />
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="competition" />
      <Tabs.Screen name="cosmetics" />
    </Tabs>
  );
}
