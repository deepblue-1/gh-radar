import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config";

export function createSupabaseClient(config: Config): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
}
