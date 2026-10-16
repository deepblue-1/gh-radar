---
phase: 33-teamflow
plan: 02
subsystem: worker, database, testing, ops
tags: [limitup-sync, supabase, postgres, pgtap, vitest, smoke, teamflow]

# Dependency graph
requires:
  - phase: 33-01
    provides: "limitup_team_flow 표 · commit_day 9번째 쌍(p_expected ? 'team_flow' 일 때만 rows 키) · teamflow_report_for_user · 워커 TEAM_FLOW_FILE 선택 분기 · pgTAP 러너 이미지"
provides:
  - "워커 D-03 재적재 자동 감지 — manifest 에 team_flow 가 있고 이력 rows.team_flow 가 다르면(키 없음 포함) files_sig 같아도 재적재"
  - "limitup day committed 로그 reason(new · files_sig · team_flow_backfill) + backfill 진행 info 한 줄"
  - "shared LimitupLoadRows 키 team_flow"
  - "pgTAP limitup_load J 절(55단언 · plan 218) · teamflow_report.test.sql 신규(28단언) — 실행 통과"
  - "smoke INV-8 limitup_team_flow 행 수 == manifest team_flow rows(없으면 0)"
affects: [33-08, 33-09]

# Actuals (#2632)
actuals:
  tokens: 10400
  tasks: 3
  commits: 4
plan_head_before: e0576b6d55ccb86c25ec241792918c516358976b
plan_head_after: 3fbda39d2d5e3285f122dda4f450e73e3cfe2cda

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "재적재 감지 = files_sig 비교 + 선택 파일 개수 비교(이력 rows 키 유무가 「옛 워커 적재」 신호) — 수동 files_sig NULL 대체"
    - "적재 로그에 재적재 사유(reason) — 배포 직후 대량 재적재를 운영자가 이상으로 오인하지 않게"
    - "pgTAP 확장은 기존 단언 불변 + 끝에 절 추가 · plan(N) 주석에 구성 합계"

key-files:
  created:
    - supabase/tests/teamflow_report.test.sql
  modified:
    - workers/limitup-sync/src/index.ts
    - workers/limitup-sync/tests/helpers/fake-supabase.ts
    - workers/limitup-sync/tests/load.test.ts
    - workers/limitup-sync/tests/dispatch.test.ts
    - packages/shared/src/limitup-report.ts
    - supabase/tests/limitup_load.test.sql
    - scripts/smoke-limitup-sync.sh

key-decisions:
  - "D-03 감지 조건은 `tfEntry !== undefined && p?.rows?.team_flow !== tfEntry.rows` — 이력 rows 는 jsonb 객체의 숫자 값만 남겨 읽고(객체 아니면 null), manifest 에 team_flow 가 없는 날짜는 키 유무와 무관하게 sig 만 본다"
  - "team_flow_backfill 재적재가 업로드 뒤 실패하면 기존 WR-B04 unpublish(files_sig null) 경로를 그대로 탄다 — 격자가 이미 다시 올라갔으므로 같은 규칙이 맞다"
  - "pgTAP 3파일을 로컬 일회용 컨테이너(postgres 17.6.1.104 · 69 마이그레이션 재생)로 실행 — 33-01 마이그레이션 수정 불필요(첫 실행부터 SQL not ok 0)"

patterns-established:
  - "선택 export 파일 재적재 감지: 이력 rows[<tbl>] ≠ manifest rows → 진행 · commit 은 p_expected 에 키가 있을 때만 이력 키를 쓴다(DB 쪽 방어선과 짝)"

requirements-completed: [TEAM-01, TEAM-02]

coverage:
  - id: D1
    description: "워커 재적재 자동 감지(D-03) — 이력 rows 에 team_flow 키 없음/0 + 같은 sig + manifest 34 → 재적재(p_expected.team_flow 34 · reason team_flow_backfill) · 다 실린 날짜 · team_flow 없는 날짜는 unchanged · reason new/files_sig · select 열 rows"
    requirement: TEAM-01
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#dispatch — team_flow 재적재 자동 감지(D-03) (6 it)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2 (108/108) + typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "적재 SQL 실행 검증 — stage CHECK 9값 · team_flow 9번째 쌍(payload 중첩 · double · null) · 날짜 교체 · team_flow 0 · 옛 워커 호출(키 없음 · 그날 비움) · 대조 실패 · purge · statement_timeout 120s 보존 · 열 타입 · PK · 잠금"
    requirement: TEAM-01
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql (218/218)"
        status: pass
    human_judgment: false
  - id: D3
    description: "보고서 RPC 실행 검증 — 게이트 · 이력 0 · dates(0행 commit · 옛 워커 날짜 제외) · 최신 날짜 · 정렬(team_net_val DESC NULLS LAST, isin) · 행 없는 날짜 rows [] · payload 중첩 · 권한 · INVOKER · STABLE + 상한가 보고서 회귀"
    requirement: TEAM-02
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql (28/28)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_report.test.sql (54/54)"
        status: pass
    human_judgment: false
  - id: D4
    description: "스모크 INV-8 — 대상 날짜 limitup_team_flow count == manifest team_flow rows(없으면 0) · 90일 밖 SKIP · manifest 없음 갈래 실패"
    requirement: TEAM-01
    verification:
      - kind: other
        ref: "bash -n scripts/smoke-limitup-sync.sh + grep(inv8_team_flow_rows · manifest_rows \"team_flow.ndjson.gz\" · INV-8) + stub 하네스 5케이스"
        status: pass
    human_judgment: true
    rationale: "라이브 실행(PostgREST · GCS manifest)은 33-08 배포 뒤 몫 — 지금은 문법 · 판정 함수 stub 검증만"
  - id: D5
    description: "PostgREST select 의 rows 열 이름이 실 Supabase 에서 그대로 동작(RESEARCH A5)"
    requirement: TEAM-01
    verification: []
    human_judgment: true
    rationale: "워커 vitest 는 가짜 Supabase 라 못 잡는다 — 33-08 배포 뒤 스모크 INV-1 · INV-3 이 확인"

# Metrics
duration: 8min
completed: 2026-10-16
status: complete
---

# Phase 33 Plan 02: 적재 완성 — 재적재 자동 감지 · pgTAP · 스모크 INV-8 Summary

**limitup-sync 가 이력 `rows.team_flow` ≠ manifest rows(키 없음 포함)이면 files_sig 가 같아도 그 날짜를 다시 싣고(로그 reason team_flow_backfill), 33-01 SQL 전부를 일회용 postgres 컨테이너 pgTAP 300단언(218 + 28 + 회귀 54)으로 실행 검증했으며, 배포 뒤 확인용 스모크 INV-8 을 더했다**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-16T06:36:54Z
- **Completed:** 2026-10-16T06:45:02Z
- **Tasks:** 3 (트레이서 TDD 1 · auto 2)
- **Files modified:** 8

## Accomplishments

- 워커: 이력 select `"date, files_sig, skip_streak, rows"` · `prev` 맵에 숫자 값만 남긴 `rows` · `needTeamFlow` 판정을 unchanged 앞으로 · `reason`(new · files_sig · team_flow_backfill)을 committed 로그에 · backfill 진행 info 한 줄 · 파이프라인 머리 주석에 D-03 규칙
- 오늘 밤 옛 워커가 team_flow 없이 다시 싣는 12일(재기록 11일 + 10/16)은 새 워커 첫 run 에서 자동으로 다시 실리고, 그 뒤 run 은 unchanged — 프로덕션 수동 UPDATE/INSERT 없음(D-15)
- pgTAP: `limitup_load.test.sql` J 절 55단언(plan 163 → 218) · `teamflow_report.test.sql` 신규 28단언 · `limitup_report.test.sql` 회귀 54 — 셋 다 exit 0 · `not ok` 0
- 스모크: `inv8_team_flow_rows` · INV-8 실행 절(90일 밖 SKIP) · manifest 없음 갈래 실패 수 +1

## Task Commits

1. **Task 1 (tracer · TDD) RED: 재적재 감지 실패 테스트** - `ebcb359d` (test)
2. **Task 1 (tracer · TDD) GREEN: needTeamFlow 감지 · reason 로그 · shared 키** - `acff5a94` (feat)
3. **Task 2: pgTAP 적재 확장 + 보고서 RPC 신규** - `ce2c9799` (test)
4. **Task 3: 스모크 INV-8** - `3fbda39d` (feat)

**Plan metadata:** 이 SUMMARY 와 STATE/ROADMAP/REQUIREMENTS 의 docs 커밋

## TDD Gate (Task 1)

- **RED:** `dispatch — team_flow 재적재 자동 감지(D-03)` 6 it 중 4개가 계획한 단언에서 실패(target: 「이력 rows 에 team_flow 키 없음 + 같은 sig + manifest team_flow 34 → 재적재 …」 — expected `loaded [20261014]`, actual `skipped.unchanged [20261014]`) · 나머지 2개(다 실린 날짜 unchanged · team_flow 없는 날짜 unchanged)는 현 동작을 잠그는 회귀 가드라 처음부터 통과 · load.test 의 select 열 단언 1개 실패.
  - 분류기: vitest `tap-flat` 리포터는 여러 줄 diff 문자열을 들여쓰기 없이 내보내 `invalid_record`(Malformed TAP) — 리포터 비호환이라 같은 대상을 `--reporter=junit` 으로 다시 돌려 `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK (target_test_failed · matched_test 일치)**.
  - semanticAssessment: 대상 테스트가 실제로 실행돼 계획한 행동 단언(loaded/unchanged)에서 실패했다. 문법 · 로드 · 픽스처 오류 없음.
- **GREEN:** `index.ts` 변경 후 워커 전체 108/108 · typecheck exit 0.
- **REFACTOR:** 없음(GREEN 이 최소 변경).
- **Tracer gate:** HUMAN_VERIFY_MODE=end-of-phase · verify 자동만 → verify 재실행 통과 → 확장 진행.

## Files Created/Modified

- `workers/limitup-sync/src/index.ts` - 이력 rows 읽기 · loadRowsOf · needTeamFlow · reason · backfill 로그 · 주석
- `workers/limitup-sync/tests/dispatch.test.ts` - describe 「team_flow 재적재 자동 감지(D-03)」 6 it(기존 addTeamFlowDay 재사용)
- `workers/limitup-sync/tests/helpers/fake-supabase.ts` - `LoadRow.rows?: Record<string, number> | null`
- `workers/limitup-sync/tests/load.test.ts` - select 열 단언
- `packages/shared/src/limitup-report.ts` - `LimitupLoadRows` 키 `team_flow`
- `supabase/tests/limitup_load.test.sql` - J 절 · plan 218 · 머리 주석
- `supabase/tests/teamflow_report.test.sql` - 신규
- `scripts/smoke-limitup-sync.sh` - INV-8

## Decisions Made

- 감지 조건 · 이력 rows 파싱 규칙 · WR-B04 unpublish 경로 재사용(frontmatter key-decisions).
- 알림 정책 문서(`ops/alert-limitup-sync-failure.yaml`)는 바꾸지 않음 — 플랜 결정대로. team_flow 행 수 불일치도 기존 「그 날짜 실패 → 종료 1」 경로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pgTAP J⑦ 준비가 H 절의 남은 stage 와 충돌**
- **Found during:** Task 2 첫 실행
- **Issue:** H 절이 일부러 남겨 둔 d89 의 「commit 뒤 남은 stage」 entries 1행 때문에 J⑦ 의 d89 team_flow commit 이 `entries stage 1 expected 0` 으로 멈춤(테스트 픽스처 문제 · SQL 결함 아님).
- **Fix:** J⑦ 준비 앞에 `limitup_stage_clear(d91 · d89)` 두 줄(주석으로 사유).
- **Files modified:** supabase/tests/limitup_load.test.sql
- **Verification:** 재실행 218/218
- **Committed in:** ce2c9799

**2. [범위 메모] RED 증거 리포터**
- vitest TAP 출력이 분류기에 malformed 로 읽혀 JUnit 리포터로 같은 대상을 다시 캡처(위 TDD Gate). 증거 기록 파일은 임시로 만들고 지웠다(저장소에 남기지 않음).

---

**Total deviations:** 1 auto-fixed (Rule 1 테스트 픽스처) + 1 범위 메모
**Impact on plan:** 33-01 마이그레이션 수정 0 · 범위 확장 없음.

## Verification

- Task 1: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2` → exit 0 · 108/108
- Task 2: `bash scripts/verify-dma-orders-price-check.sh --test …` — limitup_load 218/218 · teamflow_report 28/28 · limitup_report 54/54 (모두 `# RESULT: PASS` · 69 마이그레이션 재생)
- Task 3: `bash -n` exit 0 · grep 3종 통과 · `grep -c INV-8` = 6 · `git diff --stat` 이 그 파일 하나 · stub 하네스(34/34 PASS · 34/0 FAIL · 없음/0 PASS · 없음/5 FAIL · 34/? FAIL)
- acceptance grep 전부 통과(`select("date, files_sig, skip_streak, rows")` · team_flow_backfill · needTeamFlow · LoadRow.rows · shared "team_flow" · limitup_team_flow 25회 · statement_timeout=120s · plan(163) 없음 · has_function_privilege)

## 검증 공백

- **pgTAP:** 실행됨(공백 아님) — 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 로컬 보유.
- **라이브:** INV-8 · PostgREST `rows` 열 select(A5)는 33-08 배포 뒤 스모크에서 확인(지금은 배포 · 원격 접촉 금지).

## Issues Encountered

None

## User Setup Required

None

## Next Phase Readiness

- Ready for 33-03 이후(웹 확장) — 적재 · SQL 계약은 실행 검증으로 잠김.
- 33-08 배포 뒤 `bash scripts/smoke-limitup-sync.sh --date 20261014` 가 team_flow 개수까지 대조 · 첫 run 로그에서 reason team_flow_backfill 12건 예상.

---
*Phase: 33-teamflow*
*Completed: 2026-10-16*

## Self-Check: PASSED

- 파일 4개 존재(teamflow_report.test.sql · index.ts · smoke-limitup-sync.sh · limitup_load.test.sql)
- 커밋 ebcb359d · acff5a94 · ce2c9799 · 3fbda39d 모두 HEAD 조상
