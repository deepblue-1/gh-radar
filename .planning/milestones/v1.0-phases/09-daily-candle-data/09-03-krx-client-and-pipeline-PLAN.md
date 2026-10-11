---
phase: 09-daily-candle-data
plan: 03
type: execute
wave: 1
depends_on:
  - 09-01
  - 09-02
files_modified:
  - workers/candle-sync/src/krx/client.ts
  - workers/candle-sync/src/krx/fetchBydd.ts
  - workers/candle-sync/src/pipeline/map.ts
  - workers/candle-sync/src/pipeline/upsert.ts
  - workers/candle-sync/src/pipeline/missingDates.ts
  - workers/candle-sync/tests/krx-bydd.test.ts
  - workers/candle-sync/tests/map.test.ts
  - workers/candle-sync/tests/upsert.test.ts
  - workers/candle-sync/tests/missingDates.test.ts
autonomous: true
requirements_addressed:
  - DATA-01

must_haves:
  truths:
    - "createKrxClient 가 axios baseURL=config.krxBaseUrl + AUTH_KEY 헤더 + 30s timeout 클라이언트 반환 — master-sync mirror"
    - "fetchBydd(client, basDd) 가 KOSPI + KOSDAQ 두 엔드포인트 (`/sto/stk_bydd_trd` + `/sto/ksq_bydd_trd`) 를 Promise.all 로 호출하고 합친 BdydTrdRow[] 반환 — RESEARCH §1.1 URL 정정 반영"
    - "KRX 401 응답 시 즉시 명확한 에러 throw (retry 없음) — RESEARCH §7 T-09-01 master-sync `fetchBaseInfo.ts:35` 패턴 mirror"
    - "krxBdydToOhlcvRow 가 BdydTrdRow → StockDailyOhlcv 매핑 (TDD_OPNPRC→open, TDD_HGPRC→high, TDD_LWPRC→low, TDD_CLSPRC→close, ACC_TRDVOL→volume, ACC_TRDVAL→tradeAmount, CMPPREVDD_PRC→changeAmount, FLUC_RT→changeRate, BAS_DD→date ISO 변환)"
    - "upsertOhlcv 가 supabase.from('stock_daily_ohlcv').upsert(rows, {onConflict:'code,date'}) 호출 + chunked 1000/chunk — RESEARCH §7 T-09-07 mitigation"
    - "findMissingDates 가 SQL 호출 (recover_lookback=10 영업일 / threshold=활성×0.9 / max calls=20) — RESEARCH §3.1 알고리즘"
    - "vitest 4종 (krx-bydd / map / upsert / missingDates) 모두 GREEN — axios mock + Supabase mock + fixture 기반"
    - "fixture 가 없으면 (Plan 06 prerequisite 미실행) RESEARCH §1.2 잠정 필드명으로 작성 — Plan 06 실측 후 재조정 가능"
  artifacts:
    - path: "workers/candle-sync/src/krx/client.ts"
      provides: "createKrxClient — axios + AUTH_KEY 헤더"
      contains: "AUTH_KEY"
    - path: "workers/candle-sync/src/krx/fetchBydd.ts"
      provides: "fetchBydd — KOSPI/KOSDAQ Promise.all + 401 가드"
      contains: "stk_bydd_trd"
    - path: "workers/candle-sync/src/pipeline/map.ts"
      provides: "krxBdydToOhlcvRow — BdydTrdRow → StockDailyOhlcv"
      contains: "TDD_CLSPRC"
    - path: "workers/candle-sync/src/pipeline/upsert.ts"
      provides: "upsertOhlcv — chunked 1000/chunk + onConflict (code,date)"
      contains: "onConflict"
    - path: "workers/candle-sync/src/pipeline/missingDates.ts"
      provides: "findMissingDates — recover mode 결측 일자 SQL"
      contains: "active_stocks"
  key_links:
    - from: "workers/candle-sync/src/krx/fetchBydd.ts"
      to: "RESEARCH §1.1 KRX URL"
      via: "client.get('/sto/stk_bydd_trd', { params: { basDd } })"
      pattern: "stk_bydd_trd"
    - from: "workers/candle-sync/src/pipeline/upsert.ts"
      to: "supabase.from('stock_daily_ohlcv')"
      via: "Plan 01 마이그레이션 테이블"
      pattern: "from\\(['\"]stock_daily_ohlcv['\"]\\)"
    - from: "workers/candle-sync/src/pipeline/map.ts"
      to: "packages/shared StockDailyOhlcv + BdydTrdRow"
      via: "import { type BdydTrdRow, type StockDailyOhlcv }"
      pattern: "StockDailyOhlcv"
---

<objective>
candle-sync 의 핵심 비즈니스 로직 — KRX `bydd_trd` 호출 + KRX 응답 → DB row 매핑 + chunked UPSERT + recover mode 의 결측 일자 SQL. 본 plan 의 5개 src + 4개 test 파일은 Plan 04 의 MODE dispatch (backfill/daily/recover) 가 호출하는 빌딩 블록이다.

Purpose:
- DATA-01 SC #2 (백필 + upsert 안정성) — fetchBydd / map / chunked upsert
- DATA-01 SC #4 (rate-limit/재시도/fail-isolation) — withRetry (Plan 02 재사용) + 401 가드 + chunked
- DATA-01 SC #5 (정합성 모니터링) — findMissingDates SQL

Mirror 대상:
- `workers/master-sync/src/krx/client.ts` → `workers/candle-sync/src/krx/client.ts` (1:1 동일)
- `workers/master-sync/src/krx/fetchBaseInfo.ts` → `workers/candle-sync/src/krx/fetchBydd.ts` (URL 만 다름)
- `workers/master-sync/src/pipeline/map.ts` → `workers/candle-sync/src/pipeline/map.ts` (구조)
- `workers/master-sync/src/pipeline/upsert.ts` → `workers/candle-sync/src/pipeline/upsert.ts` (테이블 + chunking 추가)

Output:
- 5개 src + 4개 test = 9 파일
- `pnpm -F @gh-radar/candle-sync test --run` 4종 GREEN
- Plan 04 가 modes/backfill.ts / modes/daily.ts / modes/recover.ts 에서 본 plan 의 함수 호출
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/09-daily-candle-data/09-CONTEXT.md
@.planning/phases/09-daily-candle-data/09-RESEARCH.md
@.planning/phases/09-daily-candle-data/09-VALIDATION.md

# Plan 01 산출 (마이그레이션 + 타입)
@supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql
@packages/shared/src/stock.ts

# Plan 02 산출 (인프라)
@workers/candle-sync/src/config.ts
@workers/candle-sync/src/logger.ts
@workers/candle-sync/src/retry.ts
@workers/candle-sync/src/services/supabase.ts

# Mirror 대상 — master-sync 패턴
@workers/master-sync/src/krx/client.ts
@workers/master-sync/src/krx/fetchBaseInfo.ts
@workers/master-sync/src/pipeline/map.ts
@workers/master-sync/src/pipeline/upsert.ts
@workers/master-sync/tests/krx-client.test.ts
@workers/master-sync/tests/map.test.ts
@workers/master-sync/tests/upsert.test.ts

<interfaces>
<!-- Plan 03 가 export 하는 핵심 함수 -->
```typescript
// workers/candle-sync/src/krx/client.ts
import type { AxiosInstance } from "axios";
import type { Config } from "../config";
export function createKrxClient(config: Config): AxiosInstance;

// workers/candle-sync/src/krx/fetchBydd.ts
import type { AxiosInstance } from "axios";
import type { BdydTrdRow } from "@gh-radar/shared";
export async function fetchBydd(
  client: AxiosInstance,
  basDd: string,  // YYYYMMDD
): Promise<BdydTrdRow[]>;

// workers/candle-sync/src/pipeline/map.ts
import type { BdydTrdRow, StockDailyOhlcv } from "@gh-radar/shared";
export function krxBdydToOhlcvRow(r: BdydTrdRow): StockDailyOhlcv;

// workers/candle-sync/src/pipeline/upsert.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockDailyOhlcv } from "@gh-radar/shared";
export async function upsertOhlcv(
  supabase: SupabaseClient,
  rows: StockDailyOhlcv[],
): Promise<{ count: number }>;
// chunked 1000/chunk — RESEARCH §7 T-09-07 mitigation

// workers/candle-sync/src/pipeline/missingDates.ts
import type { SupabaseClient } from "@supabase/supabase-js";
export async function findMissingDates(
  supabase: SupabaseClient,
  opts: { lookback: number; threshold: number; maxCalls: number },
): Promise<string[]>;  // ISO date strings, max `maxCalls` length
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: KRX 클라이언트 + fetchBydd 구현 + 단위 테스트</name>
  <files>
    workers/candle-sync/src/krx/client.ts,
    workers/candle-sync/src/krx/fetchBydd.ts,
    workers/candle-sync/tests/krx-bydd.test.ts
  </files>

  <read_first>
    - workers/master-sync/src/krx/client.ts (mirror 대상 — axios + AUTH_KEY)
    - workers/master-sync/src/krx/fetchBaseInfo.ts (mirror 대상 — Promise.all KOSPI/KOSDAQ + 401 가드)
    - workers/master-sync/tests/krx-client.test.ts (mirror 대상 — axios mock 패턴)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §1.1 (URL 정정 — `/sto/stk_bydd_trd`), §1.2 (응답 wrapper `{OutBlock_1: [...]}`)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §7 T-09-01 (401 가드)
    - packages/shared/src/stock.ts (BdydTrdRow 타입 — Plan 01 산출)
  </read_first>

  <behavior>
    - Test: createKrxClient 가 baseURL/AUTH_KEY/timeout 모두 정확히 axios.create 에 전달
    - Test: fetchBydd 가 KOSPI 와 KOSDAQ 두 endpoint 를 Promise.all 로 호출 (호출 순서 무관, 둘 다 호출됨)
    - Test: KOSPI 응답에 market="KOSPI", KOSDAQ 응답에 market="KOSDAQ" 태깅
    - Test: OutBlock_1 = [] 빈 응답이면 빈 배열 반환 (throw 없음)
    - Test: HTTP 401 응답 시 즉시 명확한 에러 throw (retry 없음, 메시지에 AUTH_KEY 언급)
    - Test: HTTP 500 응답 시 axios error propagate (호출자 withRetry 가 처리)
  </behavior>

  <action>
1. **`workers/candle-sync/src/krx/client.ts`** — master-sync `client.ts` 와 1:1 동일:
```typescript
import axios, { type AxiosInstance } from "axios";
import type { Config } from "../config";

export function createKrxClient(config: Config): AxiosInstance {
  return axios.create({
    baseURL: config.krxBaseUrl,
    headers: {
      AUTH_KEY: config.krxAuthKey,
    },
    timeout: 30_000,
  });
}
```

2. **`workers/candle-sync/src/krx/fetchBydd.ts`** — master-sync `fetchBaseInfo.ts` 패턴 mirror, URL 만 다름:
```typescript
import type { AxiosInstance } from "axios";
import type { BdydTrdRow } from "@gh-radar/shared";

// RESEARCH §1.2 — KRX 응답 wrapper
type KrxResponse = {
  OutBlock_1?: Array<Omit<BdydTrdRow, "market">>;
};

/**
 * KRX bydd_trd — 날짜×시장 단위 단일 호출로 전 종목 OHLCV 수신.
 *
 * URL: https://data-dbg.krx.co.kr/svc/apis/sto/{stk|ksq}_bydd_trd?basDd=YYYYMMDD
 * Headers: AUTH_KEY (config.krxAuthKey)
 *
 * RESEARCH §1.1 — production 검증된 URL = data-dbg.krx.co.kr/svc/apis (master-sync 와 동일).
 * RESEARCH §7 T-09-01 — 401 시 retry 없이 즉시 throw (AUTH_KEY 미승인/만료).
 */
export async function fetchBydd(
  client: AxiosInstance,
  basDd: string,  // YYYYMMDD (예: "20260509")
): Promise<BdydTrdRow[]> {
  let kospiRes, kosdaqRes;
  try {
    [kospiRes, kosdaqRes] = await Promise.all([
      client.get<KrxResponse>("/sto/stk_bydd_trd", { params: { basDd } }),
      client.get<KrxResponse>("/sto/ksq_bydd_trd", { params: { basDd } }),
    ]);
  } catch (err: any) {
    // RESEARCH §7 T-09-01: 401 → retry 없이 명확한 에러 — master-sync fetchBaseInfo.ts:35 패턴
    if (err?.response?.status === 401) {
      throw new Error(
        `KRX 401 — AUTH_KEY 미승인 또는 잘못된 값. openapi.krx.co.kr 에서 stk_bydd_trd + ksq_bydd_trd 서비스 신청 상태 확인 필요. basDd=${basDd}`,
      );
    }
    throw err;
  }

  const kospi = (kospiRes.data.OutBlock_1 ?? []).map((r) => ({
    ...r,
    market: "KOSPI" as const,
  }));
  const kosdaq = (kosdaqRes.data.OutBlock_1 ?? []).map((r) => ({
    ...r,
    market: "KOSDAQ" as const,
  }));
  return [...kospi, ...kosdaq];
}
```

3. **`workers/candle-sync/tests/krx-bydd.test.ts`** — master-sync `tests/krx-client.test.ts` 패턴 mirror:
```typescript
import { describe, it, expect, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { fetchBydd } from "../src/krx/fetchBydd";

function mockClient(kospiData: unknown, kosdaqData: unknown, opts?: { status401?: boolean; error500?: boolean }): AxiosInstance {
  return {
    get: vi.fn((url: string) => {
      if (opts?.status401) {
        const err: any = new Error("Unauthorized");
        err.response = { status: 401 };
        return Promise.reject(err);
      }
      if (opts?.error500) {
        const err: any = new Error("Internal Server Error");
        err.response = { status: 500 };
        return Promise.reject(err);
      }
      if (url === "/sto/stk_bydd_trd") return Promise.resolve({ data: kospiData });
      if (url === "/sto/ksq_bydd_trd") return Promise.resolve({ data: kosdaqData });
      return Promise.reject(new Error(`unknown url: ${url}`));
    }),
  } as unknown as AxiosInstance;
}

describe("fetchBydd", () => {
  it("KOSPI + KOSDAQ Promise.all 호출 후 합쳐서 반환 + market 태깅", async () => {
    const client = mockClient(
      { OutBlock_1: [{ BAS_DD: "20260509", ISU_SRT_CD: "005930", TDD_CLSPRC: "70000" }] },
      { OutBlock_1: [{ BAS_DD: "20260509", ISU_SRT_CD: "035720", TDD_CLSPRC: "300000" }] },
    );
    const rows = await fetchBydd(client, "20260509");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.ISU_SRT_CD === "005930")?.market).toBe("KOSPI");
    expect(rows.find((r) => r.ISU_SRT_CD === "035720")?.market).toBe("KOSDAQ");
    expect(client.get).toHaveBeenCalledWith("/sto/stk_bydd_trd", { params: { basDd: "20260509" } });
    expect(client.get).toHaveBeenCalledWith("/sto/ksq_bydd_trd", { params: { basDd: "20260509" } });
  });

  it("OutBlock_1 빈 배열이면 빈 배열 반환 (휴장일 — T-09-02)", async () => {
    const client = mockClient({ OutBlock_1: [] }, { OutBlock_1: [] });
    const rows = await fetchBydd(client, "20260101");
    expect(rows).toEqual([]);
  });

  it("HTTP 401 시 즉시 명확한 에러 throw (T-09-01)", async () => {
    const client = mockClient(null, null, { status401: true });
    await expect(fetchBydd(client, "20260509")).rejects.toThrow(/KRX 401.*AUTH_KEY/);
  });

  it("HTTP 500 시 axios error propagate (호출자 withRetry 가 처리)", async () => {
    const client = mockClient(null, null, { error500: true });
    await expect(fetchBydd(client, "20260509")).rejects.toThrow(/Internal Server Error|500/);
  });
});
```

4. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run krx-bydd
```
exit 0 + 4 tests passed.
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- krx-bydd</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/krx/client.ts` 가 `createKrxClient(config: Config): AxiosInstance` export — `axios.create({baseURL: config.krxBaseUrl, headers: {AUTH_KEY: config.krxAuthKey}, timeout: 30_000})` 패턴
    - `workers/candle-sync/src/krx/fetchBydd.ts` 가 `export async function fetchBydd(client, basDd): Promise<BdydTrdRow[]>` export
    - fetchBydd 가 `/sto/stk_bydd_trd` + `/sto/ksq_bydd_trd` 두 endpoint 를 `Promise.all` 로 호출
    - `grep -q "Promise.all" workers/candle-sync/src/krx/fetchBydd.ts` 매치
    - 401 가드 — `grep "err?.response?.status === 401" workers/candle-sync/src/krx/fetchBydd.ts` 매치 + throw 메시지에 `AUTH_KEY` 단어 포함
    - market 태깅 — `"KOSPI" as const` 와 `"KOSDAQ" as const` 매치
    - `pnpm -F @gh-radar/candle-sync test --run -- krx-bydd` exit 0
    - 4 test all GREEN (KOSPI+KOSDAQ 합침, 빈 응답, 401, 500)
  </acceptance_criteria>

  <done>KRX 클라이언트 + fetchBydd 구현 + 4 unit test GREEN. Plan 04 의 modes 가 호출.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: pipeline/map.ts 매핑 함수 + 단위 테스트</name>
  <files>
    workers/candle-sync/src/pipeline/map.ts,
    workers/candle-sync/tests/map.test.ts
  </files>

  <read_first>
    - workers/master-sync/src/pipeline/map.ts (mirror 대상 — krxToMasterRow 패턴)
    - packages/shared/src/stock.ts (BdydTrdRow + StockDailyOhlcv 타입 — Plan 01)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §1.2 (필드 매핑 테이블)
    - .planning/phases/09-daily-candle-data/09-CONTEXT.md §D-04 (raw close 만 저장)
  </read_first>

  <behavior>
    - Test: BAS_DD "20260509" → date "2026-05-09" (YYYYMMDD → ISO YYYY-MM-DD 변환)
    - Test: TDD_OPNPRC/HGPRC/LWPRC/CLSPRC 문자열을 number 로 정확히 변환
    - Test: ACC_TRDVOL/ACC_TRDVAL 문자열을 number 로 변환 (bigint 범위)
    - Test: CMPPREVDD_PRC 가 없으면 changeAmount=null, 있으면 number
    - Test: FLUC_RT 가 없으면 changeRate=null, 있으면 number (음수 가능)
    - Test: ISU_SRT_CD 가 없으면 throw (필수 필드)
    - Test: BAS_DD 가 8자 아니면 throw
  </behavior>

  <action>
1. **`workers/candle-sync/src/pipeline/map.ts`**:
```typescript
import type { BdydTrdRow, StockDailyOhlcv } from "@gh-radar/shared";

function parseBasDdToIso(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) {
    throw new Error(`Invalid BAS_DD: "${yyyymmdd}" (expected YYYYMMDD)`);
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function parseNumber(raw: string | undefined): number {
  if (raw === undefined || raw === null || raw === "") {
    throw new Error(`Missing required numeric field`);
  }
  // KRX 응답은 ","로 천단위 구분된 문자열이 들어올 수 있음 (실측 후 확인 필요).
  // 보수적으로 ","는 제거하고 파싱.
  const cleaned = String(raw).replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric value: "${raw}"`);
  }
  return n;
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const cleaned = String(raw).replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * KRX bydd_trd row → stock_daily_ohlcv DB row 매핑.
 *
 * RESEARCH §1.2 필드 매핑:
 *   BAS_DD → date (YYYYMMDD → ISO YYYY-MM-DD)
 *   ISU_SRT_CD → code
 *   TDD_OPNPRC → open
 *   TDD_HGPRC → high
 *   TDD_LWPRC → low
 *   TDD_CLSPRC → close (raw, D-04)
 *   ACC_TRDVOL → volume
 *   ACC_TRDVAL → tradeAmount
 *   CMPPREVDD_PRC → changeAmount (nullable)
 *   FLUC_RT → changeRate (nullable, 음수 가능)
 *
 * D-05: MKTCAP / LIST_SHRS 는 저장 X.
 */
export function krxBdydToOhlcvRow(r: BdydTrdRow): StockDailyOhlcv {
  if (!r.ISU_SRT_CD) {
    throw new Error(`KRX bydd_trd row missing ISU_SRT_CD: ${JSON.stringify(r)}`);
  }
  return {
    code: r.ISU_SRT_CD,
    date: parseBasDdToIso(r.BAS_DD),
    open: parseNumber(r.TDD_OPNPRC),
    high: parseNumber(r.TDD_HGPRC),
    low: parseNumber(r.TDD_LWPRC),
    close: parseNumber(r.TDD_CLSPRC),
    volume: parseOptionalNumber(r.ACC_TRDVOL) ?? 0,
    tradeAmount: parseOptionalNumber(r.ACC_TRDVAL) ?? 0,
    changeAmount: parseOptionalNumber(r.CMPPREVDD_PRC),
    changeRate: parseOptionalNumber(r.FLUC_RT),
  };
}
```

2. **`workers/candle-sync/tests/map.test.ts`**:
```typescript
import { describe, it, expect } from "vitest";
import { krxBdydToOhlcvRow } from "../src/pipeline/map";
import type { BdydTrdRow } from "@gh-radar/shared";

const baseRow: BdydTrdRow = {
  BAS_DD: "20260509",
  ISU_SRT_CD: "005930",
  ISU_NM: "삼성전자",
  TDD_OPNPRC: "70000",
  TDD_HGPRC: "70500",
  TDD_LWPRC: "69500",
  TDD_CLSPRC: "70200",
  ACC_TRDVOL: "12345678",
  ACC_TRDVAL: "865432100000",
  CMPPREVDD_PRC: "200",
  FLUC_RT: "0.29",
  market: "KOSPI",
};

describe("krxBdydToOhlcvRow", () => {
  it("정상 row 매핑 — OHLCV/volume/tradeAmount/change*", () => {
    const out = krxBdydToOhlcvRow(baseRow);
    expect(out.code).toBe("005930");
    expect(out.date).toBe("2026-05-09");
    expect(out.open).toBe(70000);
    expect(out.high).toBe(70500);
    expect(out.low).toBe(69500);
    expect(out.close).toBe(70200);
    expect(out.volume).toBe(12345678);
    expect(out.tradeAmount).toBe(865432100000);
    expect(out.changeAmount).toBe(200);
    expect(out.changeRate).toBe(0.29);
  });

  it("CMPPREVDD_PRC 없으면 changeAmount=null", () => {
    const out = krxBdydToOhlcvRow({ ...baseRow, CMPPREVDD_PRC: undefined });
    expect(out.changeAmount).toBeNull();
  });

  it("FLUC_RT 음수 처리 (하락 종목)", () => {
    const out = krxBdydToOhlcvRow({ ...baseRow, FLUC_RT: "-2.5" });
    expect(out.changeRate).toBe(-2.5);
  });

  it("FLUC_RT 빈 문자열이면 changeRate=null", () => {
    const out = krxBdydToOhlcvRow({ ...baseRow, FLUC_RT: "" });
    expect(out.changeRate).toBeNull();
  });

  it("KRX ',' 천단위 구분 문자열 파싱 (보수적)", () => {
    const out = krxBdydToOhlcvRow({ ...baseRow, ACC_TRDVOL: "12,345,678", ACC_TRDVAL: "865,432,100,000" });
    expect(out.volume).toBe(12345678);
    expect(out.tradeAmount).toBe(865432100000);
  });

  it("ISU_SRT_CD 없으면 throw", () => {
    expect(() => krxBdydToOhlcvRow({ ...baseRow, ISU_SRT_CD: "" } as any)).toThrow(/ISU_SRT_CD/);
  });

  it("BAS_DD 가 8자 아니면 throw", () => {
    expect(() => krxBdydToOhlcvRow({ ...baseRow, BAS_DD: "2026509" })).toThrow(/BAS_DD/);
  });

  it("TDD_CLSPRC 없으면 throw (필수 필드)", () => {
    expect(() => krxBdydToOhlcvRow({ ...baseRow, TDD_CLSPRC: undefined } as any)).toThrow();
  });
});
```

3. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run map
```
exit 0 + 8 tests passed.
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- map</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/pipeline/map.ts` 가 `krxBdydToOhlcvRow` export
    - 필드 매핑 — `grep "TDD_OPNPRC" workers/candle-sync/src/pipeline/map.ts` 매치 (open, high, low, close 모두)
    - `grep "ACC_TRDVOL" workers/candle-sync/src/pipeline/map.ts` 매치
    - `grep "ACC_TRDVAL" workers/candle-sync/src/pipeline/map.ts` 매치
    - BAS_DD → ISO 변환 — `grep "parseBasDdToIso\\|YYYY-MM-DD" workers/candle-sync/src/pipeline/map.ts` 매치
    - `pnpm -F @gh-radar/candle-sync test --run -- map` exit 0
    - 8 test GREEN (정상/CMPPREVDD null/FLUC_RT 음수/빈 문자열/천단위 콤마/ISU 누락/BAS_DD 8자 아님/TDD_CLSPRC 누락)
  </acceptance_criteria>

  <done>매핑 함수 구현 + 8 unit test GREEN. Plan 04 의 modes 가 호출.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: pipeline/upsert.ts chunked UPSERT + 단위 테스트</name>
  <files>
    workers/candle-sync/src/pipeline/upsert.ts,
    workers/candle-sync/tests/upsert.test.ts
  </files>

  <read_first>
    - workers/master-sync/src/pipeline/upsert.ts (mirror 대상 — onConflict 패턴)
    - workers/master-sync/tests/upsert.test.ts (mirror 대상 — Supabase mock 패턴)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §7 T-09-07 (chunked 1000/chunk + onConflict (code,date))
    - packages/shared/src/stock.ts (StockDailyOhlcv 타입)
  </read_first>

  <behavior>
    - Test: 빈 배열 입력 시 supabase 호출 없음, return {count: 0}
    - Test: 500 row 입력 시 단일 chunk 호출 (1000 미만)
    - Test: 1500 row 입력 시 2 chunk 호출 (1000 + 500)
    - Test: 3500 row 입력 시 4 chunk 호출 (1000 + 1000 + 1000 + 500)
    - Test: onConflict 가 "code,date" 인지 검증
    - Test: 첫 chunk 에러 시 즉시 throw (나머지 chunk 호출 안 됨)
    - Test: 반환 count 가 입력 row 수
    - Test: DB row 형태 변환 — camelCase (tradeAmount) → snake_case (trade_amount) + changeAmount → change_amount + changeRate → change_rate
  </behavior>

  <action>
1. **`workers/candle-sync/src/pipeline/upsert.ts`**:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockDailyOhlcv } from "@gh-radar/shared";
import { logger } from "../logger";

const CHUNK_SIZE = 1000;  // RESEARCH §7 T-09-07: PostgREST batch limit 대응

function toDbRow(r: StockDailyOhlcv): Record<string, unknown> {
  return {
    code: r.code,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    trade_amount: r.tradeAmount,
    change_amount: r.changeAmount,
    change_rate: r.changeRate,
  };
}

/**
 * chunked UPSERT for stock_daily_ohlcv.
 *
 * RESEARCH §7 T-09-07 mitigation — PostgREST batch limit 회피.
 *   - 1000 row/chunk
 *   - onConflict (code, date) DO UPDATE — idempotent (Plan 01 마이그레이션 PK)
 *
 * D-08: backfill / daily / recover 모두 동일 함수 호출 — idempotent UPSERT 이므로 mode 별 분기 불필요.
 */
export async function upsertOhlcv(
  supabase: SupabaseClient,
  rows: StockDailyOhlcv[],
): Promise<{ count: number }> {
  if (rows.length === 0) return { count: 0 };

  let totalCount = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const dbRows = chunk.map(toDbRow);
    const { error } = await supabase
      .from("stock_daily_ohlcv")
      .upsert(dbRows, { onConflict: "code,date" });

    if (error) {
      logger.error({ error, chunkStart: i, chunkSize: chunk.length }, "upsertOhlcv chunk failed");
      throw error;
    }
    totalCount += chunk.length;
  }

  return { count: totalCount };
}
```

2. **`workers/candle-sync/tests/upsert.test.ts`**:
```typescript
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertOhlcv } from "../src/pipeline/upsert";
import type { StockDailyOhlcv } from "@gh-radar/shared";

function row(code: string, date: string = "2026-05-09"): StockDailyOhlcv {
  return {
    code, date,
    open: 100, high: 110, low: 95, close: 105,
    volume: 1000, tradeAmount: 100000,
    changeAmount: 5, changeRate: 5.0,
  };
}

function mockSupabase(opts?: { firstChunkError?: boolean }) {
  let chunkIdx = 0;
  const upsert = vi.fn((dbRows: any[], options: any) => {
    chunkIdx += 1;
    if (opts?.firstChunkError && chunkIdx === 1) {
      return Promise.resolve({ error: new Error("chunk 1 fail") });
    }
    return Promise.resolve({ error: null });
  });
  const from = vi.fn((table: string) => ({
    upsert,
  }));
  return { client: { from } as unknown as SupabaseClient, from, upsert };
}

describe("upsertOhlcv chunked UPSERT", () => {
  it("빈 배열 입력 시 supabase 호출 없음, count=0", async () => {
    const m = mockSupabase();
    const out = await upsertOhlcv(m.client, []);
    expect(out.count).toBe(0);
    expect(m.from).not.toHaveBeenCalled();
  });

  it("500 row → 1 chunk", async () => {
    const m = mockSupabase();
    const rows = Array.from({ length: 500 }, (_, i) => row(`A${i.toString().padStart(5, "0")}`));
    const out = await upsertOhlcv(m.client, rows);
    expect(out.count).toBe(500);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("1500 row → 2 chunk (1000 + 500)", async () => {
    const m = mockSupabase();
    const rows = Array.from({ length: 1500 }, (_, i) => row(`A${i.toString().padStart(5, "0")}`));
    const out = await upsertOhlcv(m.client, rows);
    expect(out.count).toBe(1500);
    expect(m.upsert).toHaveBeenCalledTimes(2);
    // 1st chunk = 1000 rows, 2nd = 500
    expect((m.upsert.mock.calls[0][0] as any[]).length).toBe(1000);
    expect((m.upsert.mock.calls[1][0] as any[]).length).toBe(500);
  });

  it("3500 row → 4 chunk (1000+1000+1000+500)", async () => {
    const m = mockSupabase();
    const rows = Array.from({ length: 3500 }, (_, i) => row(`A${i.toString().padStart(5, "0")}`));
    const out = await upsertOhlcv(m.client, rows);
    expect(out.count).toBe(3500);
    expect(m.upsert).toHaveBeenCalledTimes(4);
  });

  it("onConflict = 'code,date'", async () => {
    const m = mockSupabase();
    await upsertOhlcv(m.client, [row("005930")]);
    expect(m.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: "code,date" });
  });

  it("camelCase → snake_case 변환 (tradeAmount → trade_amount)", async () => {
    const m = mockSupabase();
    await upsertOhlcv(m.client, [row("005930")]);
    const dbRow = (m.upsert.mock.calls[0][0] as any[])[0];
    expect(dbRow.trade_amount).toBe(100000);
    expect(dbRow.change_amount).toBe(5);
    expect(dbRow.change_rate).toBe(5.0);
    expect(dbRow).not.toHaveProperty("tradeAmount");
    expect(dbRow).not.toHaveProperty("changeAmount");
  });

  it("첫 chunk 에러 시 즉시 throw — 나머지 chunk 호출 안 됨", async () => {
    const m = mockSupabase({ firstChunkError: true });
    const rows = Array.from({ length: 2500 }, (_, i) => row(`A${i.toString().padStart(5, "0")}`));
    await expect(upsertOhlcv(m.client, rows)).rejects.toThrow(/chunk 1 fail/);
    // 첫 chunk 에서 throw — 2번째/3번째 chunk 미호출
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it("from('stock_daily_ohlcv') 테이블 이름 정확", async () => {
    const m = mockSupabase();
    await upsertOhlcv(m.client, [row("005930")]);
    expect(m.from).toHaveBeenCalledWith("stock_daily_ohlcv");
  });
});
```

3. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run upsert
```
exit 0 + 8 tests passed.
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- upsert</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/pipeline/upsert.ts` 가 `upsertOhlcv(supabase, rows): Promise<{count: number}>` export
    - chunked logic — `grep -E "CHUNK_SIZE = 1000|slice\\(i, i \\+ 1000\\)" workers/candle-sync/src/pipeline/upsert.ts` 매치 (1000/chunk)
    - `grep -q "from(\"stock_daily_ohlcv\")" workers/candle-sync/src/pipeline/upsert.ts` 매치
    - `grep -q "onConflict: \"code,date\"" workers/candle-sync/src/pipeline/upsert.ts` 매치
    - DB row 변환 (snake_case): `grep -E "trade_amount|change_amount|change_rate" workers/candle-sync/src/pipeline/upsert.ts` 매치 (3개 모두)
    - `pnpm -F @gh-radar/candle-sync test --run -- upsert` exit 0
    - 8 test GREEN (빈 배열, 500/1500/3500 chunking, onConflict, snake_case 변환, 첫 chunk 에러, 테이블 이름)
  </acceptance_criteria>

  <done>chunked UPSERT 구현 + 8 unit test GREEN. RESEARCH §7 T-09-07 mitigation 완료.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: pipeline/missingDates.ts 결측 일자 SQL + 단위 테스트</name>
  <files>
    workers/candle-sync/src/pipeline/missingDates.ts,
    workers/candle-sync/tests/missingDates.test.ts
  </files>

  <read_first>
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §3.1 (결측 감지 SQL), §3.2 (파라미터 권장값 — lookback=10, threshold=0.9, maxCalls=20)
    - workers/candle-sync/src/config.ts (Plan 02 — recoverLookback/Threshold/MaxCalls 정의)
    - workers/master-sync/src/index.ts:69-79 (Supabase RPC/raw query 패턴 참고)
  </read_first>

  <behavior>
    - Test: lookback=10, threshold=0.9, maxCalls=20 입력 + 정상 응답 시 결측 일자 string[] 반환
    - Test: 모든 일자가 정상이면 빈 배열 반환
    - Test: 결측 일자 수 > maxCalls 면 maxCalls 만큼만 반환 (slice)
    - Test: Supabase RPC 또는 raw SQL 호출 시 정확한 파라미터 전달
    - Test: SQL 에러 시 throw
  </behavior>

  <action>
1. **`workers/candle-sync/src/pipeline/missingDates.ts`**:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logger";

/**
 * recover mode 의 결측 일자 감지.
 *
 * RESEARCH §3.1 SQL — 최근 N 영업일 중 row count < (활성 stocks × threshold) 인 일자.
 *
 * SQL strategy: Supabase JS client 의 .rpc 또는 raw select 로 N+1 쿼리 수행.
 *   1. active count = `SELECT COUNT(*) FROM stocks WHERE is_delisted = false`
 *   2. recent dates = `SELECT DISTINCT date FROM stock_daily_ohlcv WHERE date >= CURRENT_DATE - INTERVAL '20 days' ORDER BY date DESC LIMIT lookback`
 *   3. daily counts = `SELECT date, COUNT(*) FROM stock_daily_ohlcv WHERE date IN (...) GROUP BY date`
 *   4. filter: count < (active × threshold) → 결측 일자
 *
 * 본 구현은 raw select + 클라이언트측 비교 (Supabase JS 가 raw SQL 제한적이라 N+1 패턴).
 *
 * @param opts.lookback   영업일 수 (기본 10, RESEARCH §3.2)
 * @param opts.threshold  활성 비율 임계 (기본 0.9, RESEARCH §3.2)
 * @param opts.maxCalls   상한 (기본 20, RESEARCH §3.2 — calls 폭증 방지)
 * @returns 결측 일자 ISO string[] — descending, max `maxCalls` length
 */
export async function findMissingDates(
  supabase: SupabaseClient,
  opts: { lookback: number; threshold: number; maxCalls: number },
): Promise<string[]> {
  // Step 1: 활성 stocks 수
  const { count: activeCountRaw, error: activeErr } = await supabase
    .from("stocks")
    .select("code", { count: "exact", head: true })
    .eq("is_delisted", false);
  if (activeErr) {
    logger.error({ err: activeErr }, "findMissingDates: active count failed");
    throw activeErr;
  }
  const activeCount = activeCountRaw ?? 0;
  if (activeCount === 0) {
    logger.warn("findMissingDates: active stocks count = 0 (백필 미실행?). 결측 검사 skip.");
    return [];
  }
  const threshold = Math.floor(activeCount * opts.threshold);

  // Step 2: 최근 lookback 영업일 (DB 의 distinct date 기반 추론 — RESEARCH §3.3 옵션 A)
  // 20일 lookback 으로 시작 후 distinct date 가져옴 (휴장일 자연 skip)
  const today = new Date();
  const twentyDaysAgo = new Date(today);
  twentyDaysAgo.setDate(today.getDate() - 20);
  const sinceIso = twentyDaysAgo.toISOString().slice(0, 10);

  const { data: recentRows, error: recentErr } = await supabase
    .from("stock_daily_ohlcv")
    .select("date")
    .gte("date", sinceIso)
    .order("date", { ascending: false });
  if (recentErr) {
    logger.error({ err: recentErr }, "findMissingDates: recent dates fetch failed");
    throw recentErr;
  }

  // distinct date → 최근 lookback 개
  const seen = new Set<string>();
  const recentDates: string[] = [];
  for (const r of recentRows ?? []) {
    const d = (r as { date: string }).date;
    if (!seen.has(d)) {
      seen.add(d);
      recentDates.push(d);
      if (recentDates.length >= opts.lookback) break;
    }
  }

  if (recentDates.length === 0) {
    logger.warn("findMissingDates: 최근 영업일 없음 (DB 비어있음). 결측 검사 skip.");
    return [];
  }

  // Step 3: 각 일자별 row count (Postgres GROUP BY 가 PostgREST 에서 비효율 → 별도 select)
  // 효율 위해 단일 query 로 count 가져옴 — Supabase 의 head:true count exact
  const missing: string[] = [];
  for (const date of recentDates) {
    const { count, error } = await supabase
      .from("stock_daily_ohlcv")
      .select("code", { count: "exact", head: true })
      .eq("date", date);
    if (error) {
      logger.error({ err: error, date }, "findMissingDates: per-date count failed");
      throw error;
    }
    const rowCount = count ?? 0;
    // row_count = 0 인 일자는 휴장 가능 — skip (RESEARCH §3.2 휴장일 처리)
    if (rowCount === 0) continue;
    if (rowCount < threshold) {
      missing.push(date);
    }
  }

  // Step 4: maxCalls 상한 적용
  const limited = missing.slice(0, opts.maxCalls);
  logger.info(
    { activeCount, threshold, recentDates: recentDates.length, missingFound: missing.length, returned: limited.length },
    "findMissingDates complete",
  );
  return limited;
}
```

2. **`workers/candle-sync/tests/missingDates.test.ts`**:
```typescript
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findMissingDates } from "../src/pipeline/missingDates";

/**
 * Supabase mock (옵션 A — RPC 미사용, mock 단순화):
 *   3종 query 패턴을 각 호출별 fresh builder 로 mock — vitest `mockResolvedValue` 직접 활용.
 *
 *   A. .from('stocks').select(_, {count: exact, head: true}).eq('is_delisted', false) → activeCount
 *   B. .from('stock_daily_ohlcv').select('date').gte('date', ...).eq?(...).order('date', desc) → recent dates
 *   C. .from('stock_daily_ohlcv').select(_, {count: exact, head: true}).eq('date', X) → per-date count
 *
 * thenable 직접 구현 대신 builder 의 final method (`order` 또는 `eq` for head=true) 가
 * `mockResolvedValue` 로 result 반환 — Supabase JS v2 builder 의 PromiseLike 인터페이스를
 * 직접 흉내내지 않음 (호출자 await 가 PromiseLike 든 Promise 든 모두 동작).
 */
function mockSupabase(opts: {
  activeCount: number;
  recentDates: string[];           // distinct dates returned by query B (DESC)
  perDateCounts: Record<string, number>;  // date → count
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === "stocks") {
      // Query A: select(_, {count: exact, head: true}).eq('is_delisted', false) → resolves
      const eqMock = vi.fn().mockResolvedValue({ count: opts.activeCount, data: null, error: null });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      return { select: selectMock };
    }

    if (table === "stock_daily_ohlcv") {
      // Query B: select('date').gte('date', ...).order('date', {ascending: false}) → resolves data:[{date},...]
      const recentDateRows = opts.recentDates.map((d) => ({ date: d }));

      // Query C: select(_, {count: exact, head: true}).eq('date', X) → resolves count
      // — eq() 의 인자 col 이 'date' 면 perDateCounts 에서 lookup, 'is_delisted' 면 N/A
      const orderMock = vi.fn().mockResolvedValue({ count: null, data: recentDateRows, error: null });
      const gteMock = vi.fn().mockReturnValue({ order: orderMock });
      const eqDateMock = vi.fn((col: string, val: any) => {
        // Query C: head:true + eq('date', X) → resolves count
        return Promise.resolve({ count: opts.perDateCounts[val] ?? 0, data: null, error: null });
      });
      const selectMock = vi.fn((cols: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head) {
          // Query C path: select(_, {count: exact, head: true}).eq('date', X)
          return { eq: eqDateMock };
        }
        // Query B path: select('date').gte('date', ...).order(...)
        return { gte: gteMock };
      });
      return { select: selectMock };
    }

    throw new Error(`Unexpected table in mock: ${table}`);
  });

  return { client: { from: fromMock } as unknown as SupabaseClient, from: fromMock };
}

describe("findMissingDates", () => {
  it("활성=2800, threshold=0.9 → 결측 임계 = 2520. 5일 중 2일 결측 발견", async () => {
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: ["2026-05-09", "2026-05-08", "2026-05-07", "2026-05-06", "2026-05-05"],
      perDateCounts: {
        "2026-05-09": 2800,   // OK
        "2026-05-08": 2400,   // < 2520 missing
        "2026-05-07": 2800,   // OK
        "2026-05-06": 1500,   // < 2520 missing
        "2026-05-05": 2800,   // OK
      },
    });
    const out = await findMissingDates(m.client, { lookback: 10, threshold: 0.9, maxCalls: 20 });
    expect(out).toEqual(["2026-05-08", "2026-05-06"]);
  });

  it("모든 일자가 정상이면 빈 배열", async () => {
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: ["2026-05-09", "2026-05-08"],
      perDateCounts: { "2026-05-09": 2800, "2026-05-08": 2800 },
    });
    const out = await findMissingDates(m.client, { lookback: 10, threshold: 0.9, maxCalls: 20 });
    expect(out).toEqual([]);
  });

  it("maxCalls 상한 적용 — 결측 30개 중 maxCalls=20 만 반환", async () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-04-${(30 - i).toString().padStart(2, "0")}`);
    const counts: Record<string, number> = {};
    dates.forEach((d) => { counts[d] = 100; });  // 전부 결측
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: dates,
      perDateCounts: counts,
    });
    const out = await findMissingDates(m.client, { lookback: 30, threshold: 0.9, maxCalls: 20 });
    expect(out.length).toBe(20);
  });

  it("row_count = 0 인 일자는 휴장 — skip (결측 아님)", async () => {
    const m = mockSupabase({
      activeCount: 2800,
      recentDates: ["2026-05-09", "2026-05-08"],
      perDateCounts: {
        "2026-05-09": 0,      // 휴장 — skip
        "2026-05-08": 2800,   // OK
      },
    });
    const out = await findMissingDates(m.client, { lookback: 10, threshold: 0.9, maxCalls: 20 });
    expect(out).toEqual([]);
  });

  it("activeCount = 0 (DB 비어있음) → 빈 배열 + skip 경고", async () => {
    const m = mockSupabase({ activeCount: 0, recentDates: [], perDateCounts: {} });
    const out = await findMissingDates(m.client, { lookback: 10, threshold: 0.9, maxCalls: 20 });
    expect(out).toEqual([]);
  });
});
```

3. 검증:
```bash
pnpm -F @gh-radar/candle-sync test --run missingDates
```
exit 0 + 5 tests passed.
  </action>

  <verify>
    <automated>pnpm -F @gh-radar/candle-sync test --run -- missingDates</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/pipeline/missingDates.ts` 가 `findMissingDates(supabase, opts): Promise<string[]>` export
    - opts 타입에 `lookback`, `threshold`, `maxCalls` 모두 포함 (Plan 04 config 가 전달)
    - active count query — `grep "is_delisted" workers/candle-sync/src/pipeline/missingDates.ts` 매치
    - threshold 계산 — `grep "activeCount.*threshold\\|Math.floor" workers/candle-sync/src/pipeline/missingDates.ts` 매치
    - maxCalls 상한 — `grep "opts.maxCalls\\|slice(0, opts.maxCalls)" workers/candle-sync/src/pipeline/missingDates.ts` 매치
    - 휴장일 skip — `grep "rowCount === 0\\|row_count == 0\\|continue" workers/candle-sync/src/pipeline/missingDates.ts` 매치
    - `pnpm -F @gh-radar/candle-sync test --run -- missingDates` exit 0
    - 5 test GREEN (정상 결측 발견, 모두 정상, maxCalls 상한, 휴장 skip, activeCount=0)
  </acceptance_criteria>

  <done>findMissingDates 구현 + 5 unit test GREEN. RESEARCH §3.1 알고리즘 mitigation 완료.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| KRX API → fetchBydd | 401/500/네트워크 장애 origin |
| BdydTrdRow → DB row | 매핑 시 type coercion 오류로 잘못된 값 저장 위험 |
| StockDailyOhlcv[] → Supabase | 4M row 누적 시 PostgREST batch limit 위반 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-01 | DENIAL OF SERVICE | KRX 401 (시크릿 만료 / 미승인) | mitigate | fetchBydd 의 401 catch → 명확한 에러 throw (retry 없음). master-sync fetchBaseInfo.ts:35 패턴 mirror. Cloud Run Job exit 1 → Plan 05 alert policy 발화. |
| T-09-07 | TAMPERING (silent data loss) | Supabase UPSERT batch limit | mitigate | upsertOhlcv 의 명시적 chunking — CHUNK_SIZE=1000, 첫 chunk 에러 시 즉시 throw (부분 적용 명확화). onConflict='code,date' DO UPDATE — idempotent. |
| T-09-MAP-01 | TAMPERING (필드 매핑 오류) | krxBdydToOhlcvRow | mitigate | ISU_SRT_CD 부재 / TDD_CLSPRC 부재 / BAS_DD 8자 아님 — 모두 throw. parseNumber 가 NaN 검출. 천단위 콤마 보수적 strip. |
| T-09-MD-01 | DENIAL OF SERVICE (recover 폭주) | findMissingDates | mitigate | maxCalls 상한 (기본 20) + 휴장일 row_count=0 skip — 동일 일자 무한 재호출 방지. RESEARCH §3.2 알고리즘 명세. |

</threat_model>

<verification>
- 5개 src + 4개 test 파일 생성됨
- `pnpm -F @gh-radar/candle-sync test --run` 4종 모두 GREEN (krx-bydd / map / upsert / missingDates)
- `pnpm -F @gh-radar/candle-sync typecheck` PASS
- `pnpm -F @gh-radar/candle-sync build` PASS (dist 생성)
- BdydTrdRow + StockDailyOhlcv 타입을 packages/shared 에서 import 정상
</verification>

<success_criteria>
- KRX 클라이언트 + fetchBydd 가 401 가드 + KOSPI/KOSDAQ Promise.all 동작
- 매핑 함수 가 BdydTrdRow → StockDailyOhlcv 정확 변환 (TDD_OPNPRC/HGPRC/LWPRC/CLSPRC + ACC_TRDVOL/ACC_TRDVAL + change*)
- chunked UPSERT 1000/chunk + onConflict (code,date) 동작
- findMissingDates 가 RESEARCH §3.1 알고리즘 구현
- 4종 unit test 합계 25+ test GREEN
</success_criteria>

<output>
After completion, create `.planning/phases/09-daily-candle-data/09-03-SUMMARY.md`
</output>
</content>
</invoke>
