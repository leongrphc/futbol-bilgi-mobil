import { supabase } from "@/auth/supabase";

export type MonetizationStatus = {
  adsRemoved: boolean;
  source: string | null;
  expiresAt: string | null;
};

export const defaultMonetizationStatus: MonetizationStatus = {
  adsRemoved: false,
  source: null,
  expiresAt: null,
};

export async function getMonetizationStatus(): Promise<MonetizationStatus> {
  const { data, error } = await supabase.rpc("monetization_status");
  if (error || !data?.[0]) return defaultMonetizationStatus;
  const row = data[0];
  return {
    adsRemoved: row.ads_removed,
    source: row.source,
    expiresAt: row.expires_at,
  };
}
