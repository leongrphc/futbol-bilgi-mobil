import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchPushNotification, dueSystemSweeps, handleNotificationDispatch, notificationCopy, runSystemNotificationSweeps, type NotificationEnv } from "../src/notifications";

const env: NotificationEnv = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-secret",
  NOTIFICATION_WEBHOOK_SECRET: "webhook-secret",
};

afterEach(() => vi.unstubAllGlobals());

describe("social push notifications", () => {
  it("localizes transactional notification copy", () => {
    expect(notificationCopy("FRIEND_MATCH_INVITE", "Ada", "tr")).toEqual({
      title: "Maç daveti",
      body: "Ada seni arkadaş maçına davet etti.",
    });
    expect(notificationCopy("REMATCH_OFFER", "Alex", "en")).toEqual({
      title: "Rematch?",
      body: "Alex wants to play again.",
    });
  });

  it("rejects unsigned notification webhooks", async () => {
    const response = await handleNotificationDispatch(new Request("https://worker/notification-dispatch", {
      method: "POST",
      body: JSON.stringify({ notification_id: "11111111-1111-1111-1111-111111111111" }),
    }), env);
    expect(response.status).toBe(401);
  });

  it("claims a notification, sends localized Expo payloads, and stores receipt ids", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/app_notifications?") && init?.method === "PATCH" && url.includes("push_attempted_at=is.null")) {
        return Response.json([{
          id: "11111111-1111-1111-1111-111111111111",
          recipient_id: "22222222-2222-2222-2222-222222222222",
          actor_id: "33333333-3333-3333-3333-333333333333",
          type: "FRIEND_REQUEST",
          room_key: null,
          match_mode: null,
          expires_at: null,
          push_attempted_at: new Date().toISOString(),
        }]);
      }
      if (url.includes("/profiles?")) return Response.json([{ display_name: "Ada" }]);
      if (url.includes("/push_device_tokens?") && !init?.method) {
        return Response.json([{ id: "token-row", expo_push_token: "ExpoPushToken[abc12345678901234567]", locale: "tr" }]);
      }
      if (url.includes("/api/v2/push/send")) return Response.json({ data: [{ status: "ok", id: "expo-ticket" }] });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchPushNotification(env, "11111111-1111-1111-1111-111111111111")).resolves.toBe("SENT");

    const expoCall = fetchMock.mock.calls.find(call => String(call[0]).includes("/api/v2/push/send"));
    const message = JSON.parse(String(expoCall?.[1]?.body))[0];
    expect(message).toMatchObject({
      to: "ExpoPushToken[abc12345678901234567]",
      title: "Yeni arkadaşlık isteği",
      data: {
        notificationId: "11111111-1111-1111-1111-111111111111",
        route: "/notifications",
      },
    });
    const receiptCall = fetchMock.mock.calls.find(call => String(call[0]).includes("/app_notification_push_receipts"));
    expect(JSON.parse(String(receiptCall?.[1]?.body))[0]).toMatchObject({
      token_id: "token-row",
      ticket_id: "expo-ticket",
    });
  });
});

describe("system notification sweeps", () => {
  it("gates each sweep to its own quarter-hour window in UTC", () => {
    expect(dueSystemSweeps(new Date("2026-07-24T17:00:00Z"))).toEqual(["STREAK_REMINDERS"]);
    expect(dueSystemSweeps(new Date("2026-07-24T17:14:59Z"))).toEqual(["STREAK_REMINDERS"]);
    expect(dueSystemSweeps(new Date("2026-07-24T17:15:00Z"))).toEqual([]);
    expect(dueSystemSweeps(new Date("2026-07-24T09:00:00Z"))).toEqual([]);
    expect(dueSystemSweeps(new Date("2026-07-27T09:05:00Z"))).toEqual(["WEEKLY_REWARD_REMINDERS"]);
    expect(dueSystemSweeps(new Date("2026-07-28T09:05:00Z"))).toEqual([]);
  });

  it("calls the matching service-role RPCs for due sweeps", async () => {
    const fetchMock = vi.fn(async () => new Response("1", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await runSystemNotificationSweeps(env, new Date("2026-07-27T09:03:00Z"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/rpc/system_enqueue_weekly_reward_reminders");

    fetchMock.mockClear();
    await runSystemNotificationSweeps(env, new Date("2026-07-27T12:00:00Z"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("has copy for the system notification types in both locales", () => {
    expect(notificationCopy("STREAK_REMINDER", "Football Link", "tr").title).toBe("Serin bugün bitiyor");
    expect(notificationCopy("WEEKLY_REWARD_READY", "Football Link", "en").title).toBe("Weekly league reward");
    expect(notificationCopy("TOURNAMENT_INVITE", "Ali", "en").body).toContain("Ali");
  });
});
