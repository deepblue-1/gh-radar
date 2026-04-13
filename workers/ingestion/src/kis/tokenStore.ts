import axios from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config";
import { logger } from "../logger";

const TOKEN_BUFFER_MS = 5 * 60 * 1000;

type StoredToken = {
  access_token: string;
  expires_at: string;
};

export async function getKisToken(
  supabase: SupabaseClient,
  config: Config
): Promise<string> {
  const { data: row } = await supabase
    .from("kis_tokens")
    .select("access_token, expires_at")
    .eq("id", "current")
    .maybeSingle();

  if (row) {
    const expiresAt = new Date(row.expires_at).getTime();
    const now = Date.now();
    if (expiresAt - now > TOKEN_BUFFER_MS) {
      logger.info("reusing cached KIS token");
      return row.access_token;
    }
  }

  logger.info("issuing new KIS token");
  const res = await axios.post(`${config.kisBaseUrl}/oauth2/tokenP`, {
    grant_type: "client_credentials",
    appkey: config.kisAppKey,
    appsecret: config.kisAppSecret,
  });

  const { access_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  const { error } = await supabase.from("kis_tokens").upsert({
    id: "current",
    access_token,
    token_type: "Bearer",
    expires_at: expiresAt,
    issued_at: new Date().toISOString(),
  });

  if (error) {
    logger.warn({ error }, "failed to cache KIS token in DB, continuing");
  }

  return access_token;
}
