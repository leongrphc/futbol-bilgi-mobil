import type { PublishPayload } from "./transform";

export interface PublishChunk {
  clubs?: PublishPayload["clubs"];
  players?: PublishPayload["players"];
  aliases?: PublishPayload["aliases"];
  club_pairs?: PublishPayload["club_pairs"];
}

function* windows<T>(items: T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) yield items.slice(index, index + size);
}

/**
 * Splits a publish payload into chunks the batched RPCs can apply one
 * transaction at a time.
 *
 * Order is load bearing: clubs and players resolve by external_id inside the
 * pair insert, so they have to land first. Pairs are weighed by their player
 * count because that is what actually writes rows, and a single pair is never
 * split across chunks so publish_football_data_activate can derive exact
 * per-pair stats from the rows that landed.
 */
export function chunkPayload(payload: PublishPayload, maxRows = 2000): PublishChunk[] {
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error("maxRows must be a positive integer");

  const chunks: PublishChunk[] = [];
  for (const clubs of windows(payload.clubs, maxRows)) chunks.push({ clubs });
  for (const players of windows(payload.players, maxRows)) chunks.push({ players });
  for (const aliases of windows(payload.aliases, maxRows)) chunks.push({ aliases });

  let bucket: PublishPayload["club_pairs"] = [];
  let weight = 0;
  for (const pair of payload.club_pairs) {
    const cost = Math.max(1, pair.players.length);
    if (bucket.length > 0 && weight + cost > maxRows) {
      chunks.push({ club_pairs: bucket });
      bucket = [];
      weight = 0;
    }
    bucket.push(pair);
    weight += cost;
  }
  if (bucket.length > 0) chunks.push({ club_pairs: bucket });

  return chunks;
}

export function describeChunk(chunk: PublishChunk): string {
  if (chunk.clubs) return `clubs x${chunk.clubs.length}`;
  if (chunk.players) return `players x${chunk.players.length}`;
  if (chunk.aliases) return `aliases x${chunk.aliases.length}`;
  const pairs = chunk.club_pairs ?? [];
  return `pairs x${pairs.length} (${pairs.reduce((total, pair) => total + pair.players.length, 0)} rows)`;
}
