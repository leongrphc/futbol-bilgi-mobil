import { describe, expect, it } from "vitest";
import { chunkPayload, describeChunk, type PublishChunk } from "../src/chunk";
import type { PublishPayload } from "../src/transform";

function payload(overrides: Partial<PublishPayload> = {}): PublishPayload {
  return {
    schema_version: 2,
    data_version: "test",
    clubs: [],
    players: [],
    aliases: [],
    contracts: [],
    club_pairs: [],
    ...overrides,
  };
}

const pairOf = (id: string, playerCount: number) => ({
  club_a_id: `${id}-a`,
  club_b_id: `${id}-b`,
  players: Array.from({ length: playerCount }, (_, index) => ({ player_id: `${id}-p${index}` })),
});

const kindOf = (chunk: PublishChunk) =>
  chunk.clubs ? "clubs" : chunk.players ? "players" : chunk.aliases ? "aliases" : "club_pairs";

describe("publish payload chunking", () => {
  it("emits clubs and players before the pairs that reference them", () => {
    const chunks = chunkPayload(payload({
      clubs: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      players: [{ id: "p1", game_name: "P", normalized_name: "p" }],
      aliases: [{ player_id: "p1", alias: "P", normalized_alias: "p", accepted: true }],
      club_pairs: [pairOf("x", 1)],
    }), 10);

    expect(chunks.map(kindOf)).toEqual(["clubs", "players", "aliases", "club_pairs"]);
  });

  it("splits flat collections at the row limit", () => {
    const chunks = chunkPayload(payload({
      players: Array.from({ length: 25 }, (_, index) => ({
        id: `p${index}`,
        game_name: `P${index}`,
        normalized_name: `p${index}`,
      })),
    }), 10);

    expect(chunks.map(chunk => chunk.players?.length)).toEqual([10, 10, 5]);
  });

  it("weighs pairs by their player rows and never splits one pair", () => {
    const chunks = chunkPayload(payload({
      club_pairs: [pairOf("a", 6), pairOf("b", 5), pairOf("c", 2)],
    }), 10);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.club_pairs?.map(pair => pair.players.length)).toEqual([6]);
    expect(chunks[1]!.club_pairs?.map(pair => pair.players.length)).toEqual([5, 2]);
  });

  it("keeps an oversized pair whole in its own chunk", () => {
    const chunks = chunkPayload(payload({ club_pairs: [pairOf("big", 40), pairOf("small", 1)] }), 10);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.club_pairs).toHaveLength(1);
    expect(chunks[0]!.club_pairs![0]!.players).toHaveLength(40);
    expect(chunks[1]!.club_pairs![0]!.players).toHaveLength(1);
  });

  it("loses no rows across the split", () => {
    const source = payload({
      clubs: Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, name: `C${i}` })),
      players: Array.from({ length: 31 }, (_, i) => ({ id: `p${i}`, game_name: `P${i}`, normalized_name: `p${i}` })),
      aliases: Array.from({ length: 19 }, (_, i) => ({ player_id: `p${i}`, alias: `A${i}`, normalized_alias: `a${i}`, accepted: true })),
      club_pairs: Array.from({ length: 23 }, (_, i) => pairOf(`x${i}`, (i % 5) + 1)),
    });
    const chunks = chunkPayload(source, 8);

    const total = (key: keyof PublishChunk) =>
      chunks.reduce((sum, chunk) => sum + ((chunk[key] as unknown[] | undefined)?.length ?? 0), 0);
    expect(total("clubs")).toBe(source.clubs.length);
    expect(total("players")).toBe(source.players.length);
    expect(total("aliases")).toBe(source.aliases.length);
    expect(total("club_pairs")).toBe(source.club_pairs.length);

    const pairRows = chunks.flatMap(chunk => chunk.club_pairs ?? []).reduce((sum, pair) => sum + pair.players.length, 0);
    expect(pairRows).toBe(source.club_pairs.reduce((sum, pair) => sum + pair.players.length, 0));
  });

  it("rejects a nonsense row limit", () => {
    expect(() => chunkPayload(payload(), 0)).toThrow(/positive integer/);
  });

  it("describes each chunk kind for progress output", () => {
    expect(describeChunk({ clubs: [{ id: "a", name: "A" }] })).toBe("clubs x1");
    expect(describeChunk({ club_pairs: [pairOf("a", 3)] })).toBe("pairs x1 (3 rows)");
  });
});
