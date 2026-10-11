---
phase: 09-daily-candle-data
plan: 01
subsystem: database
tags: [supabase, postgres, migration, rls, foreign-key, typescript, types]

# Dependency graph
requires:
  - phase: 06.1-stock-master-universe
    provides: stocks 마스터 테이블 (FK 타깃) + RLS 정책 패턴
provides:
  - stock_daily_ohlcv 마이그레이션 SQL (production push 대기)
  - BdydTrdRow + StockDailyOhlcv 타입 (packages/shared)
  - MIGRATION-VERIFY 템플릿 (Plan 06 가 채움)
affects:
  - 09-02-worker-scaffold (StockDailyOhlcv import)
  - 09-03-krx-client-and-pipeline (BdydTrdRow + StockDailyOhlcv mapper)
  - 09-04-modes-and-entry (upsert 사용)
  - 09-06-backfill-and-verify (마이그레이션 production push + verify 채움)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FK NOT VALID + 런타임 bootstrap 패턴 (T-09-03 옵션 B) — 폐지종목 history orphan 회피"
    - "공용 타입은 packages/shared 에 raw KRX row + DB row 양쪽 export (Plan 03 mapper 가 변환)"

key-files:
  created:
    - "supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql"
    - ".planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md"
  modified:
    - "packages/shared/src/stock.ts"
    - "packages/shared/src/index.ts"

key-decisions:
  - "D-03 채택: PK (code, date) + numeric(20,2) OHLCV + bigint volume/trade_amount"
  - "D-04 채택: raw close 만 저장 (수정주가 컬럼 X — 후속 phase 에서 별도 처리)"
  - "D-05 채택: 시가총액 컬럼 미보유 (stocks.listing_shares × close 로 계산)"
  - "T-09-03 옵션 B 채택: FK NOT VALID + candle-sync 런타임 stocks bootstrap"
  - "production push 는 본 plan 범위 외 — Plan 06 의 [BLOCKING] task 에서 수행"

patterns-established:
  - "FK NOT VALID: 신규 row 만 검증, 기존 row 검증 skip — 폐지종목 history backfill 패턴에 활용"
  - "BdydTrdRow (raw) + StockDailyOhlcv (DB) 분리: KRX 응답 잠정 잠금 + Plan 03 mapper 가 변환 책임"
  - "마이그레이션 컨벤션: 단일 BEGIN/COMMIT 트랜잭션 + Step 단위 주석 + D-N 결정 근거 명시"

requirements-completed: [DATA-01]

# Metrics
duration: 6min
completed: 2026-05-11
---

# Phase 9 Plan 01: Migration Summary

**stock_daily_ohlcv 테이블 마이그레이션 SQL + BdydTrdRow/StockDailyOhlcv 공용 타입 정의 — production push 는 Plan 06 대기**

## Performance

- **Duration:** ~6 분
- **Started:** 2026-05-11T07:21:00Z
- **Completed:** 2026-05-11T07:27:43Z
- **Tasks:** 3 / 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `stock_daily_ohlcv` 테이블 마이그레이션 SQL 작성 — DATA-01 SC #1 의 스키마 정의 완료
- FK NOT VALID + (date DESC) 인덱스 + RLS anon SELECT 정책 모두 단일 트랜잭션에 포함
- `packages/shared` 에 `BdydTrdRow` (KRX 응답 raw) + `StockDailyOhlcv` (DB row) 타입 export — Plan 03 mapper 가 import 가능
- workspace 전체 typecheck PASS (회귀 없음)
- MIGRATION-VERIFY.md 템플릿 작성 — Plan 06 의 [BLOCKING] task 가 production push 결과를 paste

## Task Commits

각 task 는 atomic 으로 커밋됨:

1. **Task 1: 마이그레이션 SQL 작성** — `923857d` (feat)
2. **Task 2: packages/shared 타입 추가** — `a201ddb` (feat)
3. **Task 3: MIGRATION-VERIFY.md 템플릿** — `1588870` (docs)

## Files Created/Modified

- `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql` (CREATED) — stock_daily_ohlcv 테이블 + PK + FK NOT VALID + (date DESC) 인덱스 + RLS anon SELECT 정책
- `packages/shared/src/stock.ts` (MODIFIED) — BdydTrdRow + StockDailyOhlcv 두 타입 append
- `packages/shared/src/index.ts` (MODIFIED) — re-export 라인에 BdydTrdRow, StockDailyOhlcv 추가
- `.planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md` (CREATED) — 검증 템플릿 (Plan 06 채움)

## Decisions Made

PLAN 에 명시된 결정을 그대로 구현 — 신규 결정 없음:

- D-03/D-04/D-05 (스키마): PK=(code,date), numeric(20,2) OHLCV, bigint volume/trade_amount, raw close, 시가총액 미보유
- T-09-03 옵션 B (FK orphan): `NOT VALID` 키워드로 신규 INSERT 만 검증 → candle-sync 가 런타임 stocks bootstrap (`is_delisted=true ON CONFLICT DO NOTHING`) 으로 보완 (Plan 04 책임)
- RLS: Phase 06.1 stocks/stock_quotes 패턴 그대로 승계 (anon SELECT + service_role bypass)
- production push 범위: 본 plan 은 SQL 정적 작성까지만, 실제 push 는 Plan 06 의 [BLOCKING] task 에서

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D-05 결정 주석을 "market_cap" → "시가총액" 으로 변경**

- **Found during:** Task 1 검증 단계
- **Issue:** PLAN 의 acceptance criteria 가 `grep -c "market_cap" <file>` = 0 을 요구. 초안 주석에 `D-05: market_cap 컬럼 X (...)` 가 있어 grep 매치 1 → criteria 위반
- **Fix:** 주석을 `D-05: 시가총액 컬럼 X (...)` 로 한글 표현 변경. 의미 동일, acceptance criteria 충족
- **Files modified:** supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql
- **Verification:** `grep -c market_cap` = 0, 정적 검증 OK
- **Committed in:** 923857d (Task 1 commit 시 단일 파일로 묶임)

---

**Total deviations:** 1 auto-fixed (acceptance criteria 준수)
**Impact on plan:** scope creep 없음. 단순 표현 변경으로 plan 그대로 실행.

## Issues Encountered

None — plan 그대로 실행됨.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql
- FOUND: packages/shared/src/stock.ts (modified)
- FOUND: packages/shared/src/index.ts (modified)
- FOUND: .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md
- FOUND commit: 923857d (Task 1)
- FOUND commit: a201ddb (Task 2)
- FOUND commit: 1588870 (Task 3)
- VERIFIED: pnpm -F @gh-radar/shared build PASS
- VERIFIED: pnpm -w typecheck PASS (7 workspace projects, 회귀 없음)
- VERIFIED: 정적 검증 — BEGIN/COMMIT, PK, FK NOT VALID, 인덱스, RLS, 컬럼 정의 모두 매치

## User Setup Required

None — 본 plan 은 SQL/타입 정의만 추가. production push 는 Plan 06 [BLOCKING] task 에서 수행 (별도 USER-SETUP 불필요).

## Next Phase Readiness

- **Plan 02 (worker-scaffold)** ready: `StockDailyOhlcv` 타입 import 가능
- **Plan 03 (krx-client-and-pipeline)** ready: `BdydTrdRow` (입력) + `StockDailyOhlcv` (출력) mapper 작성 가능
- **Plan 06 (backfill-and-verify)** 대기: [BLOCKING] task 가 `supabase db push` 수행 + MIGRATION-VERIFY.md 채움
- Blocker 없음 — 다음 plan 으로 진행 가능

---
*Phase: 09-daily-candle-data*
*Completed: 2026-05-11*
