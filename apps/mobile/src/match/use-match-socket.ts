import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEventType, ServerMessage } from "@football-link/shared";
import { supabase } from "@/auth/supabase";

function httpUrl(webSocketUrl: string) {
  return webSocketUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function useMatchSocket(matchId: string, playerId: string, mode?: "bot" | "quick" | "blitz" | "ranked" | "event", resume = false) {
  const [events, setEvents] = useState<ServerMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>();
  const ref = useRef<WebSocket | null>(null);

  useEffect(() => {
    const base = process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787";
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let hasServerState = false;
    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken || data.session?.user.id !== playerId) { setError("Maç için geçerli bir oturum bulunamadı."); return; }
      try {
        const response = await fetch(`${httpUrl(base)}/match-token`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ match_id: matchId, mode }) });
        if (!response.ok) throw new Error("MATCH_TOKEN_FAILED");
        const ticket = await response.json() as { token: string };
        if (disposed) return;
        const query = new URLSearchParams({ token: ticket.token });
      const ws = new WebSocket(`${base}/match/${encodeURIComponent(matchId)}?${query}`);
      ref.current = ws;
      ws.onopen = () => {
        setConnected(true);
        setError(undefined);
        if (mode === "bot" || resume || hasServerState) ws.send(JSON.stringify({ protocol_version: 1, match_id: matchId, event_type: "RECONNECT", command_id: `${playerId}-${Date.now()}-sync`, payload: {} }));
      };
      ws.onerror = () => setError("Maç sunucusuna ulaşılamıyor. Bağlantı yeniden deneniyor.");
      ws.onclose = () => {
        setConnected(false);
        if (!disposed) { setError("Bağlantı kesildi. Yeniden bağlanılıyor."); retry = setTimeout(() => { void connect(); }, 2500); }
      };
      ws.onmessage = event => {
        hasServerState = true;
        const message = JSON.parse(String(event.data)) as ServerMessage;
        setEvents(old => [...old.slice(-49), message]);
      };
      } catch {
        if (!disposed) { setError("Maç bileti alınamadı. Bağlantı yeniden deneniyor."); retry = setTimeout(() => { void connect(); }, 2500); }
      }
    };
    void connect();
    return () => { disposed = true; if (retry) clearTimeout(retry); ref.current?.close(); };
  }, [matchId, mode, playerId, resume]);

  const send = useCallback((event_type: ClientEventType, payload: Record<string, unknown> = {}) => {
    if (ref.current?.readyState !== WebSocket.OPEN) { setError("Bağlantı henüz hazır değil. Birkaç saniye sonra tekrar dene."); return false; }
    ref.current.send(JSON.stringify({ protocol_version: 1, match_id: matchId, event_type, command_id: `${playerId}-${Date.now()}-${Math.random()}`, payload }));
    return true;
  }, [matchId, playerId]);

  return { connected, error, events, last: events.at(-1), send };
}
