---
phase: 29-dma-multi-server-admin
plan: 13
subsystem: api
tags: [express, admin, relay-proxy, dma, server-registry, zod, supertest]
status: complete

requires:
  - phase: 29-10
    provides: "adminRouter · requireAdmin · requireRelayAdmin · createRelayAdminClient{request · reloadAccess · reloadRegistry} · admin-supabase 목"
  - phase: 29-11
    provides: "relay /internal/admin/* 계약 표(경로 · 바디 · 409 코드 · { results } · DELETE { results, deleted })"
  - phase: 29-04
    provides: "shared SERVER_KEY_RE · brokerOfServerKey · isValidAccountNoInput · deriveAdminServersOverview · Admin 바디 타입"
  - phase: 29-01
    provides: "레지스트리 RPC dma_admin_upsert_server · set_server_enabled · set_order_server (오류 server in use · server disabled · broker change not allowed · P0002)"
provides:
  - "POST /api/admin/users dma 경로(트레이서) · POST /users/:email/dma · DELETE /users/:email 공유 판정"
  - "/api/admin/dma-users/:dma/{password, accounts, accounts/:broker/:accountNo, reconcile} relay 프록시"
  - "adminServersRouter — GET/POST /servers · PATCH /servers/:key · PUT order-server · PUT quote-primary"
  - "RelayAdminClient 타입드 메서드 8종 · relayAdminClientFrom(request) · toProxyResult"
  - "zod: AdminDmaInputSchema · AdminAccountInputSchema · AdminPasswordSchema · AdminPutAccountSchema · dmaParam · dmaAccountParam · AdminServerUpsertSchema · AdminServerPatchSchema · serverKeyParam · ServerHostSchema"
  - "테스트 대역 tests/fixtures/fake-relay-admin.ts(makeFakeRelay · relayReject)"
affects: [29-15, 29-17, 29-18, 29-19, 29-23, 29-26]

actuals:
  tokens: 28227
  tasks: 2
  commits: 2
plan_head_before: 03395378ab94209e082829f385e25e506f98f3cb
plan_head_after: 22ea13fda249b6a28368babbb2e650d17122b470

tech-stack:
  added: []
  patterns:
    - "relay 프록시 응답 = toProxyResult — 200 그대로 · 400/409(quote-primary 는 404 도) 업무 거부 그대로 · 그 밖(0 · 401 · 5xx · 모양 위반) 502 RELAY_FAILED"
    - "relay 타입드 메서드는 relayAdminClientFrom(request) 한 곳 — 테스트 가짜는 저수준 request 만 바꿔 실제 경로 문자열을 단언"
    - "라우터 관문을 경로에 한정(adminServersRouter.use('/servers', …)) + 앞에 마운트 — 같은 /api/admin 아래 두 라우터가 역할 조회를 중복하지 않게"

key-files:
  created:
    - server/src/routes/admin-servers.ts
    - server/tests/routes/admin-dma.test.ts
    - server/tests/routes/admin-servers.test.ts
    - server/tests/fixtures/fake-relay-admin.ts
  modified:
    - server/src/routes/admin.ts
    - server/src/schemas/admin.ts
    - server/src/services/relay-admin-client.ts
    - server/src/app.ts
    - server/tests/routes/admin.test.ts
    - server/tests/fixtures/admin-supabase.ts

key-decisions:
  - "POST /users + dma 는 relay 클라이언트가 없으면 쓰기 전에 503 — 허용 행만 남는 반쪽 상태를 만들지 않는다(relay 409 · 502 는 이미 upsert 뒤라 행이 남고 「DMA 연결」 로 재시도)"
  - "DMA 생성 · 연결 성공 뒤 access reload 1회 — 생성 RPC 가 app_users.dma_user_id 를 채우므로 새 trader 의 DMA 가 60초를 기다리지 않게. relayNotified = 그 결과"
  - "POST /users/:email/dma 는 이미 dma_user_id 가 있으면 409 DMA_LINKED — 생성 RPC 가 dma_user_id 를 덮어써 조용히 다른 DMA 로 갈아 끼우는 것을 막는다. viewer 400 · 없는 사용자 404"
  - "DELETE /users/:email 응답 = { ok, deleted, results?, relayNotified } — DMA 없음 경로는 29-10 의 조건부 삭제 한 문장 그대로(왕복 1회), 0행일 때만 원인 조회 → 공유 count → relay"
  - "relay 401(공유 비밀 불일치)은 502 RELAY_FAILED — 브라우저에 401 을 보내면 로그인 만료로 읽힌다"
  - "POST /servers 는 기존 키면 409 SERVER_EXISTS — upsert RPC 라 「+ 서버」 가 기존 서버 주소를 조용히 덮을 수 있었다. 주소 변경은 PATCH"
  - "sortOrder 는 RPC 가 없어 dma_servers 표 직접 update(불변식 없는 표시 값 · service_role)"
  - "quote-primary 는 Express 가 DB 를 먼저 바꾸지 않는다 — relay 가 전환 성공 뒤 DB 를 갱신(29-23). relay 404 NO_SUCH_SERVER 도 그대로 넘긴다"
  - "감사 로그의 DMA id 는 relay 와 같은 마스킹(앞 2자 + *** + (길이))"

patterns-established:
  - "Admin 오류 코드 추가: RELAY_FAILED 502 · DMA_LINKED 409 · CONFLICT 409 · SERVER_EXISTS 409 · SERVER_IN_USE 409 · SERVER_DISABLED 409 · BROKER_CHANGE 409 · relay 업무 코드(DMA_USER_EXISTS · LAST_ACCOUNT · NO_DMA_USER · QUOTE_SWITCH_FAILED …) 는 relay 원문 그대로"

requirements-completed: [ADMIN-08, ADMIN-09, ADMIN-10]

coverage:
  - id: D1
    description: "트레이서 — POST /api/admin/users { role: trader, dma } → upsert 1회 → relay POST /internal/admin/dma-users 1회 → access reload → { ok, relayNotified, results } · 교보 branch/trader 빈 값 · viewer+dma 400 · 검증 표 16건 · 409 그대로 · 502 · 503"
    requirement: ADMIN-08
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#POST /api/admin/users + dma — 트레이서 (D-16)"
        status: pass
    human_judgment: false
  - id: D2
    description: "DMA 프록시 — 비밀번호 · 계좌 put/remove · 다시 반영 · DMA 연결이 relay 같은 경로 1회 · 결과 그대로 · LAST_ACCOUNT 409 · 경로 인코딩 · 502/503 · 400"
    requirement: ADMIN-08
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#DMA 프록시 — relay 계약(29-11) 1:1 · POST /api/admin/users/:email/dma"
        status: pass
    human_judgment: false
  - id: D3
    description: "유저 삭제 공유 판정 — 단독 DMA 전 서버 ok → 행 삭제 · 한 서버 failed → deleted:false 행 유지 · 공유 → 행만(relay DMA 0회) · 409/502/503 행 유지"
    requirement: ADMIN-09
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#DELETE /api/admin/users/:email — DMA 있는 사용자 (D-15 공유 판정)"
        status: pass
    human_judgment: false
  - id: D4
    description: "서버 레지스트리 API — GET(RPC + relay 상태 · 실패 null · 역할 조회 1회) · POST(검증 · SERVER_EXISTS) · PATCH(SERVER_IN_USE · host 만 · sortOrder · 404) · order-server(SERVER_DISABLED) · quote-primary(relay 실행 · 409/404 그대로 · 502 · 503)"
    requirement: ADMIN-10
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-servers.test.ts (36건)"
        status: pass
    human_judgment: false
  - id: D5
    description: "로그 위생 — 성공 · relay 거부 · relay 실패 · 검증 실패에서 pino 실출력 · 응답에 password 원문 없음 · 감사 로그 DMA id 마스킹"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#로그 위생"
        status: pass
    human_judgment: false
  - id: D6
    description: "실 relay(29-11 · 29-23 quote-primary)와의 왕복 · 운영 Cloud Run 결선"
    verification: []
    human_judgment: true
    rationale: "relay quote-primary 는 29-23, relay 배포는 29-25, server 재배포는 29-26 — 이 플랜은 계약 문자열 · 응답 해석을 가짜 relay · 목 RPC 로만 증명했다"

duration: 11min
completed: 2026-10-07
---

# Phase 29 Plan 13: Express DMA · 서버 레지스트리 라우트 Summary

**webapp 이 부를 Admin API 전부가 섰다. 「+ 사용자」 한 번이 Express(검증 · app_users upsert)를 지나 relay 의 서버별 결과 배열로 돌아오고, 비밀번호 · 계좌 · 다시 반영 · DMA 연결 · 유저 삭제(공유 판정) · 서버 레지스트리 6경로가 relay 계약(29-11)과 레지스트리 RPC 를 1:1 로 부른다. relay 업무 거부는 409 그대로, 못 닿음은 502 `RELAY_FAILED`, 설정 없음은 503 이다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-10-06T17:03:54Z
- **Completed:** 2026-10-06T17:15:39Z
- **Tasks:** 2 (트레이서 1 · TDD 1)
- **Files:** 신규 4 · 수정 6

## Accomplishments

- **트레이서(Task 1):** `POST /api/admin/users { email, role: "trader", dma }` → zod(DMA id 8바이트 · 비밀번호 1~64 · KB 5/6 · 교보 빈 값 · 서버 1~8 · 증권사 접두 일치) → `app_users` upsert → relay `POST /internal/admin/dma-users` → access reload → `{ ok: true, relayNotified: true, results }`. 트레이서 `<verify>` 를 한 번 더 돌려 green 을 확인한 뒤 확장했다.
- **DMA 프록시(Task 2):** 5경로가 각각 relay 1회만 부르고 결과를 그대로 돌려준다. 유저 삭제는 DMA 없음 / 공유 / 단독 세 갈래로 나뉜다. 단독이면 relay 가 전 서버 ok 로 `deleted: true` 를 줄 때만 행을 지운다.
- **서버 레지스트리(Task 2):** `adminServersRouter` 를 만들었다. 불변식은 DB RPC 가 쥐고, 이 라우터는 RPC 오류를 코드로 옮긴 뒤 relay 레지스트리 재적재를 best-effort 로 부른다. 시세 주 서버 전환은 relay 가 실행하고 DB 도 relay 가 갱신한다.

## 라우트 표 (확정본 — 29-15 `admin-api.ts` 가 따른다)

모든 라우트는 `requireAuth()` → `requireAdmin()` 를 거친다(미인증 401 · admin 아님 403 `FORBIDDEN`). 검증 실패는 400 `VALIDATION_FAILED` 다.

| 메서드 · 경로 | 바디 | 성공 | 거부 |
|---|---|---|---|
| GET `/api/admin/users` | — | `AdminUsersOverview` | 500 `DB_ERROR` |
| POST `/api/admin/users` | `{ email, role, dma? }` | `{ ok, relayNotified }` · dma 있으면 `+ results` | 400(viewer+dma 포함) · 409 `SELF_LOCKOUT` · relay 409 그대로(`DMA_USER_EXISTS` · `NO_SERVERS` …) · 502 `RELAY_FAILED` · 503 `RELAY_UNAVAILABLE`(dma 있을 때 · 쓰기 전) |
| PATCH `/api/admin/users/:email` | `{ role }` | `{ ok, relayNotified }` | 400 · 404 · 409 `SELF_LOCKOUT` |
| DELETE `/api/admin/users/:email` | — | `{ ok, deleted, relayNotified }` · 단독 DMA 면 `+ results`(`deleted:false` = 일부 서버 실패로 행 유지) | 404 · 409 `SELF_LOCKOUT` · 409 `CONFLICT`(경합) · relay 409 · 502 · 503 |
| POST `/api/admin/users/:email/dma` | `AdminDmaInput` | `{ results, relayNotified }` | 400(viewer) · 404 · 409 `DMA_LINKED` · relay 409 · 502 · 503 |
| POST `/api/admin/dma-users/:dma/password` | `{ password }` | `{ results }` | 400 · relay 409 `NO_DMA_USER` · 502 · 503 |
| PUT `/api/admin/dma-users/:dma/accounts` | `{ account, servers }` | `{ results }` | 400 · relay 409 · 502 · 503 |
| DELETE `/api/admin/dma-users/:dma/accounts/:broker/:accountNo` | — | `{ results }` | 400 · relay 409 `LAST_ACCOUNT` · `NO_SUCH_ACCOUNT` · 502 · 503 |
| POST `/api/admin/dma-users/:dma/reconcile` | — | `{ results }` | 400 · 502 · 503 |
| GET `/api/admin/servers` | — | `AdminServersOverview`(relay 실패 · 없음 → 각 `status: null`) | 500 `DB_ERROR` |
| POST `/api/admin/servers` | `{ key, broker, host, port, sortOrder? }` | `{ ok, relayNotified }` | 400(키 접두 ≠ broker · port 범위 · 호스트 형식) · 409 `SERVER_EXISTS` |
| PATCH `/api/admin/servers/:key` | `{ host?, port?, enabled?, sortOrder?, broker? }`(≥1) | `{ ok, relayNotified }` | 400(broker 변경 · 빈 바디) · 404 · 409 `SERVER_IN_USE` |
| PUT `/api/admin/servers/:key/order-server` | — | `{ ok, relayNotified }` | 400 · 404 · 409 `SERVER_DISABLED` |
| PUT `/api/admin/servers/:key/quote-primary` | — | `{ ok: true }` | 400 · relay 404 `NO_SUCH_SERVER` · relay 409(`QUOTE_SWITCH_FAILED` 등) 그대로 · 502 · 503 |

## Task Commits

1. **Task 1: 트레이서 — POST /api/admin/users (dma) → app_users → relay 유저 생성 → 서버별 결과** — `d06b5918` (feat)
2. **Task 2: 나머지 DMA 프록시 · 유저 삭제 공유 판정 · /api/admin/servers/*** — `22ea13fd` (feat)

플랜 지시대로 태스크마다 커밋 1개만 만들었다. TDD 관측: Task 2 는 구현을 먼저 쓰고 테스트를 뒤에 써서 **RED 관측이 없다**. 대신 마운트 순서를 뒤집는 변이를 넣어 「역할 조회 1회」 테스트가 실패하는 것을 확인한 뒤 되돌렸다. 기존 29-10 DELETE 테스트 2건은 의도된 동작 변경 때문에 실패했고, 그 실패를 보고 갱신했다.

## Files Created/Modified

- `server/src/routes/admin-servers.ts` — `adminServersRouter`. 레지스트리 RPC 오류 매핑 · 재적재 통보 · relay 상태 조회 · 시세 전환 프록시
- `server/src/routes/admin.ts` — POST /users dma 경로, DMA 프록시 5개, DELETE 공유 판정. `parseOrThrow` · `audit` · `DbError` · `relayResults` · `relayFailed` · `maskDma` export
- `server/src/schemas/admin.ts` — DMA · 계좌 · 서버 레지스트리 zod 스키마. 문구는 고정 한국어이고 입력값을 싣지 않는다
- `server/src/services/relay-admin-client.ts` — 타입드 메서드 8종 · `relayAdminClientFrom` · `toProxyResult`
- `server/src/app.ts` — `adminServersRouter` 를 adminRouter 앞에 마운트
- `server/tests/routes/admin-dma.test.ts` — 57건(트레이서 · 프록시 · 연결 · 삭제 · 로그 위생)
- `server/tests/routes/admin-servers.test.ts` — 36건
- `server/tests/routes/admin.test.ts` — 가짜 relay 를 `relayAdminClientFrom` 기반으로 바꿨고, DELETE 테스트를 새 응답에 맞췄다(HAS_DMA 케이스는 admin-dma 로 이동)
- `server/tests/fixtures/admin-supabase.ts` — RPC 핸들러 맵 · `count/head` select · 추가 메모리 표
- `server/tests/fixtures/fake-relay-admin.ts` — 가짜 relay(실제 래퍼 + 저수준 request 교체)

## Decisions Made

결정은 frontmatter `key-decisions` 에 정리했다. 요지는 세 가지다.

- **반쪽 상태 최소화:** relay 가 없으면 쓰기 전에 거부한다. 단독 DMA 삭제는 relay `deleted` 일 때만 행을 지운다.
- **조용한 덮어쓰기 금지:** `DMA_LINKED` 와 `SERVER_EXISTS` 로 막았다.
- **DB 갱신 주체:** 시세 전환 때 DB 를 바꾸는 쪽은 relay 하나다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정합성] DMA 포함 생성에서 relay 클라이언트 확인을 upsert 앞으로**
- **Found during:** Task 1
- **Issue:** behavior 문장은 「클라이언트 없음 → 503(app_users upsert 는 이미 됐다)」 이다. 그런데 클라이언트 없음은 쓰기 전에 알 수 있는 조건이라, 행을 남길 이유가 없다.
- **Fix:** dma 가 있으면 `requireRelayAdmin` 을 upsert 앞에서 부른다. relay 409 · 502 는 relay 를 불러 봐야 알 수 있으므로 행이 남는다(주석 · 테스트로 고정).
- **Files modified:** server/src/routes/admin.ts
- **Commit:** d06b5918

**2. [Rule 2 - 정합성] DMA 생성 · 연결 뒤 access reload**
- **Found during:** Task 1
- **Issue:** 생성 RPC 가 `app_users.dma_user_id` 를 채우지만, relay 접근 맵은 최대 60초 동안 옛 값을 유지한다.
- **Fix:** 성공 뒤 `notifyAccess` 를 1회 부른다. 응답의 `relayNotified` 가 이 결과다.
- **Commit:** d06b5918 · 22ea13fd

**3. [Rule 2 - 정합성] `POST /users/:email/dma` 사전 검사(404 · viewer 400 · DMA_LINKED 409)**
- **Found during:** Task 2
- **Issue:** 29-05 생성 RPC 는 이미 연결된 사용자의 `dma_user_id` 를 덮어쓴다. viewer 에 대해서도 막지 않는다.
- **Fix:** app_users 를 1회 조회해 위 세 경우를 거부한다.
- **Commit:** 22ea13fd

**4. [Rule 2 - 정합성] `POST /servers` 기존 키 409 `SERVER_EXISTS`**
- **Found during:** Task 2
- **Issue:** upsert RPC 라서 「+ 서버」 에 기존 키를 넣으면 운영 서버 주소가 조용히 바뀐다.
- **Fix:** 존재 여부를 1회 조회해 409 로 거부한다. 주소 변경은 PATCH 로만 한다.
- **Commit:** 22ea13fd

**5. [Rule 3 - 막힘] `sortOrder` 는 RPC 가 없어 표 직접 update**
- **Found during:** Task 2
- **Issue:** shared `AdminServerUpsertBody` · `AdminServerPatchBody` 에는 `sortOrder` 가 있다. 하지만 `dma_admin_upsert_server` 는 정렬 값을 받지 않는다.
- **Fix:** 정렬 값은 불변식이 없는 표시 값이라 `dma_servers.sort_order` 를 service_role 로 직접 update 한다. 없는 키는 404 다.
- **Commit:** 22ea13fd

**6. [Rule 3 - 막힘] files_modified 밖 테스트 파일 3개**
- **Found during:** Task 1 · 2
- **Issue:** 29-10 DELETE 테스트는 이 플랜이 바꾼 동작(HAS_DMA → relay 경로)을 단언하고 있었다. 목 Supabase 는 레지스트리 RPC · count · `dma_servers` 를 흉내 내지 못했다. 가짜 relay 는 두 테스트 파일이 함께 써야 했다.
- **Fix:** `admin.test.ts` 를 갱신했다. `admin-supabase.ts` 는 하위 호환으로 넓혔다. `fake-relay-admin.ts` 를 새로 만들었다.
- **Commit:** d06b5918 · 22ea13fd

**7. [Rule 1 - 성능] 서버 라우터 관문 경로 한정 + 마운트 순서**
- **Found during:** Task 2
- **Issue:** `app.use("/api/admin", adminServersRouter)` 를 adminRouter 옆에 그대로 두면 두 라우터가 각자 역할 조회를 한다. 그러면 Cloud Run → Supabase 왕복이 1회 늘어난다(VPC egress 지연이 지배적인 경로).
- **Fix:** 서버 라우터를 앞에 마운트하고 관문은 `/servers` 경로에만 건다. 테스트가 /servers 와 /users 모두 역할 조회가 1회인지 확인하고, 변이로도 검증했다.
- **Commit:** 22ea13fd

---

**Total deviations:** 7 auto-fixed (정합성 4 · 막힘 2 · 성능 1)
**Impact on plan:** 경로 · 응답 모양은 계약 표 그대로이고, 필드를 더하기만 했다(`DELETE` 의 `relayNotified` · `/users/:email/dma` 의 `relayNotified`). 오류 코드 5종을 새로 정했다: `DMA_LINKED` · `CONFLICT` · `SERVER_EXISTS` · `SERVER_DISABLED` · `BROKER_CHANGE`.

## Issues Encountered

None.

## Known Stubs

없음.

## User Setup Required

None. server 재배포와 env 주입은 29-26 이 맡는다. relay quote-primary 경로는 29-23 이 만든다(그 전에 부르면 relay 404 → 그대로 404).

## Next Phase Readiness

- **29-15(webapp admin-api):** 위 라우트 표가 계약이다. 서버별 결과 칩은 `results[].outcome` · `message` 를 그대로 쓴다. `deleted:false` 면 행이 남아 있으니 「다시 삭제」 를 노출한다.
- **29-19(서버 페이지):** PATCH 는 한 번에 한 필드를 보낸다. `SERVER_IN_USE` · `SERVER_DISABLED` 문구는 서버가 고정 한국어로 준다.
- **29-23:** relay 가 `POST /internal/admin/servers/:key/quote-primary` 에서 400/404/409 를 `{ error: { code, message } }` 로 주면 Express 가 그대로 넘긴다. 성공 응답은 200 이고 본문이 비어 있지 않아야 한다(`{ ok: true }`). 본문이 null 이면 502 로 처리한다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck` — 통과
- `vitest run tests/routes/admin-dma.test.ts tests/routes/admin-servers.test.ts tests/routes/admin.test.ts` — 3 files · 121 tests passed
- `vitest run`(server 전체) — 39 files · 463 tests passed
- 인수 기준: createDmaUser 합계 3(≥2) · RELAY_FAILED 합계 7(≥1) · `export const adminServersRouter` 1 · SERVER_IN_USE 2 · deriveAdminServersOverview 3 · `"HAS_DMA"` 0 · `/dma-users/:dma/reconcile` 3 · `dma_admin_set_order_server` 1
- 스키마 푸시: 해당 없음(목 RPC). 보안검사는 `security_enforcement: false` 로 생략했다. spec-less probe 는 건너뛰었다(29-01 과 같음).

## Self-Check: PASSED

- FOUND: server/src/routes/admin-servers.ts · server/tests/routes/admin-dma.test.ts · server/tests/routes/admin-servers.test.ts · server/tests/fixtures/fake-relay-admin.ts
- FOUND commits(HEAD 조상): d06b5918 · 22ea13fd

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-07*
