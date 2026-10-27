---
phase: 35-launch-gate
plan: 17
subsystem: relay
tags: [relay, admin-api, launch-plan, gh-trade-43, shared, vitest]
status: complete

requires:
  - phase: 35-16
    provides: "ADMIN_OP.SetLaunchPlan(8) · GetLaunchPlan(9) · AdminCommandOutcome.launchPlan · 94 짝짓기(op 8 의 94 버림)"
  - phase: 35-13
    provides: "server RelayAdminClient.launchPlans · setLaunchPlan — relay HTTP 계약(경로 · 응답 모양 검사)"
  - phase: 35-12
    provides: "shared LaunchPlanServer · LaunchPlanRelayReadResponse · LaunchPlanRelaySetBody/Response · LAUNCH_PLAN_SERVER_MAX_PIECES"
provides:
  - "relay LaunchPlanService.read(serverKeys) · set(serverKey, body, { deadlineAt }) — 서버 키 단위(dispatcher 밖)"
  - "relay GET /internal/admin/launch-plan?servers= · PUT /internal/admin/launch-plan/:server"
  - "AdminApiDeps.launchPlan? · SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE · index.ts 배선"
  - "shared interpretAdminResult op 유니온 1|2|3|4|5|8|9"
affects: [35-18, 35-19, phase-36 병합]

actuals:
  tokens: 13850
  tasks: 2
  commits: 4
plan_head_before: a276b6215acca4eb1f5de75c3119dfd247c1caf0
plan_head_after: ac6b6103c99a7b4e297e93c32e19ff3a20837ca5

tech-stack:
  added: []
  patterns:
    - "서버 설정 op(발사 계획)는 DMA 유저 줄(#serial) 밖 서버 키 단위 모듈 — 서버당 직렬은 AdminConn FIFO"
    - "offline 판정은 연결 isReady 로만 한다(87 캐시 유무와 무관한 op)"
    - "저장 뒤 새 값은 op 9 재조회 — 마감(도착 + 10초) 안에 5초 상한이 들어갈 때만"

key-files:
  created:
    - relay/src/admin/launch-plan.ts
    - relay/tests/admin-launch-plan.test.ts
  modified:
    - relay/src/admin/admin-api.ts
    - relay/src/index.ts
    - relay/tests/admin-api.test.ts
    - packages/shared/src/admin.ts
    - packages/shared/src/__tests__/admin.test.ts

key-decisions:
  - "35-17: 레지스트리에 없는 서버 · 꺼진 서버 모두 skipped + SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE 하나(dispatcher 의 꺼짐 · 없음 동일 문구 결) — GET 400 아님(server 가 요청 키 전부를 기대)"
  - "35-17: op 9 가 86 code 0 인데 94 없이 끝나면(와이어 규약 밖) offline + warn — failed code 0 은 모순이라 쓰지 않는다"
  - "35-17: 94 updated_at 빈 문자열 → null(모름) · plan_rev 가 2^53 초과면 null + warn"
  - "35-17: PUT 저장 failed 결과에는 usersRev 를 싣지 않는다(op 8 의 86 users_rev 는 계획과 무관) · ok 에만 usersRev 문자열"
  - "35-17: LaunchPlanService.read 는 입력 키 중복을 한 번만 묻는다(라우트도 중복 제거)"
  - "35-17: index.ts 는 const 선언 없이 createAdminRouter 인자에 new LaunchPlanService(...) 를 인라인 — phase-36 의 dispatcher 블록 끝 줄과 인접 충돌을 피한다"

requirements-completed: []

duration: 8min
completed: 2026-10-28
---

# Phase 35 Plan 17: relay 발사 계획 HTTP 라우트 Summary

**relay 에 `GET /internal/admin/launch-plan?servers=`(서버마다 op 9 를 병렬로 보내 서버별 `LaunchPlanServer`)와 `PUT /internal/admin/launch-plan/:server`(같은 연결에서 조회 → op 8 저장 → 조회 · 요청 마감 10초)를 붙였다. 판정은 서버 키 단위 `LaunchPlanService` 가 맡고 dispatcher 를 거치지 않는다. shared `interpretAdminResult` 는 op 8 · 9 를 받는다. 로컬 커밋까지만 했고 push · 배포는 하지 않았다.**

## Performance

- **Duration:** 약 8분
- **Completed:** 2026-10-28
- **Tasks:** 2 (tracer 1 + auto 1, TDD RED/GREEN 각 2커밋)
- **Files:** 신설 2 · 수정 5

## Phase 36 갈래 — ③ (이 플랜이 먼저 커밋)

- **미커밋 확인(두 태스크 시작 전 모두):** `git worktree list` 의 두 트리(`/Users/alex/repos/gh-radar` · `.claude/worktrees/phase-36`)에서 다섯 경로(`relay/src/admin/admin-api.ts` · `relay/tests/admin-api.test.ts` · `relay/src/index.ts` · `packages/shared/src/admin.ts` · `packages/shared/src/__tests__/admin.test.ts`)의 `git status --porcelain` 출력이 **비어 있었다**. ①(실행 중) 아니다.
- **SUMMARY 유무:** master 의 `.planning/phases/36-account-budget/` 에는 `36-02` · `36-04` · `36-10-SUMMARY.md` 가 **없다**. 그래서 ② 도 아니고 ③ 이다.
- **주의할 실제 상황:** Phase 36 은 브랜치 `gsd/phase-36-account-budget`(worktree `.claude/worktrees/phase-36`, HEAD `b9ef05e6` 「36-09 배포 대기 — Phase 35 종료 뒤 master 병합과 함께(사용자 결정)」)에서 36-01~08 · 36-10 까지 **이미 커밋을 끝낸 채 master 에 병합되지 않았다**. 그래서 ③ 이지만 「36 플랜이 실행할 때 이 라우트를 다시 읽는다」 는 전제는 맞지 않는다. 남는 일은 **병합 때 충돌을 푸는 것**이다.
- **병합 미리보기(`git merge-tree` · 읽기만):** 이 플랜 파일 중 `relay/src/index.ts` · `relay/tests/admin-api.test.ts` 는 자동으로 병합된다. 충돌 3곳은 모두 두 쪽을 함께 살리면 된다.
  - `relay/src/admin/admin-api.ts` import 줄 1곳: 35-17 의 `import type { LaunchPlanService }` 와 36 의 `import { ADMIN_OP, type AdminUsersSnapshot }` 를 둘 다 둔다.
  - `packages/shared/src/admin.ts` 의 `interpretAdminResult` JSDoc · 시그니처: `op: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9` 로 합친다. 두 쪽 JSDoc 줄도 다 둔다.
  - `packages/shared/src/__tests__/admin.test.ts` 의 it.each 케이스: 두 쪽을 다 둔다.
  - 그 밖의 충돌(types.ts · envelope.ts · frames.ts 등)은 35-16 몫이다. `.planning/STATE.md` · `state.json` 도 충돌한다.

## relay 라우트 2

| 라우트 | 왕복 | 응답 |
|---|---|---|
| `GET /internal/admin/launch-plan?servers=KB120,KYOBO119` | 서버마다 op 9 1건, 병렬 | 200 `{ servers: Record<키, LaunchPlanServer> }`. 요청한 키를 모두 요청 순서대로 싣는다. 감사 줄 없음(읽기) |
| `PUT /internal/admin/launch-plan/:server` body `{ profile, market, offsets_us }` | 그 서버 1대에 op 9(전) → op 8 → op 9(후, 조건부). 같은 AdminConn FIFO | 200 `{ result: AdminServerResult(server = 경로 키), before_us, plan }`. 감사 1줄 |

- 입력 검사(zod)는 구조만 본다. `servers` 는 쉼표로 구분한 1~8개이고 각 키가 `SERVER_KEY_RE` 에 맞아야 하며 중복은 뺀다. 누락 · 빈 값 · 9개 · `KB 120` · `KB120,,KB121` · `NH1` 은 400 `VALIDATION_FAILED` 다. PUT 바디는 `profile` Q16|N · `market` K|Q · `offsets_us` int32 정수 1~64칸만 받고 추가 키는 `.strict()` 로 400 이다. 순서 위반 `[-340,-350]` 이나 범위 밖 `[-9000]` 은 **400 이 아니다**. relay 는 그대로 보내고 gh-trade 가 code 1 고정 문구로 답한다(D-26 · D-30). 경로 `:server` 형식이 틀리면 400 이다.
- deps `launchPlan` 이 없으면 두 라우트 모두 503 `LAUNCH_PLAN_UNAVAILABLE` 이다. `x-admin-email` 이 없으면 기존 관문이 400 `ADMIN_EMAIL_REQUIRED` 를 낸다.
- 감사 줄: `{ admin, route: "PUT /launch-plan/:server", server, profile, market, n, servers: [{ server, outcome, code? }] }`. offsets 원문은 싣지 않고 조각 수(n)만 싣는다.
- relay 는 DB 를 쓰지 않는다. 이력은 server 가 남긴다(D-29).

## 판정 표 (서버 1대 · `LaunchPlanService`)

| 상황 | 조회(read) | 저장(set) | 44 |
|---|---|---|---|
| 레지스트리에 없음 · `enabled` false | `skipped` + `SKIPPED_DISABLED_LAUNCH_PLAN_MESSAGE` | result `skipped`(같은 문구) · before_us null · plan null | 0 |
| 파이프라인 · admin 연결 없음 · `isReady` false | `offline` | result `offline` · null · null | 0 |
| command `timeout` · `offline` | 그대로 | 저장이 그러면 result 그대로 · plan null | — |
| 같은 request_id 86 code ≠ 0(구 서버 1 「알 수 없는 명령입니다」 · 10 · 11) | `failed { code, message 원문 }` | 전 조회면 before_us null 로 두고 **저장을 계속 보낸다**. 저장이면 result `failed { code, message }` · plan null · 후 조회 없음 · warn `{ server, code, message }` | — |
| 94 스냅샷 | `ok { plan_rev: number, updated_at, entries }` | 전: 그 profile/market 칸의 offsets(칸이 없으면 null). 후: plan | — |
| 저장 86 code 0(같은 값 「변경 없음」 포함) | — | result `ok { usersRev }` → 후 조회. 후 조회가 ok 가 아니면 plan null | — |
| 86 code 0 인데 94 없음(규약 밖) | `offline` + warn | — | — |

- `entries` 는 Q16|N × K|Q 행만 남긴다. 모르는 행은 서버마다 warn 1줄(`dropped`)을 남기고 뺀다. `plan_rev` 는 `Number(planRev)` 이고 2^53 을 넘으면 null + warn. `updated_at` 이 `""` 이면 null.
- offline 은 87 수신 여부로 판정하지 않는다(S4). 발사 계획은 users.toml 과 무관하기 때문이다.

## 마감 규칙

- 라우트 핸들러 첫 줄에서 `deadlineAt = 도착 시각 + ADMIN_REQUEST_DEADLINE_MS(10초)` 를 잰다(`deadlineOf()`).
- 저장 86 을 받은 뒤 `now() + ADMIN_COMMAND_TIMEOUT_MS(5초) > deadlineAt` 이면 후 조회를 건너뛴다. 이때 plan 은 null 이지만 저장 결과는 싣고 info 로그 1줄을 남긴다. 정확히 같은 시각이면 후 조회를 보낸다.
- 이 경로는 기록이 없어서 dispatcher 의 「먼저 응답 · 뒤에서 계속 반영」 접기를 쓰지 않는다. 응답은 저장 86 뒤에만 나간다. 최악은 전 조회 5초 + 저장 5초 = 10초이고, server PUT 상한은 기본 15초다.
- GET 은 서버별 op 9 상한이 5초이고 병렬이다. server 상한은 6초다. 같은 서버 FIFO 에 앞 명령(PUT 등)이 비행 중이면 그만큼 늦어져 server 가 offline 으로 접을 수 있다. 이는 의도된 한계다.

## interpretAdminResult op 유니온 (실제 줄)

```ts
export function interpretAdminResult(op: 1 | 2 | 3 | 4 | 5 | 8 | 9, code: number): "ok" | "failed" {
```

본문은 바꾸지 않았다. op 8 · 9 는 code 0 만 ok 이고, op 4 의 8 · op 2 의 4 예외는 번지지 않는다(테스트 `[8, 8]` · `[9, 4]` failed). 36-10 이 병합되면 `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9` 가 된다.

## Task Commits

1. **Task 1 (tracer): GET /launch-plan · LaunchPlanService.read** — RED `7fc997df` · GREEN `1e20cf10`
2. **Task 2: PUT /launch-plan/:server · set · interpretAdminResult 8/9** — RED `956189e0` · GREEN `ac6b6103`

## TDD Gate Compliance

- Task 1 RED `7fc997df`: `admin-launch-plan.test.ts` · `admin-api.test.ts` 두 파일이 import 단계에서 실패했다(`../src/admin/launch-plan.js` 없음 · tests 0). GREEN `1e20cf10` 에서 66 통과.
- Tracer 게이트: Task 1 GREEN 뒤 `<verify>`(shared build · 두 파일 vitest · typecheck · typecheck:tests)를 다시 돌려 통과한 뒤 Task 2 로 넘어갔다.
- Task 2 RED `956189e0`: relay 는 12 failed(S1~S5 · W1~W4) · 66 passed. shared 는 런타임이 이미 맞아서(본문 무변경 계획) RED 가 **타입 단계**에만 있었다. `tsc` 가 `TS2345 '8' is not assignable to type '1 | 2 | 3 | 4 | 5'` 로 실패했다. GREEN `ac6b6103`.

## 검증 결과

| 명령 | 결과 |
|---|---|
| Task 1 verify: shared build + `vitest run tests/admin-launch-plan.test.ts tests/admin-api.test.ts` + relay typecheck + typecheck:tests | 2 files · 66 passed · tsc 통과 |
| Task 2 verify: shared build + `vitest run src/__tests__/admin.test.ts`(shared) + relay 4 파일(admin-launch-plan · admin-api · admin-dispatcher · admin-conn) + typecheck 둘 | shared 65 passed · relay 4 files 137 passed · tsc 통과 |
| relay 전체 `vitest run --maxWorkers=2` | **60 files · 1704 passed · failed 0**(기준선 59 · 1684 → +1 파일 · +20 케이스: 서비스 13 · 라우트 7) |
| shared 전체 `vitest run --maxWorkers=2` | 24 files · 724 passed |
| shared `tsc --noEmit` · server `typecheck` | 통과(유니온을 넓혔으니 server 호출부는 영향 없음) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Target` 판정 타입이 `never` 로 좁혀졌다**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** `Extract<LaunchPlanServer, { status: "skipped" | "offline" }>` 를 썼는데, 해당 멤버의 status 가 3값 유니온이라 Extract 결과가 never 가 됐다(TS2322).
- **Fix:** `{ status: "skipped"; message: string } | { status: "offline" }` 를 직접 적었다.
- **Files modified:** relay/src/admin/launch-plan.ts · **Commit:** 1e20cf10

### 설계 메모 (계획 범위 안의 선택)

- **Task 1 의 실패 판정:** Task 1 에서는 `r.code !== 0` 으로 판정했다. 그때는 shared 유니온에 9 가 없었기 때문이다. Task 2 에서 `interpretAdminResult(ADMIN_OP.GetLaunchPlan, …)` 로 바꿨다.
- **라우트 테스트 위치:** admin-api.test 의 기존 하네스에 `launchPlan` 옵션 하나를 더했다(기본 = 실 서비스 · `null` = 주입 없음 · 대역). L1 · W1 은 실 AdminConn ↔ 가짜 게이트웨이(`sendFrame` 94)로 끝까지 돈다. W1 은 op 8 뒤 서버가 보내는 94 를 relay 가 짝 없음으로 버리고, 후 조회가 자기 94 로 풀리는 것까지 잠근다. fake-gateway.ts 는 고치지 않았다(phase-36 충돌 회피 · 35-16 결).
- **acceptance grep 메모:** `grep -q '"/internal/admin/launch-plan' server/src/services/relay-admin-client.ts` 는 따옴표가 큰따옴표라 그대로는 맞지 않는다. server 는 백틱 템플릿(`` `/internal/admin/launch-plan?servers=…` `` · `` `/internal/admin/launch-plan/${…}` ``)을 쓰기 때문이다. 경로 문자열 자체는 relay `/internal/admin` 마운트 + `/launch-plan` · `/launch-plan/:server` 와 같은 것을 확인했다.
- **protected 브랜치 가드:** `gsd-tools query git.base-branch --is-protected master` = true 였다. 그래도 오케스트레이터 지시(SEQUENTIAL · main tree · master)대로 master 에 로컬 커밋했다. 이전 35-xx 플랜과 같은 방식이고 push 는 하지 않았다.

## Known Stubs

None.

## Threat Flags

없음. 새 라우트 2개는 기존 `X-Relay-Secret` 관문과 `x-admin-email` 관문 뒤에 있다. 입력은 zod 로 구조를 검사하고, DB 접근은 없다.

## Next Phase Readiness

- **35-19(노트 대조 · 범위 7 전체 회귀):** `LAUNCH_PLAN_LIMITS` 대조 · 16:00 머리 카드 `learnLabel` 은 손대지 않았다. relay 거부 문구는 gh-trade 원문을 그대로 통과시킨다. 웹의 「서버 미지원」 분기(failed + code 1)는 GET · PUT 모두 relay 가 `{ status|outcome: "failed", code: 1, message: "알 수 없는 명령입니다" }` 로 내므로 그대로 닿는다. 노트 `261028-launch-plan-contract.md` 는 `status: open` 그대로다(어드민 화면 항목은 35-19 뒤에 닫는다).
- **35-18(배포 · 메인 세션):** relay 이미지에 이 플랜 커밋 4개가 들어가야 server(35-13)의 GET/PUT 이 offline 이 아닌 실값을 받는다. gh-trade 43 서버가 먼저 나가 있어야 한다. 구 서버는 code 1 「알 수 없는 명령입니다」 를 내고 화면은 「서버 미지원」 을 보인다(깨지지 않음). 라이브 스모크 순서: `GET /internal/admin/launch-plan?servers=KB120,KYOBO119` 로 두 키를 확인 → 같은 값 PUT(code 0 「변경 없음」 · plan_rev 불변)으로 안전하게 왕복 확인.
- **phase-36 병합 세션:** 위 「Phase 36 갈래」 의 충돌 3곳은 두 쪽을 다 살린다. `interpretAdminResult` 는 `1|…|9` 다.
- push · relay/server 배포 없음.

## Self-Check: PASSED

- FOUND: relay/src/admin/launch-plan.ts (`export class LaunchPlanService`) · relay/tests/admin-launch-plan.test.ts · admin-api.ts `router.get("/launch-plan"` · `router.put("/launch-plan/:server"` · `launchPlan.set(` · index.ts `new LaunchPlanService(` · shared `interpretAdminResult(op: 1 | 2 | 3 | 4 | 5 | 8 | 9`
- FOUND commits (HEAD 조상): 7fc997df · 1e20cf10 · 956189e0 · ac6b6103
