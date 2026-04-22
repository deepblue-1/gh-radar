import type { SupabaseClient } from "@supabase/supabase-js";
import type { Label } from "./classifyOne.js";

/**
 * Phase 08.1 — Map<id, Label> → discussions UPDATE.
 *
 * approved plan §2: 성공 분류 row 만 relevance + classified_at=now() 업데이트.
 * 실패 row(Map 에 없음)는 classified_at NULL 유지 → 다음 cycle 재시도.
 *
 * 단건 UPDATE 루프 채택 — bulk CASE WHEN 은 Supabase JS SDK 지원이 미약하고,
 * 배치 크기가 cycle 당 최대 수십~수백 row 이므로 네트워크 비용도 허용 범위.
 * 반환값: 성공 UPDATE 수 (에러 발생 row 는 skip — 다음 cycle 재시도).
 */
export async function persistRelevance(
  supabase: SupabaseClient,
  labels: Map<string, Label>,
): Promise<number> {
  if (labels.size === 0) return 0;
  const now = new Date().toISOString();
  let updated = 0;
  for (const [id, label] of labels) {
    const { error } = await supabase
      .from("discussions")
      .update({ relevance: label, classified_at: now })
      .eq("id", id);
    if (!error) updated++;
  }
  return updated;
}
