---
phase: 34-accum
plan: 05
status: complete
subsystem: database
tags: [postgres, supabase, pgtap, limitup-sync, accum_flow, rpc, smoke, tracer]

requires:
  - phase: 34-01
    provides: "limitup_accum_flow 표 · stage CHECK 10값 · commit_day 10번째 쌍 · purge accum_flow · accum_report_for_user · accum_detail_for_user"
  - phase: 34-03
    provides: "탐지 0 거래일 manifest 적재(워커 단위 테스트) — 이 플랜은 SQL 쪽 D-03 교차를 잠금"
provides:
  - "supabase/tests/accum_report.test.sql — 목록/상세 RPC 게이트 · 이력 0 · dates/최신/행 없는 날 · 정렬 · 37열 · payload 제외 · 상세 row/null · 권한 · RLS · D-03 날짜 교차 (52단언)"
  - "supabase/tests/limitup_load.test.sql 섹션 K — accum_flow 적재 · 옛 워커 호환 · 교체 · 원자성 · purge · timeout · 열 타입 · PK · 잠금 (53단언 · plan 218 → 271)"
  - "scripts/smoke-limitup-sync.sh INV-9 — 대상 날짜 limitup_accum_flow 행 수 == manifest accum_flow.ndjson.gz rows(없으면 0)"
affects: [34-11]

actuals:
  tokens: 9000
  tasks: 3
  commits: 3
plan_head_before: afef1fe51fb0ac3e6b3a0047ec97c42602996272
plan_head_after: 2b9fb034f9f54d88cd0176c960894f5c3b2d49ec

tech-stack:
  added: []
  patterns:
    - "목록 RPC 응답의 키 집합을 information_schema 열 목록(− payload)과 직접 비교 — 열이 늘거나 payload 가 새면 바로 깨진다"
    - "D-03 교차는 탐지 0 날짜 1개를 세 보고서 RPC 에 동시에 물어 「매집감지 · 상한가 = 뜸 / 팀 매집 = 안 뜸」 을 한 파일에서 잠금"

key-files:
  created:
    - supabase/tests/accum_report.test.sql
  modified:
    - supabase/tests/limitup_load.test.sql
    - scripts/smoke-limitup-sync.sh

key-decisions:
  - "D-03 팀 매집 단언을 「dates 에 20261015 없음」 대신 「dates = [20261014]」 로 강화 — 20261014 에 team_flow 1행을 함께 적재해 빈 배열로 우연히 통과하지 않게 했다"
  - "마이그레이션 결함 없음 — 34-01 마이그레이션 2개를 수정하지 않았다"

patterns-established:
  - "새 limitup 표를 더할 때 limitup_load pgTAP 에 J/K 동형 절(CHECK · 적재 · 옛 워커 키 없음 · 교체 · 원자성 · purge · timeout · 타입 · 잠금)을 하나 더한다"

requirements-completed: []

coverage:
  - id: D1
    description: "accum_report_for_user · accum_detail_for_user — 게이트 · 이력 0 · dates/최신/행 없는 날 · 정렬 · 목록 37열 · payload 없음 · 상세 payload/row null · 권한 · SECURITY INVOKER · STABLE · RLS 정책 0"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/accum_report.test.sql (ok 52/52)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-03 탐지 0 거래일 — 매집감지 dates · 상한가 dates(loaded · entries []) 에 있고 팀 매집 dates 에 없음"
    verification:
      - kind: integration
        ref: "supabase/tests/accum_report.test.sql ⑧ (ok 49~52)"
        status: pass
    human_judgment: false
  - id: D3
    description: "limitup_load 섹션 K — accum_flow 적재 · 옛 워커 호환(rows 키 8개 · J⑤ 무수정) · 교체 · 원자성 · purge · timeout · 열 타입 · 잠금"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql (ok 271/271)"
        status: pass
      - kind: integration
        ref: "teamflow_report.test.sql ok 28/28 · limitup_report.test.sql ok 54/54 (무수정)"
        status: pass
    human_judgment: false
  - id: D4
    description: "스모크 INV-9 — limitup_accum_flow 행 수 == manifest accum_flow rows · 보존 창 밖 SKIP · manifest 없음 FAIL"
    verification:
      - kind: other
        ref: "bash -n scripts/smoke-limitup-sync.sh + grep 6건"
        status: pass
    human_judgment: true
    rationale: "구문 · 문자열만 확인 — 실 DB/GCS 대상 실행은 34-11 메인 세션 몫"

duration: 4min
completed: 2026-10-20
---

# Phase 34 Plan 05: 매집감지 SQL 회귀 + 스모크 INV-9 Summary

**34-01 마이그레이션 2개를 로컬 일회용 컨테이너 pgTAP 으로 끝까지 실행 검증했다. 새 보고서 RPC 테스트 52단언과 limitup_load 섹션 K 53단언을 더했고, 기존 SQL 회귀 3파일은 수정 없이 green 이다. 라이브 스모크에는 INV-9(accum_flow 행 수 == manifest)를 더했다.**

## Performance

- **Duration:** 약 4분(측정 시작 이후)
- **Completed:** 2026-10-20T13:46Z
- **Tasks:** 3 (tracer 1 · auto 2)
- **Files modified:** 3 (신규 1 · 수정 2)

## pgTAP 결과 (모두 실행됨 — 77 마이그레이션 재생 · 원격 접촉 0)

| 파일 | ok | not ok | 계획 |
|------|----|--------|------|
| supabase/tests/accum_report.test.sql (신규) | 52 | 0 | 1..52 |
| supabase/tests/limitup_load.test.sql (섹션 K 추가) | 271 | 0 | 1..271 |
| supabase/tests/teamflow_report.test.sql (무수정) | 28 | 0 | 1..28 |
| supabase/tests/limitup_report.test.sql (무수정) | 54 | 0 | 1..54 |

컨테이너는 한 번에 하나씩 순차로 돌렸다. 러너 trap 이 지워서 남은 컨테이너는 0개다.

## Accomplishments

- **accum_report.test.sql** (①~⑧)
  - ① 게이트: U3 · NULL 사용자는 두 RPC 모두 `{"access": false}` 를 받는다.
  - ② 이력 0: 목록은 빈 모양, 상세는 `{access:true, row:null}` 이다.
  - ③ dates 는 내림차순이고 p_date 가 없으면 최신 날짜다. 정렬은 state 3 이 pos 최대여도 뒤로 가고, pos DESC NULLS LAST 다음 isin 순이다.
  - ④ 목록 행
    - 어느 행에도 payload 키가 없고 키 수는 37이다.
    - 키 집합이 표 열(payload 제외)과 같다.
    - last_rate 는 `29.78` 숫자, since_date 는 `"20261009"` 문자열이다.
  - ⑤ 행 없는 날짜는 `rows []` 이고 dates 는 그대로다.
  - ⑥ 상세
    - row 에 payload 객체가 있고 키 수는 38이다.
    - 없는 isin 이나 다른 날짜는 `row: null` 이다.
  - ⑦ 권한
    - EXECUTE 는 anon · authenticated 둘 다 불가, service_role 만 가능하다(6단언).
    - 두 함수 모두 prosecdef false · STABLE 이다.
    - RLS 가 켜져 있고 정책은 0개이며, anon/authenticated 는 SELECT 할 수 없다.
  - ⑧ D-03: 탐지 0 날짜 20261015 를 세 RPC 에 물었다.
    - 매집감지 dates 에 있다.
    - 상한가 보고서 dates 에도 있다(loaded true · entries []).
    - 팀 매집 dates 는 `["20261014"]` 뿐이다.
- **limitup_load 섹션 K** (K①~K⑩)
  - CHECK 10값을 확인했다(목록 밖 tbl 은 23514).
  - 2행 적재에서 payload 중첩 · double · since_date 문자열 · null 열과 name 키가 없는 경우를 확인했다.
  - 이력 키를 확인했다.
  - 옛 워커 호출을 확인했다: 그날 행을 비우고, 키가 없고, rows 키는 8개다.
  - 재적재 2→1 과 대조 실패 원자성을 확인했다(기존 행 · 이력 · stage 그대로).
  - purge 는 d91 을 지우고 d89 를 남기며 `deleted.accum_flow=1` 이다.
  - timeout 120s 와 열 타입 11개 · PK 를 확인했다.
  - 잠금 10단언을 넣었다.
- **스모크 INV-9**
  - `inv9_accum_flow_rows` 를 추가했다.
  - 보존 창 밖이면 SKIP, manifest 가 없으면 FAIL 목록에 `"INV-9 manifest"` 를 넣는다(FAIL +4).
  - 머리 주석과 사용법을 INV-1~9 로 바꿨다.

## Task Commits

1. **Task 1 (tracer): 보고서 RPC pgTAP** - `ee24a973` (test)
2. **Task 2: limitup_load 섹션 K** - `8dd21bc9` (test)
3. **Task 3: 스모크 INV-9** - `2b9fb034` (feat)

## Files Created/Modified
- `supabase/tests/accum_report.test.sql` — 새 RPC pgTAP 52단언
- `supabase/tests/limitup_load.test.sql` — 머리 주석에 Phase 34 줄 · 섹션 K · plan 218 → 271
- `scripts/smoke-limitup-sync.sh` — INV-9 함수 · 분기 · 주석

## Decisions Made
- D-03 팀 매집 쪽 단언은 「없음」만 보면 빈 배열로도 통과한다. 그래서 20261014 에 team_flow 1행을 함께 적재하고 `dates = ["20261014"]` 와 정확히 같은지 비교했다.
- 상한가 보고서 탐지 0 날짜 단언에는 dates 포함 여부와 함께 `loaded: true · day.entries: []` 를 넣었다. 빈 날 문구가 이 값에서 나온다.

## Deviations from Plan

None - plan executed exactly as written. pgTAP 이 마이그레이션 결함을 드러내지 않아 34-01 마이그레이션은 고치지 않았다. 단언 수(52 · 53)는 플랜이 정하지 않고 「실제 단언 수와 같게」 라고 했으므로 실측값을 그대로 썼다.

## Issues Encountered
None.

## Known Stubs
None.

## User Setup Required
None. 스모크 INV-9 의 실 실행(실 DB · GCS)은 34-11 메인 세션이 맡는다.

## Next Phase Readiness
- 34-11 원격 push 전 조건인 「SQL 본문 1회 실행」 을 충족했다. pgTAP 4파일 모두 green 이다.
- 34-11 에서 limitup-sync 를 배포한 뒤 `bash scripts/smoke-limitup-sync.sh` 를 돌리면 INV-9 가 함께 돈다.

## Self-Check: PASSED
- FOUND: supabase/tests/accum_report.test.sql · supabase/tests/limitup_load.test.sql · scripts/smoke-limitup-sync.sh
- FOUND commits: ee24a973 · 8dd21bc9 · 2b9fb034 (rev-list afef1fe5..HEAD = 3)
