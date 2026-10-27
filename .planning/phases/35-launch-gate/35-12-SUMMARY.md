---
phase: 35-launch-gate
plan: 12
subsystem: database
tags: [shared, supabase, pgtap, rpc, launch-plan, vitest]

requires:
  - phase: 35-launch-gate
    provides: "35-02 launch_gate 마이그레이션 문형(서비스롤 잠금 · 권한 3줄) · 35-03 launchDaysOf/launchRibbonAt · 첨부 196행 픽스처"
provides:
  - "packages/shared/src/launch-plan.ts — 범위 7 계약 타입 13종 · 상수 4 · 순수 함수 5"
  - "public.launch_plan_changes 표(서비스롤 SELECT/INSERT 전용) · launch_plan_change_record(jsonb) · launch_plan_changes_for_admin(integer)"
  - "pgTAP supabase/tests/launch_plan_changes.test.sql 26단언"
affects: [35-13, 35-14, 35-15, 35-16, 35-17, 35-18, 35-19]

actuals:
  tokens: 12200
  tasks: 3
  commits: 6
plan_head_before: 5a81f17400f337fa9599c53a9dc8429a670496c9
plan_head_after: 5f16c547e5d8e24a94049d8339668531f540a02c

tech-stack:
  added: []
  patterns:
    - "계약 핀 — shared LAUNCH_PLAN_CHANGE_COLUMNS(타입 양방향 Exclude 단언) 와 pgTAP 키 집합이 같은 12개 이름"
    - "읽기 RPC = 조합별 row_number ≤ N ∪ DISTINCT ON 마지막 ok → jsonb 1값(왕복 1회)"
    - "pgTAP 에서 service_role 실호출 — SET LOCAL ROLE + DO/PERFORM set_config 로 결과를 GUC 에 넘긴다(pgTAP 임시 표는 service_role 이 못 쓴다)"

key-files:
  created:
    - packages/shared/src/launch-plan.ts
    - packages/shared/src/__tests__/launch-plan.test.ts
    - supabase/migrations/20261028200100_launch_plan_changes.sql
    - supabase/tests/launch_plan_changes.test.sql
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "마이그레이션 이름은 계획 값 그대로 20261028200100_launch_plan_changes.sql (실행 때 tail = 20261027200100 — 더 늦은 파일 없음)"
  - "launchPlanVerdictRows 의 idx 와 validateLaunchPlanDraft 의 badIdx 는 0부터(화면 번호 = +1) · 개수 위반 badIdx -1"
  - "검증 순서는 개수 → 칸마다(정수 → 범위) → 순서 — 앞 칸의 범위 위반이 뒤 칸의 정수 위반보다 먼저"
  - "identity 시퀀스는 anon/authenticated/PUBLIC 에서 걷기만 하고 service_role 에 따로 주지 않는다 — identity nextval 은 표 INSERT 권한으로 돈다(pgTAP 26 이 service_role 실기록으로 증명)"

patterns-established:
  - "이력 표: RLS 켬 · 정책 0 · REVOKE ALL FROM PUBLIC / anon, authenticated, service_role → GRANT SELECT, INSERT TO service_role"

requirements-completed: []

coverage:
  - id: D1
    description: "shared 이력 행 계약(12키)과 DB 기록/읽기 RPC 반환 키가 같다 — 한 행 왕복"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/launch-plan.test.ts#launch-plan 계약"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_plan_changes.test.sql (ok 1~5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "이력 읽기 RPC — 조합별 최근 N + 마지막 ok · 입력 오류 22023/23514 · 서비스롤 전용 권한"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_plan_changes.test.sql (ok 6~26)"
        status: pass
    human_judgment: false
  - id: D3
    description: "shared 편집 검증(D-26 · D-34) · 계획 칸 · 「쐈다면」 판정(D-28)"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/launch-plan.test.ts (validateLaunchPlanDraft · launchPlanEntryOf · launchPlanVerdictRows)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-28
status: complete
---

# Phase 35 Plan 12: 발사 계획 shared 계약 · 변경 이력 표 Summary

**shared `launch-plan.ts`(계획 · 이력 · 저장 · relay 계약 타입, D-34 잠정 한도 검증, 리본 식을 재사용한 「쐈다면」 판정)와 서비스롤 전용 `launch_plan_changes` 표 + 기록/읽기 RPC 2개(조합별 최근 N + 마지막 ok)를 pgTAP 26 · vitest로 고정. 로컬 커밋까지만 했고 push는 하지 않았다(D-35).**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-10-28 00:12 KST
- **Completed:** 2026-10-28 00:20 KST
- **Tasks:** 3 (tracer 1 + auto 2 · TDD RED/GREEN 각 2커밋)
- **Files:** 신설 4 · 수정 1

## Accomplishments

- **계약 핀:** `LAUNCH_PLAN_CHANGE_COLUMNS` 12키 = `LaunchPlanChangeRow` 키(타입 양방향 단언) = 기록 RPC 반환 jsonb 키(pgTAP 1 · 5).
- **이력 표:** `public.launch_plan_changes` — fire · market · outcome CHECK, gateway CHECK/FK 없음, 인덱스 `launch_plan_changes_key_at_idx`, RLS 켬 · 정책 0, service_role SELECT · INSERT만 허용(UPDATE · DELETE 없음), purge 없음.
- **RPC:** `launch_plan_change_record(p jsonb)`는 필수 키 6개와 after_us 배열 여부를 검사하고(22023), 어휘 위반은 CHECK가 그대로 23514로 올린다. `launch_plan_changes_for_admin(p_limit)`은 p_limit을 1~200으로 받고 `{ changes }`를 jsonb 1값으로 돌려준다. 둘 다 SECURITY INVOKER · search_path 고정 · PUBLIC/anon/authenticated 명시 REVOKE.
- **shared 순수 함수:** `validateLaunchPlanDraft`(문구 원문 3종 · U+2212), `launchPlanEntryOf`, `launchPlanVerdictRows`(셀 = `launchRibbonAt`, 첨부 리본 표본 KB120 코스닥 −337 → 5/3/2 교차 확인).

## shared export 목록 (`packages/shared/src/launch-plan.ts` · `index.ts` 재수출)

- 타입: `LaunchPlanProfile` · `LaunchPlanGateway` · `LaunchPlanEntry` · `LaunchPlanServer` · `LaunchPlanChangeRow` · `LaunchPlanResponse` · `LaunchPlanSaveBody` · `LaunchPlanSaveResponse` · `LaunchPlanRelayReadResponse` · `LaunchPlanRelaySetBody` · `LaunchPlanRelaySetResponse` · `LaunchPlanDraftCheck` · `LaunchPlanVerdictRow`
- 상수: `LAUNCH_PLAN_GATEWAYS` · `LAUNCH_PLAN_CHANGE_COLUMNS` · `LAUNCH_PLAN_LIMITS` · `LAUNCH_PLAN_SERVER_MAX_PIECES`
- 함수: `launchPlanProfileOf` · `launchPlanUsText` · `validateLaunchPlanDraft` · `launchPlanEntryOf` · `launchPlanVerdictRows`

## Task Commits

1. **Task 1 (tracer): 이력 한 행 왕복** — RED `c5bd89a6` · GREEN `56319118`
2. **Task 2: 이력 RPC 완성** — RED `d73a1210` · GREEN `c35873dd`
3. **Task 3: shared 순수 함수** — RED `c1b385ff` · GREEN `5f16c547`

## 실제 마이그레이션 파일 이름

`supabase/migrations/20261028200100_launch_plan_changes.sql` — 계획 값 그대로다. 실행 때 `ls supabase/migrations | tail -1` 결과가 `20261027200100_launch_gate_apply.sql`이라 바꿀 이유가 없었다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_plan_changes.test.sql` | 1..26 · not ok 0 · RESULT: PASS (85 migrations 재생) |
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql` (회귀) | 1..60 · RESULT: PASS |
| `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch-plan.test.ts src/__tests__/launch.test.ts --maxWorkers=2` | 2 files · 46 passed |
| `pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2` (전체 회귀) | 24 files · 715 passed · failed 0 |
| `pnpm --filter @gh-radar/shared run typecheck` · `build` | 통과 |
| RED 확인 | Task 1: vitest import 실패 · pgTAP 함수 없음 / Task 2: not ok 9 of 26 / Task 3: vitest import 실패 |

## TDD Gate Compliance

세 태스크 모두 `test(35-12) … (RED)` 커밋이 `feat(35-12) … (GREEN)` 커밋보다 앞서 있다. RED 커밋은 실패를 확인한 뒤에 만들었고, 커밋 파일은 모두 이 플랜의 5경로 안이다.

## Decisions Made

- frontmatter `key-decisions` 참조. 요약하면 idx/badIdx는 0부터 센다. 검증은 개수 → 칸마다(정수 → 범위) → 순서로 보고, identity 시퀀스는 걷기만 한다.

## Deviations from Plan

None - plan executed exactly as written. Task 1의 읽기 RPC는 계획대로 「최근 p_limit 행만」(전역 LIMIT)으로 만들었고, Task 2에서 조합별 N + 마지막 ok로 바꿨다. pgTAP의 service_role 실호출 단언 1건(26번)은 계획 behavior의 「service_role INSERT true」를 권한 조회에 더해 실제 호출로도 보이려고 넣었다.

## Issues Encountered

- pgTAP 안에서 `SELECT set_config(...)`를 쓰면 결과 행이 TAP 출력에 섞였다. `DO $svc$ … PERFORM … $svc$`로 바꿔 출력을 없앴다.

## 운영 메모

- **push 안 함(D-35).** `git log origin/master..master` 에 이 플랜 6커밋이 로컬로만 있다. 원격 `supabase db push` · 배포 없음 — 원격 적용은 35-18(또는 먼저 도는 35-11) 메인 세션.
- 다른 세션의 미커밋 변경(`relay/src/generated/**` · Phase 36 `.gitkeep` · 인박스 261027-account-pnl/openarb · `.planning/milestone.lock`)은 건드리지 않았다.
- `LAUNCH_PLAN_LIMITS`는 잠정값이다. 35-19가 정식 노트와 대조해 이 한 곳만 고친다.

## Next Phase Readiness

- 35-13(server 라우트)은 `LaunchPlanResponse` · `LaunchPlanSaveResponse` · 두 RPC 위에서 바로 구현할 수 있다. 35-14 · 35-15(웹)는 `validateLaunchPlanDraft` · `launchPlanVerdictRows` · `launchPlanEntryOf`를 쓴다.

## Self-Check: PASSED

- FOUND: packages/shared/src/launch-plan.ts · packages/shared/src/__tests__/launch-plan.test.ts · supabase/migrations/20261028200100_launch_plan_changes.sql · supabase/tests/launch_plan_changes.test.sql
- FOUND commits: c5bd89a6 · 56319118 · d73a1210 · c35873dd · c1b385ff · 5f16c547 (모두 HEAD 조상)
