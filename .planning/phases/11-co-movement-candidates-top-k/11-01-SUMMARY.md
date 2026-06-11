---
phase: 11-co-movement-candidates-top-k
plan: 01
subsystem: database
tags: [postgres, plpgsql, rpc, supabase, rls, vitest, shared-types, worker-scaffold, comovement]

requires:
  - phase: 09-daily-candle-data
    provides: stock_daily_ohlcv (이벤트 소스 — change_rate 기반 발화일/co-surge)
  - phase: 10-theme-classification
    provides: themes/theme_stocks (테마-풀링 active 멤버 + manual_override/hidden 필터)
provides:
  - COMV-01 REQUIREMENTS 정식 등록 (커버리지 33→34)
  - theme_comovement + cosurge_edges 사전계산 테이블 + rebuild_comovement() plpgsql RPC (마이그레이션 파일, push 미실행)
  - CoMovementCandidate / CoMovementResponse 공유 타입 (server·webapp 계약 단일 소스)
  - computeComovement / 읽기라우트 RED 테스트 (Plan 03 구현 검증 게이트)
  - workers/co-movement-sync 워커 스캐폴드 (candle-sync 1:1 복제, KRX 제거)
affects: [11-02-db-push, 11-03-read-path, 11-04-worker, 11-05-ui]

tech-stack:
  added: []
  patterns:
    - "두 경로 사전계산(theme_comovement 테마-풀링 주 + cosurge_edges 글로벌 co-surge 보조) 무향 정규화 code_a<code_b"
    - "rebuild_comovement() full-rebuild plpgsql (TRUNCATE+INSERT, leave-one-out 발화일 R4, 광역일 일관 제외 R2, co-surge 적격성 JOIN R1)"
    - "co-located 순수함수 단위테스트(src/**/*.test.ts) vitest include 확장 + tsconfig 빌드 제외"

key-files:
  created:
    - supabase/migrations/20260611120000_comovement_tables.sql
    - packages/shared/src/comovement.ts
    - server/src/lib/computeComovement.test.ts
    - server/tests/routes/co-movement.test.ts
    - workers/co-movement-sync/ (package.json/tsconfig/vitest/Dockerfile/config/logger/supabase/config.test)
  modified:
    - .planning/REQUIREMENTS.md
    - packages/shared/src/index.ts
    - server/tests/fixtures/supabase-mock.ts
    - server/vitest.config.ts
    - server/tsconfig.json

key-decisions:
  - "computeComovement.test.ts 를 plan 지정 src/lib 에 co-locate → vitest include 에 src/**/*.test.ts 추가 + tsconfig build 에 동일 패턴 제외 (Rule 3)"
  - "마이그레이션은 파일 작성만, production push 는 Plan 02 [BLOCKING] 책임"

patterns-established:
  - "동조 사전계산 = full-rebuild RPC (TRUNCATE+INSERT) — 야간 1회 워커가 lookback_months 인자로 호출"
  - "신규 공개 read 테이블은 RLS TO anon, authenticated 둘 다 + RPC REVOKE 3줄 (PUBLIC + anon,authenticated + GRANT service_role)"

requirements-completed: [COMV-01]

duration: 8min
completed: 2026-06-11
---

# Phase 11 Plan 01: Co-movement 계약·스키마·테스트 스캐폴드 Summary

**theme_comovement/cosurge_edges 사전계산 테이블 + rebuild_comovement() plpgsql RPC + CoMovement 공유 타입 + fixture 3쌍 RED 테스트 + co-movement-sync 워커 스캐폴드를 한 번에 박제 (인터페이스 우선)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-11T04:45:45Z
- **Completed:** 2026-06-11T04:53:35Z
- **Tasks:** 3
- **Files modified:** 16 (created 11 / modified 5)

## Accomplishments

- COMV-01 을 REQUIREMENTS.md v1 Co-movement 섹션 + Traceability + 커버리지(33→34) 에 정식 등록
- `20260611120000_comovement_tables.sql` — 2 테이블 + idx_ohlcv_surge_bar 부분인덱스 + rebuild_comovement() plpgsql RPC (REVOKE 3줄 + SECURITY DEFINER search_path + RLS anon/authenticated + R1/R2/R4 로직) 작성 (push 미실행)
- `CoMovementCandidate`/`CoMovementResponse` 공유 타입 export + shared build green
- computeComovement(fixture A~H) + 읽기라우트(객체계약/빈상태/k클램프/db-max-rows) RED 테스트 박제 — Plan 03 구현 게이트
- workers/co-movement-sync 스캐폴드 (candle-sync 1:1 복제, axios+KRX 제거, LOOKBACK_MONTHS 추가) 빌드·테스트 green

## Task Commits

1. **Task 1: COMV-01 등록 + 사전계산 마이그레이션 SQL** - `96f53c3` (docs)
2. **Task 2: 공유 타입 + computeComovement/읽기라우트 RED 테스트** - `5074c16` (test)
3. **Task 3: co-movement-sync 워커 스캐폴드** - `b38e67d` (feat)

## Files Created/Modified

- `supabase/migrations/20260611120000_comovement_tables.sql` - theme_comovement + cosurge_edges + 부분인덱스 + rebuild_comovement() RPC + REVOKE/RLS
- `packages/shared/src/comovement.ts` - CoMovementCandidate/CoMovementResponse 타입
- `packages/shared/src/index.ts` - 확장자 없는 type re-export (Turbopack lesson)
- `server/src/lib/computeComovement.test.ts` - 결합점수/타이트니스/dedup/후행/표본배지/앵커가중 (RED)
- `server/tests/routes/co-movement.test.ts` - 객체계약 + 빈상태 + k클램프 + db-max-rows (RED, 404)
- `server/tests/fixtures/supabase-mock.ts` - theme_comovement/cosurge_edges 데이터셋 추가
- `server/vitest.config.ts` - include 에 src/**/*.test.ts 추가 (co-located 단위테스트 수집)
- `server/tsconfig.json` - 빌드에서 src/**/*.test.ts 제외 (vitest 타입 누설 방지)
- `workers/co-movement-sync/*` - 워커 스캐폴드 8 파일 (candle-sync 1:1, KRX 제거)
- `.planning/REQUIREMENTS.md` - COMV-01 등록 + 커버리지 34

## Decisions Made

- **computeComovement.test.ts 위치 vs vitest include 불일치 해소 (Rule 3):** plan 은 테스트를 `server/src/lib/computeComovement.test.ts` 에 co-locate 지정했으나 server vitest `include` 가 `tests/**/*.test.ts` 만 수집해 테스트가 발견되지 않았다(false-RED — Plan 03 구현 후에도 GREEN 전환 불가). `include` 에 `src/**/*.test.ts` 추가로 발견되게 하고, production `tsc` 빌드가 vitest 타입을 끌어오지 않도록 `server/tsconfig.json` exclude 에 동일 패턴 추가. computeTop3 선례는 `tests/lib/` 였으나 plan 의 co-locate 지정을 존중.
- **마이그레이션 push 미실행:** 본 plan 은 파일 작성 + 정적 검증(grep)만. production db push 는 Plan 02 [BLOCKING] 책임 (plan objective 명시).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] computeComovement RED 테스트 미발견 → vitest include + tsconfig 조정**
- **Found during:** Task 2 (공유 타입 + RED 테스트)
- **Issue:** plan 이 `server/src/lib/computeComovement.test.ts` 에 테스트를 두라 지정했으나 server `vitest.config.ts` 의 `include: ["tests/**/*.test.ts"]` 가 src 하위를 수집하지 않아 "No test files found" — Plan 03 구현 후에도 GREEN 전환 불가능한 false-RED.
- **Fix:** `vitest.config.ts` include 에 `src/**/*.test.ts` 추가(테스트 발견), `server/tsconfig.json` exclude 에 `src/**/*.test.ts` 추가(production `tsc` 빌드가 vitest describe/it/expect 타입을 끌어와 실패하는 것 방지).
- **Files modified:** server/vitest.config.ts, server/tsconfig.json
- **Verification:** computeComovement.test.ts 가 RED(소스 미존재로 실패)로 발견됨 + 기존 19 테스트 파일 147 테스트 전부 green 유지 + `pnpm -F @gh-radar/server build` exit 0.
- **Committed in:** 5074c16 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 테스트 인프라가 plan 의 co-locate 의도대로 동작하도록 최소 조정. 스코프 확장 없음 — Plan 03 이 GREEN 전환할 수 있는 진짜 RED 게이트 확보.

## Issues Encountered

- 워크트리에 node_modules 부재로 첫 `pnpm -F @gh-radar/shared build` 가 `tsup: command not found` — `pnpm install` 후 해소 (정상 워크플로, Task 3 의 install step 을 Task 2 빌드 전으로 앞당김).

## Known Stubs

- `workers/co-movement-sync/src/index.ts` / `rebuild.ts` 미작성 — plan 명시대로 Plan 04 가 추가. config/logger/supabase 토대만 박제(빌드·테스트 green, passWithNoTests). 의도된 스캐폴드 stub.
- `computeComovement` / `/api/stocks/:code/co-movement` 라우트 미구현 — RED 테스트만 박제, Plan 03 이 GREEN 구현. 의도된 인터페이스-우선 stub.

## User Setup Required

None - no external service configuration required. (production db push 는 Plan 02 [BLOCKING] 가 사용자 승인 게이트로 수행)

## Next Phase Readiness

- Plan 02 (db push) 가 `20260611120000_comovement_tables.sql` 을 production 에 적용 + fixture sanity 검증 가능.
- Plan 03 (read path) 가 computeComovement.ts + `/api/stocks/:code/co-movement` 라우트를 구현해 RED → GREEN 전환 가능 (공유 타입 + supabase-mock 데이터셋 준비됨).
- Plan 04 (worker) 가 co-movement-sync 에 index.ts/rebuild.ts 추가 가능 (config/logger/supabase 토대 + LOOKBACK_MONTHS 준비됨).
- **블로커 없음.** STATE.md/ROADMAP.md 갱신은 오케스트레이터가 wave 완료 후 수행 (worktree 분리 정책).

---
*Phase: 11-co-movement-candidates-top-k*
*Completed: 2026-06-11*

## Self-Check: PASSED

- All created files verified present (migration SQL, comovement.ts, both RED tests, worker config + test).
- All 3 task commits verified in git log (96f53c3, 5074c16, b38e67d).
