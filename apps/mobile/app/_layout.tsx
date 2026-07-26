import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/theme/colors";
import { AuthProvider } from "@/auth/auth-context";
import * as WebBrowser from "expo-web-browser";
import { LanguageProvider } from "@/language/language-provider";
import { AccountLanguageSync } from "@/language/account-language-sync";
import { NotificationProvider } from "@/notifications/notification-provider";

WebBrowser.maybeCompleteAuthSession();

export default function Layout() {
  return <LanguageProvider>
    <AuthProvider>
      <AccountLanguageSync />
      <NotificationProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </NotificationProvider>
    </AuthProvider>
  </LanguageProvider>;
}
