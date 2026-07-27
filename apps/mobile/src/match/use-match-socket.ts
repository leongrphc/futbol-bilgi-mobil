import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEventType, ServerMessage } from "@football-link/shared";
import { supabase } from "@/auth/supabase";
import { tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import {
  appendRecentMatchEvent,
  parseExpectedMatchServerMessage,
} from "@/match/match-view-state";

function httpUrl(webSocketUrl: string) {
  return webSocketUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function useMatchSocket(
  matchId: string,
  playerId: string,
  mode?: "bot" | "quick" | "blitz" | "ranked" | "event",
  resume = false,
  onMessage?: (message: ServerMessage) => void,
) {
  const { locale } = useLanguage();
  const [events, setEvents] = useState<ServerMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>();
  const ref = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    setEvents([]);
  }, [matchId, playerId]);

  useEffect(() => {
    const base = process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787";
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let hasServerState = false;
    let currentSocket: WebSocket | null = null;
    let connectAttempt = 0;

    setConnected(false);

    const detach = (ws: WebSocket) => {
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.onmessage = null;
    };
    const isCurrent = (ws: WebSocket) =>
      !disposed && currentSocket === ws && ref.current === ws;
    const scheduleReconnect = () => {
      if (disposed) return;
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => {
        retry = undefined;
        void connect();
      }, 2500);
    };
    const connect = async () => {
      const attempt = ++connectAttempt;
      const { data } = await supabase.auth.getSession();
      if (disposed || attempt !== connectAttempt) return;
      const accessToken = data.session?.access_token;
      if (!accessToken || data.session?.user.id !== playerId) { setError(tr.connection.noSession); return; }
      try {
        const response = await fetch(`${httpUrl(base)}/match-token`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ match_id: matchId, mode }) });
        if (!response.ok) throw new Error("MATCH_TOKEN_FAILED");
        const ticket = await response.json() as { token: string };
        if (disposed || attempt !== connectAttempt) return;
        const query = new URLSearchParams({ token: ticket.token });
        const ws = new WebSocket(`${base}/match/${encodeURIComponent(matchId)}?${query}`);
        currentSocket = ws;
        ref.current = ws;
        ws.onopen = () => {
          if (!isCurrent(ws)) return;
          setConnected(true);
          setError(undefined);
          if (mode === "bot" || resume || hasServerState) {
            ws.send(JSON.stringify({ protocol_version: 1, match_id: matchId, event_type: "RECONNECT", command_id: `${playerId}-${Date.now()}-sync`, payload: {} }));
          }
        };
        ws.onerror = () => {
          if (isCurrent(ws)) setError(tr.connection.unreachable);
        };
        ws.onclose = () => {
          if (!isCurrent(ws)) return;
          currentSocket = null;
          if (ref.current === ws) ref.current = null;
          detach(ws);
          setConnected(false);
          setError(tr.connection.disconnected);
          scheduleReconnect();
        };
        ws.onmessage = event => {
          if (!isCurrent(ws)) return;
          const message = parseExpectedMatchServerMessage(String(event.data), matchId);
          if (!message) return;
          hasServerState = true;
          // Keep only a small recent-event window for transient UI effects/debugging.
          // Durable match view state consumes every message through the callback below.
          setEvents(old => appendRecentMatchEvent(old, message));
          onMessageRef.current?.(message);
        };
      } catch {
        if (disposed || attempt !== connectAttempt) return;
        setError(tr.connection.ticketFailed);
        scheduleReconnect();
      }
    };
    void connect();
    return () => {
      disposed = true;
      connectAttempt++;
      if (retry) clearTimeout(retry);
      const ws = currentSocket;
      currentSocket = null;
      if (!ws) return;
      detach(ws);
      if (ref.current === ws) ref.current = null;
      ws.close();
    };
  }, [locale, matchId, mode, playerId, resume]);

  const send = useCallback((event_type: ClientEventType, payload: Record<string, unknown> = {}) => {
    if (ref.current?.readyState !== WebSocket.OPEN) { setError(tr.connection.notReady); return false; }
    ref.current.send(JSON.stringify({ protocol_version: 1, match_id: matchId, event_type, command_id: `${playerId}-${Date.now()}-${Math.random()}`, payload }));
    return true;
  }, [locale, matchId, playerId]);

  return { connected, error, events, last: events.at(-1), send };
}
