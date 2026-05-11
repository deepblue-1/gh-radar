---
phase: 09-daily-candle-data
plan: 03
subsystem: data-pipeline
tags: [krx, axios, supabase, vitest, tdd, ohlcv]

# Dependency graph
requires:
  - phase: 09-daily-candle-data
    provides: "Plan 01 — stock_daily_ohlcv migration + BdydTrdRow/StockDailyOhlcv 타입 (packages/shared)"
  - phase: 09-daily-candle-data
    provides: "Plan 02 — candle-sync 워크스페이스 (config/logger/retry/services/supabase, Dockerfile, vitest)"
provides:
  - "createKrxClient (axios + AUTH_KEY + 30s timeout) for KRX OpenAPI"
  - "fetchBydd (KOSPI/KOSDAQ Promise.all + market 태깅 + 401 즉시 throw)"
  - "krxBdydToOhlcvRow (BdydTrdRow → StockDailyOhlcv, BAS_DD ISO 변환, 천단위 콤마 처리)"
  - "upsertOhlcv (chunked 1000/chunk + onConflict code,date, camelCase → snake_case)"
  - "findMissingDates (활성×0.9 threshold + lookback distinct date + maxCalls 상한 + 휴장 skip)"
affects: [09-04-modes-and-entry, 09-05-iam-deploy-scheduler, 09-06-backfill-and-verify]

# Tech tracking
tech-stack:
  added: []   # 의존성 추가 없음 — Plan 02 에서 axios/supabase/pino/vitest 모두 도입
  patterns:
    - "TDD 4종 (RED-GREEN cycle) — test 작성 → 컴파일 실패 확인 → 구현 → 4종 4파일 모두 GREEN"
    - "master-sync mirror 패턴 — 동일 axios+AUTH_KEY 헤더 + Promise.all KOSPI/KOSDAQ + 401 가드 (1:1 클라이언트, URL+엔드포인트만 다름)"
    - "chunked UPSERT 1000/chunk — PostgREST batch limit 회피, 첫 chunk 에러 시 즉시 throw (부분 적용 명확화)"
    - "camelCase → snake_case DB row 변환 (tradeAmount → trade_amount 등) — Plan 01 마이그레이션 컬럼명 일치"
    - "N+1 결측 감지 — Supabase JS client 의 head:true count 패턴으로 활성 stocks 카운트 + per-date count 비교 (RPC 없이 client-side 비교)"

key-files:
  created:
    - workers/candle-sync/src/krx/client.ts
    - workers/candle-sync/src/krx/fetchBydd.ts
    - workers/candle-sync/src/pipeline/map.ts
    - workers/candle-sync/src/pipeline/upsert.ts
    - workers/candle-sync/src/pipeline/missingDates.ts
    - workers/candle-sync/tests/krx-bydd.test.ts
    - workers/candle-sync/tests/map.test.ts
    - workers/candle-sync/tests/upsert.test.ts
    - workers/candle-sync/tests/missingDates.test.ts
  modified: []

key-decisions:
  - "결측 감지는 RPC 가 아닌 client-side N+1 패턴 — 활성 stocks count 1회 + lookback 영업일 distinct date 1회 + per-date count N회. Supabase JS v2 가 raw SQL/GROUP BY 제한적이라 head:true count 의 명료성 우선."
  - "lookback 영업일 추론 = 최근 20일 distinct date 수집 (DB 의 실제 거래일 기반). DB 가 비어 있거나 활성=0 이면 빈 배열 반환 + warn 로그 — Plan 06 백필 전에 호출되어도 safe."
  - "Vitest mockResolvedValue 직접 사용 — Supabase v2 builder thenable 흉내 없이 final method (eq/order) 에서 resolve. mock 단순함이 thenable 정확도보다 우선."

patterns-established:
  - "TDD 4종 (krx-bydd / map / upsert / missingDates) — RED step 마다 `Cannot find module` import 실패 확인 후 GREEN 구현. 4 파일 모두 첫 GREEN 실행에 통과 (재시도 없음)."
  - "401 가드 메시지 패턴 — basDd 포함 + AUTH_KEY 신청 서비스명 명시 (`stk_bydd_trd + ksq_bydd_trd 서비스 신청 상태 확인 필요`)"
  - "parseOptionalNumber — KRX 천단위 콤마 + 빈 문자열 + 음수 모두 일관 처리, NaN 은 null"

requirements-completed: [DATA-01]

# Metrics
duration: 5min
completed: 2026-05-11
---

# Phase 09 Plan 03: KRX Client + Pipeline (fetchBydd / map / upsert / missingDates) Summary

**KRX bydd_trd 호출 + BdydTrdRow→StockDailyOhlcv 매핑 + 1000/chunk UPSERT + recover mode 결측 감지를 모두 TDD 4종 26 test GREEN 으로 구현**

## Performance

- **Duration:** 5min (~4m 40s)
- **Started:** 2026-05-11T07:35:26Z
- **Completed:** 2026-05-11T07:40:14Z
- **Tasks:** 4
- **Files modified:** 9 (5 src + 4 test)

## Accomplishments

- KRX 클라이언트 + fetchBydd — KOSPI + KOSDAQ Promise.all 단일 호출로 날짜×시장 전 종목 OHLCV 수신, 401 시 retry 없이 명확한 에러 (T-09-01 mitigation)
- krxBdydToOhlcvRow — BdydTrdRow 의 raw 문자열 (BAS_DD YYYYMMDD, TDD_*PRC, ACC_TRDVOL/VAL, CMPPREVDD_PRC, FLUC_RT) → StockDailyOhlcv 타입화된 row 변환. 천단위 콤마 보수 strip, ISU_SRT_CD/BAS_DD/TDD_CLSPRC 누락 시 throw
- upsertOhlcv — 1000/chunk 분할 + onConflict (code,date) DO UPDATE, camelCase → snake_case 변환 (tradeAmount→trade_amount, changeAmount→change_amount, changeRate→change_rate), 첫 chunk 에러 시 즉시 throw (T-09-07 mitigation)
- findMissingDates — 활성 stocks × 0.9 threshold 동적 산출, 최근 lookback 영업일 distinct date 추론, per-date row count 비교, 휴장(row_count=0) skip, maxCalls 상한 (T-09-MD-01 mitigation)
- 4종 vitest 모두 GREEN — 26 test (5+8+8+5), Plan success_criteria "25+ test" 충족
- typecheck PASS + build PASS — Plan 04 의 modes/{backfill,daily,recover}.ts 가 import 할 빌딩 블록 안정

## Task Commits

각 task 는 atomic commit:

1. **Task 1: KRX 클라이언트 + fetchBydd + 5 test** — `beafd6b` (feat)
2. **Task 2: pipeline/map.ts 매핑 + 8 test** — `c524fb7` (feat)
3. **Task 3: pipeline/upsert.ts chunked + 8 test** — `ea4c257` (feat)
4. **Task 4: pipeline/missingDates.ts 결측 감지 + 5 test** — `f791dc9` (feat)

_각 task 의 RED step (test 작성 후 import 실패 확인) 은 GREEN 구현과 동일 commit 으로 묶음 — TDD 사이클이 짧고 (단일 RED → 첫 GREEN PASS) 별도 test 커밋이 의미 없음._

## Files Created/Modified

- `workers/candle-sync/src/krx/client.ts` — axios baseURL + AUTH_KEY 헤더 + 30s timeout (master-sync 1:1 mirror)
- `workers/candle-sync/src/krx/fetchBydd.ts` — `/sto/stk_bydd_trd` + `/sto/ksq_bydd_trd` Promise.all + market 태깅 + 401 가드
- `workers/candle-sync/src/pipeline/map.ts` — BdydTrdRow → StockDailyOhlcv 매핑 (parseBasDdToIso / parseNumber / parseOptionalNumber)
- `workers/candle-sync/src/pipeline/upsert.ts` — chunked 1000/chunk UPSERT + toDbRow camelCase→snake_case
- `workers/candle-sync/src/pipeline/missingDates.ts` — 활성×threshold + lookback 추론 + per-date count + maxCalls 상한
- `workers/candle-sync/tests/krx-bydd.test.ts` — 5 test (client headers, KOSPI/KOSDAQ 합침 + market 태깅, 빈 응답, 401, 500)
- `workers/candle-sync/tests/map.test.ts` — 8 test (정상, CMPPREVDD null, FLUC_RT 음수, 빈 문자열, 콤마 파싱, ISU_SRT_CD 누락, BAS_DD 8자 아님, TDD_CLSPRC 누락)
- `workers/candle-sync/tests/upsert.test.ts` — 8 test (빈 배열, 500/1500/3500 chunking, onConflict, snake_case 변환, 첫 chunk 에러, 테이블 이름)
- `workers/candle-sync/tests/missingDates.test.ts` — 5 test (정상 결측 발견, 모두 정상, maxCalls 상한, 휴장 skip, activeCount=0)

## Decisions Made

- **결측 감지 구현 = N+1 client-side 비교** — RESEARCH §3.1 의 SQL GROUP BY 가 Supabase JS v2 builder 에 제한적 (raw SQL/RPC 없이는 GROUP BY 결과를 직접 받기 어렵움). 대신 활성 stocks count 1회 + lookback distinct date 1회 + per-date head:true count N회. 비용은 (1 + 1 + N) RPC roundtrip, lookback=10 시 12회 — Plan 04 recover mode 가 일일 1회 호출이므로 무시 가능한 오버헤드. Plan 06 백필 후 실측 시 SQL 함수로 전환 검토 가능.
- **lookback 영업일 = DB distinct date 기반 추론** — RESEARCH §3.3 옵션 A 채택. 한국 영업일 calendar lib 없이도 DB 가 거래일만 보유하므로 자연스러운 휴장일 skip. 단, DB 가 비어있거나 활성=0 이면 빈 배열 + warn (Plan 06 백필 전 호출 안전).
- **Vitest mock 단순화** — Supabase v2 builder 의 PromiseLike thenable 흉내 대신 final method (eq/order) 에서 mockResolvedValue 로 즉시 resolve. 호출자 await 가 PromiseLike/Promise 모두 처리하므로 안전. 8 test (upsert) + 5 test (missingDates) 모두 통과.
- **TDD RED step 별도 커밋 생략** — 각 task 의 RED 는 `Cannot find module` import 실패로 즉시 확인 (vitest 가 컴파일 실패를 명시) + GREEN 1차 통과. test+impl 을 한 commit 으로 묶어 history 단순화.

## Deviations from Plan

None — plan 의 모든 코드 블록을 그대로 구현. 4개 task 모두 첫 GREEN 실행에서 PASS (재시도 없음). Acceptance criteria 의 grep 패턴 모두 매치.

## Issues Encountered

None — RED→GREEN 사이클 4종 모두 단일 패스. typecheck/build 도 1차 PASS.

## User Setup Required

None — 본 plan 은 순수 단위 테스트 + axios/supabase mock 기반. 실제 KRX 호출/Supabase write 는 Plan 05 (deploy) + Plan 06 (backfill+verify) 에서 진행.

## Next Phase Readiness

- Plan 04 (modes-and-entry) 의 `modes/{backfill,daily,recover}.ts` 가 본 plan 의 4개 함수 호출:
  - `backfill.ts` → `createKrxClient` + `fetchBydd(client, basDd)` + `krxBdydToOhlcvRow` + `upsertOhlcv` 의 시계열 loop
  - `daily.ts` → 동일 4개 함수의 단일 일자 (오늘 EOD) 호출
  - `recover.ts` → `findMissingDates` 로 결측 일자 list 산출 후 각 일자에 대해 fetchBydd→map→upsert
- `index.ts` 의 MODE env 분기는 Plan 04 가 구현. 본 plan 의 함수 시그니처 (`Promise<BdydTrdRow[]>`, `Promise<{count: number}>`, `Promise<string[]>`) 가 안정적.
- typecheck + build PASS 이므로 Plan 04 의 import 단계에서 break 없을 것.

## Self-Check: PASSED

**Files exist:**
- FOUND: workers/candle-sync/src/krx/client.ts
- FOUND: workers/candle-sync/src/krx/fetchBydd.ts
- FOUND: workers/candle-sync/src/pipeline/map.ts
- FOUND: workers/candle-sync/src/pipeline/upsert.ts
- FOUND: workers/candle-sync/src/pipeline/missingDates.ts
- FOUND: workers/candle-sync/tests/krx-bydd.test.ts
- FOUND: workers/candle-sync/tests/map.test.ts
- FOUND: workers/candle-sync/tests/upsert.test.ts
- FOUND: workers/candle-sync/tests/missingDates.test.ts

**Commits exist:**
- FOUND: beafd6b (Task 1: KRX 클라이언트 + fetchBydd)
- FOUND: c524fb7 (Task 2: pipeline/map.ts)
- FOUND: ea4c257 (Task 3: pipeline/upsert.ts)
- FOUND: f791dc9 (Task 4: pipeline/missingDates.ts)

**Test execution:**
- pnpm -F @gh-radar/candle-sync test --run: 4 test files passed, 26 tests passed
- pnpm -F @gh-radar/candle-sync typecheck: PASS
- pnpm -F @gh-radar/candle-sync build: PASS

---
*Phase: 09-daily-candle-data*
*Completed: 2026-05-11*
