import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSnapshotPayload } from "@gh-radar/shared";

/**
 * Phase 13 Plan 02 Task 3 — home_theme_snapshots 시점별 append (Pattern 4).
 *
 * onConflict "trade_date,captured_at" + ignoreDuplicates:true — 같은 slot 재실행 시
 * PK 충돌은 조용히 무시(idempotent). 배치가 한 slot 을 중복 실행해도 첫 스냅샷을 보존한다
 * (덮어쓰기 아님 — 최초 계산값 유지).
 */
export interface SnapshotRow {
  trade_date: string;
  captured_at: string;
  theme_count: number;
  stock_count: number;
  content_hash: string;
  is_carried: boolean;
  payload: HomeSnapshotPayload;
}

export async function upsertSnapshot(
  supabase: SupabaseClient,
  row: SnapshotRow,
): Promise<void> {
  const { error } = await supabase
    .from("home_theme_snapshots")
    .upsert(row, { onConflict: "trade_date,captured_at", ignoreDuplicates: true });
  if (error) throw error;
}
