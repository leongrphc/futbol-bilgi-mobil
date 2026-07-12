import { useEffect } from "react";
import { Tabs } from "expo-router";
import { StadiumTabBar } from "@/navigation/bottom-nav";
import { preloadSounds, startLobbyMusic, stopLobbyMusic } from "@/audio/sounds";

export default function TabsLayout() {
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
