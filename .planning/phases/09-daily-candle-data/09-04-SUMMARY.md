---
phase: 09-daily-candle-data
plan: 04
subsystem: data-pipeline
tags: [krx, candle-sync, modes, dispatch, businessDay, vitest, tdd]

# Dependency graph
requires:
  - phase: 09-daily-candle-data
    provides: "Plan 02 — candle-sync 워크스페이스 (config/logger/retry/services/supabase, Dockerfile, vitest)"
  - phase: 09-daily-candle-data
    provides: "Plan 03 — krx/{client,fetchBydd} + pipeline/{map,upsert,missingDates} 빌딩 블록 (26 test GREEN)"
provides:
  - "runDaily(deps) — basDd 자동 (todayBasDdKst) + KRX 빈 응답 warn 분기 + MIN_EXPECTED 가드 (T-09-02)"
  - "runBackfill(deps) — BACKFILL_FROM/TO iterateBusinessDays 순회 + per-day try/catch 격리 + 401/MIN_EXPECTED 우회 즉시 throw"
  - "runRecover(deps) — findMissingDates → per-date 격리 fetch + 0 결측 정상 종료 (best-effort)"
  - "bootstrapStocks(supabase, rows) — KRX 응답 unique code 를 stocks 에 is_delisted=true ON CONFLICT DO NOTHING (T-09-03 옵션 B)"
  - "businessDay 유틸 (todayBasDdKst / isoToBasDd / basDdToIso / iterateBusinessDays generator)"
  - "dispatch() — MODE switch → runDaily/runBackfill/runRecover + TS exhaustive never check"
  - "main() CLI 진입점 — try/catch exit 0/1 + vitest 안전 가드 (master-sync mirror)"
affects: [09-05-iam-deploy-scheduler, 09-06-backfill-and-verify]

# Tech tracking
tech-stack:
  added: []   # 새 dependency 없음 — Plan 02/03 의존성 그대로 사용
  patterns:
    - "TDD 5종 (businessDay / runDaily / runBackfill / runRecover / index) — Plan 03 mirror 패턴 + vi.mock 가짜 모듈 (loadConfig/services/krx/pipeline) → mode 함수 격리 검증"
    - "per-day/per-date 격리 try/catch + 화이트리스트 즉시 throw — message.includes('KRX 401') / includes('MIN_EXPECTED') 만 우회, 일반 network 에러는 daysFailed/datesProcessed-- 후 continue"
    - "config.basDd ?? todayBasDdKst() override 패턴 — BAS_DD env 가 있으면 사용 (테스트 mock + 수동 재실행용), 없으면 KST today 자동 (master-sync 와 동일 운영 흐름)"
    - "exhaustive switch never check — switch default 에서 `const _exhaustive: never = config.mode;` TS 가 새 Mode 추가 시 컴파일 에러로 강제"
    - "mock 디자인 — call counter 누적 race 피하기 위해 basDd 값 기반 분기 (`if (basDd === '20260505') reject` 패턴)로 retry 와 무관하게 일관 fail/success 보장"

key-files:
  created:
    - workers/candle-sync/src/modes/businessDay.ts
    - workers/candle-sync/src/modes/bootstrapStocks.ts
    - workers/candle-sync/src/modes/daily.ts
    - workers/candle-sync/src/modes/backfill.ts
    - workers/candle-sync/src/modes/recover.ts
    - workers/candle-sync/tests/businessDay.test.ts
    - workers/candle-sync/tests/runDaily.test.ts
    - workers/candle-sync/tests/runBackfill.test.ts
    - workers/candle-sync/tests/runRecover.test.ts
    - workers/candle-sync/tests/index.test.ts
  modified:
    - workers/candle-sync/src/index.ts       # placeholder → 실제 dispatch
    - workers/candle-sync/src/config.ts      # optional basDd (BAS_DD env) 추가

key-decisions:
  - "config.basDd optional 추가 — Plan 02 의 config 에 BAS_DD env 가 없었으나, plan 의 daily.ts 의도(`config.basDd ?? todayBasDdKst()`)와 테스트 mock 통과를 위해 Rule 3 (blocking) 으로 추가. 운영 영향은 무: env 미설정 시 todayBasDdKst() 가 default. 수동 재실행/테스트 시 BAS_DD=20260509 로 override 가능."
  - "backfill MIN_EXPECTED 정책 — RESEARCH §7 T-09-02 의 backfill 권고 (warn+continue) 와 의도적 차이로 throw 채택. 한 영업일이라도 부분 데이터로 ~4M row 전체를 오염시킬 위험이 더 크다는 plan threat_model 판단. daily/recover 는 RESEARCH 와 일치 (daily=throw, recover=skip)."
  - "mock 디자인 (call counter → basDd 기반) — Plan 의 초안 mock 은 `let call=0; if (call===2) reject` 패턴이었으나 withRetry 의 3회 재시도가 call counter 를 누적시켜 fail intent 무효화. basDd 값 기반 분기 (`if (basDd === '20260505') reject`) 로 변경 — retry 와 무관하게 해당 날짜만 일관 fail. Plan 의 의도 (per-day 격리 검증) 달성."

patterns-established:
  - "vi.mock 단일 mock 변수 패턴 — `const mockFetchBydd = vi.fn(); vi.mock(...)` 으로 hoist 안전 (mockFn 선언이 vi.mock 보다 위)"
  - "main()/dispatch() 분리 패턴 — dispatch 만 export (테스트 import) + main 은 private (CLI exit 처리). vitest 안전 가드 `process.argv[1].endsWith('index.js')` 로 import 시 미실행"
  - "MIN_EXPECTED + per-day 격리 화이트리스트 — message 키워드 매치 (`includes('KRX 401') || includes('MIN_EXPECTED')`) 로 우회 조건 명시. 새 우회 조건 추가 시 인자 1줄"

requirements-completed: [DATA-01]

# Metrics
duration: 7min
completed: 2026-05-11
---

# Phase 09 Plan 04: Modes + Entry (MODE dispatch + runDaily/Backfill/Recover) Summary

**candle-sync 워커의 MODE switch dispatch + 3개 mode 함수 (backfill/daily/recover) + businessDay 유틸 + bootstrapStocks 를 TDD 5종 26 신규 test GREEN 으로 구현. 전체 9 test files 52 tests 통과 — 워커 로컬 dev 실행 준비 완료.**

## Performance

- **Duration:** 7min (~6m 30s)
- **Started:** 2026-05-11T07:43:30Z
- **Completed:** 2026-05-11T07:49:30Z
- **Tasks:** 4
- **Files modified:** 12 (10 created + 2 modified)

## Accomplishments

- **runDaily** — basDd 자동 (KST UTC+9, todayBasDdKst) + KRX 빈 응답은 warn `KRX data not yet available` + return count=0 (exit 0) + row<minExpectedRows 시 throw (T-09-02 MIN_EXPECTED 가드). bootstrapStocks → map → upsert 순서로 FK orphan 회피
- **runBackfill** — BACKFILL_FROM/TO env 양쪽 필수, iterateBusinessDays generator 로 평일만 순회 (휴장은 KRX 빈응답으로 자연 skip). per-day try/catch 격리: 일반 network 에러는 daysFailed 증가 + continue, KRX 401/MIN_EXPECTED 는 즉시 throw (보수적 — 부분 데이터 오염 회피)
- **runRecover** — findMissingDates 호출 → 결측 일자에 대해 per-date 격리 fetch+upsert (best-effort). 0 결측 시 `no missing dates detected` info + 정상 종료. KRX 빈응답은 skip (datesProcessed 미증가)
- **bootstrapStocks** — T-09-03 옵션 B: KRX 응답의 unique code (Map dedup) 를 stocks 에 `is_delisted=true` `ON CONFLICT DO NOTHING` (`ignoreDuplicates: true`) 등록. master-sync 쓰기 경쟁 자연 회피. 신규 등록은 다음 master-sync 사이클에서 활성 여부 재평가
- **businessDay 유틸** — todayBasDdKst (KST UTC+9), isoToBasDd / basDdToIso 양방향 변환 (잘못된 형식 throw), iterateBusinessDays generator (월~금 yield, 토/일 skip)
- **dispatch()** — switch (config.mode) 로 MODE 분기 + TS exhaustive `never` check (Mode union 확장 시 컴파일 에러). main() try/catch exit 0/1 + master-sync 패턴 mirror CLI 가드
- **5종 vitest 모두 GREEN** — businessDay 9 + runDaily 4 + runBackfill 5 + runRecover 4 + index 4 = 26 신규 test. 전체 9 test files 52 tests 통과
- **typecheck + build PASS** — `MODE=daily KRX_AUTH_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm -F @gh-radar/candle-sync dev` 로컬 실행 준비. Plan 05 (Docker/Cloud Run 배포) 입력 산출물 안정

## Verification

- ✅ Task 1: businessDay test 9 GREEN — `pnpm -F @gh-radar/candle-sync test --run -- businessDay` exit 0
- ✅ Task 2: runDaily test 4 GREEN — 정상(2,800 row) / 빈 응답 / MIN_EXPECTED (500<1400) / KRX 401 retry 후 throw
- ✅ Task 3: runBackfill 5 GREEN — 5 영업일 정상 / 빈 응답 / MIN_EXPECTED 즉시 throw / KRX 401 즉시 throw / 일반 network 에러 per-day 격리. runRecover 4 GREEN — 0 결측 / 3 결측 / per-date 격리 / KRX 빈 응답 skip
- ✅ Task 4: dispatch 4 GREEN — MODE=daily/backfill/recover 분기 + result wrap. **전체 9 test files 52 tests passed** (Plan 목표 ~51 초과 달성)
- ✅ `pnpm -F @gh-radar/candle-sync typecheck` exit 0 (TS strict 통과, exhaustive never 컴파일 확인)
- ✅ `pnpm -F @gh-radar/candle-sync build` exit 0 (`workers/candle-sync/dist/` 모든 src 컴파일)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] config.basDd optional 필드 추가**

- **Found during:** Task 2 — daily.ts plan 코드에 `config.basDd ?? todayBasDdKst()` 패턴이 있는데 Plan 02 의 config.ts 에는 basDd 필드 없음. 테스트 mock 은 `basDd: "20260509"` 를 전달해 통과를 가정.
- **Issue:** plan 코드 그대로 작성 시 TS 컴파일 에러 (`Property 'basDd' does not exist on type 'Config'`). 테스트 mock 의 basDd 도 무시되어 runDaily 결과의 basDd 가 실제 KST today 가 되어 `expect(out.basDd).toBe("20260509")` fail.
- **Fix:** `Config` 타입에 `basDd?: string` 추가 + `loadConfig()` 가 `process.env.BAS_DD` 읽도록. 운영 영향 무 — env 미설정 시 todayBasDdKst() 가 default.
- **Files modified:** `workers/candle-sync/src/config.ts`
- **Commit:** f88e65a

**2. [Rule 1 - Bug] Plan 의 mock 디자인 (call counter) 이 withRetry 와 호환 안 됨**

- **Found during:** Task 3 — `let call=0; if (call===2) reject` 패턴의 mock 은 withRetry 의 3회 attempt 가 call counter 를 누적시켜 attempt 1 만 fail 후 attempt 2 success → 의도된 "한 일자 전체 fail" 시나리오가 무효화. 결과적으로 daysFailed=0, datesProcessed=3 으로 expect 와 불일치.
- **Issue:** test 가 검증하려는 "per-day/per-date 격리" 동작이 mock 결함으로 검증 불가.
- **Fix:** mock 을 basDd 값 기반 분기로 변경 (`if (basDd === '20260505') return Promise.reject(...)`). 해당 날짜는 withRetry 의 3회 attempt 모두 fail 보장, 다른 날짜는 정상 응답. test timeout 도 10000ms 로 명시 (3회 retry × 200/400ms backoff ≈ 1s).
- **Files modified:** `workers/candle-sync/tests/runBackfill.test.ts`, `workers/candle-sync/tests/runRecover.test.ts`
- **Commit:** 23f9ead

## Decisions Made

- **basDd override 채택 (BAS_DD env)** — Plan 02 config 확장. 운영 영향 무, 수동 재실행 가능 (예: BAS_DD=20260510 으로 특정 일자 재시도)
- **backfill MIN_EXPECTED 정책 = throw** — RESEARCH §7 의 backfill 권고 warn+continue 와 의도적 차이. plan threat_model T-09-02 의 보수적 채택. 부분 응답이 한 영업일이라도 전체 ~4M row 를 오염시킬 위험이 더 크다는 판단
- **mock basDd 분기 패턴** — call counter 누적 race 회피, retry 동작과 무관하게 일관 fail/success. 후속 plan 의 mode 함수 test 에서도 동일 패턴 권장
- **bootstrapStocks 단독 unit test 생략** — Plan 의 결정 그대로 채택. integration test (runDaily/Backfill/Recover) 에서 호출 횟수 검증으로 충분

## Threat Mitigations

- **T-09-02 (TAMPERING — 부분 응답)** ✅ — daily.ts + backfill.ts 모두 `if (krxRows.length < config.minExpectedRows) throw`. backfill 은 per-day 격리 우회로 전체 중단 (보수적). recover 는 daily 와 동일 정책 (MIN_EXPECTED 검사 X, 빈 응답만 skip — 결측 일자라 부분 데이터도 진전).
- **T-09-03 (TAMPERING — FK orphan)** ✅ — bootstrapStocks 가 fetchBydd 직후 + upsertOhlcv 직전에 호출. is_delisted=true + ON CONFLICT DO NOTHING + ignoreDuplicates:true 로 master-sync 와 쓰기 경쟁 회피.
- **T-09-MODE-01 (DENIAL OF SERVICE — Unknown MODE)** ✅ — Plan 02 config.parseMode 가 throw + dispatch 의 exhaustive `never` check (TS 컴파일 시점).
- **T-09-MODE-02 (TAMPERING — per-day 격리 우회 실패)** ✅ — backfill catch 블록의 `message.includes("KRX 401") || message.includes("MIN_EXPECTED")` 화이트리스트. 둘 다 우회로 전체 중단.

## Known Stubs

None — 본 plan 의 모든 함수는 실제 KRX/Supabase 호출을 수행 (mock 은 테스트에 한정). production 환경에서 `MODE=daily/backfill/recover` 로 즉시 실행 가능. Plan 05 의 Cloud Run Job + Scheduler 배포만 남음.

## Next

Plan 05 — IAM / Deploy / Scheduler. Docker build + Cloud Run Job 등록 + Scheduler cron 설정 + smoke 테스트.

## Self-Check: PASSED

- ✅ Files: `workers/candle-sync/src/modes/{businessDay,bootstrapStocks,daily,backfill,recover}.ts` (5) + `workers/candle-sync/tests/{businessDay,runDaily,runBackfill,runRecover,index}.test.ts` (5) + modified `workers/candle-sync/src/index.ts` + `workers/candle-sync/src/config.ts` 모두 존재 확인
- ✅ Commits: 2f03f0d (Task 1) / f88e65a (Task 2) / 23f9ead (Task 3) / 15645eb (Task 4) `git log --oneline` 확인
- ✅ 전체 vitest 9 files 52 tests passed + typecheck + build PASS
