import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockMaster } from "@gh-radar/shared";
import { logger } from "../logger";

/** `stocks` upsert 의 공통 컬럼 (isin 제외 — 아래 두 갈래가 다르게 취급한다). */
type StockDbRow = {
  code: string;
  name: string;
  market: string;
  sector: string | null;
  kosdaq_segment: string | null;
  security_type: string;
  security_group: string;
  english_name: string | null;
  listing_date: string | null;
  par_value: number | null;
  listing_shares: number | null;
  is_delisted: boolean;
  updated_at: string;
};

function toDbRow(m: StockMaster): StockDbRow {
  return {
    code: m.code,
    name: m.name,
    market: m.market,
    sector: m.sector,
    kosdaq_segment: m.kosdaqSegment,
    security_type: m.securityType,
    security_group: m.securityGroup,
    english_name: m.englishName,
    listing_date: m.listingDate,
    par_value: m.parValue,
    listing_shares: m.listingShares,
    is_delisted: m.isDelisted,
    updated_at: m.updatedAt,
  };
}

export async function upsertMasters(
  supabase: SupabaseClient,
  rows: StockMaster[],
): Promise<{ count: number }> {
  if (rows.length === 0) return { count: 0 };

  // dedup by code (마지막 값 우선).
  //
  // 단, `isin` 만은 예외로 **기존 non-null 값을 보존**한다 (RESEARCH Pitfall 13 / T-15-33).
  //   `index.ts` 가 `[...krxRows, ...etpRows]` 순으로 넘기므로 같은 code 가 주식·ETP 양쪽에
  //   있으면 뒤에 온 ETP 행(항상 isin=null)이 앞의 주식 행을 통째로 덮는다. 다른 필드의
  //   last-wins 는 기존 동작이라 손대지 않고, 게이트웨이 키인 isin 만 살려둔다.
  const deduped = new Map<string, StockMaster>();
  for (const r of rows) {
    const prev = deduped.get(r.code);
    deduped.set(r.code, prev ? { ...r, isin: r.isin ?? prev.isin } : r);
  }
  const merged = [...deduped.values()];

  // isin 유무로 페이로드를 **두 배치로 분리**한다.
  //
  // 조건부 키 포함(행마다 isin 키 유무가 다름)을 한 배열에 섞을 수 없는 이유:
  //   PostgREST 의 bulk insert 는 배열 내 모든 객체의 키 집합이 동일해야 한다
  //   (`missing=default` prefer 헤더 없이는 "All object keys must match" 로 거부).
  //   그래서 배치를 나눈다 — 요청 1회가 2회로 늘어나는 대신 의미가 명확해진다.
  //
  // isin 이 null 인 행에서 키를 **생략**하는 이유:
  //   Supabase upsert 는 명시한 컬럼만 SET 하므로(Phase 09.1 D-22 partial upsert 선례),
  //   키를 생략하면 이미 백필된 isin 이 ETP 행이나 KRX 응답 누락으로 NULL 로 지워지지 않는다.
  //   `isin: null` 을 그대로 넣으면 정반대로 매번 지워진다.
  const withIsin: Array<StockDbRow & { isin: string }> = [];
  const withoutIsin: StockDbRow[] = [];
  for (const m of merged) {
    if (m.isin) withIsin.push({ ...toDbRow(m), isin: m.isin });
    else withoutIsin.push(toDbRow(m));
  }

  for (const batch of [withIsin, withoutIsin]) {
    if (batch.length === 0) continue;
    const { error } = await supabase
      .from("stocks")
      .upsert(batch, { onConflict: "code" });
    if (error) {
      logger.error({ error }, "upsertMasters failed");
      throw error;
    }
  }

  logger.info(
    { total: merged.length, withIsin: withIsin.length, withoutIsin: withoutIsin.length },
    "upsertMasters batches",
  );

  return { count: merged.length };
}
