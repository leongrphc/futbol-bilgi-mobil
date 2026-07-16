export type AnswerChoice = { id: string; label: string };

export function resolveAnswerPayload(choiceMode: boolean, choices: AnswerChoice[], payload: Record<string, unknown>): string {
  if (!choiceMode) return String(payload.answer ?? "");
  const choiceId = String(payload.choice_id ?? "");
  const choice = choices.find(item => item.id === choiceId);
  if (!choice) throw new Error("INVALID_CHOICE");
  return choice.label;
}
