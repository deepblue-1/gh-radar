---
phase: 30-kb-ip-mac
plan: 03
subsystem: api
tags: [relay, express, admin, order-ip-mac, read-path, audit]

requires:
  - phase: 30-01
    provides: "PUT orderEndpoint 쓰기 경로(Express zod · relay 라우트) — 감사 플래그를 다는 같은 PUT"
  - phase: 30-02
    provides: "shared AdminOrderEndpointsRaw · deriveAdminUsersOverview(raw, endpoints?) — 이 플랜이 원천을 대고 파생을 부른다"
provides:
  - "relay GET /internal/admin/order-endpoints → 200 AdminOrderEndpointsRaw — 켜진 서버별 87 캐시 전 계좌 { dmaUserId, accountNo, orderIp, orderMac } · 87 모르는 서버 키 없음"
  - "AdminApiDeps.pipelines admin.currentSnapshot(): AdminUsersSnapshot | null 타입"
  - "RelayAdminClient.orderEndpoints(adminEmail)"
  - "Express GET /api/admin/users — RPC admin_users_raw 와 relay order-endpoints 병렬 → deriveAdminUsersOverview(raw, endpoints) · relay 실패는 200 · null(확인 전)"
  - "Express PUT /dma-users/:dma/accounts 감사 줄 orderEndpoint: set | clear(값 없음)"
  - "가짜 relay 기본 응답 order-endpoints → { servers: {} }"
affects: [30-04, 30-05, 30-06, 30-07, relay-deploy, server-deploy, webapp-admin-users]

actuals:
  tokens: 6700
  tasks: 3
  commits: 5
plan_head_before: d994055d8fac0d77a8acd9b43870330210b7279a
plan_head_after: 932f7ece6c86ea5d5eeb7d3941ad623654cc0e3a

tech-stack:
  added: []
  patterns:
    - "읽기 원천 병렬 병합 — GET /servers 의 fetchLiveStatus 선례 그대로: Promise.all([RPC, relay]) · relay 쪽은 null 폴백 · warn 에 status 만"
    - "메모리 87 캐시 노출 — relay 라우트는 currentSnapshot() 만 읽고 44 · 감사 · 로그를 남기지 않는다"

key-files:
  created:
    - .planning/phases/30-kb-ip-mac/30-03-SUMMARY.md
  modified:
    - relay/src/admin/admin-api.ts
    - relay/tests/admin-api.test.ts
    - server/src/services/relay-admin-client.ts
    - server/tests/fixtures/fake-relay-admin.ts
    - server/tests/services/relay-admin-client.test.ts
    - server/src/routes/admin.ts
    - server/tests/routes/admin.test.ts
    - server/tests/routes/admin-dma.test.ts

key-decisions:
  - "relay order-endpoints 는 켜진 서버 중 currentSnapshot() 이 있는 서버만 키를 둔다 — 꺼짐 · 파이프라인 없음 · 재접속 중(87 미수신)은 전부 키 없음 = 「확인 전」(shared 파생이 null 로)"
  - "fetchOrderEndpoints 는 relay 호출 throw 도 status 0 으로 접어 null — 실 클라이언트는 throw 하지 않지만 개요 200 을 계약으로 잠근다"
  - "모양 검사는 servers 가 배열 아닌 객체인지만 — 행 단위 검증은 하지 않는다(relay 는 내부 신뢰 경계 · fetchLiveStatus 와 같은 깊이)"
  - "Express PUT 감사 플래그는 Express 가 trim 한 뒤 값 기준 — 두 칸 모두 \"\" 면 clear, 아니면 set(relay 감사와 같은 규칙)"

patterns-established:
  - "87 전용 값 읽기: DB 열 없이 relay 내부 GET → Express 가 RPC 와 병렬 → shared 파생 두 번째 인자"

requirements-completed: [IPMAC-02]

coverage:
  - id: D1
    description: "relay GET /internal/admin/order-endpoints 가 켜진 서버별 87 캐시 계좌 IP/MAC(정규화값 그대로 · 미설정 \"\")을 주고, 꺼진 · 파이프라인 없는 · 87 미수신 서버는 키가 없으며, 관문 401 · 44 0건(op 5 포함) · 로그에 값 없음"
    requirement: IPMAC-02
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#P30 GET /order-endpoints (D-09) (E1~E4 · 5 tests)"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-switch.test.ts (pipelines get: () => undefined 스텁 타입 호환)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Express RelayAdminClient.orderEndpoints 가 GET /internal/admin/order-endpoints 를 X-Relay-Secret · x-admin-email 과 함께 부른다"
    requirement: IPMAC-02
    verification:
      - kind: integration
        ref: "server/tests/services/relay-admin-client.test.ts#P30 orderEndpoints — GET /internal/admin/order-endpoints · x-admin-email · 바디 없음"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/admin/users 가 relay order-endpoints 를 병합해 계좌 orderEndpoints 를 싣고, relay 500 · throw · 모양 위반이면 200 · 전 서버 null · warn 에 status 만, RPC 오류는 종전대로 500"
    requirement: IPMAC-02
    verification:
      - kind: integration
        ref: "server/tests/routes/admin.test.ts#P30 GET /users orderEndpoints 병합 (D-09) (E1~E4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "PUT /dma-users/:dma/accounts 감사 줄에 orderEndpoint set/clear 플래그만 · orderEndpoint 없으면 키 없음 · 로그 어디에도 IP/MAC 원문 없음"
    requirement: IPMAC-02
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#P30 PUT 감사 플래그 — IP/MAC 값 없음 (A1~A3)"
        status: pass
    human_judgment: false
  - id: D5
    description: "저장 뒤 재조회가 실서버 87 정규화값을 카드에 그리는지(relay 밖 변경 신선도 포함) — 배포(30-07) 뒤 라이브 확인"
    requirement: IPMAC-02
    verification: []
    human_judgment: true
    rationale: "테스트는 스텁 게이트웨이 · 가짜 relay 기준이다. 실 gh-trade 87 의 정규화값이 Cloud Run Express 를 거쳐 웹 카드에 보이는지는 relay · server 배포 뒤에만 확인할 수 있다."

duration: 5min
completed: 2026-10-11
status: complete
---

# Phase 30 Plan 03: relay 87 캐시 IP/MAC 읽기 경로 · Express 개요 병합 · PUT 감사 플래그 Summary

**relay 새 내부 GET `/internal/admin/order-endpoints` 가 켜진 서버별 87 캐시의 계좌 IP/MAC 을 내주고, Express `GET /api/admin/users` 가 RPC 와 병렬로 받아 `deriveAdminUsersOverview(raw, endpoints)` 로 계좌마다 `orderEndpoints` 를 싣는다(relay 실패는 200 · 「확인 전」). PUT 감사 줄에는 set/clear 플래그만 남는다**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-11T06:21:29Z
- **Completed:** 2026-10-11T06:26:15Z
- **Tasks:** 3 (TDD 2 + auto 1)
- **Files modified:** 8

## Accomplishments

- **relay(D-09):** `router.get("/order-endpoints")` — 레지스트리 순으로 켜진 서버만, `pipelines.get(key)?.admin.currentSnapshot()` 이 있으면 `users.flatMap` 으로 전 계좌 `{ dmaUserId, accountNo, orderIp ?? "", orderMac ?? "" }`. 87 을 모르면 키 없음. 44 · 감사 · 로그 없음. `AdminApiDeps.pipelines` 의 `admin` 에 `currentSnapshot()` 타입 추가(실 `ServerPipelines` · 하네스 `AdminConn` · quote-switch 스텁 모두 그대로 호환). 머리 계약 주석에 신선도 단락.
- **Express 클라이언트:** `RelayAdminClient.orderEndpoints(adminEmail)` · 가짜 relay 기본 `{ servers: {} }`.
- **Express GET /users(D-09 · D-10):** `fetchOrderEndpoints(req)` 를 `Promise.all` 로 RPC 와 병렬 — relay 없음 · 비200 · 모양 위반 · throw 는 null + `warn({ relay: { op: "order-endpoints", status } })`. 파생은 `deriveAdminUsersOverview(data as AdminUsersRaw, endpoints)`.
- **Express PUT 감사:** `body.orderEndpoint` 가 있을 때만 `orderEndpoint: "set" | "clear"` 조건부 spread.
- 검증: relay 전체 57 파일 · 1516 tests 통과, server 전체 39 파일 · 508 tests 통과, relay typecheck · typecheck:tests · server typecheck 0 오류.

## Task Commits

1. **Task 1: relay GET /internal/admin/order-endpoints** - `6f2b0c46` (test · RED) → `58638c0c` (feat · GREEN)
2. **Task 2: Express relay 클라이언트 orderEndpoints · 가짜 relay 기본 응답** - `43e39f14` (feat)
3. **Task 3: Express GET /users 병렬 병합 · PUT 감사 플래그** - `b1890ac3` (test · RED) → `932f7ece` (feat · GREEN)

## Files Created/Modified

- `relay/src/admin/admin-api.ts` — `/order-endpoints` 라우트 · deps 타입 `currentSnapshot()` · `AdminOrderEndpointsRaw` · `AdminUsersSnapshot` import type · 머리 계약 단락
- `relay/tests/admin-api.test.ts` — 「P30 GET /order-endpoints (D-09)」 E1~E4(5 tests) · 머리 잠금 목록
- `server/src/services/relay-admin-client.ts` — `orderEndpoints` 인터페이스(JSDoc) · 구현
- `server/tests/fixtures/fake-relay-admin.ts` — order-endpoints 기본 응답 · 머리 목록 한 줄
- `server/tests/services/relay-admin-client.test.ts` — 「P30 orderEndpoints」 요청 계약
- `server/src/routes/admin.ts` — `fetchOrderEndpoints` · GET /users `Promise.all` · PUT 감사 플래그 · 머리 주석
- `server/tests/routes/admin.test.ts` — 「P30 GET /users orderEndpoints 병합 (D-09)」 E1~E4
- `server/tests/routes/admin-dma.test.ts` — 「P30 PUT 감사 플래그 — IP/MAC 값 없음」 A1~A3

## Decisions Made

- 87 미수신(재접속 중) 서버도 키를 두지 않는다 — 플랜 behavior 에 없던 경우지만 must_haves 「87 미수신 서버는 키가 없다」 를 잠그려고 E2 에 1건 추가.
- relay 호출 throw 를 status 0 으로 접는다 — `admin-servers.ts` 의 `fetchLiveStatus` 는 try 가 없지만 이 플랜은 「throw 해도 null」 을 명시해 try/catch 로 둔다.

## Deviations from Plan

None - plan executed exactly as written. (E2 의 「87 미수신」 테스트 1건 · E4 모양 위반 변형 3가지는 must_haves 를 잠그는 추가 단언이며 구현 범위는 그대로다.)

## Issues Encountered

- 첫 server 전체 실행에서 `admin-servers.test.ts` 「미인증 401 · trader 403 · RPC 0」 이 `read ECONNRESET` 으로 1건 실패 — 이 플랜이 건드리지 않은 GET /servers 경로이고, 그 파일 단독 재실행 37 passed · 전체 재실행 508 passed. supertest 소켓 플레이크로 판단(코드 무변경).
- RED 단계에서 E3 · E4(relay 실패 → null) · A3(플래그 없음)은 구현 전에도 통과했다 — relay 를 부르지 않던 종전 코드가 `deriveAdminUsersOverview(raw)` = `(raw, null)` 이고 감사 줄에 키가 없었기 때문. 회귀 잠금 용도다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 30-04/05(웹 편집 칸 · 카드 IP/MAC 표시)가 `GET /api/admin/users` 응답의 `accounts[].orderEndpoints` 와 shared `summarizeOrderEndpoint` 를 그대로 쓴다.
- 배포 순서 **relay → server → webapp**: server 가 먼저 나가면 relay 404 → 개요는 200 · 전 서버 「확인 전」(warn 1줄/요청)으로 안전하게 퇴행한다. 배포는 30-07 메인 세션 몫 — 이 플랜은 커밋만, push · 배포 없음.

---
*Phase: 30-kb-ip-mac*
*Completed: 2026-10-11*

## Self-Check: PASSED
