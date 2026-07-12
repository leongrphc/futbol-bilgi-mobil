import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/theme/colors";
import { AuthProvider } from "@/auth/auth-context";
import * as WebBrowser from "expo-web-browser";
import { RematchOfferWatcher } from "@/match/rematch-offer-watcher";
import { FriendInviteWatcher } from "@/friends/friend-invite-watcher";

WebBrowser.maybeCompleteAuthSession();

export default function Layout() {
  return <AuthProvider>
    <RematchOfferWatcher />
    <FriendInviteWatcher />
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
  </AuthProvider>;
}
