import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformExport } from "../src/transform";

const legacy = [{ club_a: { slug: "arsenal", name: "Arsenal" }, club_b: { slug: "real", name: "Real" }, players: [{ name: "Mesut Özil", wikidata_qid: "Q1" }] }];

describe("football data transform", () => {
  it("keeps legacy exports deterministic", () => {
    const value = transformExport([...legacy, ...legacy], "v1");
    expect(value.clubs).toHaveLength(2);
    expect(value.players).toHaveLength(1);
    expect(value.club_pairs).toHaveLength(2);
  });

  it("maps schema v2 accepted answers and memberships", () => {
    const value = transformExport({ schema_version: 2, club_pairs: [{ club_a: { slug: "trabzonspor", name: "Trabzonspor" }, club_b: { slug: "galatasaray", name: "Galatasaray" }, players: [{ id: 161, name: "Uğurcan Çakır", normalized_name: "ugurcan cakir", accepted_answers: ["Uğurcan Çakır"], wikidata_qid: "Q19610875" }] }] }, "2026.07");
    expect(value.players[0]?.id).toBe("Q19610875");
    expect(value.aliases.map(alias => alias.normalized_alias)).toEqual(["ugurcan cakir"]);
    expect(value.contracts).toEqual(expect.arrayContaining([{ player_id: "Q19610875", club_id: "trabzonspor", source: "PAIR_EXPORT_V2" }, { player_id: "Q19610875", club_id: "galatasaray", source: "PAIR_EXPORT_V2" }]));
  });

  it("does not introduce fuzzy typo aliases", () => {
    const value = transformExport({ schema_version: 2, club_pairs: [{ club_a: { slug: "a", name: "A" }, club_b: { slug: "b", name: "B" }, players: [{ name: "Uğurcan Çakır", accepted_answers: ["ugurcan cakir"] }] }] }, "v2");
    expect(value.aliases.some(alias => alias.normalized_alias === "ugurcann cakir")).toBe(false);
  });

  it("imports the production export with Uğurcan Çakır accepted only by exact normalization", () => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), "../football-data-builder/exports/club_pairs.json"), "utf8"));
    const value = transformExport(raw, "integration");
    const pair = value.club_pairs.find(item => new Set([item.club_a_id, item.club_b_id]).has("galatasaray") && new Set([item.club_a_id, item.club_b_id]).has("trabzonspor"));
    expect(pair?.players).toContainEqual({ player_id: "Q19610875" });
    expect(value.aliases).toContainEqual(expect.objectContaining({ player_id: "Q19610875", normalized_alias: "ugurcan cakir", accepted: true }));
    expect(value.aliases).not.toContainEqual(expect.objectContaining({ normalized_alias: "ugurcann cakir" }));
  });

  it("handles a synthetic 5,000-player / 50,000-membership load without production fixtures", () => {
    const players = Array.from({ length: 5_000 }, (_, id) => ({ id, name: `Load Player ${id}`, accepted_answers: [`load player ${id}`] }));
    const club_pairs = Array.from({ length: 5 }, (_, pair) => ({ club_a: { slug: `load-${pair * 2}`, name: `Load ${pair * 2}` }, club_b: { slug: `load-${pair * 2 + 1}`, name: `Load ${pair * 2 + 1}` }, players }));
    const value = transformExport({ schema_version: 2, club_pairs }, "load-test");
    expect(value.players).toHaveLength(5_000);
    expect(value.contracts).toHaveLength(50_000);
    expect(value.club_pairs.reduce((sum, pair) => sum + pair.players.length, 0)).toBe(25_000);
  }, 10_000);
});
