import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import { createKisClient } from "../kis/client.js";
import { getKisToken } from "../kis/tokenStore.js";
import { logger } from "../logger.js";

export async function createKisRuntime(
  config: AppConfig,
  supabase: SupabaseClient,
): Promise<AxiosInstance> {
  const token = await getKisToken(supabase, config);
  logger.info({ tokenLen: token.length }, "KIS runtime ready");
  return createKisClient(config, token);
}
