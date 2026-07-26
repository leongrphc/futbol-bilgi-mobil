export interface NotificationEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  NOTIFICATION_WEBHOOK_SECRET: string;
  EXPO_ACCESS_TOKEN?: string;
}

type NotificationType = "FRIEND_REQUEST" | "FRIEND_ACCEPTED" | "FRIEND_MATCH_INVITE" | "REMATCH_OFFER";
type NotificationRecord = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  room_key: string | null;
  match_mode: string | null;
  expires_at: string | null;
  push_attempted_at: string | null;
};
type PushTokenRecord = {
  id: string;
  expo_push_token: string;
  locale: "tr" | "en";
};
type PushReceiptRecord = {
  id: string;
  ticket_id: string;
  token_id: string;
};
type ExpoTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};
type ExpoReceipt = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

const serviceHeaders = (env: NotificationEnv, extra?: HeadersInit): HeadersInit => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  ...extra,
});

const restUrl = (env: NotificationEnv, path: string) => `${env.SUPABASE_URL}/rest/v1/${path}`;

async function readRows<T>(env: NotificationEnv, path: string): Promise<T[]> {
  const response = await fetch(restUrl(env, path), { headers: serviceHeaders(env) });
  if (!response.ok) throw new Error(`SUPABASE_READ_${response.status}`);
  return await response.json() as T[];
}

async function patchRows(
  env: NotificationEnv,
  path: string,
  value: Record<string, unknown>,
  returnRows = false,
): Promise<Record<string, unknown>[]> {
  const response = await fetch(restUrl(env, path), {
    method: "PATCH",
    headers: serviceHeaders(env, {
      "Content-Type": "application/json",
      Prefer: returnRows ? "return=representation" : "return=minimal",
    }),
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`SUPABASE_PATCH_${response.status}`);
  return returnRows ? await response.json() as Record<string, unknown>[] : [];
}

async function insertRows(env: NotificationEnv, path: string, value: unknown): Promise<void> {
  const response = await fetch(restUrl(env, path), {
    method: "POST",
    headers: serviceHeaders(env, {
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=ignore-duplicates",
    }),
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`SUPABASE_INSERT_${response.status}`);
}

export function notificationCopy(type: NotificationType, actorName: string, locale: "tr" | "en") {
  if (locale === "en") {
    if (type === "FRIEND_REQUEST") return { title: "New friend request", body: `${actorName} wants to add you as a friend.` };
    if (type === "FRIEND_ACCEPTED") return { title: "Friend request accepted", body: `${actorName} is now on your friends list.` };
    if (type === "FRIEND_MATCH_INVITE") return { title: "Match invitation", body: `${actorName} invited you to a friend match.` };
    return { title: "Rematch?", body: `${actorName} wants to play again.` };
  }
  if (type === "FRIEND_REQUEST") return { title: "Yeni arkadaşlık isteği", body: `${actorName} seni arkadaş olarak eklemek istiyor.` };
  if (type === "FRIEND_ACCEPTED") return { title: "Arkadaşlık isteği kabul edildi", body: `${actorName} artık arkadaş listende.` };
  if (type === "FRIEND_MATCH_INVITE") return { title: "Maç daveti", body: `${actorName} seni arkadaş maçına davet etti.` };
  return { title: "Rövanş?", body: `${actorName} yeniden oynamak istiyor.` };
}

const expoHeaders = (env: NotificationEnv): HeadersInit => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
});

async function markPushError(env: NotificationEnv, notificationId: string, error: string): Promise<void> {
  await patchRows(env, `app_notifications?id=eq.${encodeURIComponent(notificationId)}`, {
    push_error: error.slice(0, 500),
  });
}

async function disableToken(env: NotificationEnv, tokenId: string): Promise<void> {
  await patchRows(env, `push_device_tokens?id=eq.${encodeURIComponent(tokenId)}`, {
    disabled_at: new Date().toISOString(),
  });
}

export async function dispatchPushNotification(env: NotificationEnv, notificationId: string): Promise<"SENT" | "SKIPPED"> {
  if (!/^[0-9a-f-]{36}$/i.test(notificationId)) throw new Error("INVALID_NOTIFICATION_ID");

  const claimed = await patchRows(
    env,
    `app_notifications?id=eq.${encodeURIComponent(notificationId)}&push_attempted_at=is.null`,
    { push_attempted_at: new Date().toISOString(), push_error: null },
    true,
  ) as NotificationRecord[];
  const notification = claimed[0];
  if (!notification) return "SKIPPED";

  if (notification.expires_at && new Date(notification.expires_at).getTime() <= Date.now()) {
    await markPushError(env, notification.id, "EXPIRED");
    return "SKIPPED";
  }

  const [actors, tokens] = await Promise.all([
    notification.actor_id
      ? readRows<{ display_name: string }>(
        env,
        `profiles?id=eq.${encodeURIComponent(notification.actor_id)}&select=display_name&limit=1`,
      )
      : Promise.resolve([]),
    readRows<PushTokenRecord>(
      env,
      `push_device_tokens?user_id=eq.${encodeURIComponent(notification.recipient_id)}&disabled_at=is.null&select=id,expo_push_token,locale`,
    ),
  ]);
  if (!tokens.length) {
    await markPushError(env, notification.id, "NO_ACTIVE_PUSH_TOKEN");
    return "SKIPPED";
  }

  const actorName = actors[0]?.display_name ?? "Football Link";
  const messages = tokens.map(token => {
    const copy = notificationCopy(notification.type, actorName, token.locale);
    return {
      to: token.expo_push_token,
      title: copy.title,
      body: copy.body,
      sound: "default",
      channelId: "social",
      priority: "high",
      data: {
        notificationId: notification.id,
        notificationType: notification.type,
        route: "/notifications",
      },
    };
  });

  let response: Response;
  try {
    response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: expoHeaders(env),
      body: JSON.stringify(messages),
    });
  } catch (error) {
    await markPushError(env, notification.id, `RETRYABLE:${error instanceof Error ? error.message : "NETWORK_ERROR"}`);
    throw error;
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    await markPushError(env, notification.id, `${response.status >= 500 || response.status === 429 ? "RETRYABLE:" : ""}EXPO_${response.status}:${detail}`);
    throw new Error(`EXPO_PUSH_${response.status}`);
  }

  const payload = await response.json() as { data?: ExpoTicket | ExpoTicket[]; errors?: unknown };
  const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  const receipts: Array<{ notification_id: string; token_id: string; ticket_id: string }> = [];
  const immediateErrors: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const ticket = tickets[index];
    if (ticket?.status === "ok" && ticket.id) {
      receipts.push({ notification_id: notification.id, token_id: token.id, ticket_id: ticket.id });
      continue;
    }
    const code = ticket?.details?.error ?? "UNKNOWN";
    immediateErrors.push(`${code}:${ticket?.message ?? "Push rejected"}`);
    if (code === "DeviceNotRegistered") await disableToken(env, token.id);
  }

  if (receipts.length) await insertRows(env, "app_notification_push_receipts", receipts);
  await patchRows(env, `app_notifications?id=eq.${encodeURIComponent(notification.id)}`, {
    push_error: immediateErrors.length ? immediateErrors.join(" | ").slice(0, 500) : null,
  });
  return receipts.length ? "SENT" : "SKIPPED";
}

export async function handleNotificationDispatch(request: Request, env: NotificationEnv): Promise<Response> {
  if (!env.NOTIFICATION_WEBHOOK_SECRET || request.headers.get("X-Webhook-Secret") !== env.NOTIFICATION_WEBHOOK_SECRET) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const body = await request.json<{ notification_id?: string }>();
    if (!body.notification_id) return Response.json({ error: "INVALID_NOTIFICATION_ID" }, { status: 400 });
    const status = await dispatchPushNotification(env, body.notification_id);
    return Response.json({ status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PUSH_DISPATCH_FAILED" }, { status: 500 });
  }
}

export async function checkPushReceipts(env: NotificationEnv): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const pending = await readRows<PushReceiptRecord>(
    env,
    `app_notification_push_receipts?status=eq.PENDING&created_at=lte.${encodeURIComponent(cutoff)}&select=id,ticket_id,token_id&order=created_at.asc&limit=1000`,
  );
  if (!pending.length) return;

  for (let offset = 0; offset < pending.length; offset += 300) {
    const batch = pending.slice(offset, offset + 300);
    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: expoHeaders(env),
      body: JSON.stringify({ ids: batch.map(item => item.ticket_id) }),
    });
    if (!response.ok) throw new Error(`EXPO_RECEIPTS_${response.status}`);
    const payload = await response.json() as { data?: Record<string, ExpoReceipt> };

    for (const item of batch) {
      const receipt = payload.data?.[item.ticket_id];
      if (!receipt?.status) continue;
      const errorCode = receipt.details?.error ?? null;
      await patchRows(env, `app_notification_push_receipts?id=eq.${encodeURIComponent(item.id)}`, {
        status: receipt.status === "ok" ? "DELIVERED" : "ERROR",
        error_code: errorCode,
        error_message: receipt.message?.slice(0, 500) ?? null,
        checked_at: new Date().toISOString(),
      });
      if (errorCode === "DeviceNotRegistered") await disableToken(env, item.token_id);
    }
  }
}
