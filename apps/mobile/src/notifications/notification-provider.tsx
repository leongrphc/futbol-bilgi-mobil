import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { locale } from "@/i18n";
import { loadUnreadNotificationCount } from "./api";
import { isPushEnabled, refreshPushRegistration } from "./push";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationContextValue = {
  unreadCount: number;
  pushEnabled: boolean;
  refresh: () => Promise<void>;
  refreshPushState: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function notificationIdFromResponse(response: Notifications.NotificationResponse): string | undefined {
  const value = response.notification.request.content.data?.notificationId;
  return typeof value === "string" ? value : undefined;
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const { profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const handledResponse = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!profile) {
      setUnreadCount(0);
      return;
    }
    try {
      setUnreadCount(await loadUnreadNotificationCount());
    } catch {
      // Inbox remains available through manual retry if the network is unavailable.
    }
  }, [profile]);

  const refreshPushState = useCallback(async () => {
    setPushEnabled(await isPushEnabled());
  }, []);

  useEffect(() => {
    void refreshPushState();
    if (!profile) return;
    void refresh();
    void refreshPushRegistration(locale).then(refreshPushState).catch(() => undefined);

    const channel = supabase
      .channel(`app-notifications:${profile.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "app_notifications",
        filter: `recipient_id=eq.${profile.id}`,
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile, refresh, refreshPushState]);

  useEffect(() => {
    if (!profile) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const notificationId = notificationIdFromResponse(response);
      const responseId = response.notification.request.identifier;
      if (handledResponse.current === responseId) return;
      handledResponse.current = responseId;
      router.push({
        pathname: "/notifications",
        params: notificationId ? { notificationId } : {},
      } as never);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open);
    return () => subscription.remove();
  }, [profile]);

  const value = useMemo(() => ({ unreadCount, pushEnabled, refresh, refreshPushState }), [pushEnabled, refresh, refreshPushState, unreadCount]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationProvider");
  return value;
}
