---
phase: 09-daily-candle-data
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql
  - packages/shared/src/stock.ts
  - packages/shared/src/index.ts
  - .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md
autonomous: true
requirements_addressed:
  - DATA-01

must_haves:
  truths:
    - "supabase 마이그레이션 파일이 단일 트랜잭션(BEGIN/COMMIT)으로 stock_daily_ohlcv 테이블을 생성한다 — DATA-01 SC #1"
    - "테이블 PK 가 (code, date) 이며 NOT NULL OHLCV 컬럼(open/high/low/close)을 갖는다 — DATA-01 SC #1"
    - "(date DESC) 인덱스가 생성되어 일자별 전 종목 쿼리(스캐너용)를 지원한다 — DATA-01 SC #1"
    - "RLS 가 활성화되어 anon SELECT 허용 + service_role 만 쓰기 — Phase 06.1 패턴 승계"
    - "옵션 B (T-09-03) — FK 는 마이그레이션에 ADD CONSTRAINT NOT VALID 형태 또는 deferred. candle-sync 가 런타임에 stocks bootstrap (is_delisted=true ON CONFLICT DO NOTHING) 으로 orphan 회피"
    - "packages/shared 에 StockDailyOhlcv (DB row) + BdydTrdRow (KRX 응답) 타입이 export 된다 — Plan 03 mapper 가 import"
    - "마이그레이션 파일이 timestamp prefix 컨벤션(YYYYMMDDhhmmss_*.sql) 을 따른다"
  artifacts:
    - path: "supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql"
      provides: "stock_daily_ohlcv 테이블 + PK + 인덱스 + RLS + FK (NOT VALID)"
      contains: "PRIMARY KEY (code, date)"
    - path: "packages/shared/src/stock.ts"
      provides: "StockDailyOhlcv + BdydTrdRow 타입 export"
      contains: "StockDailyOhlcv"
    - path: ".planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md"
      provides: "psql/Supabase 검증 결과 기록 템플릿 (Plan 06 push 후 실값 채움)"
      contains: "stock_daily_ohlcv"
  key_links:
    - from: "stock_daily_ohlcv.code"
      to: "stocks(code)"
      via: "FOREIGN KEY ... NOT VALID (옵션 B 보완: candle-sync 가 신규 종목 bootstrap)"
      pattern: "REFERENCES stocks\\(code\\)"
    - from: "packages/shared/src/stock.ts"
      to: "Plan 03 workers/candle-sync/src/pipeline/map.ts"
      via: "StockDailyOhlcv + BdydTrdRow import"
      pattern: "StockDailyOhlcv"
---

<objective>
Phase 9 의 데이터 모델 기반 — Supabase `stock_daily_ohlcv` 테이블 마이그레이션 SQL 작성 + packages/shared 에 `StockDailyOhlcv` (DB row) + `BdydTrdRow` (KRX 응답) 타입 추가. 본 plan 은 SQL 파일과 타입 정의만 생성. **production push 는 plan 06 의 `[BLOCKING]` task 에서 수행** — 그 전에는 typecheck 만 통과시킴.

Purpose: DATA-01 SC #1 ("일봉 OHLCV 테이블이 Supabase 에 존재하고 PK=(code, date), 컬럼 open/high/low/close/volume/trade_amount 포함") 의 스키마 정의 + Plan 03 mapper/upsert 가 import 할 타입 계약 확립.

D-03 (테이블 스키마), D-04 (raw close only), D-05 (no market_cap), T-09-03 옵션 B (FK NOT VALID + 런타임 bootstrap) 반영.

Output:
- 마이그레이션 SQL 1개 (정적 검증 통과)
- `StockDailyOhlcv` + `BdydTrdRow` 타입 export
- MIGRATION-VERIFY.md 템플릿 (Plan 06 가 채움)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/09-daily-candle-data/09-CONTEXT.md
@.planning/phases/09-daily-candle-data/09-RESEARCH.md
@.planning/phases/09-daily-candle-data/09-VALIDATION.md

# 마이그레이션 컨벤션·기존 스키마
@supabase/migrations/20260413120000_init_tables.sql
@supabase/migrations/20260413120100_rls_policies.sql
@supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql

# 공용 타입 패키지
@packages/shared/src/stock.ts
@packages/shared/src/index.ts

<interfaces>
<!-- 마이그레이션 후 최종 스키마 (Plan 03 pipeline 가 이걸 가정) -->
```sql
CREATE TABLE stock_daily_ohlcv (
  code           text         NOT NULL,        -- KRX ISU_SRT_CD (6자 단축코드)
  date           date         NOT NULL,        -- BAS_DD 영업일 (YYYY-MM-DD)
  open           numeric(20,2) NOT NULL,       -- TDD_OPNPRC
  high           numeric(20,2) NOT NULL,       -- TDD_HGPRC
  low            numeric(20,2) NOT NULL,       -- TDD_LWPRC
  close          numeric(20,2) NOT NULL,       -- TDD_CLSPRC (raw close, D-04)
  volume         bigint        NOT NULL DEFAULT 0,  -- ACC_TRDVOL
  trade_amount   bigint        NOT NULL DEFAULT 0,  -- ACC_TRDVAL (KRW)
  change_amount  numeric(20,2),                -- CMPPREVDD_PRC (전일대비 절대값, nullable)
  change_rate    numeric(8,4),                 -- FLUC_RT (등락률 %, nullable)
  inserted_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (code, date)
);
-- FK 옵션 B (T-09-03): candle-sync 가 런타임에 stocks bootstrap 으로 orphan 회피.
-- NOT VALID 로 추가 → 신규 row 만 검증, 기존 폐지종목 history 는 미검증 통과.
ALTER TABLE stock_daily_ohlcv
  ADD CONSTRAINT stock_daily_ohlcv_code_fkey
  FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE NOT VALID;

CREATE INDEX idx_stock_daily_ohlcv_date_desc
  ON stock_daily_ohlcv (date DESC);

ALTER TABLE stock_daily_ohlcv ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_stock_daily_ohlcv"
  ON stock_daily_ohlcv FOR SELECT TO anon USING (true);
```

<!-- packages/shared 신규 타입 -->
```typescript
// KRX bydd_trd 응답 raw row (필드명은 RESEARCH §1.2 기준)
// 실제 키 이름은 Plan 06 Wave 0 prerequisite task (KRX 실측 호출) 의 fixture 캡처로 잠금 — 본 타입은 잠정.
export type BdydTrdRow = {
  BAS_DD: string;          // 기준일자 YYYYMMDD
  ISU_CD?: string;         // 표준코드 (참고용)
  ISU_SRT_CD: string;      // 단축코드 6자 → code
  ISU_NM?: string;         // 종목명 (참고용)
  MKT_NM?: string;         // 시장구분 (참고용)
  SECT_TP_NM?: string;     // 소속부 (참고용)
  TDD_OPNPRC: string;      // 당일 시가
  TDD_HGPRC: string;       // 당일 고가
  TDD_LWPRC: string;       // 당일 저가
  TDD_CLSPRC: string;      // 당일 종가
  CMPPREVDD_PRC?: string;  // 전일대비
  FLUC_RT?: string;        // 등락률 (%)
  ACC_TRDVOL?: string;     // 누적거래량
  ACC_TRDVAL?: string;     // 누적거래대금
  MKTCAP?: string;         // 시가총액 (D-05: 저장 X)
  LIST_SHRS?: string;      // 상장주식수 (D-05: 저장 X)
  market: "KOSPI" | "KOSDAQ";  // 호출 엔드포인트로 결정
};

// stock_daily_ohlcv 테이블 row (Plan 03 mapper 의 출력 = Plan 03 upsert 의 입력)
export type StockDailyOhlcv = {
  code: string;                       // ISU_SRT_CD
  date: string;                       // ISO YYYY-MM-DD (BAS_DD 변환)
  open: number;
  high: number;
  low: number;
  close: number;                      // raw close (D-04)
  volume: number;
  tradeAmount: number;
  changeAmount: number | null;
  changeRate: number | null;
};
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: 마이그레이션 SQL 작성 — stock_daily_ohlcv 테이블 + 인덱스 + RLS + FK NOT VALID</name>
  <files>supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql</files>

  <read_first>
    - supabase/migrations/20260413120000_init_tables.sql (테이블 컨벤션 — text/numeric/timestamptz 타입 선택)
    - supabase/migrations/20260413120100_rls_policies.sql (anon SELECT 정책 패턴)
    - supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql (FK + RLS + ENABLE ROW LEVEL SECURITY 패턴 — Plan 06.1 직전 마이그레이션)
    - .planning/phases/09-daily-candle-data/09-CONTEXT.md §D-03 §D-04 §D-05 (스키마 결정)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §1.2 (KRX 필드 매핑), §7 T-09-03 (FK orphan 옵션 B), §7 T-09-07 (chunked UPSERT — 인덱스 영향)
  </read_first>

  <action>
파일 `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` 를 다음 내용으로 새로 생성:

```sql
-- ============================================================
-- Phase 9 Plan 01: stock_daily_ohlcv 테이블 생성 (DATA-01 SC #1)
--
-- 결정 근거 (09-CONTEXT.md):
--   D-03: PK (code, date) + numeric(20,2) OHLCV + bigint volume/trade_amount
--   D-04: raw close 만 저장 (수정주가 X — 후속 phase)
--   D-05: market_cap 컬럼 X (stocks.listing_shares × close 로 계산 가능)
--   T-09-03 옵션 B: FK NOT VALID — 폐지종목 history orphan 은 candle-sync 가
--                  런타임에 stocks bootstrap (is_delisted=true ON CONFLICT DO NOTHING) 으로 해소
--   RLS: anon SELECT 허용 + service_role 쓰기 (Phase 06.1 stocks/stock_quotes 패턴 승계)
--   인덱스: PK (code, date) 외 (date DESC) — 일자별 전 종목 쿼리(스캐너용)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- Step 1. stock_daily_ohlcv 테이블 생성
-- ─────────────────────────────────────────────────────────
CREATE TABLE stock_daily_ohlcv (
  code           text          NOT NULL,                -- KRX ISU_SRT_CD (6자)
  date           date          NOT NULL,                -- BAS_DD (YYYY-MM-DD)
  open           numeric(20,2) NOT NULL,                -- TDD_OPNPRC
  high           numeric(20,2) NOT NULL,                -- TDD_HGPRC
  low            numeric(20,2) NOT NULL,                -- TDD_LWPRC
  close          numeric(20,2) NOT NULL,                -- TDD_CLSPRC (raw, D-04)
  volume         bigint        NOT NULL DEFAULT 0,      -- ACC_TRDVOL
  trade_amount   bigint        NOT NULL DEFAULT 0,      -- ACC_TRDVAL (KRW)
  change_amount  numeric(20,2),                         -- CMPPREVDD_PRC (nullable — 신규 상장일/휴장 직후 등)
  change_rate    numeric(8,4),                          -- FLUC_RT (% nullable)
  inserted_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (code, date)
);

-- ─────────────────────────────────────────────────────────
-- Step 2. FK 옵션 B (T-09-03) — NOT VALID 로 추가
--   KRX bydd_trd 가 폐지종목 history 를 반환하면 해당 종목 code 가 stocks 마스터에
--   없을 수 있음. NOT VALID 는 신규 INSERT 만 검증, 기존 row 검증 skip.
--   candle-sync (Plan 04) 가 UPSERT 직전에 stocks bootstrap (is_delisted=true ON CONFLICT DO NOTHING)
--   을 수행하여 신규 row 도 항상 FK 충족.
-- ─────────────────────────────────────────────────────────
ALTER TABLE stock_daily_ohlcv
  ADD CONSTRAINT stock_daily_ohlcv_code_fkey
  FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE NOT VALID;

-- ─────────────────────────────────────────────────────────
-- Step 3. 인덱스 — (date DESC) 만 추가 (PK 외)
--   - 일자별 전 종목 쿼리(스캐너용)에 사용
--   - 분석 친화 인덱스(change_rate, volume 등)는 후속 phase 에서 추가 (RESEARCH §8 Open Q 6)
-- ─────────────────────────────────────────────────────────
CREATE INDEX idx_stock_daily_ohlcv_date_desc
  ON stock_daily_ohlcv (date DESC);

-- ─────────────────────────────────────────────────────────
-- Step 4. RLS — anon SELECT 허용 + service_role 만 쓰기
--   Phase 06.1 의 stocks/stock_quotes 정책과 동일 패턴
-- ─────────────────────────────────────────────────────────
ALTER TABLE stock_daily_ohlcv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_stock_daily_ohlcv"
  ON stock_daily_ohlcv FOR SELECT TO anon USING (true);

COMMIT;
```

추가로 다음을 확인하라:
1. 파일명이 정확히 `20260512120000_create_stock_daily_ohlcv.sql` 인지 확인 (timestamp prefix `20260512120000` 는 2026-05-12 12:00:00 KST)
2. 기존 migration 중 같은 timestamp 가 없는지 `ls supabase/migrations/2026051*` 로 검증
3. 파일은 100% UTF-8 + LF (CRLF 금지)
  </action>

  <verify>
    <automated>node -e "const fs=require('fs');const sql=fs.readFileSync('supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql','utf8');const r=(p,n)=>{if(!p.test(sql))throw new Error('miss '+n)};r(/^BEGIN;/m,'BEGIN');r(/COMMIT;\s*$/,'COMMIT');r(/CREATE TABLE stock_daily_ohlcv/,'create table');r(/PRIMARY KEY \(code, date\)/,'PK');r(/REFERENCES stocks\(code\) ON DELETE CASCADE NOT VALID/,'FK NOT VALID');r(/CREATE INDEX idx_stock_daily_ohlcv_date_desc/,'date index');r(/ENABLE ROW LEVEL SECURITY/,'RLS');r(/anon_read_stock_daily_ohlcv/,'anon policy');r(/open\s+numeric\(20,2\) NOT NULL/,'open');r(/high\s+numeric\(20,2\) NOT NULL/,'high');r(/low\s+numeric\(20,2\) NOT NULL/,'low');r(/close\s+numeric\(20,2\) NOT NULL/,'close');r(/volume\s+bigint\s+NOT NULL/,'volume');r(/trade_amount\s+bigint\s+NOT NULL/,'trade_amount');console.log('OK')"</automated>
  </verify>

  <acceptance_criteria>
    - 파일 `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` 존재 (`test -f` exit 0)
    - 단일 `BEGIN;` + 단일 `COMMIT;` 트랜잭션
    - `grep -c "CREATE TABLE stock_daily_ohlcv" <file>` = 1
    - `grep -c "PRIMARY KEY (code, date)" <file>` = 1
    - `grep "REFERENCES stocks(code) ON DELETE CASCADE NOT VALID" <file>` 매치 (옵션 B)
    - `grep "CREATE INDEX idx_stock_daily_ohlcv_date_desc" <file>` 매치
    - `grep "ENABLE ROW LEVEL SECURITY" <file>` 매치
    - `grep "anon_read_stock_daily_ohlcv" <file>` 매치
    - 컬럼 정의 매치 — `open`, `high`, `low`, `close` 모두 `numeric(20,2) NOT NULL` 로 선언
    - `volume bigint NOT NULL` + `trade_amount bigint NOT NULL` 선언
    - `change_amount numeric(20,2)` (NULLABLE — NOT NULL 없음) + `change_rate numeric(8,4)` (NULLABLE)
    - `inserted_at timestamptz NOT NULL DEFAULT now()` 매치
    - **충돌 검증:** `ls supabase/migrations/20260512120000_*.sql | wc -l` = 1 (timestamp 중복 없음)
    - **market_cap 컬럼 없음 (D-05):** `grep -c "market_cap" <file>` = 0
    - 파일 적용은 본 plan 범위 외 — production push 는 plan 06 에서.
  </acceptance_criteria>

  <done>마이그레이션 SQL 작성 + 정적 검증 통과. production 적용은 Plan 06 의 `[BLOCKING]` task 에서.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: packages/shared 에 StockDailyOhlcv + BdydTrdRow 타입 추가</name>
  <files>
    packages/shared/src/stock.ts,
    packages/shared/src/index.ts
  </files>

  <read_first>
    - packages/shared/src/stock.ts (기존 Market/StockMaster/StockQuote 정의 — 본 task 가 추가)
    - packages/shared/src/index.ts (export 라인 — StockDailyOhlcv + BdydTrdRow 추가 필요)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §1.2 (KRX 필드 매핑 테이블) §4.2 (BAS_DD → date 변환 패턴)
    - workers/master-sync/src/krx/fetchBaseInfo.ts (KrxBaseInfoRow 패턴 — BdydTrdRow 의 mirror 대상)
  </read_first>

  <action>
1. `packages/shared/src/stock.ts` 의 **마지막**에 다음 두 타입을 추가 (기존 export 위에 끼워넣지 말고 파일 끝에 append):

```typescript

// ============================================================
// Phase 9 — Daily Candle Data (DATA-01)
//
// BdydTrdRow: KRX OpenAPI `stk_bydd_trd` / `ksq_bydd_trd` 응답의 raw row.
//   - 필드명은 RESEARCH §1.2 기준 잠정. Plan 06 Wave 0 prerequisite task 의
//     fixture 캡처(`workers/candle-sync/tests/fixtures/bydd-trd-{kospi,kosdaq}.json`)
//     실측으로 잠금 — 실측 차이 발견 시 본 타입 수정.
//   - market 필드는 호출 엔드포인트 (stk_ vs ksq_) 로 결정 후 태깅
// ============================================================

export type BdydTrdRow = {
  BAS_DD: string;              // 기준일자 YYYYMMDD
  ISU_CD?: string;             // 표준코드 KR로 시작 12자 (참고용)
  ISU_SRT_CD: string;          // 단축코드 6자 — code 필수
  ISU_NM?: string;             // 종목명 (참고용 — stocks 마스터에 이미 존재)
  MKT_NM?: string;             // 시장구분 ("KOSPI"/"KOSDAQ")
  SECT_TP_NM?: string;         // 소속부 / 업종 (참고용)
  TDD_OPNPRC: string;          // 당일 시가 → open
  TDD_HGPRC: string;           // 당일 고가 → high
  TDD_LWPRC: string;           // 당일 저가 → low
  TDD_CLSPRC: string;          // 당일 종가 → close
  CMPPREVDD_PRC?: string;      // 전일대비 (절대값) → change_amount
  FLUC_RT?: string;            // 등락률 (%) → change_rate
  ACC_TRDVOL?: string;         // 누적거래량 → volume
  ACC_TRDVAL?: string;         // 누적거래대금 → trade_amount
  MKTCAP?: string;             // 시가총액 (D-05: 저장 X)
  LIST_SHRS?: string;          // 상장주식수 (D-05: 저장 X)
  market: "KOSPI" | "KOSDAQ";  // 호출 엔드포인트로 결정 (Plan 03 fetchBydd 가 태깅)
};

// stock_daily_ohlcv 테이블 row — Plan 03 mapper 의 출력, Plan 03 upsert 의 입력
export type StockDailyOhlcv = {
  code: string;                       // ISU_SRT_CD
  date: string;                       // ISO YYYY-MM-DD (BAS_DD → 변환)
  open: number;                       // numeric(20,2)
  high: number;
  low: number;
  close: number;                      // raw close (D-04 — 수정주가 X)
  volume: number;                     // bigint
  tradeAmount: number;                // bigint (KRW)
  changeAmount: number | null;        // 전일대비 (nullable — 신규 상장일 등)
  changeRate: number | null;          // 등락률 % (nullable)
};
```

2. `packages/shared/src/index.ts` 의 첫 번째 export 라인을 다음과 같이 갱신 (기존 라인 순서 보존):

기존:
```typescript
export type { Stock, Market, SecurityType, StockMaster, StockQuote, StockWithQuote } from "./stock.js";
```

신규:
```typescript
export type { Stock, Market, SecurityType, StockMaster, StockQuote, StockWithQuote, BdydTrdRow, StockDailyOhlcv } from "./stock.js";
```

3. typecheck 회귀 확인:
```bash
pnpm -F @gh-radar/shared build
pnpm -w typecheck
```
양쪽 모두 exit 0 이어야 함. 신규 타입이 기존 코드를 깨지 않음 (오직 추가 export 이므로).
  </action>

  <verify>
    <automated>node -e "const fs=require('fs');const stock=fs.readFileSync('packages/shared/src/stock.ts','utf8');const idx=fs.readFileSync('packages/shared/src/index.ts','utf8');if(!/export type BdydTrdRow/.test(stock))throw new Error('miss BdydTrdRow');if(!/export type StockDailyOhlcv/.test(stock))throw new Error('miss StockDailyOhlcv');if(!/BdydTrdRow.*StockDailyOhlcv/.test(idx) && !/StockDailyOhlcv.*BdydTrdRow/.test(idx))throw new Error('miss index re-export');console.log('OK')" && pnpm -F @gh-radar/shared build</automated>
  </verify>

  <acceptance_criteria>
    - `grep "export type BdydTrdRow" packages/shared/src/stock.ts` 매치
    - `grep "export type StockDailyOhlcv" packages/shared/src/stock.ts` 매치
    - `BdydTrdRow` 의 멤버에 `BAS_DD`, `ISU_SRT_CD`, `TDD_OPNPRC`, `TDD_HGPRC`, `TDD_LWPRC`, `TDD_CLSPRC`, `market` 모두 존재
    - `StockDailyOhlcv` 의 멤버에 `code`, `date`, `open`, `high`, `low`, `close`, `volume`, `tradeAmount` 존재
    - `StockDailyOhlcv.changeAmount` 와 `changeRate` 가 `number | null` 로 nullable
    - `packages/shared/src/index.ts` 의 `./stock.js` re-export 라인에 `BdydTrdRow` 와 `StockDailyOhlcv` 모두 포함
    - `pnpm -F @gh-radar/shared build` exit 0
    - `pnpm -w typecheck` exit 0 (회귀 없음 — 신규 타입은 추가만)
  </acceptance_criteria>

  <done>StockDailyOhlcv + BdydTrdRow 타입이 packages/shared 에서 export 되며 workspace 전체 typecheck PASS. Plan 03 의 mapper/upsert 가 import 가능.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: MIGRATION-VERIFY.md 템플릿 작성 (Plan 06 push 후 채움)</name>
  <files>.planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md</files>

  <read_first>
    - .planning/phases/06.1-stock-master-universe/06.1-02-MIGRATION-VERIFY.md (Phase 06.1 의 templating 패턴 — 본 task 가 mirror)
    - .planning/phases/09-daily-candle-data/09-VALIDATION.md (`9-06-01` Manual-Only Verifications)
  </read_first>

  <action>
파일 `.planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md` 를 다음 템플릿으로 생성:

```markdown
# Phase 9 Plan 01 — Migration Verification

**Status:** Draft (Plan 06 에서 production push 후 실값으로 갱신)
**Migration:** `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql`
**Method:** `supabase db push` (또는 `psql $SUPABASE_DB_URL -f ...`)

## Schema Verification (Plan 06 채움)

### stock_daily_ohlcv
[psql `\d stock_daily_ohlcv` 결과 paste — Plan 06 Task 1 실행 후]

기대 컬럼:
- `code text NOT NULL`
- `date date NOT NULL`
- `open numeric(20,2) NOT NULL`
- `high numeric(20,2) NOT NULL`
- `low numeric(20,2) NOT NULL`
- `close numeric(20,2) NOT NULL`
- `volume bigint NOT NULL DEFAULT 0`
- `trade_amount bigint NOT NULL DEFAULT 0`
- `change_amount numeric(20,2)` (nullable)
- `change_rate numeric(8,4)` (nullable)
- `inserted_at timestamptz NOT NULL DEFAULT now()`

기대 PK: `PRIMARY KEY (code, date)`
기대 FK: `stock_daily_ohlcv_code_fkey FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE NOT VALID`

## FK Constraint (T-09-03 옵션 B)
[`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='stock_daily_ohlcv'::regclass AND contype='f';` 결과 paste]

기대: `NOT VALID` 키워드 포함 — 신규 row 만 검증, 폐지종목 history 는 candle-sync 가 stocks bootstrap 으로 해소.

## Indexes
[`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='stock_daily_ohlcv';` 결과 paste]

기대:
- `stock_daily_ohlcv_pkey` (PK — code, date)
- `idx_stock_daily_ohlcv_date_desc` (date DESC)

## RLS Policies
[`SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE tablename='stock_daily_ohlcv';` 결과 paste]

기대: `anon_read_stock_daily_ohlcv` (anon, SELECT)

## Sign-off (Plan 06 채움)
- [ ] `supabase db push` exit code 0
- [ ] psql `\d stock_daily_ohlcv` 모든 컬럼 + PK + FK 확인
- [ ] FK NOT VALID 키워드 확인
- [ ] `idx_stock_daily_ohlcv_date_desc` 인덱스 확인
- [ ] `anon_read_stock_daily_ohlcv` 정책 확인
- [ ] Plan 06 Task 1 의 [BLOCKING] task 가 본 검증 paste
```
  </action>

  <verify>
    <automated>test -f .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md && grep "stock_daily_ohlcv" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md && grep "NOT VALID" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md</automated>
  </verify>

  <acceptance_criteria>
    - 파일 `.planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md` 존재
    - `Status: Draft` 표시 — Plan 06 이 실값으로 갱신할 placeholder 임이 명시
    - 기대 컬럼 11개 모두 나열 (code/date/open/high/low/close/volume/trade_amount/change_amount/change_rate/inserted_at)
    - 기대 PK `PRIMARY KEY (code, date)` 명시
    - FK NOT VALID 키워드 명시
    - 기대 인덱스 2종 명시 (`stock_daily_ohlcv_pkey` + `idx_stock_daily_ohlcv_date_desc`)
    - 기대 RLS 정책 `anon_read_stock_daily_ohlcv` 명시
    - Sign-off 체크리스트 6항목 (모두 unchecked — Plan 06 가 체크)
  </acceptance_criteria>

  <done>VERIFY 템플릿 작성 완료. Plan 06 Task 1 ([BLOCKING] supabase db push) 가 실값으로 갱신.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Migration SQL → production DB | (Plan 06 에서 푸시) — 트랜잭션 실패 시 부분 적용 위험 |
| anon role → stock_daily_ohlcv | RLS 미적용 시 anon 의 비인가 쓰기 노출 |
| KRX 폐지종목 history → FK 제약 | T-09-03 옵션 B 로 NOT VALID 처리 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-03 | TAMPERING (FK orphan) | stock_daily_ohlcv.code → stocks(code) | mitigate | **옵션 B 채택 — FK NOT VALID + candle-sync 가 런타임 stocks bootstrap (is_delisted=true ON CONFLICT DO NOTHING).** Plan 04 의 backfill mode 가 KRX 응답의 unique code 를 stocks 에 신규 등록 후 stock_daily_ohlcv UPSERT. ON CONFLICT DO NOTHING 으로 기존 활성 종목은 미변경 (master-sync 쓰기 경쟁 회피). |
| T-09-MIG-01 | INFORMATION DISCLOSURE | anon role 의 stock_daily_ohlcv 접근 | mitigate | Step 4 의 `ENABLE ROW LEVEL SECURITY` + `anon_read_stock_daily_ohlcv` (SELECT only). 쓰기는 service_role bypass. Phase 06.1 stocks/stock_quotes 정책 그대로 승계. |
| T-09-MIG-02 | TAMPERING (마이그레이션 실패) | BEGIN/COMMIT 트랜잭션 | mitigate | 본 plan 은 SQL 작성만. Plan 06 의 `supabase db push` 가 단일 트랜잭션 — 실패 시 자동 ROLLBACK. |

</threat_model>

<verification>
- `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` 생성됨 (정적 검증 통과)
- `packages/shared/src/stock.ts` 에 BdydTrdRow + StockDailyOhlcv export
- `packages/shared/src/index.ts` 에 두 타입 re-export
- `pnpm -F @gh-radar/shared build` PASS
- `pnpm -w typecheck` PASS (회귀 없음)
- MIGRATION-VERIFY.md 템플릿 존재 — Plan 06 이 채움
- **NOT VERIFIED 본 plan 에서:** 실제 production push 는 plan 06.
</verification>

<success_criteria>
- 마이그레이션 SQL 파일 1개 생성 (정적 검증 PASS)
- packages/shared 에 StockDailyOhlcv + BdydTrdRow 타입 추가 (build PASS)
- MIGRATION-VERIFY.md 템플릿 생성
- 본 plan 의 변경이 workspace 전체 typecheck 회귀를 일으키지 않음
</success_criteria>

<output>
After completion, create `.planning/phases/09-daily-candle-data/09-01-SUMMARY.md`
</output>
</content>
</invoke>