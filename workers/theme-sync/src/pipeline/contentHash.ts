import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MergedTheme } from "../merge/mergeThemes";
import { logger } from "../logger";

/**
 * 콘텐츠 SHA256 변경 감지 (D-09, 5원칙 #2 — 동일 콘텐츠면 DB write skip).
 *
 * 직전 cycle 의 해시를 api_usage 에 저장(신규 마이그레이션 불필요)하고, 이번 cycle 의
 * 병합 결과 해시와 동일하면 skipWrite=true → upsert 전부 생략(법적/비용 양면 순손실 회피).
 *
 * 해시 입력은 테마명/종목 집합의 결정적 직렬화 — 순서 무관(정렬 후 직렬화).
 */

const HASH_SERVICE = "theme_content_hash";

/** 병합 결과의 결정적 SHA256 해시 — 순서 무관(테마/종목 정렬 후 직렬화). */
export function computeContentHash(themes: MergedTheme[]): string {
  const canonical = themes
    .map((t) => ({
      k: t.normKey,
      n: t.name,
      s: [...t.sources].sort(),
      c: t.stocks.map((st) => st.code).sort(),
    }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

/**
 * 이번 cycle 해시를 저장 (다음 cycle 비교용). api_usage upsert (service_role).
 *
 * count(bigint)에 hex 전체를 못 담으므로 hex → 52bit 정수 다이제스트로 축약 저장.
 * 충돌 확률 무시 가능(변경 감지용, 보안 아님).
 */
export async function storeHash(
  supabase: SupabaseClient,
  hashHex: string,
  now: Date = new Date(),
): Promise<void> {
  const dateKst = new Date(now.getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const { error } = await supabase.from("api_usage").upsert(
    {
      service: HASH_SERVICE,
      usage_date: dateKst,
      count: hashToInt(hashHex),
      updated_at: now.toISOString(),
    },
    { onConflict: "service,usage_date" },
  );
  if (error) {
    logger.warn({ err: error.message }, "storeHash write failed");
  }
}

/** hex 앞 13자리(52bit)를 정수로 — count(bigint) 저장 + 비교용 안정 다이제스트. */
export function hashToInt(hashHex: string): number {
  return parseInt(hashHex.slice(0, 13), 16);
}

/**
 * 변경 감지: 직전 저장 해시와 이번 해시를 비교. 동일하면 skipWrite=true.
 * api_usage 의 count(축약 정수) 비교 — getPreviousHash 가 hex 를 직접 못 주므로
 * 정수 다이제스트로 대칭 비교.
 */
export async function shouldSkipWrite(
  supabase: SupabaseClient,
  currentHashHex: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("api_usage")
    .select("count")
    .eq("service", HASH_SERVICE)
    .order("usage_date", { ascending: false })
    .limit(1);
  if (error) {
    logger.warn({ err: error.message }, "shouldSkipWrite lookup failed");
    return false;
  }
  const rows = (data ?? []) as Array<{ count?: number | string }>;
  if (rows.length === 0) return false;
  const prevInt = Number(rows[0].count ?? -1);
  return prevInt === hashToInt(currentHashHex);
}
