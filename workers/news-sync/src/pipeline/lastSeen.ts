import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";

/** 종목별 조회 동시 수 — Supabase 왕복을 겹쳐 실행 시간을 1초 안팎으로 둔다. */
const LAST_SEEN_CONCURRENCY = 8;

/**
 * Phase 07 (R7) — 종목별 MAX(published_at) 사전 로드.
 *
 * 반환: Map<stock_code, iso_string>.
 * 미존재 종목은 Map 에 없음 → collectStockNews 가 null 로 폴백 → 7일 firstCutoff 사용.
 *
 * 2026-11-12: 종목마다 최신 1건(limit 1)을 따로 읽는다. 예전에는 in(codes) 전체를
 * published_at 내림차순 한 번에 읽었는데, PostgREST 최대 행 수(1000)에 잘려 기사가 많은
 * 종목(삼성전자 시간당 100건 이상)이 앞을 채우면 나머지 종목이 Map 에서 빠져 7일치를
 * 다시 넘겼다. 시가총액 상위 대형주를 대상에 넣으면서 이 잘림이 잦아질 수 있어 바꿨다.
 * news_articles(stock_code, published_at DESC) 인덱스로 종목당 1행만 읽는다.
 */
export async function loadLastSeenMap(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (codes.length === 0) return out;

  const limit = pLimit(LAST_SEEN_CONCURRENCY);
  await Promise.all(
    Array.from(new Set(codes)).map((code) =>
      limit(async () => {
        const { data, error } = await supabase
          .from("news_articles")
          .select("published_at")
          .eq("stock_code", code)
          .order("published_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        const row = (data ?? [])[0] as { published_at?: string } | undefined;
        if (row?.published_at) out.set(code, row.published_at);
      }),
    ),
  );
  return out;
}
