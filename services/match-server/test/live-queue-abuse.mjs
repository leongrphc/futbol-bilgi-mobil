import { readFile } from "node:fs/promises";

async function loadEnvFile(url) {
  try {
    const value = await readFile(url, "utf8");
    for (const line of value.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await loadEnvFile(new URL("../.dev.vars", import.meta.url));
await loadEnvFile(new URL("../../../apps/mobile/.env", import.meta.url));

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const workerUrl = (process.env.MATCH_HTTP_URL ?? "https://football-link-match-server.franklimewood.workers.dev").replace(/\/$/, "");
if (!supabaseUrl || !serviceKey || !anonKey) throw new Error("Supabase smoke credentials are unavailable");

const createdUsers = [];
const request = async (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });

async function createPlayer(label) {
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `queue-smoke-${label}-${suffix}@example.invalid`;
  const password = `Smoke-${crypto.randomUUID()}!`;
  const createResponse = await request(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: `Queue Smoke ${label}` } }),
  });
  if (!createResponse.ok) throw new Error(`smoke user create failed (${createResponse.status})`);
  const user = await createResponse.json();
  createdUsers.push(user.id);

  const tokenResponse = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!tokenResponse.ok) throw new Error(`smoke sign-in failed (${tokenResponse.status})`);
  const session = await tokenResponse.json();
  if (!session.access_token) throw new Error("smoke sign-in did not return an access token");
  return { id: user.id, token: session.access_token };
}

async function queue(player, action) {
  const response = await request(`${workerUrl}/blitz-match`, {
    method: "POST",
    headers: { Authorization: `Bearer ${player.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, region: "OTHER" }),
  });
  if (!response.ok) throw new Error(`queue ${action} failed (${response.status}): ${await response.text()}`);
  return response.json();
}

async function loadProfile(player) {
  const response = await request(`${supabaseUrl}/rest/v1/rpc/player_profile_stats`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${player.token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`profile stats RPC failed (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  if (!payload?.profile?.player_id || payload.profile.player_id !== player.id || typeof payload.career?.win_rate !== "number") {
    throw new Error("profile stats RPC returned an invalid payload");
  }
}

try {
  const first = await createPlayer("A");
  const second = await createPlayer("B");
  await loadProfile(first);

  let penaltyMs = 0;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const joined = await queue(first, "join");
    if (joined.status !== "WAITING") throw new Error(`attempt ${attempt}: expected WAITING, received ${joined.status}`);
    const cancelled = await queue(first, "cancel");
    const cooldownMs = Number(cancelled.cooldown_ms ?? 0);
    if (attempt < 10 && cooldownMs !== 0) throw new Error(`attempt ${attempt}: unexpected cooldown ${cooldownMs}`);
    if (attempt === 10) {
      if (cooldownMs < 40_000) throw new Error(`tenth exit did not apply cooldown: ${cooldownMs}`);
      penaltyMs = cooldownMs;
    }
  }

  const blocked = await queue(first, "join");
  if (blocked.status !== "COOLDOWN") throw new Error(`expected COOLDOWN, received ${blocked.status}`);

  await new Promise(resolve => setTimeout(resolve, penaltyMs + 1_500));
  const firstWaiting = await queue(first, "join");
  if (firstWaiting.status !== "WAITING") throw new Error(`post-cooldown join failed: ${firstWaiting.status}`);
  const secondMatched = await queue(second, "join");
  if (secondMatched.status !== "MATCHED") throw new Error(`cleanup match failed: ${secondMatched.status}`);
  const firstMatched = await queue(first, "join");
  if (firstMatched.status !== "MATCHED" || firstMatched.match_id !== secondMatched.match_id) throw new Error("queue assignment mismatch");

  console.log(JSON.stringify({ ok: true, free_exits: 9, penalized_exit: 10, cooldown_ms: penaltyMs, profile_rpc: true, abuse_state_reset_by_match: true }));
} finally {
  for (const userId of createdUsers) {
    await request(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }).catch(() => undefined);
  }
}
