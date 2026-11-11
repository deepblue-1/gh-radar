/**
 * Phase 41 — 분류된 행을 `kis_news_ingest` RPC 로 들여온다(41-01 계약).
 *
 * - 행 단위 멱등(같은 일련번호 → 연결만) · 같은 KST 날 수정본 1행 · 새 글은 RPC 가 가른다.
 * - 행이 0개여도 부른다 — `p_via='feed'` 는 feed_at 갱신, `p_queried_code` 는 「수집했는데 글 없음」
 *   수집 시각 기록(D-06). 조회 코드 연결은 RPC 가 아니라 행의 `links` 에 들어 있어야 한다(41-01).
 * - 서비스롤 클라이언트로만 부른다(RPC EXECUTE 는 service_role 전용).
 * - 오류 · 결과 모양 위반은 빈 결과로 숨기지 않고 throw — 루프가 기록하고 다음 run 에 다시 받는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestRow } from "./classify.js";

export type IngestVia = "feed" | "stock";

export interface IngestResult {
  inserted: number;
  revisions: number;
  linked: number;
}

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export async function ingestRows(
  supabase: SupabaseClient,
  rows: readonly IngestRow[],
  via: IngestVia,
  queriedCode?: string,
): Promise<IngestResult> {
  const { data, error } = await supabase.rpc("kis_news_ingest", {
    p_rows: rows,
    p_via: via,
    p_queried_code: queriedCode ?? null,
  });
  if (error) {
    const e = error as { message?: string; code?: string };
    throw new Error(`kis_news_ingest 실패: ${e.message ?? String(error)}${e.code ? ` (${e.code})` : ""}`);
  }
  const d = data as Partial<Record<keyof IngestResult, unknown>> | null;
  if (!d || !isCount(d.inserted) || !isCount(d.revisions) || !isCount(d.linked)) {
    throw new Error(`kis_news_ingest 결과 모양이 다르다: ${JSON.stringify(data)}`);
  }
  return { inserted: d.inserted, revisions: d.revisions, linked: d.linked };
}
