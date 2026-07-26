import { tr } from "@/i18n";

export type FriendshipState = "NONE" | "PENDING_INCOMING" | "PENDING_OUTGOING" | "ACCEPTED" | "SELF";

export function friendErrorMessage(error: unknown): string {
  const value = [
    String((error as { code?: string })?.code ?? ""),
    String((error as { message?: string })?.message ?? ""),
    String((error as { details?: string })?.details ?? ""),
  ].join(" ");
  const code = Object.keys(tr.friends.errors).find(key => value.includes(key)) as keyof typeof tr.friends.errors | undefined;
  return code ? tr.friends.errors[code] : tr.friends.errors.fallback;
}

export function createFriendRoomKey(): string {
  return (globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12)
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`).toLowerCase();
}
