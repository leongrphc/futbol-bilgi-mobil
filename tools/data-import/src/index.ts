import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chunkPayload, describeChunk } from "./chunk";
import { transformExport } from "./transform";

const args = process.argv.slice(2);
const flag = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

const file = flag("--file");
if (!file) throw new Error("Usage: pnpm data:import -- --file ./club_pairs.json [--batch] [--chunk-rows 2000] [--version 20260726170000]");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (server only)");

const bytes = await readFile(resolve(file));
const hash = createHash("sha256").update(bytes).digest("hex");
const raw = JSON.parse(bytes.toString("utf8")) as unknown;
const generatedAt = !Array.isArray(raw) && raw && typeof raw === "object" && "generated_at" in raw
  ? String((raw as { generated_at?: unknown }).generated_at ?? "")
  : "";
const version = flag("--version") ?? (generatedAt || new Date().toISOString()).replace(/[-:TZ.]/g, "").slice(0, 14);
const payload = transformExport(raw, version);

async function rpc(name: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} failed ${response.status}: ${await response.text()}`);
  return response.json();
}

// Every chunk is an idempotent upsert against a STAGING version, so replaying
// one after a transport error cannot double-write.
async function withRetry<T>(label: string, run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.error(`  ${label}: attempt ${attempt} failed, retrying — ${(error as Error).message.slice(0, 300)}`);
      await new Promise(done => setTimeout(done, attempt * 2000));
    }
  }
}

const summary = {
  schema_version: payload.schema_version,
  data_version: version,
  hash,
  clubs: payload.clubs.length,
  players: payload.players.length,
  aliases: payload.aliases.length,
  memberships: payload.contracts.length,
  pairs: payload.club_pairs.length,
  pair_players: payload.club_pairs.reduce((total, pair) => total + pair.players.length, 0),
};

if (!args.includes("--batch")) {
  const versionId = await rpc("publish_football_data", { payload, export_hash: hash, data_version: version });
  console.log(JSON.stringify({ status: "published", mode: "single", version_id: versionId, ...summary }, null, 2));
} else {
  const chunkRows = Number(flag("--chunk-rows") ?? 2000);
  const chunks = chunkPayload(payload, chunkRows);
  console.log(JSON.stringify({ status: "staging", mode: "batch", chunk_rows: chunkRows, chunks: chunks.length, ...summary }, null, 2));

  const versionId = await withRetry("begin", () =>
    rpc("publish_football_data_begin", { p_data_version: version, p_export_hash: hash })) as string;
  console.log(`staged version ${versionId}`);

  const startedAt = Date.now();
  const applied = { clubs: 0, players: 0, aliases: 0, pair_players: 0 };
  for (const [index, chunk] of chunks.entries()) {
    const result = await withRetry(`chunk ${index + 1}`, () =>
      rpc("publish_football_data_chunk", { p_version_id: versionId, p_chunk: chunk })) as Record<string, number>;
    for (const counter of Object.keys(applied) as (keyof typeof applied)[]) applied[counter] += result[counter] ?? 0;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[${index + 1}/${chunks.length}] ${describeChunk(chunk)} — ${elapsed}s`);
  }

  const activated = await withRetry("activate", () => rpc("publish_football_data_activate", { p_version_id: versionId }));
  console.log(JSON.stringify({ status: "published", mode: "batch", version_id: versionId, applied, activated, ...summary }, null, 2));
}
