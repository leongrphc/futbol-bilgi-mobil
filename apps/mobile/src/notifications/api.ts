import { supabase } from "@/auth/supabase";

export type AppNotificationType =
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "FRIEND_MATCH_INVITE"
  | "REMATCH_OFFER"
  | "STREAK_REMINDER"
  | "WEEKLY_REWARD_READY"
  | "TOURNAMENT_INVITE";
export type AppNotification = {
  id: string;
  type: AppNotificationType;
  actorId: string | null;
  actorName: string;
  entityId: string | null;
  roomKey: string | null;
  matchMode: string | null;
  actionStatus: string;
  readAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type NotificationRow = {
  notification_id: string;
  notification_type: string;
  actor_id: string | null;
  actor_name: string;
  entity_id: string | null;
  room_key: string | null;
  match_mode: string | null;
  action_status: string;
  read_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function type(value: string): AppNotificationType | null {
  return value === "FRIEND_REQUEST"
    || value === "FRIEND_ACCEPTED"
    || value === "FRIEND_MATCH_INVITE"
    || value === "REMATCH_OFFER"
    || value === "STREAK_REMINDER"
    || value === "WEEKLY_REWARD_READY"
    || value === "TOURNAMENT_INVITE"
    ? value
    : null;
}

export async function loadNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc("notifications_inbox", { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as NotificationRow[]).flatMap(row => {
    const notificationType = type(row.notification_type);
    if (!notificationType) return [];
    return [{
      id: row.notification_id,
      type: notificationType,
      actorId: row.actor_id,
      actorName: row.actor_name,
      entityId: row.entity_id,
      roomKey: row.room_key,
      matchMode: row.match_mode,
      actionStatus: row.action_status,
      readAt: row.read_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }];
  });
}

export async function loadUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("notifications_unread_count");
  if (error) throw error;
  return Math.max(0, Number(data ?? 0));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc("notifications_mark_read", { p_notification_id: notificationId });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("notifications_mark_all_read");
  if (error) throw error;
}

export async function registerPushToken(token: string, platform: "ANDROID" | "IOS", locale: "tr" | "en"): Promise<void> {
  const { error } = await supabase.rpc("notifications_register_push_token", {
    p_expo_push_token: token,
    p_platform: platform,
    p_locale: locale,
  });
  if (error) throw error;
}

export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc("notifications_unregister_push_token", { p_expo_push_token: token });
  if (error) throw error;
}
