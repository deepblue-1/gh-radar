import type { SupabaseClient } from "@supabase/supabase-js";
import type { KiwoomKa10027Row } from "@gh-radar/shared";
import { SHORT_CODE_RE } from "@gh-radar/shared";
import { logger } from "../logger";
import { stripAlSuffix } from "./map";

/**
 * bootstrap 이 붙이는 미분류 sentinel.
 * rebuildTopMovers 의 ELIGIBLE_SECGROUPS 화이트리스트와 ETP 계열('ETF'/'ETN'/'ELW')
 * 어느 쪽에도 속하지 않아야 한다 — 어느 방향으로도 오분류되지 않는 값이어야 한다.
 */
export const UNCLASSIFIED_SECURITY_GROUP = "미확인";

/**
 * intraday-sync 의 FK orphan 회피. RESEARCH §3.4 + candle-sync mirror.
 *
 * ka10027 응답의 활성 종목 ~1,898 + ka10001 hot set ~250 은 stocks 마스터에 존재 가정.
 * 신규 상장 종목이 master-sync 08:10 전에 키움에 등장하면 FK 위반 → 본 함수가 is_delisted=false 로 신규 등록.
 * master-sync 가 다음 실행 시 정확 정보로 갱신.
 *
 * ON CONFLICT (code) DO NOTHING — master-sync 와 쓰기 경쟁 회피.
 */
export async function bootstrapMissingStocks(
  supabase: SupabaseClient,
  rows: KiwoomKa10027Row[],
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  const codeMap = new Map<string, { code: string; name: string }>();
  for (const r of rows) {
    const code = stripAlSuffix(r.stk_cd);
    // 6자 단축코드(숫자+대문자) — 영문 포함 신규 상장 종목도 bootstrap 대상이다.
    if (!SHORT_CODE_RE.test(code)) continue;
    if (codeMap.has(code)) continue;
    codeMap.set(code, { code, name: r.stk_nm ?? code });
  }
  if (codeMap.size === 0) return { inserted: 0 };

  const now = new Date().toISOString();
  const payload = [...codeMap.values()].map((s) => ({
    code: s.code,
    name: s.name,
    market: "KOSPI" as const, // 신규 등록 placeholder — master-sync 가 정확 시장 보강
    security_type: "보통주",
    // 모르는 종목을 '주권' 이라고 우기지 않는다 (2026-09-08 회귀).
    //   ka10027 응답에는 주식뿐 아니라 ETF/ETN/ELW 도 섞여 온다. 여기서 '주권' 을 박으면
    //   rebuildTopMovers 의 eligibleCodes 화이트리스트를 그대로 통과해 ETF 가 스캐너 급등
    //   목록에 올라간다 (영문코드 ETF 297종 → SK하이닉스 단일종목 레버리지 7종 유입 사례).
    //   bootstrap 의 목적은 FK orphan 회피이지 종목 분류가 아니다. 화이트리스트 어디에도
    //   없는 sentinel 을 넣어, master-sync 가 정확한 값으로 덮을 때까지 배제 상태로 둔다.
    //   (security_group 은 NOT NULL DEFAULT '주권' 이라 NULL 을 쓸 수 없다.)
    security_group: UNCLASSIFIED_SECURITY_GROUP,
    is_delisted: false, // intraday-sync 는 활성 종목만 응답 받음 (candle-sync 의 is_delisted=true 와 차이)
    updated_at: now,
  }));

  const { error, count } = await supabase
    .from("stocks")
    .upsert(payload, { onConflict: "code", ignoreDuplicates: true, count: "exact" });

  if (error) {
    logger.error({ err: error, attempted: payload.length }, "bootstrapMissingStocks failed");
    throw error;
  }

  const inserted = count ?? 0;
  logger.info({ attempted: payload.length, inserted }, "bootstrapMissingStocks complete");
  return { inserted };
}
