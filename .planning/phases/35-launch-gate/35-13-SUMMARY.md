---
phase: 35-launch-gate
plan: 13
subsystem: api
tags: [server, express, relay-admin, supabase-rpc, launch-plan, vitest, supertest]

requires:
  - phase: 35-launch-gate
    provides: "35-12 shared launch-plan 계약(LaunchPlanServer · LaunchPlanResponse · LaunchPlanSaveResponse · LaunchPlanRelay* · LAUNCH_PLAN_GATEWAYS · LAUNCH_PLAN_SERVER_MAX_PIECES · launchPlanProfileOf) · RPC launch_plan_change_record / launch_plan_changes_for_admin"
provides:
  - "GET /api/admin/launch/plan — relay 계획 조회 ‖ 이력 RPC → LaunchPlanResponse (relay 실패는 offline 200)"
  - "PUT /api/admin/launch/plan/:gateway/:fire/:market — relay 저장 → 이력 1행(실패 포함) → LaunchPlanSaveResponse · 감사 줄"
  - "RelayAdminClient.launchPlans · setLaunchPlan · RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS(6초) — 35-17 relay HTTP 계약 고정"
  - "가짜 relay 기본 응답 GET/PUT launch-plan · LAUNCH_PLAN_DEFAULT"
affects: [35-14, 35-15, 35-17]

actuals:
  tokens: 10650
  tasks: 2
  commits: 4
plan_head_before: a2a3671d2fa493971ddb6976a15499cdad5a4311
plan_head_after: 904813b478f8a5c2897c5db440771af61f71aa85

tech-stack:
  added: []
  patterns:
    - "relay 의존 조회는 throw 없이 서버별 offline 으로 접는다(orderEndpoints 결) — 로그에는 op · status · 접은 서버 키만"
    - "쓰기 시도 이력은 relay 결과와 무관하게 1행 · 기록 실패는 응답을 바꾸지 않고 logger.error"

key-files:
  created: []
  modified:
    - server/src/services/relay-admin-client.ts
    - server/src/services/admin-launch.ts
    - server/src/schemas/admin-launch.ts
    - server/src/routes/admin-launch.ts
    - server/tests/fixtures/fake-relay-admin.ts
    - server/tests/routes/admin-launch.test.ts

key-decisions:
  - "relay 서버 값 검사: ok=entries 배열 · failed=code number + message string · offline/timeout/skipped=message 없음|string — 그 밖 · 누락 서버는 그 서버만 offline(RELAY_FAILED_MESSAGE)"
  - "relay 클라이언트 미설정은 offline + 「relay 연결이 설정되지 않았어요」(RELAY_NOT_CONFIGURED_MESSAGE) · warn 로그 없음(설정 상태라 요청마다 찍지 않는다)"
  - "PUT relay 응답 모양 위반 = 200 이 아님 · result.server ≠ gateway · outcome 어휘 밖 · before_us 가 숫자 배열|null 아님 · plan 이 LaunchPlanServer|null 아님 → 전부 offline(before_us null · plan null)"
  - "경고 로그 op 이름: launch-plan-get · launch-plan-put — 감사 op 는 launch-plan-put · target `<gateway>/<fire>/<market>` · extra { outcome, code(null 가능) }"
  - "이력 기록 실패 logger.error 필드 = { gateway, fire, market, outcome, cause(DbError 의 cause) } · 메시지 「[admin-launch] 발사 계획 이력 기록 실패」"

patterns-established:
  - "admin-launch 라우터의 relay 접근은 req.app.locals.relayAdmin 을 직접 넘긴다(requireRelayAdmin 503 대신 offline 200 — D-25)"

requirements-completed: []

coverage:
  - id: D1
    description: "GET /api/admin/launch/plan — 관문 · relay 1 ‖ RPC 1 · offline 접기 · 이력 RPC 오류 500"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-launch.test.ts#P35 발사 계획 GET (P35-S1~S4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PUT /api/admin/launch/plan/:gateway/:fire/:market — relay 저장 경로 · 바디 · 이력 1행(모든 결과) · 기록 실패 200 · 구조 400 · 감사 줄"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-launch.test.ts#P35 발사 계획 PUT (P35-S5~S9)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-28
status: complete
---

# Phase 35 Plan 13: server 발사 계획 라우트 2개 Summary

**`GET /api/admin/launch/plan`(relay 계획 조회와 이력 RPC를 Promise.all로 한 번씩 부르고, relay가 실패하면 offline 200)과 `PUT /api/admin/launch/plan/:gateway/:fire/:market`(relay 저장 → 결과와 상관없이 이력 1행 → `{ result, plan, change }` · 감사 줄)를 가짜 relay supertest 31건으로 고정했다. 로컬 커밋까지만 했고 push · 배포는 하지 않았다(D-35).**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-10-28 00:22 KST
- **Completed:** 2026-10-28 00:28 KST
- **Tasks:** 2 (tracer 1 + auto 1, TDD RED/GREEN 각 2커밋)
- **Files:** 수정 6

## 라우트 2

| 라우트 | 왕복 | 응답 |
|---|---|---|
| `GET /api/admin/launch/plan` | relay 1(`launchPlans`) ‖ Supabase 1(`launch_plan_changes_for_admin` `{ p_limit: 20 }`) | `LaunchPlanResponse` `{ servers: { KB120, KYOBO119 }, changes }` — servers 키 순서 = `LAUNCH_PLAN_GATEWAYS` |
| `PUT /api/admin/launch/plan/:gateway/:fire/:market` `{ offsets_us }` | relay 1(`setLaunchPlan`) → Supabase 1(`launch_plan_change_record` `{ p }`) | `LaunchPlanSaveResponse` `{ result, plan, change }` — plan 은 relay 재조회 값 그대로(웹이 다시 부르지 않는다) |

관문은 기존 `/launch` 경로 관문(requireAuth → requireAdmin)을 그대로 쓴다. 역할 조회는 요청당 1회다.

## relay HTTP 계약 (35-17 이 맞출 것)

- **조회:** `GET /internal/admin/launch-plan?servers=KB120,KYOBO119`. 서버 키마다 `encodeURIComponent`를 하고 `,`로 잇는다. 헤더는 `x-admin-email`이고 상한은 `RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS` = 6_000이다. 응답은 `{ servers: Record<string, LaunchPlanServer> }`(`LaunchPlanRelayReadResponse`).
- **저장:** `PUT /internal/admin/launch-plan/:server`. 바디는 `{ profile: "Q16" | "N", market: "K" | "Q", offsets_us }`(`LaunchPlanRelaySetBody` · profile = `launchPlanProfileOf(fire)`), 상한은 기본(쓰기 15초)이다. 응답은 `{ result: AdminServerResult(server = 경로 서버), before_us: number[] | null, plan: LaunchPlanServer | null }`(`LaunchPlanRelaySetResponse`).
- relay는 이 경로에서 DB에 쓰지 않는다. 이력 기록은 server가 맡는다(D-29).

## 실패 분기 표

| 상황 | GET | PUT |
|---|---|---|
| relayAdmin 미설정 | 200 · 두 서버 `{ status: "offline", message: "relay 연결이 설정되지 않았어요" }` · warn 없음 | 200 · result offline(같은 문구) · 이력 offline 1행 |
| relay status 0 · 비200 | 200 · 두 서버 offline(`RELAY_FAILED_MESSAGE`) · warn `{ relay: { op: "launch-plan-get", status } }` 1줄 | 200 · result offline · before_us null · plan null · 이력 offline 1행 · warn `launch-plan-put` |
| relay 모양 위반(전체) | 위와 같음 | 위와 같음(result 없음 · 다른 서버 결과 · outcome 어휘 밖 포함) |
| relay가 서버 하나를 빠뜨리거나 그 값의 모양이 틀림 | 그 서버만 offline · warn 1줄(`offline: [키]`) | — |
| relay result failed · timeout · skipped | 그 서버 status 그대로 통과 | 200 · result 그대로 · 이력에 outcome · code · message 원문 |
| 이력 RPC 오류 · `{ changes: null }` | 500 DB_ERROR(원문은 응답에 없음) | — |
| 이력 기록 RPC 오류 | — | 200 · change null · `logger.error({ gateway, fire, market, outcome, cause })` |
| 입력 구조 위반 | — | 400 VALIDATION_FAILED · relay 0회 · RPC 0회 |
| 순서 위반 · 범위 밖 | — | 막지 않는다. relay로 보내고 이력 1행을 남긴다(D-26 · D-34 · gh-trade code 1) |
| trader · 무토큰 | 403 · 401 · relay 0 · RPC 0 | 403 · 401 · relay 0 · RPC 0 |

## Task Commits

1. **Task 1 (tracer): GET /launch/plan** — RED `425b55e3` · GREEN `7444975a`
2. **Task 2: PUT /launch/plan/:gateway/:fire/:market** — RED `eb5323f7` · GREEN `904813b4`

## 검증 결과

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| Task 1 RED: `vitest run tests/routes/admin-launch.test.ts` | 7 failed · 30 passed (404 — 라우트 없음) |
| Task 1 verify: `vitest run tests/routes/admin-launch.test.ts tests/routes/admin.test.ts --maxWorkers=2` + `typecheck` | 2 files · 70 passed · tsc 통과 |
| Task 2 RED: `vitest run tests/routes/admin-launch.test.ts` | 23 failed · 38 passed |
| Task 2 verify: `vitest run tests/routes/admin-launch.test.ts tests/routes/admin.test.ts tests/routes/admin-servers.test.ts --maxWorkers=2` + `typecheck` | 3 files · 131 passed · tsc 통과 |
| `pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2` (전체 회귀) | 43 files · 608 passed · failed 0 |

admin-launch.test.ts는 기존 30건에 이 플랜 31건(GET 7 · PUT 24, it.each 펼친 수)을 더해 61건이다.

## TDD Gate Compliance

두 태스크 모두 `test(35-13) … (RED)` 커밋이 `feat(35-13) … (GREEN)` 커밋보다 먼저 있다. RED 커밋은 실패를 확인한 뒤에 만들었다(Task 1은 404, Task 2는 404/미구현). tracer 게이트는 Task 1 GREEN 뒤 `<verify>`를 다시 돌려 통과한 다음 Task 2로 넘어갔다.

## Decisions Made

frontmatter `key-decisions`를 참조. 하류 플랜이 따라야 할 인터페이스는 아래와 같다.

- **35-14 · 35-15(웹):** GET `servers`에는 늘 `KB120` · `KYOBO119` 두 키가 이 순서로 있다. ok가 아닌 서버는 offline · failed · timeout · skipped 가운데 하나이고 message가 붙는다. 「계획 고치기」 비활성 판단은 `status !== "ok"` 하나로 한다. PUT은 relay가 실패해도 200이므로 `result.outcome`으로 분기한다. `change === null`이면 이력 기록이 실패한 것이니 이력 목록을 낙관적으로 갱신하지 않는다(서버 로그로 추적).
- **35-17(relay):** 위 「relay HTTP 계약」의 경로 · 바디 · 응답 모양을 그대로 맞춘다. PUT 응답 `result.server`는 경로 서버 키와 같아야 하고, 다르면 server가 offline으로 접는다.

## Deviations from Plan

None - plan executed exactly as written. 계획보다 조금 넓힌 곳은 두 군데다. (1) relay 서버 값 검사에서 failed는 code · message 타입까지 본다. (2) relay 호출이 throw하면 status 0과 똑같이 offline으로 접는다(`fetchOrderEndpoints` 결). 둘 다 계획에 있는 「모양 위반 → offline」 범위 안이다.

## Issues Encountered

None.

## 운영 메모

- **push · 배포 안 함(D-35).** 이 플랜의 4커밋은 로컬 master에만 있다. server Cloud Run 배포도 없다. 지금 실서버 relay에는 `/internal/admin/launch-plan`이 없어서, 배포하더라도 GET은 늘 offline(대신 값)이다. relay 라우트는 35-17에서 만든다.
- 다른 세션의 미커밋 변경(`relay/src/generated/**` · Phase 36 `.gitkeep` · 인박스 261027 두 건 · `.planning/milestone.lock`)은 건드리지 않았다. 모든 add는 경로를 지정해서 했다.

## Next Phase Readiness

- 35-14 · 35-15(웹)는 이 두 라우트와 shared 타입 위에서 바로 구현할 수 있다. 35-17(relay)은 이 클라이언트가 고정한 HTTP 계약을 구현한다.

## Self-Check: PASSED

- FOUND: server/src/services/relay-admin-client.ts · server/src/services/admin-launch.ts · server/src/schemas/admin-launch.ts · server/src/routes/admin-launch.ts · server/tests/fixtures/fake-relay-admin.ts · server/tests/routes/admin-launch.test.ts
- FOUND commits: 425b55e3 · 7444975a · eb5323f7 · 904813b4 (모두 HEAD 조상)
