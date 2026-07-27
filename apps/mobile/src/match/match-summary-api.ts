import { supabase } from "@/auth/supabase";
import {
  MatchSummaryError,
  parseMatchSummary,
  type MatchSummary,
} from "./match-summary-model";

export { MatchSummaryError } from "./match-summary-model";

type RpcErrorLike = {
  code?: string;
  message?: string;
};

function isNotFound(error: RpcErrorLike): boolean {
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toUpperCase() : "";
  return code === "PGRST116"
    || code === "P0002"
    || message.includes("MATCH_NOT_FOUND")
    || message.includes("MATCH_SUMMARY_NOT_FOUND")
    || message.includes("MATCH_SUMMARY_NOT_AVAILABLE");
}

export async function loadMatchSummary(matchId: string): Promise<MatchSummary> {
  const normalizedMatchId = matchId.trim();
  if (!normalizedMatchId) throw new MatchSummaryError("NOT_FOUND");

  let result: { data: unknown; error: RpcErrorLike | null };
  try {
    result = await supabase.rpc("competition_match_summary", {
      p_match_id: normalizedMatchId,
    });
  } catch {
    throw new MatchSummaryError("UNAVAILABLE");
  }

  if (result.error) {
    throw new MatchSummaryError(isNotFound(result.error) ? "NOT_FOUND" : "UNAVAILABLE");
  }
  if (result.data === null || result.data === undefined) {
    throw new MatchSummaryError("NOT_FOUND");
  }

  try {
    return parseMatchSummary(result.data);
  } catch {
    throw new MatchSummaryError("UNAVAILABLE");
  }
}
