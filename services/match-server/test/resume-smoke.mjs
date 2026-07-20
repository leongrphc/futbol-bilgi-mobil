import { readFile } from "node:fs/promises";
import { createSmokeTicket, matchSocketUrl } from "./smoke-ticket.mjs";

const fixture = JSON.parse(await readFile(new URL("../../../tools/football-data-builder/exports/club_pairs.json", import.meta.url), "utf8"));
const fixturePairs = Array.isArray(fixture) ? fixture : fixture.club_pairs;
const key = (a, b) => [a, b].sort().join(":");
const validPairs = new Set(fixturePairs.map(pair => key(pair.club_a.slug, pair.club_b.slug)));
const base = process.env.MATCH_URL ?? "ws://127.0.0.1:8787";
const matchId = `resume-smoke-${Date.now()}`;
const playerId = process.env.MATCH_PLAYER_ID ?? "resume-human";
let sequence = 0;
let pool = [];
let socket;
let reconnecting = false;
const send = (event_type, payload = {}) => socket.send(JSON.stringify({ protocol_version: 1, match_id: matchId, event_type, command_id: `resume-${++sequence}`, payload }));
const ticket = await createSmokeTicket({ playerId, matchId, base });
const openSocket = () => new WebSocket(matchSocketUrl(base, matchId, ticket));

const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("resume smoke timeout")), 45_000);
  const attach = ws => {
    socket = ws;
    ws.onerror = () => { if (!reconnecting) reject(new Error("resume socket failed")); };
    ws.onopen = () => send("RECONNECT");
    ws.onmessage = ({ data }) => {
      const event = JSON.parse(String(data));
      console.log(`resume-smoke: ${event.event_type}`);
      if (event.event_type === "ERROR") return reject(new Error(`server error: ${JSON.stringify(event.payload)}`));
      if (event.event_type === "READY_CHECK_STARTED") send("READY_CONFIRM");
      if (event.event_type === "TEAM_POOL_CREATED") pool = event.payload.clubs;
      if (event.event_type === "TEAM_SELECTION_STARTED") {
        const selected = pool.find(a => pool.some(b => a.id !== b.id && validPairs.has(key(a.id, b.id))));
        if (!selected) return reject(new Error("selectable club missing"));
        send("TEAM_SELECT", { club_id: selected.id }); send("TEAM_CONFIRM");
      }
      if (event.event_type === "COUNTDOWN_STARTED" && !reconnecting) {
        reconnecting = true;
        ws.close();
        setTimeout(() => attach(openSocket()), 1000);
      }
      if (event.event_type === "PLAYER_RECONNECTED" && reconnecting) {
        clearTimeout(timer);
        resolve({ phase: event.payload.phase, deadline: event.payload.deadline });
      }
    };
  };
  attach(openSocket());
});

try {
  if (result.phase !== "COUNTDOWN" || Number(result.deadline) <= Date.now()) throw new Error(`unexpected reconnect snapshot ${JSON.stringify(result)}`);
  console.log(JSON.stringify({ ok: true, matchId, resumedPhase: result.phase }));
} finally {
  socket?.close();
}
