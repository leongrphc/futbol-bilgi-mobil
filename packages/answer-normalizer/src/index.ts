const special: Record<string, string> = { "ı": "i", "æ": "ae", "ǽ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ß": "ss" };

export function normalizeAnswer(input: string): string {
  return [...input.trim().toLocaleLowerCase("und")]
    .map((char) => special[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-'’]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const answersEqual = (left: string, right: string): boolean =>
  normalizeAnswer(left) === normalizeAnswer(right);
