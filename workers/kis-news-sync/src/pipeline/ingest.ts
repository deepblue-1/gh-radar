// RED 스텁 — GREEN 커밋에서 kis_news_ingest 호출로 바뀐다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestRow } from "./classify.js";

export type IngestVia = "feed" | "stock";
export interface IngestResult {
  inserted: number;
  revisions: number;
  linked: number;
}

export async function ingestRows(
  _supabase: SupabaseClient,
  _rows: readonly IngestRow[],
  _via: IngestVia,
  _queriedCode?: string,
): Promise<IngestResult> {
  return { inserted: 0, revisions: 0, linked: 0 };
}
