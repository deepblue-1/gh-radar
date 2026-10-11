---
phase: 09-daily-candle-data
plan: 02
subsystem: infra

tags: [pnpm-workspace, candle-sync, worker-scaffold, dockerfile, pino, supabase, vitest]

# Dependency graph
requires:
  - phase: 09-daily-candle-data
    provides: stock_daily_ohlcv 마이그레이션 SQL + shared 타입 (Plan 01)
provides:
  - "@gh-radar/candle-sync 워크스페이스 — pnpm-workspace.yaml workers/* 패턴으로 자동 등록"
  - "src/config.ts loadConfig() — KRX_AUTH_KEY/SUPABASE_* 필수 검증 + MODE/BACKFILL_*/RECOVER_* env 노출"
  - "src/logger.ts — pino + redact (*.krxAuthKey, *.supabaseServiceRoleKey)"
  - "src/retry.ts withRetry — 3회 exponential backoff (200·400ms), master-sync 시그니처 동일"
  - "src/services/supabase.ts createSupabaseClient — service_role 클라이언트"
  - "src/index.ts placeholder — Plan 04 의 MODE dispatch 가 채울 entry"
  - "Dockerfile 멀티스테이지 (builder + production) + GIT_SHA build-arg + alpine 22"
affects: ["09-03-krx-client-and-pipeline", "09-04-modes-and-entry", "09-05-iam-deploy-scheduler"]

# Tech tracking
tech-stack:
  added: ["pino@9", "@supabase/supabase-js@2.49", "axios@1.7", "dotenv@16.4 (in candle-sync)"]
  patterns:
    - "Worker scaffold = master-sync 패턴 1:1 mirror"
    - "vitest passWithNoTests:true 옵션 — placeholder 워크스페이스에서 exit 0 보장"
    - "config.ts 의 krxBaseUrl default 직접 잠금 (master-sync = openapi.krx.co.kr/svc, candle-sync = data-dbg.krx.co.kr/svc/apis)"

key-files:
  created:
    - "workers/candle-sync/package.json"
    - "workers/candle-sync/tsconfig.json"
    - "workers/candle-sync/vitest.config.ts"
    - "workers/candle-sync/Dockerfile"
    - "workers/candle-sync/src/config.ts"
    - "workers/candle-sync/src/logger.ts"
    - "workers/candle-sync/src/retry.ts"
    - "workers/candle-sync/src/services/supabase.ts"
    - "workers/candle-sync/src/index.ts"
  modified:
    - "pnpm-lock.yaml (candle-sync 의존성 entry)"

key-decisions:
  - "vitest passWithNoTests:true — Plan 02 는 placeholder 만 작성, Plan 03/04 가 실제 테스트 추가 시 자연스럽게 제거 가능"
  - "krxBaseUrl default = data-dbg.krx.co.kr/svc/apis (master-sync = openapi.krx.co.kr/svc 와 의도적 차이) — RESEARCH §1.1 production 검증된 URL 직접 잠금"
  - "candle-sync 신규 env: MODE/BACKFILL_FROM/BACKFILL_TO/RECOVER_LOOKBACK/RECOVER_THRESHOLD/RECOVER_MAX_CALLS/MIN_EXPECTED_ROWS"
  - "src/index.ts 는 stub — Plan 04 의 runBackfill/runDaily/runRecover dispatch 가 채움"

patterns-established:
  - "Worker scaffold mirror: package.json + tsconfig + vitest.config + Dockerfile + src/{config,logger,retry,services/supabase}.ts 6 file set"
  - "Env 입력 검증: parseMode (enum) + parseNumberEnv (numeric) 헬퍼 — invalid 시 즉시 throw"

requirements-completed: [DATA-01]

# Metrics
duration: 3min
completed: 2026-05-11
---

# Phase 09 Plan 02: Worker Scaffold Summary

**candle-sync 워크스페이스 1:1 mirror of master-sync — 인프라 4종 (config/logger/retry/supabase) + Dockerfile + placeholder entry, typecheck/test/build 3종 PASS**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-11T07:30:16Z
- **Completed:** 2026-05-11T07:32:57Z
- **Tasks:** 2 / 2
- **Files modified:** 9 (8 created + 1 lockfile)

## Accomplishments

- `@gh-radar/candle-sync` 워크스페이스 등록 — `pnpm -F @gh-radar/candle-sync ...` 호출 가능
- master-sync 패턴 1:1 mirror — 동일한 의존성 / tsconfig / vitest / Dockerfile 구조
- candle-sync 신규 config 노출 — Plan 04 의 MODE dispatch + recover guard 가 import 할 수 있는 7개 신규 env field
- typecheck + test + build 3종 모두 PASS — Plan 03/04 가 본 plan 의 산출물 위에 즉시 빌드 가능

## Task Commits

각 task 는 원자적으로 커밋:

1. **Task 1: 워크스페이스 등록 + 의존성 설치** — `37036cc` (chore)
   - workers/candle-sync/package.json + tsconfig.json + vitest.config.ts 생성
   - pnpm install — lockfile candle-sync entry 추가
2. **Task 2: 인프라 4종 + Dockerfile + placeholder entry** — `1b22aee` (feat)
   - src/{config,logger,retry,services/supabase,index}.ts + Dockerfile 생성
   - typecheck PASS, test PASS (0 tests, exit 0), build PASS (dist/index.js 생성)

## Files Created/Modified

- `workers/candle-sync/package.json` — @gh-radar/candle-sync 워크스페이스 정의 (axios/supabase-js/pino/dotenv + tsx/vitest)
- `workers/candle-sync/tsconfig.json` — ../../tsconfig.base.json extends (commonjs/node)
- `workers/candle-sync/vitest.config.ts` — globals:true + passWithNoTests:true
- `workers/candle-sync/Dockerfile` — 멀티스테이지 (builder + production) + GIT_SHA arg
- `workers/candle-sync/src/config.ts` — Mode 타입 + Config + loadConfig() with parseMode/parseNumberEnv 헬퍼
- `workers/candle-sync/src/logger.ts` — pino + redact (krxAuthKey/supabaseServiceRoleKey)
- `workers/candle-sync/src/retry.ts` — withRetry<T> 3회 exponential backoff
- `workers/candle-sync/src/services/supabase.ts` — createSupabaseClient(config)
- `workers/candle-sync/src/index.ts` — placeholder (Plan 04 가 MODE dispatch 채움)
- `pnpm-lock.yaml` — candle-sync 의존성 entry 추가 (다른 워크스페이스 영향 없음)

## Decisions Made

- **vitest passWithNoTests:true 추가** — placeholder 워크스페이스에서 vitest 가 exit 1 하는 것을 회피. Plan 03/04 가 테스트 추가 시 자연스럽게 제거하거나 유지 가능. master-sync 는 실제 테스트가 있어 옵션 불필요.
- **krxBaseUrl default = `data-dbg.krx.co.kr/svc/apis`** — master-sync 의 `openapi.krx.co.kr/svc` 와 의도적 차이. RESEARCH §1.1 에서 production 검증된 URL 직접 잠금 결정.
- **src/index.ts 는 stub** — `loadConfig()` 호출 후 log + exit 0. 실제 runBackfill/runDaily/runRecover dispatch 는 Plan 04 가 구현.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest `passWithNoTests:true` 옵션 추가**

- **Found during:** Task 2 verification (`pnpm -F @gh-radar/candle-sync test --run`)
- **Issue:** Plan 의 acceptance criteria 는 "zero test 라도 vitest 가 0 으로 종료" 라고 명시했으나, vitest 의 기본 동작은 "No test files found, exiting with code 1" — exit 1. test 검증이 PASS 하려면 옵션 추가 필요.
- **Fix:** `workers/candle-sync/vitest.config.ts` 에 `passWithNoTests: true` 추가. master-sync 는 실제 테스트가 있어 옵션 불필요했지만, candle-sync 는 placeholder 단계라 필요.
- **Files modified:** workers/candle-sync/vitest.config.ts
- **Verification:** `pnpm -F @gh-radar/candle-sync test --run` 재실행 → `exiting with code 0` 확인
- **Committed in:** `1b22aee` (Task 2 commit — vitest.config.ts 가 Task 2 의 일부로 통합)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** test acceptance criteria 충족 위한 필수 수정. Plan 03/04 가 실제 테스트 추가 시 옵션 유지/제거 자유 선택 가능. No scope creep.

## Issues Encountered

- 없음. master-sync 미러 패턴이 매끄럽게 작동.

## Threat Model Verification

| Threat ID | Mitigation 적용 |
|-----------|-----------------|
| T-09-SCAF-01 (INFO DISCLOSURE — logger redact) | ✅ `*.krxAuthKey`, `*.supabaseServiceRoleKey` 명시 redact (master-sync 패턴) |
| T-09-SCAF-02 (TAMPERING — env mismatch) | ✅ parseMode() unknown MODE 시 throw, parseNumberEnv() invalid numeric 시 throw |
| T-09-SCAF-03 (INFO DISCLOSURE — Dockerfile secret leak) | ✅ Dockerfile 에 env/secret 정의 없음. build context 에 .env 미포함. Plan 05 가 Cloud Run secret 마운트 |

## User Setup Required

없음 — 본 plan 은 scaffold 만 (외부 서비스 설정 불필요). Plan 05 (deploy) 가 Cloud Run + Secret Manager + Scheduler 설정.

## Next Phase Readiness

- Plan 03 (KRX 클라이언트 + 파이프라인) 가 본 plan 의 src/{config,logger,retry,services/supabase}.ts 를 import 가능
- Plan 04 (MODE dispatch) 가 본 plan 의 placeholder src/index.ts 를 대체
- Dockerfile build 자체는 본 plan 에서 검증하지 않음 — Plan 05 가 첫 Cloud Build 실행

## Self-Check: PASSED

검증 항목:
- workers/candle-sync/package.json — FOUND
- workers/candle-sync/tsconfig.json — FOUND
- workers/candle-sync/vitest.config.ts — FOUND
- workers/candle-sync/Dockerfile — FOUND
- workers/candle-sync/src/config.ts — FOUND
- workers/candle-sync/src/logger.ts — FOUND
- workers/candle-sync/src/retry.ts — FOUND
- workers/candle-sync/src/services/supabase.ts — FOUND
- workers/candle-sync/src/index.ts — FOUND
- commit `37036cc` (Task 1) — FOUND
- commit `1b22aee` (Task 2) — FOUND
- `pnpm -F @gh-radar/candle-sync typecheck` — exit 0
- `pnpm -F @gh-radar/candle-sync test --run` — exit 0
- `pnpm -F @gh-radar/candle-sync build` — exit 0 (dist/index.js 생성됨)

---
*Phase: 09-daily-candle-data*
*Plan: 02 — worker-scaffold*
*Completed: 2026-05-11*
