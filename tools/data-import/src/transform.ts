import { normalizeAnswer } from "@football-link/answer-normalizer";

export interface PublishPayload {
  schema_version: number;
  data_version: string;
  clubs: { id: string; name: string }[];
  players: { id: string; game_name: string; normalized_name: string }[];
  aliases: { player_id: string; alias: string; normalized_alias: string; accepted: boolean }[];
  contracts: { player_id: string; club_id: string; source: string }[];
  club_pairs: { club_a_id: string; club_b_id: string; players: { player_id: string }[] }[];
}

type ExportPlayer = { id?: number | string; name: string; normalized_name?: string; accepted_answers?: string[]; wikidata_qid?: string | null; api_football_id?: number | string | null };
type ExportPair = { club_a: { slug: string; name: string }; club_b: { slug: string; name: string }; players: ExportPlayer[] };
type SchemaV2Export = { schema_version: 2; generated_at?: string; club_pairs: ExportPair[] };

const slug = (value: string) => normalizeAnswer(value).replace(/ /g, "-");
const playerId = (player: ExportPlayer) => player.wikidata_qid || (player.api_football_id != null ? `api-football:${player.api_football_id}` : `builder:${player.id ?? slug(player.name)}`);

export function transformExport(raw: unknown, version: string): PublishPayload {
  const sourcePairs = Array.isArray(raw) ? raw as ExportPair[] : (raw as SchemaV2Export).club_pairs;
  if (!Array.isArray(sourcePairs)) throw new Error("Unsupported export schema");
  const schemaVersion = Array.isArray(raw) ? 1 : Number((raw as SchemaV2Export).schema_version);
  if (schemaVersion !== 1 && schemaVersion !== 2) throw new Error(`Unsupported export schema version: ${schemaVersion}`);

  const clubs = new Map<string, string>();
  const players = new Map<string, PublishPayload["players"][number]>();
  const aliases = new Map<string, PublishPayload["aliases"][number]>();
  const contracts = new Map<string, PublishPayload["contracts"][number]>();
  const clubPairs = sourcePairs.map(pair => {
    clubs.set(pair.club_a.slug, pair.club_a.name);
    clubs.set(pair.club_b.slug, pair.club_b.name);
    return {
      club_a_id: pair.club_a.slug,
      club_b_id: pair.club_b.slug,
      players: pair.players.map(player => {
        const id = playerId(player);
        const normalizedName = player.normalized_name || normalizeAnswer(player.name);
        players.set(id, { id, game_name: player.name, normalized_name: normalizedName });
        for (const answer of new Set([normalizedName, ...(player.accepted_answers ?? [])])) {
          const normalizedAlias = normalizeAnswer(answer);
          if (normalizedAlias) aliases.set(`${id}:${normalizedAlias}`, { player_id: id, alias: answer, normalized_alias: normalizedAlias, accepted: true });
        }
        for (const clubId of [pair.club_a.slug, pair.club_b.slug]) contracts.set(`${id}:${clubId}`, { player_id: id, club_id: clubId, source: "PAIR_EXPORT_V2" });
        return { player_id: id };
      }),
    };
  });

  return { schema_version: schemaVersion, data_version: version, clubs: [...clubs].map(([id, name]) => ({ id, name })), players: [...players.values()], aliases: [...aliases.values()], contracts: [...contracts.values()], club_pairs: clubPairs };
}
