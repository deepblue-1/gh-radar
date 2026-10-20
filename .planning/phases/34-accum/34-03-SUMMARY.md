---
phase: 34-accum
plan: 03
status: complete
subsystem: worker
tags: [limitup-sync, accum_flow, team_flow, backfill, reload-detection, vitest, tracer]

requires:
  - phase: 34-01
    provides: "OPTIONAL_FILES(team_flow chunk 20 · accum_flow chunk 1) · p_expected 10키 · 10/14 accum_flow 6행 픽스처(AF_SHA) · addAccumFlowDay 헬퍼"
  - phase: 34-13
    provides: "shared dist 직렬화 순서(이 플랜이 shared 를 다시 빌드)"
provides:
  - "loadDay 재적재 감지 일반화 — OPTIONAL_FILES 순회 backfillTbls(manifest 에 있는 선택 파일만 이력 rows 와 대조)"
  - "reason `${backfillTbls.join('+')}_backfill` — team_flow_backfill · accum_flow_backfill · team_flow+accum_flow_backfill"
  - "backfill 분기(격자 재업로드 생략 · 실패 시 unpublish 생략) = reason.endsWith('_backfill')"
  - "backfill info 로그 객체 { date, tables: [{ tbl, prev, manifest }] } · 실패 warn `limitup day ${표들} backfill failed — 게시된 날짜는 그대로 둔다(unpublish 없음)`"
  - "shared LimitupLoadRows 에 accum_flow 키"
  - "dispatch 테스트: accum_flow 재적재 감지 5건 · 탐지 0 manifest(addZeroDetectDay) · 동시 backfill · 동시 backfill 실패"
affects: [34-04, 34-10, 34-11]

actuals:
  tokens: 5300
  tasks: 2
  commits: 4
plan_head_before: db079716421c60bbd0e1708d9811ebaf3bad5894
plan_head_after: 2ce50adad409206f2e24fc37f1a97d8b079a3176

tech-stack:
  added: []
  patterns:
    - "선택 파일 목록을 한 번 탐색(optional = OPTIONAL_FILES + manifest entry)해 재적재 감지 · 읽기 · stage 가 같은 배열을 쓴다"
    - "reason 문자열을 표 이름 결합으로 만들어 표 하나일 때 기존 문자열 · 로그 문구가 글자 그대로 유지된다(Pitfall 5)"

key-files:
  created: []
  modified:
    - workers/limitup-sync/src/index.ts
    - workers/limitup-sync/tests/dispatch.test.ts
    - workers/limitup-sync/tests/dispatch-dryrun-totals.test.ts
    - packages/shared/src/limitup-report.ts

key-decisions:
  - "backfill info 로그 객체를 표별 { tbl, prev, manifest } 배열로 바꿨다(플랜 지정 형태) — 옛 team_flow 전용 키(prevTeamFlow · manifestTeamFlow)를 toEqual 로 본 단언 1건만 새 형태로 갱신"
  - "탐지 0 manifest(D-03)는 코드 변경 없이 그대로 적재된다 — 테스트로만 잠금(빈 gzip 읽기 · 격자 0 · 파생 0 · commit 0=0 전부 통과)"

patterns-established:
  - "선택 파일을 더할 때: OPTIONAL_FILES 한 줄 + StageTbl · LimitupLoadRows 키 — 재적재 감지 · reason · backfill 분기는 자동으로 따라온다"

requirements-completed: []

coverage:
  - id: D1
    description: "이력 rows 에 accum_flow 키 없음/0 + 같은 sig + manifest 6 → accum_flow_backfill 재적재 · 격자 업로드 0 · p_expected.accum_flow 6 · rows.accum_flow 6 이면 unchanged · manifest 에 없으면 unchanged · sig 변경이면 files_sig 통째(격자 3)"
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#dispatch — accum_flow 재적재 감지(D-02 · D-04)"
        status: pass
  - id: D2
    description: "탐지 0 거래일 manifest(6표 rows 0 · 격자 0 · team_flow 없음 · accum_flow 6) → loaded · p_expected 10키 정확 비교 · 업로드 0"
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#dispatch — 탐지 0 거래일 manifest(D-03) · 동시 backfill(D-02)"
        status: pass
  - id: D3
    description: "team_flow+accum_flow 동시 backfill reason · 표별 로그 · commit 실패 시 일반화 warn · files_sig null 갱신 0회"
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#dispatch — 탐지 0 거래일 manifest(D-03) · 동시 backfill(D-02)"
        status: pass
  - id: D4
    description: "기존 team_flow 재적재 단언(reason 'team_flow_backfill' · 'limitup day team_flow backfill' 접두 · 실패 warn 원문) 무수정 green · dry-run totals 에 accum_flow 0"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2 (9 files · 124 tests)"
        status: pass

duration: 4min
completed: 2026-10-20
---

# Phase 34 Plan 03: 워커 재적재 감지 일반화 + 탐지 0 manifest 수용 Summary

**limitup-sync 재적재 감지가 team_flow 전용에서 OPTIONAL_FILES 전체로 바뀌었다. 같은 files_sig 라도 manifest 에 있는 선택 파일의 이력 개수가 없거나 다르면 `<표들>_backfill` 사유로 격자 없이 다시 싣고, 실패해도 게시된 날짜를 내리지 않는다. 탐지 0 거래일 manifest 는 코드 변경 없이 그대로 적재되는 것을 테스트로 잠갔다.**

## Performance

- **Duration:** 약 4분(실행 구간 · 사전 읽기 제외)
- **Completed:** 2026-10-20
- **Tasks:** 2 (tracer 1 · auto 1)
- **Files modified:** 4

## Accomplishments

- `index.ts` loadDay
  - `optional = OPTIONAL_FILES.map(o => ({ ...o, entry }))` 을 한 번 만들고, 재적재 감지 · 선택 파일 읽기 · stage 가 이 배열을 함께 쓴다.
  - `backfillTbls`는 manifest 에 있고 `p.rows[tbl] !== entry.rows`(키 없음 포함)인 표들이다. unchanged 조건은 `p?.sig === sig && backfillTbls.length === 0`.
  - reason 은 `new` / `files_sig` / `${backfillTbls.join("+")}_backfill`, backfill 판정은 `reason.endsWith("_backfill")`.
  - info 로그는 `limitup day ${표들} backfill — files_sig 같음 · 개수 불일치(D-02)` 이고 객체는 `{ date, tables: [{ tbl, prev, manifest }] }`. 실패 warn 은 `limitup day ${표들} backfill failed — 게시된 날짜는 그대로 둔다(unpublish 없음)` 로, 표가 하나면 기존 team_flow 문자열과 같다.
  - `TEAM_FLOW_OPTIONAL` 상수는 지웠다. 머리 주석에 Phase 34 D-02 일반화를 적었다.
- `LimitupLoadRows` 에 `"accum_flow"` 를 넣었다.
- 운영 효과(RESEARCH 「재적재 감지 일반화의 운영 효과」)
  - 배포 뒤 첫 run 에서는 manifest 에 accum_flow 가 있는 날짜만 움직인다. 10/20 은 `accum_flow_backfill`, 소급으로 sig 가 바뀐 10/19 는 `files_sig` 다.
  - 나머지 90일은 unchanged 다.

## TDD Gate

### Task 1 (tracer · tdd)
- **RED** `0bd707d0`: 새 describe 「accum_flow 재적재 감지(D-02 · D-04)」 5건을 넣었다. 이 중 2건(키 없음 → 재적재 · 0 → 재적재)이 옛 감지 때문에 실패했다.
  - 증거: `vitest --reporter=junit` 으로 실행해 exit 1, 54건 중 fail 2, `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK (target_test_failed)`. TAP 리포터는 여러 줄 actual 이 들여쓰기 없이 나와 `invalid_record` 로 거부돼서 JUnit 으로 다시 돌렸다.
  - semanticAssessment: target 은 `expect(out.skipped.unchanged).toEqual([])` 에서 `["20261014"]` 를 받고 실패했다. 옛 코드가 team_flow 만 봐서 같은 sig 날짜를 unchanged 로 넘긴 것이고, 계획한 동작 단언이 계획한 이유로 실패한 것이다. 로드 · 픽스처 오류는 없었다.
  - 나머지 3건(rows.accum_flow 6 unchanged · manifest 에 없으면 unchanged · sig 변경 files_sig)은 RED 때도 통과했다. 이 3건은 일반화가 깨면 안 되는 동작을 잠그는 회귀 테스트다.
- **GREEN** `7813bcf0`: 감지 · reason · 로그 · backfill 분기를 일반화했다. limitup-sync typecheck 와 dispatch · load · dryrun-totals 62건이 green.
- **Tracer 게이트**: interactive · end-of-phase 이고 `<verify>` 가 자동이라 다시 돌려 통과했다. 그 뒤 Task 2 로 확장했다.

### Task 2 (auto · tdd)
- **테스트** `a3ff0cf5`: 탐지 0 manifest · 동시 backfill · 동시 backfill 실패 · dry-run totals accum_flow 0.
  - 처음 실행부터 green 이었다. 플랜이 예상한 대로다. D-03 은 「코드 변경 필요 없을 것 — 테스트로 잠근다」 이고, 동시 backfill 은 「Task 1 구현이 이미 만족하면 테스트만 추가」 다.
  - 그래서 이 묶음에는 RED 가 없고, 이미 있는 동작을 잠그는 회귀 테스트다.
- **feat** `2ce50ada`: `LimitupLoadRows` accum_flow. 타입만 넓혔다(Partial Record 확장 · 소비처 server/webapp 영향 없음).
- REFACTOR: 없음.

## Task Commits

1. **Task 1 RED**: `0bd707d0` test(34-03): accum_flow 재적재 감지 실패 테스트
2. **Task 1 GREEN**: `7813bcf0` feat(34-03): 선택 파일 재적재 감지 일반화(accum_flow_backfill)
3. **Task 2 테스트**: `a3ff0cf5` test(34-03): 탐지 0 manifest · 동시 backfill 테스트
4. **Task 2 타입**: `2ce50ada` feat(34-03): LimitupLoadRows accum_flow

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2` → 9 files · 124 tests 통과 · typecheck exit 0
- 플랜이 무수정을 요구한 단언 셋(`reason: "team_flow_backfill"` · `msg.startsWith("limitup day team_flow backfill")` · 실패 warn 원문)은 고치지 않았고 green 이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 충돌] team_flow backfill 로그 객체 단언 1건 갱신**
- **Found during:** Task 1 GREEN
- **Issue:** 플랜은 backfill info 로그 객체를 표별 `{ tbl, prev, manifest }` 배열로 바꾸라고 하면서 「기존 team_flow describe 는 고치지 않는다」 고도 했다. 그런데 기존 테스트 하나가 옛 객체 `{ date, prevTeamFlow, manifestTeamFlow }` 를 `toEqual` 로 정확 비교하고 있어, 두 지시를 함께 지킬 수 없었다.
- **Fix:** 그 한 줄을 `{ date, tables: [{ tbl: "team_flow", prev: null, manifest: 34 }] }` 로 바꿨다. 플랜 acceptance 가 무수정으로 보호한 단언 셋(reason · 메시지 접두 · 실패 warn 원문)은 그대로다.
- **Files modified:** workers/limitup-sync/tests/dispatch.test.ts
- **Commit:** 7813bcf0

---

**Total deviations:** 1 auto-fixed(테스트 단언 형태 1줄)
**Impact on plan:** 없음. 운영 로그 객체 키 이름이 바뀌었다(prevTeamFlow → tables[]). 이 키로 거르는 Cloud Logging 알림이나 쿼리는 저장소에 없다.

## Issues Encountered

- TDD RED 증거 분류기가 vitest `tap-flat` 출력을 `Malformed TAP` 으로 거부했다(여러 줄 actual 이 들여쓰기 없이 나옴). `--reporter=junit --outputFile` 로 다시 실행해 JUnit 어댑터로 `RED_EVIDENCE_OK` 를 받았다. 증거 파일은 저장소 밖 스크래치에 두었고 커밋하지 않았다.

## Next Phase Readiness

- 34-04(다음 wave · shared dist 빌드)가 이어받을 수 있다.
- 배포 뒤 첫 run 로그에서 확인할 것: 10/20 은 `reason: "accum_flow_backfill"`, 10/19 는 소급 뒤 `reason: "files_sig"`(34-11 · 34-10 운영 단계).

## Self-Check: PASSED

- FOUND: workers/limitup-sync/src/index.ts · workers/limitup-sync/tests/dispatch.test.ts · workers/limitup-sync/tests/dispatch-dryrun-totals.test.ts · packages/shared/src/limitup-report.ts
- FOUND commits: 0bd707d0 · 7813bcf0 · a3ff0cf5 · 2ce50ada (git log db079716..HEAD = 4)
