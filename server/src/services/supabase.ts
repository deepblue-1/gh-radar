import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function createSupabase(u = url!, k = key!): SupabaseClient {
  return createClient(u, k, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
