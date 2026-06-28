---
phase: 12-a-n-master-sync
plan: 01
subsystem: infra
tags: [limit-up, tick-size, vitest, supabase, cloud-run-job, monorepo, shared-types]

# Dependency graph
requires:
  - phase: 11-co-movement
    provides: co-movement-sync 워커 스캐폴드 (package/tsconfig/vitest/Dockerfile/config/logger/index/rebuild/supabase) + comovement.ts 응답 계약 패턴 (1:1 복제 원본)
  - phase: 09-daily-candle-data
    provides: stock_daily_ohlcv (~4M row, 원 정수 close) — limitUpPrice 정수 비교 + 백테스트 source
provides:
  - "limitUpPrice() 호가단위 TS 미러 함수 (RPC limit_up_price() 회귀 대조 기준)"
  - "LimitUpResponse/Event/StockStats/ThemeStat 응답 계약 타입 (객체 형태, webapp·server 공유)"
  - "workers/limit-up-sync 워크스페이스 — rebuild_limit_up RPC 1줄 호출 thin 워커 스캐폴드"
affects: [12-02 limit_up 마이그레이션+RPC, 12-03 server 읽기 라우트, 12-04 webapp 섹션, 12-05 배포]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "호가단위 산출 = floor(prev_close×1.3 / tick(target)) × tick(target), tick 은 target 가격대 7-tier (Pitfall 1)"
    - "응답 계약은 객체({hero,events,themes}) — 배열 아님 (comovement 계약 드리프트 회피)"
    - "thin 워커 = Phase 11 동조 워커 1:1 복제 + RPC명/식별자 교체, 외부 HTTP 0 (자체 DB 집계)"

key-files:
  created:
    - packages/shared/src/limitUp.ts
    - packages/shared/src/limitUp.test.ts
    - workers/limit-up-sync/ (전체 워크스페이스)
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "limitUpPrice tick 판정은 target(prev_close×1.3) 가격대 기준 — prev_close 기준 시 경계 오류 (Pitfall 1)"
  - "응답 계약 객체 형태 {hero,events,themes} 채택 — comovement 의 배열 계약 드리프트 회피"
  - "src/index.ts·src/rebuild.ts 주석의 'co-movement-sync 선례' → 'Phase 11 동조 워커 선례' 로 표현 변경 — verification grep -rn co-movement-sync == 0 게이트 충족 (식별자 누락 복제 회귀 차단)"

patterns-established:
  - "호가단위 TS 미러 + vitest 황금/경계 케이스로 plpgsql RPC 회귀 대조 (Wave 2 RPC 작성 시 SELECT limit_up_price(x)=y 대조)"
  - "확장자 없는 re-export from './limitUp' (Turbopack dev resolve 갭 회피, 10-08 lesson)"

requirements-completed: [LIMIT-01]

# Metrics
duration: ~8min
completed: 2026-06-28
---

# Phase 12 Plan 01: 호가단위 TS 미러 + 응답 계약 + limit-up-sync 워커 스캐폴드 Summary

**KRX 호가단위 상한가 산출 limitUpPrice() TS 미러(황금 6 + 경계 12 케이스 검증) + LimitUpResponse 객체 계약 타입 + Phase 11 동조 워커 1:1 복제로 만든 rebuild_limit_up thin 워커 스캐폴드**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-28T11:04Z (init)
- **Completed:** 2026-06-28T11:12Z
- **Tasks:** 2
- **Files modified/created:** 15 (shared 3 + worker 11 + lockfile 1)

## Accomplishments
- `limitUpPrice(prevClose)` 호가단위 산출 — `floor(prev_close×1.3 / tick(target)) × tick(target)`, 실측 황금 케이스 6종(95500→124100, 297000→386000, 386000→501000 500k경계, 876000→1138000, 60000→78000) + tier 경계(2000/5000/20000/50000/200000/500000) 직하/직상 12종 전부 green
- `LimitUpResponse`(hero/events/themes 객체) + `LimitUpEvent`/`LimitUpStockStats`/`LimitUpThemeStat` 계약 타입을 shared index 에서 export — Wave 2 라우트·Wave 3 섹션이 import 할 단일 계약
- `workers/limit-up-sync` 워크스페이스를 co-movement-sync 1:1 복제로 생성, `rebuild_limit_up` RPC 1줄 호출 구조 — config 4 + rebuild 3 테스트 green
- pnpm-lock.yaml 에 신규 워크스페이스 반영, 모노레포 전체 빌드(`pnpm -r build`, webapp 포함) green

## Task Commits

1. **Task 1: packages/shared 응답 계약 타입 + limitUpPrice() TS 미러 + 황금 케이스 테스트** — `d78401f` (feat)
2. **Task 2: workers/limit-up-sync 워크스페이스 스캐폴드 (co-movement-sync 1:1 복제 + RPC명 교체)** — `23c9d6b` (feat)

_Task 1 은 tdd 지정이나 단일 순수함수라 test+impl 동일 커밋(RED 검증 후 GREEN)으로 원자화._

## Files Created/Modified
- `packages/shared/src/limitUp.ts` - LimitUpResponse/Event/StockStats/ThemeStat 계약 타입 + limitUpPrice() 7-tier 호가단위 미러
- `packages/shared/src/limitUp.test.ts` - 황금 6 + 경계 12 (17 toBe) vitest
- `packages/shared/src/index.ts` - 확장자 없는 re-export 추가
- `workers/limit-up-sync/{package.json,tsconfig.json,vitest.config.ts,Dockerfile}` - 워크스페이스 메타 (co-movement-sync 복제, 경로/name 교체)
- `workers/limit-up-sync/src/{config,logger,index,rebuild}.ts` + `src/services/supabase.ts` - thin 워커 cycle (rebuild_limit_up RPC 1줄)
- `workers/limit-up-sync/tests/{config,rebuild}.test.ts` - config 4 + rebuild 3 케이스
- `pnpm-lock.yaml` - 신규 워크스페이스 반영

## Decisions Made
- **limitUpPrice tick = target 가격대 기준** (prev_close 아님): 386000→501000 같은 500k 경계가 prev_close 기준(>200k bucket=500)이면 틀리고 target(501800≥500k bucket=1000) 기준이어야 정확 (Pitfall 1, RESEARCH §1).
- **응답 계약 객체 형태**: `{ hero, events, themes }` — comovement 의 배열 계약 드리프트를 의도적으로 회피 (PLAN 명시).
- **float 안전**: tick 비교는 tgt 직접, `Math.floor(tgt/unit)*unit` 정수 반환 — RPC numeric 비교와 동형 (Node 로 17 케이스 사전 검산).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 워커 주석의 'co-movement-sync' 문자열이 verification grep 게이트 위반**
- **Found during:** Task 2 (limit-up-sync 스캐폴드)
- **Issue:** `src/index.ts`·`src/rebuild.ts` 의 "co-movement-sync 선례" 주석이 plan `<verification>` 의 `grep -rn "co-movement-sync" workers/limit-up-sync/` == 0 게이트를 위반 (의미상 선례 참조이나 게이트는 literal-0).
- **Fix:** 두 주석을 "Phase 11 동조 워커 선례" 로 표현 변경 (의미 보존, 식별자 누락 복제 회귀 차단 게이트 충족). dist/ 잔존은 gitignore + 재빌드로 해소.
- **Files modified:** workers/limit-up-sync/src/index.ts, workers/limit-up-sync/src/rebuild.ts
- **Verification:** `grep -rn "co-movement-sync" workers/limit-up-sync/` == 0, 재빌드 후 dist 포함 0
- **Committed in:** 23c9d6b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 표현만 변경, 동작·스키마 무영향. Scope creep 없음.

## Issues Encountered
None - 모든 계획 작업이 사전 검산(boundary 17 케이스 Node 검증)으로 일발 통과.

## User Setup Required
None - 외부 서비스 설정 불필요. (rebuild_limit_up RPC 본체는 Wave 2 Plan 02, 배포는 Plan 05.)

## Next Phase Readiness
- **Wave 2 (12-02) 준비됨**: limitUpPrice TS 미러가 plpgsql `limit_up_price()` 회귀 대조 기준 확보 — Plan 02 RPC 작성 시 `SELECT limit_up_price(386000)=501000` 등으로 대조. LimitUpResponse 계약이 Plan 03 라우트·Plan 04 섹션 import 대기.
- **블로커 없음**: limit-up-sync 워커가 rebuild_limit_up 호출 구조로 존재 — Plan 02 가 RPC 본체(마이그레이션)를 채우면 즉시 호출 가능. 배포 스크립트(setup/deploy/smoke)는 Plan 05 책임.

## Self-Check: PASSED

- 생성 파일 전부 존재 (limitUp.ts/test, worker rebuild/config/package 등)
- 커밋 d78401f / 23c9d6b 둘 다 git log 확인

---
*Phase: 12-a-n-master-sync*
*Completed: 2026-06-28*
