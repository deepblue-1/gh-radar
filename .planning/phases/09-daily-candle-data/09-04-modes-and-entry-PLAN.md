---
phase: 09-daily-candle-data
plan: 04
type: execute
wave: 1
depends_on:
  - 09-03
files_modified:
  - workers/candle-sync/src/modes/backfill.ts
  - workers/candle-sync/src/modes/daily.ts
  - workers/candle-sync/src/modes/recover.ts
  - workers/candle-sync/src/modes/bootstrapStocks.ts
  - workers/candle-sync/src/modes/businessDay.ts
  - workers/candle-sync/src/index.ts
  - workers/candle-sync/tests/runBackfill.test.ts
  - workers/candle-sync/tests/runDaily.test.ts
  - workers/candle-sync/tests/runRecover.test.ts
  - workers/candle-sync/tests/index.test.ts
  - workers/candle-sync/tests/businessDay.test.ts
autonomous: true
requirements_addressed:
  - DATA-01

must_haves:
  truths:
    - "src/index.ts 의 main() 이 MODE env 를 읽어 runBackfill / runDaily / runRecover 중 하나 dispatch (switch) — RESEARCH §4.1"
    - "Unknown MODE 시 명확한 에러 throw + exit 1"
    - "runDaily 가 basDd=todayKstYYYYMMDD 자동 계산 + KRX 응답 row count < minExpectedRows 면 MIN_EXPECTED 가드 throw (T-09-02) + 빈 응답이면 'KRX data not yet available' warn + exit 0"
    - "runBackfill 이 BACKFILL_FROM ~ BACKFILL_TO 영업일 순회 + per-day try/catch 격리 (1일 실패가 전체 중단 X) + 401 / MIN_EXPECTED throw 만 즉시 중단"
    - "runRecover 가 findMissingDates 호출 → 결측 일자 각각에 대해 fetch+map+upsert (best-effort, per-date 격리) + 0 일자 처리 시 'no missing dates detected' 정상 종료"
    - "bootstrapStocks (T-09-03 옵션 B) — KRX 응답의 unique code 를 stocks 에 is_delisted=true ON CONFLICT DO NOTHING 으로 신규 등록 (master-sync 쓰기 경쟁 회피)"
    - "businessDay.ts 가 ISO date 의 평일/주말 판단 + lookback/iterator 유틸 제공 (휴장 calendar 는 KRX 빈응답 자연 skip — RESEARCH §3.3 옵션 C)"
    - "통합 테스트 4종 (runBackfill / runDaily / runRecover / index dispatch) + businessDay 단위 테스트 GREEN"
  artifacts:
    - path: "workers/candle-sync/src/modes/backfill.ts"
      provides: "runBackfill — BACKFILL_FROM~TO 순회 + per-day 격리"
      contains: "BACKFILL_FROM"
    - path: "workers/candle-sync/src/modes/daily.ts"
      provides: "runDaily — basDd 자동 + MIN_EXPECTED 가드"
      contains: "minExpectedRows"
    - path: "workers/candle-sync/src/modes/recover.ts"
      provides: "runRecover — findMissingDates + per-date 격리"
      contains: "findMissingDates"
    - path: "workers/candle-sync/src/modes/bootstrapStocks.ts"
      provides: "bootstrapStocks — T-09-03 옵션 B"
      contains: "is_delisted"
    - path: "workers/candle-sync/src/index.ts"
      provides: "main() — MODE switch dispatch"
      contains: "switch"
  key_links:
    - from: "workers/candle-sync/src/index.ts"
      to: "workers/candle-sync/src/modes/{backfill,daily,recover}.ts"
      via: "MODE switch dispatch"
      pattern: "switch.*mode"
    - from: "workers/candle-sync/src/modes/*.ts"
      to: "Plan 03 src/krx/fetchBydd.ts + src/pipeline/{map,upsert,missingDates}.ts"
      via: "fetchBydd + krxBdydToOhlcvRow + upsertOhlcv + findMissingDates"
      pattern: "fetchBydd"
    - from: "workers/candle-sync/src/modes/bootstrapStocks.ts"
      to: "stocks 테이블 (Phase 06.1 마스터)"
      via: "insert {is_delisted: true} ON CONFLICT DO NOTHING"
      pattern: "is_delisted"
---

<objective>
candle-sync 의 MODE dispatch 레이어 + 3개 mode 함수 (backfill/daily/recover) + 보조 유틸 (businessDay, bootstrapStocks). 본 plan 이 완성되면 candle-sync 워커가 Plan 03 의 빌딩 블록 위에서 **로컬에서 dev 실행 가능** (production 배포는 Plan 05).

Purpose:
- DATA-01 SC #2 (백필 1회 실행) — runBackfill
- DATA-01 SC #3 (EOD 증분 갱신) — runDaily + runRecover
- DATA-01 SC #4 (rate-limit/재시도/fail-isolation) — per-day try/catch + withRetry
- DATA-01 SC #5 (정합성 모니터링) — runRecover 가 findMissingDates 사용
- RESEARCH §4.1 (단일 entry + per-mode strategy)
- RESEARCH §4.2 (모드별 입력/출력/실패 정책)
- RESEARCH §7 T-09-02 (MIN_EXPECTED 가드)
- RESEARCH §7 T-09-03 옵션 B (bootstrapStocks)

Output:
- 6개 src + 5개 test = 11 파일
- `pnpm -F @gh-radar/candle-sync test --run` 5종 GREEN (총 ~20+ test)
- `pnpm -F @gh-radar/candle-sync typecheck` PASS
- `pnpm -F @gh-radar/candle-sync build` PASS
- `MODE=daily pnpm -F @gh-radar/candle-sync dev` 가 로컬 .env 와 함께 작동 가능 (실제 KRX 호출은 사용자 재량)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/09-daily-candle-data/09-CONTEXT.md
@.planning/phases/09-daily-candle-data/09-RESEARCH.md
@.planning/phases/09-daily-candle-data/09-VALIDATION.md

# Plan 02 산출 (인프라)
@workers/candle-sync/src/config.ts
@workers/candle-sync/src/logger.ts
@workers/candle-sync/src/retry.ts
@workers/candle-sync/src/services/supabase.ts

# Plan 03 산출 (빌딩 블록)
@workers/candle-sync/src/krx/client.ts
@workers/candle-sync/src/krx/fetchBydd.ts
@workers/candle-sync/src/pipeline/map.ts
@workers/candle-sync/src/pipeline/upsert.ts
@workers/candle-sync/src/pipeline/missingDates.ts

# Mirror 대상 — master-sync 패턴
@workers/master-sync/src/index.ts

<interfaces>
<!-- mode 함수 시그니처 — index.ts dispatch 가 호출 -->
```typescript
import type pino from "pino";

export async function runDaily(deps: { log: pino.Logger }): Promise<{ basDd: string; count: number }>;
export async function runBackfill(deps: { log: pino.Logger }): Promise<{ daysProcessed: number; totalRows: number; daysFailed: number }>;
export async function runRecover(deps: { log: pino.Logger }): Promise<{ datesProcessed: number; totalRows: number }>;

// helpers
export function todayBasDdKst(): string;  // YYYYMMDD
export function isoToBasDd(iso: string): string;  // "2026-05-09" → "20260509"
export function basDdToIso(basDd: string): string;
export function* iterateBusinessDays(from: string, to: string): Generator<string>;  // ISO dates, skip Sat/Sun (실제 휴장은 KRX 빈응답으로 처리)

// bootstrapStocks (T-09-03 옵션 B)
export async function bootstrapStocks(
  supabase: SupabaseClient,
  rows: BdydTrdRow[],
): Promise<{ inserted: number }>;
// stocks 에 unique code 를 is_delisted=true ON CONFLICT DO NOTHING 으로 신규 등록
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: businessDay.ts + bootstrapStocks.ts 유틸 + 테스트</name>
  <files>
    workers/candle-sync/src/modes/businessDay.ts,
    workers/candle-sync/src/modes/bootstrapStocks.ts,
    workers/candle-sync/tests/businessDay.test.ts
  </files>

  <read_first>
    - workers/master-sync/src/index.ts:11-20 (todayBasDdKst 패턴 — KST UTC+9 변환)
    - workers/master-sync/src/index.ts:69-100 (delist-sweep — Supabase select+update 패턴)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §3.3 (영업일 calendar — KRX 빈응답 자연 skip)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §7 T-09-03 옵션 B (bootstrapStocks)
    - packages/shared/src/stock.ts (BdydTrdRow 타입)
  </read_first>

  <behavior>
    - Test (businessDay): todayBasDdKst() 가 KST 기준 YYYYMMDD (UTC 12:00 = KST 21:00 → today)
    - Test: isoToBasDd("2026-05-09") = "20260509"
    - Test: basDdToIso("20260509") = "2026-05-09"
    - Test: iterateBusinessDays("2026-05-04", "2026-05-08") = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"] (월~금)
    - Test: iterateBusinessDays("2026-05-08", "2026-05-11") skip 주말 = ["2026-05-08", "2026-05-11"] (금→월)
    - Test: from > to 면 빈 generator
    - Test (bootstrapStocks): 빈 배열 입력 시 supabase 호출 없음, return {inserted: 0}
    - Test: 동일 code 중복 입력 시 dedup 후 단일 row 로 upsert (ON CONFLICT DO NOTHING)
    - Test: insert payload 가 {code, name, market, is_delisted: true, updated_at, security_type: "보통주"} 형태
  </behavior>

  <action>
1. **`workers/candle-sync/src/modes/businessDay.ts`**:
```typescript
/**
 * 영업일 유틸리티.
 *
 * 정책 (RESEARCH §3.3):
 *   - 영업일 = 평일 (월~금). 실제 휴장(공휴일/임시휴장) 은 KRX 빈응답으로 자연 skip — 본 유틸은 calendar X.
 *   - todayBasDdKst: KST UTC+9 변환 후 YYYYMMDD (master-sync 패턴 mirror).
 *   - iterateBusinessDays: from ~ to (inclusive) 중 평일만 yield.
 */

export function todayBasDdKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function isoToBasDd(iso: string): string {
  // "2026-05-09" → "20260509"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid ISO date: "${iso}"`);
  }
  return iso.replace(/-/g, "");
}

export function basDdToIso(basDd: string): string {
  // "20260509" → "2026-05-09"
  if (!/^\d{8}$/.test(basDd)) {
    throw new Error(`Invalid BAS_DD: "${basDd}"`);
  }
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;  // 일=0, 토=6
}

/**
 * from ~ to (ISO YYYY-MM-DD, inclusive) 의 평일을 yield.
 * UTC 기준 — 영업일 판단에 시차 영향 없음 (Sat/Sun 은 어느 timezone 이든 동일).
 */
export function* iterateBusinessDays(
  fromIso: string,
  toIso: string,
): Generator<string> {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error(`Invalid date range: from=${fromIso} to=${toIso}`);
  }

  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    if (!isWeekend(cursor)) {
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cursor.getUTCDate()).padStart(2, "0");
      yield `${y}-${m}-${d}`;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}
```

2. **`workers/candle-sync/src/modes/bootstrapStocks.ts`**:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BdydTrdRow } from "@gh-radar/shared";
import { logger } from "../logger";

/**
 * T-09-03 옵션 B — FK orphan 회피.
 *
 * KRX bydd_trd 응답에는 폐지종목 history 가 포함될 수 있는데, 해당 code 가
 * stocks 마스터에 없으면 stock_daily_ohlcv FK 위반.
 *
 * 본 함수는 응답의 unique code 를 stocks 에 is_delisted=true 로 신규 등록.
 * - ON CONFLICT (code) DO NOTHING → 기존 활성 종목 미변경 (master-sync 쓰기 경쟁 회피)
 * - 신규 등록 행은 is_delisted=true — master-sync 가 다음 실행 시 활성 여부 재평가
 *
 * 호출 시점: fetchBydd 직후 + upsertOhlcv 직전.
 */
export async function bootstrapStocks(
  supabase: SupabaseClient,
  rows: BdydTrdRow[],
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  // dedup by code
  const codeMap = new Map<string, { code: string; name: string; market: "KOSPI" | "KOSDAQ" }>();
  for (const r of rows) {
    if (!r.ISU_SRT_CD) continue;
    if (codeMap.has(r.ISU_SRT_CD)) continue;
    codeMap.set(r.ISU_SRT_CD, {
      code: r.ISU_SRT_CD,
      name: r.ISU_NM ?? r.ISU_SRT_CD,
      market: r.market,
    });
  }

  if (codeMap.size === 0) return { inserted: 0 };

  const now = new Date().toISOString();
  const payload = [...codeMap.values()].map((s) => ({
    code: s.code,
    name: s.name,
    market: s.market,
    security_type: "보통주",     // stocks 테이블 default 와 일치 (Plan 06.1 스키마)
    security_group: "주권",      // stocks 테이블 default
    is_delisted: true,           // 신규 등록은 일단 delisted — master-sync 가 활성 종목 재평가
    updated_at: now,
  }));

  // upsert with ignoreDuplicates=true → INSERT ... ON CONFLICT DO NOTHING
  const { error, count } = await supabase
    .from("stocks")
    .upsert(payload, { onConflict: "code", ignoreDuplicates: true, count: "exact" });

  if (error) {
    logger.error({ err: error, attempted: payload.length }, "bootstrapStocks failed");
    throw error;
  }

  const inserted = count ?? 0;
  logger.info({ attempted: payload.length, inserted }, "bootstrapStocks complete");
  return { inserted };
}
```

3. **`workers/candle-sync/tests/businessDay.test.ts`**:
```typescript
import { describe, it, expect } from "vitest";
import { todayBasDdKst, isoToBasDd, basDdToIso, iterateBusinessDays } from "../src/modes/businessDay";

describe("businessDay utils", () => {
  it("isoToBasDd 정상 변환", () => {
    expect(isoToBasDd("2026-05-09")).toBe("20260509");
    expect(isoToBasDd("2020-01-01")).toBe("20200101");
  });

  it("isoToBasDd 잘못된 형식이면 throw", () => {
    expect(() => isoToBasDd("2026/5/9")).toThrow();
    expect(() => isoToBasDd("2026-5-9")).toThrow();
  });

  it("basDdToIso 정상 변환", () => {
    expect(basDdToIso("20260509")).toBe("2026-05-09");
    expect(basDdToIso("20200101")).toBe("2020-01-01");
  });

  it("basDdToIso 8자 아니면 throw", () => {
    expect(() => basDdToIso("2026509")).toThrow();
  });

  it("todayBasDdKst 가 YYYYMMDD 8자 string 반환", () => {
    const today = todayBasDdKst();
    expect(today).toMatch(/^\d{8}$/);
  });

  it("iterateBusinessDays — 평일 5일 (월~금)", () => {
    // 2026-05-04 (월) ~ 2026-05-08 (금)
    const days = [...iterateBusinessDays("2026-05-04", "2026-05-08")];
    expect(days).toEqual(["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"]);
  });

  it("iterateBusinessDays — 주말 skip (금→월)", () => {
    // 2026-05-08 (금) ~ 2026-05-11 (월) — 토/일 skip
    const days = [...iterateBusinessDays("2026-05-08", "2026-05-11")];
    expect(days).toEqual(["2026-05-08", "2026-05-11"]);
  });

  it("iterateBusinessDays — from > to 빈 generator", () => {
    const days = [...iterateBusinessDays("2026-05-10", "2026-05-09")];
    expect(days).toEqual([]);
  });

  it("iterateBusinessDays — 6년 4개월 평일 ~1,650개 (한국 공휴일 미반영, ~75일 차이로 영업일 ~1,575)", () => {
    const days = [...iterateBusinessDays("2020-01-01", "2026-05-09")];
    // 6년 4개월 ≈ 1,650 평일 (휴장 calendar 없이 평일만 — 공휴일 ~75일 빼면 영업일 ~1,575)
    expect(days.length).toBeGreaterThan(1500);
    expect(days.length).toBeLessThan(1700);
  });
});
```

4. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run businessDay
```
exit 0 + 9 tests passed.

bootstrapStocks 의 단독 unit test 는 Plan 04 Task 4 의 integration test 에 포함 — 별도 파일 생성하지 않음 (mock 복잡도 vs ROI).
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- businessDay && test -f workers/candle-sync/src/modes/bootstrapStocks.ts && grep -q "is_delisted: true" workers/candle-sync/src/modes/bootstrapStocks.ts && grep -q "ignoreDuplicates" workers/candle-sync/src/modes/bootstrapStocks.ts</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/modes/businessDay.ts` 가 `todayBasDdKst`, `isoToBasDd`, `basDdToIso`, `iterateBusinessDays` 4개 export
    - `iterateBusinessDays` 가 generator function (function*) 으로 구현
    - 주말 skip — `grep "day === 0" workers/candle-sync/src/modes/businessDay.ts` 매치 (단일 조건 — `day === 0 || day === 6` 의 첫 부분만 검증, escape 단순화)
    - `workers/candle-sync/src/modes/bootstrapStocks.ts` 가 `bootstrapStocks(supabase, rows)` export
    - `is_delisted: true` payload — `grep "is_delisted: true" workers/candle-sync/src/modes/bootstrapStocks.ts` 매치
    - `ignoreDuplicates: true` — `grep "ignoreDuplicates" workers/candle-sync/src/modes/bootstrapStocks.ts` 매치 (ON CONFLICT DO NOTHING 효과)
    - dedup — `grep "Map<string" workers/candle-sync/src/modes/bootstrapStocks.ts` 매치 (Plan 02 master-sync mirror)
    - `pnpm -F @gh-radar/candle-sync test --run -- businessDay` exit 0
    - 9 test GREEN
  </acceptance_criteria>

  <done>유틸 함수 2개 + businessDay 9 test GREEN. bootstrapStocks 는 Task 2~4 integration test 에서 검증.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: modes/daily.ts (basDd 자동 + MIN_EXPECTED 가드) + 통합 테스트</name>
  <files>
    workers/candle-sync/src/modes/daily.ts,
    workers/candle-sync/tests/runDaily.test.ts
  </files>

  <read_first>
    - workers/candle-sync/src/config.ts (Plan 02 — minExpectedRows default 1400)
    - workers/candle-sync/src/krx/fetchBydd.ts (Plan 03)
    - workers/candle-sync/src/pipeline/map.ts (Plan 03)
    - workers/candle-sync/src/pipeline/upsert.ts (Plan 03)
    - workers/candle-sync/src/modes/businessDay.ts (Task 1)
    - workers/candle-sync/src/modes/bootstrapStocks.ts (Task 1)
    - workers/candle-sync/src/retry.ts (withRetry)
    - workers/master-sync/src/index.ts (mirror 대상 — MIN_EXPECTED 가드 패턴 + log shape)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §4.2 (daily mode 입력/출력/실패 정책), §4.3 (KRX 응답 0 row 분기)
  </read_first>

  <behavior>
    - Test: 정상 응답 (2,800 row) → bootstrap + map + upsert + return {basDd, count:2800}
    - Test: KRX 401 → throw (즉시 exit 1)
    - Test: 빈 응답 (0 row, 평일 EOD 직후) → warn "KRX data not yet available" + return {basDd, count:0} (exit 0)
    - Test: row count < minExpectedRows (1400) → MIN_EXPECTED 가드 throw — 부분 응답 의심
    - Test: bootstrapStocks 가 fetchBydd 결과로 호출됨
    - Test: upsertOhlcv 가 map 결과로 호출됨
  </behavior>

  <action>
1. **`workers/candle-sync/src/modes/daily.ts`**:
```typescript
import type pino from "pino";
import { loadConfig } from "../config";
import { createKrxClient } from "../krx/client";
import { fetchBydd } from "../krx/fetchBydd";
import { krxBdydToOhlcvRow } from "../pipeline/map";
import { upsertOhlcv } from "../pipeline/upsert";
import { createSupabaseClient } from "../services/supabase";
import { withRetry } from "../retry";
import { todayBasDdKst, basDdToIso } from "./businessDay";
import { bootstrapStocks } from "./bootstrapStocks";

/**
 * runDaily — D-08 의 daily mode.
 *
 * RESEARCH §4.2 입력/출력/실패 정책:
 *   - 입력 env: 없음 (basDd = todayKstYYYYMMDD 자동)
 *   - 출력: { basDd, count }
 *   - 실패: 전체 실패 시 throw (Cloud Run Job exit 1 → alert)
 *
 * RESEARCH §4.3 분기:
 *   - OutBlock_1 = [] (평일 EOD 직후 — R1 가설): warn "KRX data not yet available" + 정상 종료
 *   - row count < minExpectedRows: throw (T-09-02 MIN_EXPECTED 가드)
 */
export async function runDaily(deps: { log: pino.Logger }): Promise<{ basDd: string; count: number }> {
  const { log } = deps;
  const config = loadConfig();
  const basDd = config.basDd ?? todayBasDdKst();
  const log2 = log.child({ basDd });

  log2.info("runDaily start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  const krxRows = await withRetry(() => fetchBydd(krx, basDd), "fetchBydd");
  log2.info({ krxRows: krxRows.length }, "KRX fetched");

  // RESEARCH §4.3: 빈 응답 분기
  if (krxRows.length === 0) {
    log2.warn("KRX data not yet available (휴장일 또는 미갱신)");
    return { basDd, count: 0 };
  }

  // RESEARCH §7 T-09-02: MIN_EXPECTED 가드 — 부분 응답 시 throw
  if (krxRows.length < config.minExpectedRows) {
    throw new Error(
      `KRX returned ${krxRows.length} rows (< ${config.minExpectedRows}) — partial response suspected. basDd=${basDd}`,
    );
  }

  // T-09-03 옵션 B: stocks bootstrap 먼저 (FK orphan 회피)
  const boot = await withRetry(() => bootstrapStocks(supabase, krxRows), "bootstrapStocks");
  if (boot.inserted > 0) {
    log2.info({ bootstrapped: boot.inserted }, "stocks bootstrap inserted (delisted/new codes)");
  }

  // map + upsert
  const mapped = krxRows.map(krxBdydToOhlcvRow);
  const { count } = await withRetry(() => upsertOhlcv(supabase, mapped), "upsertOhlcv");

  log2.info({ count, dateIso: basDdToIso(basDd) }, "runDaily complete");
  return { basDd, count };
}
```

2. **`workers/candle-sync/tests/runDaily.test.ts`**:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

// loadConfig stub
vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "http://test",
    supabaseServiceRoleKey: "sk",
    krxAuthKey: "test-key",
    krxBaseUrl: "http://krx",
    logLevel: "silent",
    appVersion: "test",
    mode: "daily" as const,
    minExpectedRows: 1400,
    recoverLookback: 10,
    recoverThreshold: 0.9,
    recoverMaxCalls: 20,
    basDd: "20260509",  // 고정값
  }),
}));

vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: () => ({}),
}));

const mockFetchBydd = vi.fn();
vi.mock("../src/krx/fetchBydd", () => ({ fetchBydd: (...args: any[]) => mockFetchBydd(...args) }));

vi.mock("../src/krx/client", () => ({
  createKrxClient: () => ({}),
}));

const mockUpsert = vi.fn();
vi.mock("../src/pipeline/upsert", () => ({
  upsertOhlcv: (...args: any[]) => mockUpsert(...args),
}));

const mockBootstrap = vi.fn();
vi.mock("../src/modes/bootstrapStocks", () => ({
  bootstrapStocks: (...args: any[]) => mockBootstrap(...args),
}));

import { runDaily } from "../src/modes/daily";

const log = pino({ level: "silent" });

function makeRow(code: string) {
  return {
    BAS_DD: "20260509",
    ISU_SRT_CD: code,
    ISU_NM: code,
    TDD_OPNPRC: "100",
    TDD_HGPRC: "110",
    TDD_LWPRC: "95",
    TDD_CLSPRC: "105",
    ACC_TRDVOL: "1000",
    ACC_TRDVAL: "100000",
    market: "KOSPI" as const,
  };
}

describe("runDaily", () => {
  beforeEach(() => {
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
  });

  it("정상 응답 2,800 row → bootstrap + upsert 호출 + return {basDd, count}", async () => {
    const rows = Array.from({ length: 2800 }, (_, i) => makeRow(`A${i.toString().padStart(5, "0")}`));
    mockFetchBydd.mockResolvedValue(rows);
    mockBootstrap.mockResolvedValue({ inserted: 5 });
    mockUpsert.mockResolvedValue({ count: 2800 });

    const out = await runDaily({ log });
    expect(out.basDd).toBe("20260509");
    expect(out.count).toBe(2800);
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("빈 응답 (0 row) → warn + return count=0 (throw 없음)", async () => {
    mockFetchBydd.mockResolvedValue([]);
    const out = await runDaily({ log });
    expect(out.count).toBe(0);
    expect(mockBootstrap).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("row < minExpectedRows (1400) → MIN_EXPECTED 가드 throw", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => makeRow(`A${i}`));
    mockFetchBydd.mockResolvedValue(rows);
    await expect(runDaily({ log })).rejects.toThrow(/500 rows.*1400.*partial response/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("KRX 401 (fetchBydd throw) → 즉시 throw + retry 후에도 실패", async () => {
    mockFetchBydd.mockRejectedValue(new Error("KRX 401 — AUTH_KEY"));
    await expect(runDaily({ log })).rejects.toThrow(/KRX 401/);
  });
});
```

3. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run runDaily
```
exit 0 + 4 tests passed.
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- runDaily</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/modes/daily.ts` 가 `runDaily(deps): Promise<{basDd, count}>` export
    - `grep "minExpectedRows" workers/candle-sync/src/modes/daily.ts` 매치 (MIN_EXPECTED 가드)
    - `grep "KRX data not yet available" workers/candle-sync/src/modes/daily.ts` 매치 (빈 응답 분기)
    - `grep "bootstrapStocks" workers/candle-sync/src/modes/daily.ts` 매치 (T-09-03 옵션 B)
    - `grep "withRetry" workers/candle-sync/src/modes/daily.ts` 매치 (3회 backoff)
    - `pnpm -F @gh-radar/candle-sync test --run -- runDaily` exit 0
    - 4 test GREEN (정상/빈 응답/MIN_EXPECTED/401)
  </acceptance_criteria>

  <done>runDaily 구현 + 4 integration test GREEN. T-09-01 (401) + T-09-02 (MIN_EXPECTED) mitigation 완료.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: modes/backfill.ts + modes/recover.ts + 통합 테스트</name>
  <files>
    workers/candle-sync/src/modes/backfill.ts,
    workers/candle-sync/src/modes/recover.ts,
    workers/candle-sync/tests/runBackfill.test.ts,
    workers/candle-sync/tests/runRecover.test.ts
  </files>

  <read_first>
    - workers/candle-sync/src/modes/daily.ts (Task 2 — 같은 패턴)
    - workers/candle-sync/src/pipeline/missingDates.ts (Plan 03 — recover 가 호출)
    - workers/candle-sync/src/modes/businessDay.ts (Task 1 — iterateBusinessDays, isoToBasDd)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §4.2 backfill/recover 실패 정책
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §3.4 recover 시나리오
    - workers/candle-sync/src/config.ts (backfillFrom/backfillTo/recover* env)
  </read_first>

  <behavior>
    - Test (backfill): 5 영업일 모두 정상 → 5회 fetch + 5회 upsert + return {daysProcessed:5, totalRows, daysFailed:0}
    - Test (backfill): per-day 격리 — 1일 fetch 실패 (휴장 가능 — 빈 응답 아님) → 계속 진행 + daysFailed:1
    - Test (backfill): BACKFILL_FROM 없으면 throw
    - Test (backfill): KRX 401 → 즉시 중단 (per-day 격리 우회)
    - Test (backfill): MIN_EXPECTED 위반 시 — 평일/주말 calendar 로 판단해서 throw vs warn — 본 구현은 throw (T-09-02 보수적)
    - Test (recover): findMissingDates 가 0 일자 반환 → 'no missing dates detected' log + return {datesProcessed:0, totalRows:0}
    - Test (recover): 3 결측 일자 → 3회 fetch + 3회 upsert + return {datesProcessed:3}
    - Test (recover): per-date 격리 — 1일 실패해도 나머지 continue (best-effort)
  </behavior>

  <action>
1. **`workers/candle-sync/src/modes/backfill.ts`**:
```typescript
import type pino from "pino";
import { loadConfig } from "../config";
import { createKrxClient } from "../krx/client";
import { fetchBydd } from "../krx/fetchBydd";
import { krxBdydToOhlcvRow } from "../pipeline/map";
import { upsertOhlcv } from "../pipeline/upsert";
import { createSupabaseClient } from "../services/supabase";
import { withRetry } from "../retry";
import { iterateBusinessDays, isoToBasDd } from "./businessDay";
import { bootstrapStocks } from "./bootstrapStocks";

/**
 * runBackfill — D-07/D-08 의 backfill mode.
 *
 * RESEARCH §4.2 입력/출력/실패 정책:
 *   - 입력 env: BACKFILL_FROM (YYYY-MM-DD), BACKFILL_TO (YYYY-MM-DD) — 둘 다 필수
 *   - 출력: { daysProcessed, totalRows, daysFailed }
 *   - 실패: per-day 격리 (try/catch 안에서 continue). 단 KRX 401 / MIN_EXPECTED 위반은 즉시 throw.
 *
 * 영업일 calendar: businessDay.iterateBusinessDays 평일만 yield. 실제 휴장(공휴일) 은
 *   KRX 빈응답으로 자연 skip (RESEARCH §3.3 옵션 C).
 */
export async function runBackfill(deps: { log: pino.Logger }): Promise<{ daysProcessed: number; totalRows: number; daysFailed: number }> {
  const { log } = deps;
  const config = loadConfig();

  if (!config.backfillFrom || !config.backfillTo) {
    throw new Error("BACKFILL_FROM and BACKFILL_TO env required for MODE=backfill");
  }

  const log2 = log.child({ from: config.backfillFrom, to: config.backfillTo });
  log2.info("runBackfill start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  let daysProcessed = 0;
  let totalRows = 0;
  let daysFailed = 0;

  for (const iso of iterateBusinessDays(config.backfillFrom, config.backfillTo)) {
    const basDd = isoToBasDd(iso);
    try {
      const krxRows = await withRetry(() => fetchBydd(krx, basDd), `fetchBydd ${basDd}`);

      if (krxRows.length === 0) {
        log2.info({ basDd }, "non-trading day (empty response) — skip");
        daysProcessed += 1;
        continue;
      }

      // MIN_EXPECTED 가드 — 부분 응답 의심 → throw (per-day 격리 우회, 전체 중단)
      if (krxRows.length < config.minExpectedRows) {
        throw new Error(
          `MIN_EXPECTED violation on ${basDd}: ${krxRows.length} rows (< ${config.minExpectedRows}). Backfill aborted.`,
        );
      }

      // T-09-03 옵션 B: stocks bootstrap
      const boot = await withRetry(() => bootstrapStocks(supabase, krxRows), `bootstrap ${basDd}`);
      if (boot.inserted > 0) {
        log2.info({ basDd, bootstrapped: boot.inserted }, "stocks bootstrap inserted");
      }

      const mapped = krxRows.map(krxBdydToOhlcvRow);
      const { count } = await withRetry(() => upsertOhlcv(supabase, mapped), `upsertOhlcv ${basDd}`);
      totalRows += count;
      daysProcessed += 1;
      log2.info({ basDd, count }, "day complete");
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // KRX 401 / MIN_EXPECTED 는 즉시 throw (per-day 격리 우회)
      if (message.includes("KRX 401") || message.includes("MIN_EXPECTED")) {
        throw err;
      }
      // 기타 일시 장애 — per-day 격리: log error + continue
      daysFailed += 1;
      log2.error({ basDd, err: message }, "day failed — continue");
    }
  }

  log2.info({ daysProcessed, totalRows, daysFailed }, "runBackfill complete");
  return { daysProcessed, totalRows, daysFailed };
}
```

2. **`workers/candle-sync/src/modes/recover.ts`**:
```typescript
import type pino from "pino";
import { loadConfig } from "../config";
import { createKrxClient } from "../krx/client";
import { fetchBydd } from "../krx/fetchBydd";
import { krxBdydToOhlcvRow } from "../pipeline/map";
import { upsertOhlcv } from "../pipeline/upsert";
import { findMissingDates } from "../pipeline/missingDates";
import { createSupabaseClient } from "../services/supabase";
import { withRetry } from "../retry";
import { isoToBasDd } from "./businessDay";
import { bootstrapStocks } from "./bootstrapStocks";

/**
 * runRecover — D-09 2차 잡 의 recover mode.
 *
 * RESEARCH §4.2 입력/출력/실패 정책:
 *   - 입력 env: 없음 (RECOVER_LOOKBACK/THRESHOLD/MAX_CALLS 만 — config 에서 로드)
 *   - 출력: { datesProcessed, totalRows }
 *   - 실패: best-effort — 일부 일자 실패해도 나머지 continue. 0 일자도 success.
 *
 * RESEARCH §3.4 시나리오 1~4 모두 idempotent UPSERT 로 안전.
 */
export async function runRecover(deps: { log: pino.Logger }): Promise<{ datesProcessed: number; totalRows: number }> {
  const { log } = deps;
  const config = loadConfig();

  const log2 = log.child({
    lookback: config.recoverLookback,
    threshold: config.recoverThreshold,
    maxCalls: config.recoverMaxCalls,
  });
  log2.info("runRecover start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  const missingDates = await findMissingDates(supabase, {
    lookback: config.recoverLookback,
    threshold: config.recoverThreshold,
    maxCalls: config.recoverMaxCalls,
  });

  if (missingDates.length === 0) {
    log2.info("no missing dates detected");
    return { datesProcessed: 0, totalRows: 0 };
  }

  log2.info({ missingDates }, "missing dates detected — recovery start");

  let datesProcessed = 0;
  let totalRows = 0;

  for (const iso of missingDates) {
    const basDd = isoToBasDd(iso);
    try {
      const krxRows = await withRetry(() => fetchBydd(krx, basDd), `fetchBydd ${basDd}`);
      if (krxRows.length === 0) {
        log2.info({ basDd }, "KRX returned 0 row — skip (non-trading or unrecoverable)");
        continue;
      }

      // T-09-03 옵션 B
      const boot = await withRetry(() => bootstrapStocks(supabase, krxRows), `bootstrap ${basDd}`);
      if (boot.inserted > 0) {
        log2.info({ basDd, bootstrapped: boot.inserted }, "stocks bootstrap inserted");
      }

      const mapped = krxRows.map(krxBdydToOhlcvRow);
      const { count } = await withRetry(() => upsertOhlcv(supabase, mapped), `upsertOhlcv ${basDd}`);
      totalRows += count;
      datesProcessed += 1;
      log2.info({ basDd, count }, "recover date complete");
    } catch (err) {
      // best-effort — log error + continue (per-date 격리)
      log2.error({ basDd, err: (err as Error).message }, "recover date failed — continue");
    }
  }

  log2.info({ datesProcessed, totalRows }, "runRecover complete");
  return { datesProcessed, totalRows };
}
```

3. **`workers/candle-sync/tests/runBackfill.test.ts`**:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "http://test", supabaseServiceRoleKey: "sk",
    krxAuthKey: "k", krxBaseUrl: "http://krx",
    logLevel: "silent", appVersion: "test",
    mode: "backfill" as const,
    backfillFrom: "2026-05-04", backfillTo: "2026-05-08",
    minExpectedRows: 1400,
    recoverLookback: 10, recoverThreshold: 0.9, recoverMaxCalls: 20,
  }),
}));

vi.mock("../src/services/supabase", () => ({ createSupabaseClient: () => ({}) }));
vi.mock("../src/krx/client", () => ({ createKrxClient: () => ({}) }));

const mockFetchBydd = vi.fn();
vi.mock("../src/krx/fetchBydd", () => ({ fetchBydd: (...a: any[]) => mockFetchBydd(...a) }));

const mockUpsert = vi.fn();
vi.mock("../src/pipeline/upsert", () => ({ upsertOhlcv: (...a: any[]) => mockUpsert(...a) }));

const mockBootstrap = vi.fn();
vi.mock("../src/modes/bootstrapStocks", () => ({ bootstrapStocks: (...a: any[]) => mockBootstrap(...a) }));

import { runBackfill } from "../src/modes/backfill";

const log = pino({ level: "silent" });

function fixtureRow(code: string, basDd: string) {
  return {
    BAS_DD: basDd, ISU_SRT_CD: code, ISU_NM: code,
    TDD_OPNPRC: "100", TDD_HGPRC: "110", TDD_LWPRC: "95", TDD_CLSPRC: "105",
    ACC_TRDVOL: "1000", ACC_TRDVAL: "100000",
    market: "KOSPI" as const,
  };
}

describe("runBackfill", () => {
  beforeEach(() => {
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
    mockBootstrap.mockResolvedValue({ inserted: 0 });
    mockUpsert.mockResolvedValue({ count: 2800 });
  });

  it("5 영업일 (월~금) 모두 정상 → daysProcessed=5, daysFailed=0", async () => {
    mockFetchBydd.mockImplementation((_c, basDd: string) =>
      Promise.resolve(Array.from({ length: 2800 }, (_, i) => fixtureRow(`A${i}`, basDd))),
    );

    const out = await runBackfill({ log });
    expect(out.daysProcessed).toBe(5);
    expect(out.daysFailed).toBe(0);
    expect(out.totalRows).toBe(5 * 2800);
    expect(mockFetchBydd).toHaveBeenCalledTimes(5);
  });

  it("빈 응답 (휴장일) → daysProcessed 증가, upsert 안 호출", async () => {
    mockFetchBydd.mockResolvedValue([]);
    const out = await runBackfill({ log });
    expect(out.daysProcessed).toBe(5);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("MIN_EXPECTED 위반 (500 row) → 즉시 throw (per-day 격리 우회)", async () => {
    mockFetchBydd.mockImplementation((_c, basDd: string) =>
      Promise.resolve(Array.from({ length: 500 }, (_, i) => fixtureRow(`A${i}`, basDd))),
    );
    await expect(runBackfill({ log })).rejects.toThrow(/MIN_EXPECTED.*500.*1400/);
  });

  it("KRX 401 → 즉시 throw (per-day 격리 우회)", async () => {
    mockFetchBydd.mockRejectedValue(new Error("KRX 401 — AUTH_KEY"));
    await expect(runBackfill({ log })).rejects.toThrow(/KRX 401/);
  });

  it("일반 에러 (network) → per-day 격리: daysFailed 증가, 나머지 continue", async () => {
    let call = 0;
    mockFetchBydd.mockImplementation((_c, basDd: string) => {
      call += 1;
      if (call === 2) return Promise.reject(new Error("ECONNRESET"));
      return Promise.resolve(Array.from({ length: 2800 }, (_, i) => fixtureRow(`A${i}`, basDd)));
    });

    const out = await runBackfill({ log });
    expect(out.daysFailed).toBe(1);
    expect(out.daysProcessed).toBe(4);  // 5 영업일 - 1 fail
  });
});
```

4. **`workers/candle-sync/tests/runRecover.test.ts`**:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "http://test", supabaseServiceRoleKey: "sk",
    krxAuthKey: "k", krxBaseUrl: "http://krx",
    logLevel: "silent", appVersion: "test",
    mode: "recover" as const,
    minExpectedRows: 1400,
    recoverLookback: 10, recoverThreshold: 0.9, recoverMaxCalls: 20,
  }),
}));

vi.mock("../src/services/supabase", () => ({ createSupabaseClient: () => ({}) }));
vi.mock("../src/krx/client", () => ({ createKrxClient: () => ({}) }));

const mockFetchBydd = vi.fn();
vi.mock("../src/krx/fetchBydd", () => ({ fetchBydd: (...a: any[]) => mockFetchBydd(...a) }));

const mockUpsert = vi.fn();
vi.mock("../src/pipeline/upsert", () => ({ upsertOhlcv: (...a: any[]) => mockUpsert(...a) }));

const mockBootstrap = vi.fn();
vi.mock("../src/modes/bootstrapStocks", () => ({ bootstrapStocks: (...a: any[]) => mockBootstrap(...a) }));

const mockMissing = vi.fn();
vi.mock("../src/pipeline/missingDates", () => ({ findMissingDates: (...a: any[]) => mockMissing(...a) }));

import { runRecover } from "../src/modes/recover";

const log = pino({ level: "silent" });

function row(code: string, basDd: string) {
  return {
    BAS_DD: basDd, ISU_SRT_CD: code, ISU_NM: code,
    TDD_OPNPRC: "100", TDD_HGPRC: "110", TDD_LWPRC: "95", TDD_CLSPRC: "105",
    ACC_TRDVOL: "1000", ACC_TRDVAL: "100000",
    market: "KOSPI" as const,
  };
}

describe("runRecover", () => {
  beforeEach(() => {
    mockFetchBydd.mockReset();
    mockUpsert.mockReset();
    mockBootstrap.mockReset();
    mockMissing.mockReset();
    mockBootstrap.mockResolvedValue({ inserted: 0 });
    mockUpsert.mockResolvedValue({ count: 2800 });
  });

  it("0 결측 일자 → datesProcessed=0, totalRows=0", async () => {
    mockMissing.mockResolvedValue([]);
    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(0);
    expect(out.totalRows).toBe(0);
    expect(mockFetchBydd).not.toHaveBeenCalled();
  });

  it("3 결측 일자 → 3회 fetch + 3회 upsert + datesProcessed=3", async () => {
    mockMissing.mockResolvedValue(["2026-05-09", "2026-05-08", "2026-05-07"]);
    mockFetchBydd.mockImplementation((_c, basDd: string) =>
      Promise.resolve(Array.from({ length: 2800 }, (_, i) => row(`A${i}`, basDd))),
    );

    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(3);
    expect(out.totalRows).toBe(3 * 2800);
    expect(mockFetchBydd).toHaveBeenCalledTimes(3);
  });

  it("per-date 격리 — 1일 실패 시 나머지 continue (best-effort)", async () => {
    mockMissing.mockResolvedValue(["2026-05-09", "2026-05-08", "2026-05-07"]);
    let call = 0;
    mockFetchBydd.mockImplementation((_c, basDd: string) => {
      call += 1;
      if (call === 2) return Promise.reject(new Error("ECONNRESET"));
      return Promise.resolve(Array.from({ length: 2800 }, (_, i) => row(`A${i}`, basDd)));
    });

    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(2);  // 1 fail, 2 success
  });

  it("KRX 빈 응답 (휴장 가능) → skip + datesProcessed 미증가", async () => {
    mockMissing.mockResolvedValue(["2026-05-09"]);
    mockFetchBydd.mockResolvedValue([]);
    const out = await runRecover({ log });
    expect(out.datesProcessed).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
```

5. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run runBackfill
pnpm -F @gh-radar/candle-sync test --run runRecover
```
양쪽 exit 0 + 합쳐서 9 tests.
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- runBackfill && pnpm -F @gh-radar/candle-sync test --run -- runRecover</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/modes/backfill.ts` 가 `runBackfill(deps): Promise<{daysProcessed, totalRows, daysFailed}>` export
    - `grep "BACKFILL_FROM and BACKFILL_TO env required" workers/candle-sync/src/modes/backfill.ts` 매치 (input validation)
    - `grep "iterateBusinessDays" workers/candle-sync/src/modes/backfill.ts` 매치
    - `grep "try {" workers/candle-sync/src/modes/backfill.ts` 매치 (per-day 격리)
    - `grep "KRX 401.*MIN_EXPECTED" workers/candle-sync/src/modes/backfill.ts` 또는 등가 패턴 매치 (per-day 격리 우회 조건)
    - `workers/candle-sync/src/modes/recover.ts` 가 `runRecover(deps): Promise<{datesProcessed, totalRows}>` export
    - `grep "findMissingDates" workers/candle-sync/src/modes/recover.ts` 매치
    - `grep "no missing dates detected" workers/candle-sync/src/modes/recover.ts` 매치
    - 양쪽 모두 `bootstrapStocks` + `withRetry` + `upsertOhlcv` 호출
    - `pnpm -F @gh-radar/candle-sync test --run -- runBackfill` exit 0 (5 test GREEN)
    - `pnpm -F @gh-radar/candle-sync test --run -- runRecover` exit 0 (4 test GREEN)
  </acceptance_criteria>

  <done>backfill + recover 구현 + 9 integration test GREEN. per-day/per-date 격리 동작 + MIN_EXPECTED 가드 + KRX 401 즉시 중단 모두 검증.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: src/index.ts MODE switch dispatch + 통합 테스트</name>
  <files>
    workers/candle-sync/src/index.ts,
    workers/candle-sync/tests/index.test.ts
  </files>

  <read_first>
    - workers/candle-sync/src/config.ts (Plan 02 — Mode 타입 + parseMode throw 패턴)
    - workers/candle-sync/src/modes/daily.ts (Task 2)
    - workers/candle-sync/src/modes/backfill.ts (Task 3)
    - workers/candle-sync/src/modes/recover.ts (Task 3)
    - workers/master-sync/src/index.ts (mirror — main() + CLI 진입점 패턴)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §4.1 (단일 entry switch dispatch)
  </read_first>

  <behavior>
    - Test: MODE=daily → runDaily 호출, runBackfill/runRecover 미호출
    - Test: MODE=backfill → runBackfill 호출
    - Test: MODE=recover → runRecover 호출
    - Test: MODE 미설정 → "daily" default + runDaily 호출 (config.parseMode default)
    - Test: 알 수 없는 MODE → parseMode throw (Plan 02 config.ts 가 처리)
    - Test: main() 이 mode 결과를 log 후 exit 0 (실패 시 exit 1)
  </behavior>

  <action>
1. **`workers/candle-sync/src/index.ts`** — Plan 02 의 placeholder 를 실제 dispatch 로 교체:
```typescript
import "dotenv/config";
import { loadConfig, type Mode } from "./config";
import { logger } from "./logger";
import { runBackfill } from "./modes/backfill";
import { runDaily } from "./modes/daily";
import { runRecover } from "./modes/recover";

/**
 * candle-sync entry — D-08 의 MODE dispatch.
 *
 * RESEARCH §4.1 단일 entry + per-mode strategy:
 *   - MODE=daily   → runDaily   (basDd 자동, MIN_EXPECTED 가드)
 *   - MODE=backfill → runBackfill (BACKFILL_FROM/TO 영업일 순회, per-day 격리)
 *   - MODE=recover → runRecover (findMissingDates + per-date 격리)
 *
 * Unknown MODE 는 loadConfig 의 parseMode 에서 throw (Plan 02 config.ts).
 *
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작 (master-sync 패턴 mirror).
 */
export async function dispatch(): Promise<{ mode: Mode; result: unknown }> {
  const config = loadConfig();
  const log = logger.child({ app: "candle-sync", version: config.appVersion, mode: config.mode });

  switch (config.mode) {
    case "backfill":
      return { mode: "backfill", result: await runBackfill({ log }) };
    case "daily":
      return { mode: "daily", result: await runDaily({ log }) };
    case "recover":
      return { mode: "recover", result: await runRecover({ log }) };
    default: {
      // exhaustive check (TS will error if Mode union extended without handling)
      const _exhaustive: never = config.mode;
      throw new Error(`Unhandled MODE: ${String(_exhaustive)}`);
    }
  }
}

async function main(): Promise<void> {
  try {
    const out = await dispatch();
    logger.info({ ...out }, "candle-sync complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "candle-sync failed");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
```

2. **`workers/candle-sync/tests/index.test.ts`**:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunDaily = vi.fn();
const mockRunBackfill = vi.fn();
const mockRunRecover = vi.fn();

vi.mock("../src/modes/daily", () => ({ runDaily: (...a: any[]) => mockRunDaily(...a) }));
vi.mock("../src/modes/backfill", () => ({ runBackfill: (...a: any[]) => mockRunBackfill(...a) }));
vi.mock("../src/modes/recover", () => ({ runRecover: (...a: any[]) => mockRunRecover(...a) }));

let currentMode: "daily" | "backfill" | "recover" = "daily";

vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "u", supabaseServiceRoleKey: "k",
    krxAuthKey: "k", krxBaseUrl: "u",
    logLevel: "silent", appVersion: "t",
    mode: currentMode,
    minExpectedRows: 1400, recoverLookback: 10,
    recoverThreshold: 0.9, recoverMaxCalls: 20,
  }),
}));

import { dispatch } from "../src/index";

describe("MODE dispatch", () => {
  beforeEach(() => {
    mockRunDaily.mockReset();
    mockRunBackfill.mockReset();
    mockRunRecover.mockReset();
    mockRunDaily.mockResolvedValue({ basDd: "20260509", count: 2800 });
    mockRunBackfill.mockResolvedValue({ daysProcessed: 5, totalRows: 14000, daysFailed: 0 });
    mockRunRecover.mockResolvedValue({ datesProcessed: 2, totalRows: 5600 });
  });

  it("MODE=daily → runDaily 호출", async () => {
    currentMode = "daily";
    const out = await dispatch();
    expect(out.mode).toBe("daily");
    expect(mockRunDaily).toHaveBeenCalledTimes(1);
    expect(mockRunBackfill).not.toHaveBeenCalled();
    expect(mockRunRecover).not.toHaveBeenCalled();
  });

  it("MODE=backfill → runBackfill 호출", async () => {
    currentMode = "backfill";
    const out = await dispatch();
    expect(out.mode).toBe("backfill");
    expect(mockRunBackfill).toHaveBeenCalledTimes(1);
    expect(mockRunDaily).not.toHaveBeenCalled();
  });

  it("MODE=recover → runRecover 호출", async () => {
    currentMode = "recover";
    const out = await dispatch();
    expect(out.mode).toBe("recover");
    expect(mockRunRecover).toHaveBeenCalledTimes(1);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });

  it("dispatch 가 mode 별 결과를 wrap 해서 반환", async () => {
    currentMode = "daily";
    const out = await dispatch();
    expect(out.result).toEqual({ basDd: "20260509", count: 2800 });
  });
});
```

3. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run index
pnpm -F @gh-radar/candle-sync typecheck
pnpm -F @gh-radar/candle-sync build
pnpm -F @gh-radar/candle-sync test --run   # 전체 — businessDay + map + upsert + missingDates + krx-bydd + runDaily + runBackfill + runRecover + index 모두
```
모두 exit 0.
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- index && pnpm -F @gh-radar/candle-sync test --run && pnpm -F @gh-radar/candle-sync typecheck && pnpm -F @gh-radar/candle-sync build</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/index.ts` 가 `dispatch()` export + `main()` private
    - `grep "switch (config.mode)" workers/candle-sync/src/index.ts` 매치
    - 3 case (backfill/daily/recover) 모두 매치
    - `grep "process.argv\\[1\\] && process.argv\\[1\\].endsWith" workers/candle-sync/src/index.ts` 매치 (vitest 안전 CLI 가드)
    - `pnpm -F @gh-radar/candle-sync test --run -- index` exit 0 (4 test GREEN)
    - **전체** `pnpm -F @gh-radar/candle-sync test --run` exit 0 — vitest 출력에 `Tests  51 passed` 또는 그 이상 매치 (krx-bydd 4 + map 8 + upsert 8 + missingDates 5 + businessDay 9 + runDaily 4 + runBackfill 5 + runRecover 4 + index 4 = 51 GREEN). 51 미만이면 누락된 test 식별 후 추가.
    - `pnpm -F @gh-radar/candle-sync typecheck` exit 0
    - `pnpm -F @gh-radar/candle-sync build` exit 0
  </acceptance_criteria>

  <done>MODE dispatch + main() 구현 + 전체 test suite GREEN. Plan 05 배포 직전 candle-sync 워커는 로컬에서 `MODE=daily pnpm -F @gh-radar/candle-sync dev` 로 작동 가능.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| process.env.MODE → dispatch | Unknown MODE 시 잘못된 mode 실행 위험 |
| KRX 응답 → MIN_EXPECTED 가드 | 부분 응답으로 부실 데이터 저장 위험 |
| KRX 폐지종목 history → FK orphan | stocks 마스터 부재 시 UPSERT 실패 |
| 영업일 calendar 추정 → 누락된 일자 | iterateBusinessDays 가 휴장 calendar 미반영 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-02 | TAMPERING (부분 응답) | runDaily / runBackfill MIN_EXPECTED 가드 | mitigate | `if (krxRows.length < config.minExpectedRows) throw` — 활성 stocks × 0.5 ≈ 1,400 미만이면 throw. daily mode 는 즉시 throw, backfill mode 는 per-day 격리 우회 (전체 중단) — 부분 데이터로 stocks 덮어쓰기 방지. **RESEARCH §7 T-09-02 의 backfill mode 권고 (warn+continue) 와 의도적 차이 — backfill 의 부분 응답은 한 영업일이라도 잘못된 데이터로 ~4M row 전체를 오염시킬 위험이 더 크므로 throw 채택. RESEARCH 의 warn+continue 는 daily/recover 모드에 한정 적용.** |
| T-09-03 | TAMPERING (FK orphan) | bootstrapStocks | mitigate | KRX 응답의 unique code 를 stocks 에 is_delisted=true ON CONFLICT DO NOTHING 으로 신규 등록. ignoreDuplicates:true 옵션 사용. master-sync 가 다음 실행 시 활성 여부 재평가 — 쓰기 경쟁 자연 회피. |
| T-09-MODE-01 | DENIAL OF SERVICE (Unknown MODE) | dispatch | mitigate | Plan 02 config.parseMode 가 unknown MODE 시 throw. dispatch 의 exhaustive check (`_exhaustive: never`) 로 TS 컴파일 시점 검증 추가. |
| T-09-MODE-02 | TAMPERING (per-day 격리 우회 실패) | runBackfill catch 블록 | mitigate | catch 블록 안에서 `err.message.includes("KRX 401")` / `MIN_EXPECTED` 검사 — 둘 다 per-day 우회로 전체 중단 (보수적). 일반 network 에러만 per-day 격리. |

</threat_model>

<verification>
- 6개 src + 5개 test = 11 파일 생성됨
- `pnpm -F @gh-radar/candle-sync test --run` 전체 GREEN (~51 test)
- `pnpm -F @gh-radar/candle-sync typecheck` PASS
- `pnpm -F @gh-radar/candle-sync build` PASS — `workers/candle-sync/dist/` 에 컴파일 완료
- 로컬 dev (사용자 재량): `MODE=daily KRX_AUTH_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm -F @gh-radar/candle-sync dev` 작동 가능
- 본 plan 산출물은 Plan 05 의 Docker build/deploy 가 사용
</verification>

<success_criteria>
- MODE dispatch 가 daily/backfill/recover 3 mode 정확 분기
- runDaily 가 MIN_EXPECTED 가드 + 빈 응답 분기 + bootstrapStocks 호출
- runBackfill 이 per-day 격리 + 401/MIN_EXPECTED 즉시 중단
- runRecover 가 findMissingDates + per-date 격리 + 0 일자 정상 종료
- bootstrapStocks 가 FK orphan 회피 (T-09-03 옵션 B)
- 전체 unit + integration test ~51 개 GREEN
</success_criteria>

<output>
After completion, create `.planning/phases/09-daily-candle-data/09-04-SUMMARY.md`
</output>
