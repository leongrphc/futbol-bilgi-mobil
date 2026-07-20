import { readFile } from "node:fs/promises";
import { createSmokeTicket, matchSocketUrl } from "./smoke-ticket.mjs";

const fixture = JSON.parse(await readFile(new URL("../../../tools/football-data-builder/exports/club_pairs.json", import.meta.url), "utf8"));
const fixturePairs = Array.isArray(fixture) ? fixture : fixture.club_pairs;
const key = (a, b) => [a, b].sort().join(":");
const answers = new Map(fixturePairs.map(pair => [
  key(pair.club_a.slug, pair.club_b.slug),
  new Set(pair.players.map(player => player.name)),
]));
const matchId = `bot-smoke-${Date.now()}`;
const base = process.env.MATCH_URL ?? "ws://127.0.0.1:8787";
const playerId = process.env.MATCH_PLAYER_ID ?? "human";
const ticket = await createSmokeTicket({ playerId, matchId, base });
const socket = new WebSocket(matchSocketUrl(base, matchId, ticket));
let sequence = 0;
let pool = [];
let clubs = [];
let rounds = 0;
const used = new Set();
const seen = [];
const send = (event_type, payload = {}) => socket.send(JSON.stringify({ protocol_version: 1, match_id: matchId, event_type, command_id: `bot-smoke-${++sequence}`, payload }));

const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`bot smoke timeout after: ${seen.join(", ") || "no events"}`)), 120_000);
  socket.onopen = () => send("RECONNECT");
  socket.onerror = () => reject(new Error("bot socket failed"));
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(String(data));
    seen.push(event.event_type);
    console.log(`bot-smoke: ${event.event_type}`);
    if (event.event_type === "ERROR") reject(new Error(`server error: ${JSON.stringify(event.payload)}`));
    if (event.event_type === "READY_CHECK_STARTED") send("READY_CONFIRM");
    if (event.event_type === "TEAM_POOL_CREATED") { pool = event.payload.clubs; if (pool.length !== 6) return reject(new Error(`expected 6 clubs, received ${pool.length}`)); }
    if (event.event_type === "TEAM_SELECTION_STARTED") {
      const selected = pool.find(a => pool.some(b => a.id !== b.id && answers.has(key(a.id, b.id)) && !used.has(key(a.id, b.id))));
      if (!selected) return reject(new Error("selectable club missing"));
      send("TEAM_SELECT", { club_id: selected.id });
      send("TEAM_CONFIRM");
    }
    if (event.event_type === "TEAMS_REVEALED") { clubs = event.payload.club_ids; used.add(key(clubs[0], clubs[1])); }
    if (event.event_type === "ANSWER_PHASE_STARTED") {
      const validAnswers = answers.get(key(clubs[0], clubs[1]));
      if (!validAnswers?.size) return reject(new Error(`fixture answer missing for ${clubs.join("/")}`));
      if (event.payload.input_mode === "CHOICE") {
        const choice = event.payload.choices?.find(item => validAnswers.has(item.label));
        if (!choice) return reject(new Error(`valid fixture answer missing from choices for ${clubs.join("/")}`));
        send("ANSWER_SUBMIT", { choice_id: choice.id });
      } else send("ANSWER_SUBMIT", { answer: validAnswers.values().next().value });
    }
    if (event.event_type === "REVEAL_STARTED") {
      rounds++;
      if (event.payload.scores[playerId] !== rounds || event.payload.scores["test-bot"] !== 0) reject(new Error(`unexpected bot score ${JSON.stringify(event.payload.scores)}`));
    }
    if (event.event_type === "MATCH_FINISHED") { clearTimeout(timer); resolve(event.payload); }
  };
});

try {
  if (result.winner_id !== playerId || rounds !== 3) throw new Error(`unexpected finish ${JSON.stringify({ result, rounds })}`);
  console.log(JSON.stringify({ ok: true, matchId, rounds, winner: result.winner_id, opponent: "test-bot" }));
} finally {
  socket.close();
}
