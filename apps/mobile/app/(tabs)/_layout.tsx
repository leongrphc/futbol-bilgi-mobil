import { Tabs } from "expo-router";
import { StadiumTabBar } from "@/navigation/bottom-nav";

export default function TabsLayout() {
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
