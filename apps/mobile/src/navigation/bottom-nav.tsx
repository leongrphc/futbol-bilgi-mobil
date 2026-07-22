import { useCallback, type ComponentProps } from "react";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { playSfx } from "@/audio/sounds";
import { useLanguage } from "@/language/language-provider";

type IconName = ComponentProps<typeof Ionicons>["name"];
type MainRoute = "lobby" | "friends" | "competition" | "cosmetics";
type RouteMeta = { path: string; icon: IconName; activeIcon: IconName; label: string };

const routeMeta = (name: string): RouteMeta | undefined => {
  if (name === "lobby") return { path: "/lobby", icon: "football-outline", activeIcon: "football", label: tr.nav.play };
  if (name === "friends") return { path: "/friends", icon: "people-outline", activeIcon: "people", label: tr.nav.friends };
  if (name === "competition") return { path: "/competition", icon: "trophy-outline", activeIcon: "trophy", label: tr.nav.league };
  if (name === "cosmetics") return { path: "/cosmetics", icon: "bag-handle-outline", activeIcon: "bag-handle", label: tr.nav.style };
  return undefined;
};

function TabVisual({ meta, focused }: { meta: RouteMeta; focused: boolean }) {
  return (
    <>
      <View style={[styles.iconShell, focused && styles.iconShellActive]}>
        <Ionicons name={focused ? meta.activeIcon : meta.icon} size={24} color={focused ? colors.primary : "#78909B"} />
      </View>
      <Text numberOfLines={1} style={[styles.label, focused && styles.labelActive]}>{meta.label}</Text>
      {focused && <View style={styles.indicator} />}
    </>
  );
}

export function StadiumTabBar({ state, navigation }: BottomTabBarProps) {
  useLanguage();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.stage, { bottom: Math.max(insets.bottom, 8) }]}>
      <View accessibilityRole="tablist" style={styles.dock}>
        {state.routes.map((route, index) => {
          const meta = routeMeta(route.name);
          if (!meta) return null;
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              void Haptics.selectionAsync();
              void playSfx("tab");
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              style={({ pressed }) => [styles.item, focused && styles.itemActive, pressed && styles.pressed]}
            >
              <TabVisual meta={meta} focused={focused} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Secondary Stack screens use the same visual dock to return to a main tab.
export function BottomNav() {
  useLanguage();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const items: MainRoute[] = ["lobby", "friends", "competition", "cosmetics"];
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { router.replace("/lobby"); return true; });
    return () => subscription.remove();
  }, []));
  return (
    <View pointerEvents="box-none" style={[styles.stage, { bottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.dock}>
        {items.map(name => {
          const meta = routeMeta(name)!;
          const focused = pathname === meta.path;
          return (
            <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => {
              if (focused) return;
              void Haptics.selectionAsync();
              void playSfx("tab");
              router.replace(meta.path as never);
            }} style={({ pressed }) => [styles.item, focused && styles.itemActive, pressed && styles.pressed]}>
              <TabVisual meta={meta} focused={focused} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { position: "absolute", left: 16, right: 16, zIndex: 50 },
  dock: { height: 72, flexDirection: "row", alignItems: "center", borderRadius: 21, borderWidth: 1, borderColor: "#24414D", backgroundColor: "rgba(13,30,40,.99)", paddingHorizontal: 6, paddingVertical: 6, shadowColor: "#000", shadowOpacity: .24, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 10 },
  item: { position: "relative", flex: 1, height: 60, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 3 },
  itemActive: { transform: [{ translateY: -1 }] },
  iconShell: { width: 42, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconShellActive: { backgroundColor: "rgba(89,213,166,.11)" },
  label: { color: "#78909B", fontSize: 10, lineHeight: 13, fontWeight: "700" },
  labelActive: { color: colors.text, fontWeight: "900" },
  indicator: { position: "absolute", bottom: 1, width: 20, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  pressed: { opacity: .68, transform: [{ scale: .97 }] },
});
