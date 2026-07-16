import { describe, expect, it } from "vitest";
import { resolveAnswerPayload, type AnswerChoice } from "../src/choices";

const choices: AnswerChoice[] = [
  { id: "offered-a", label: "Mesut Özil" },
  { id: "offered-b", label: "Isco" },
  { id: "offered-c", label: "Santi Cazorla" },
  { id: "offered-d", label: "Ángel Di María" },
];

describe("competitive choice payloads", () => {
  it("resolves only a server-issued choice id", () => {
    expect(resolveAnswerPayload(true, choices, { choice_id: "offered-a" })).toBe("Mesut Özil");
  });

  it("rejects arbitrary text and stale ids in choice modes", () => {
    expect(() => resolveAnswerPayload(true, choices, { answer: "Mesut Özil" })).toThrow("INVALID_CHOICE");
    expect(() => resolveAnswerPayload(true, choices, { choice_id: "another-round" })).toThrow("INVALID_CHOICE");
  });

  it("keeps typed answers available for Ranked", () => {
    expect(resolveAnswerPayload(false, [], { answer: "Mesut Özil" })).toBe("Mesut Özil");
  });
});
