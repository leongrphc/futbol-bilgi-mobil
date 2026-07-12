import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "../src/index";

describe("PRD answer normalization", () => {
  it.each([
    ["Mesut Özil", "mesut ozil"], ["MESUT OZIL", "mesut ozil"],
    ["Mesut Ozıl", "mesut ozil"], ["Simon Kjær", "simon kjaer"],
    ["Mesutt Ozil", "mesutt ozil"], ["Mesut Ozi", "mesut ozi"],
  ])("normalizes %s", (input, output) => expect(normalizeAnswer(input)).toBe(output));
});
