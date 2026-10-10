---
phase: 29-dma-multi-server-admin
plan: 37
subsystem: api
tags: [relay, express, admin, dma, order-server, zod, supabase-rpc, shared]

requires:
  - phase: 29-36
    provides: "AccountOrderServers changed → sweep → dropUser → wss 1012 재수립 결선 · staleStrategies"
  - phase: 29-34
    provides: "유저 삭제 skipDisabled 경로 · admin-api / server admin.ts / relay-admin-client 최신본"
  - phase: 29-33
    provides: "AccountOrderServers 적재기 reload()(TailReload 꼬리) · changed 이벤트"
  - phase: 29-29
    provides: "RPC dma_admin_set_account_order_server · intent[].isOrder · servers[].isOrderServer · put/remove 가 지정 해제"
  - phase: 29-32
    provides: "변경 라우트 10초 deadlineAt 규율"
provides:
  - "relay PUT /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server { serverKey | null } → 200 { ok, orderServer }"
  - "AdminIntentStore.setAccountOrderServer · INTENT_ERROR_CODES += ORDER_SERVER_NOT_REGISTERED"
  - "AdminApiDeps.orderServers?: { reload() } — 지정 · 계좌 put · 계좌 제거 · 유저 삭제 뒤 즉시 재적재(실패 warn)"
  - "Express PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server 프록시 · AdminOrderServerSchema · relayOrderServer 해석"
  - "RelayAdminClient.setAccountOrderServer(dma, broker, accountNo, serverKey, adminEmail)"
  - "shared AdminIntentRow.isOrder? · AdminUsersRaw.servers[].isOrderServer? · AdminAccountView.orderServer? · defaultOrderServer? · AdminOrderServerBody · AdminOrderServerResponse"
affects: [29-38, admin-users-ui, order-routing]

actuals:
  tokens: 10163
  tasks: 3
  commits: 6
plan_head_before: 39b0d7c720887cbd89cf980dd1d48ac1e945fe7f
plan_head_after: a856afcb7d605259e99c62016aa558665f2487e8

tech-stack:
  added: []
  patterns:
    - "쓰기 라우트 끝 지정 적재기 재적재 — await · 실패는 응답 무변경 warn(reloadOrderServers)"
    - "결과 배열이 아닌 relay 응답은 전용 해석 함수(relayOrderServer) — relayResults 와 같은 상태 매핑"

key-files:
  created: []
  modified:
    - relay/src/admin/intent-store.ts
    - relay/src/admin/admin-api.ts
    - relay/src/index.ts
    - relay/tests/admin-api.test.ts
    - relay/tests/helpers/admin-db-fake.ts
    - server/src/routes/admin.ts
    - server/src/services/relay-admin-client.ts
    - server/src/schemas/admin.ts
    - server/tests/routes/admin-dma.test.ts
    - packages/shared/src/admin.ts
    - packages/shared/src/__tests__/admin-overview.test.ts

key-decisions:
  - "AdminApiDeps.orderServers 는 선택 deps — 주지 않으면 60초 주기에 맡긴다(quote-switch 테스트 하네스 무변경 · index.ts 는 늘 결선)"
  - "유저 삭제는 deleted 결과와 무관하게 지정 재적재 — 부분 settle 도 그 서버 등록 행(지정 포함)을 지운다 · 무변화면 changed 없음"
  - "Express zod 는 serverKey 증권사 접두가 경로 :broker 와 다르면 400 — relay 까지 가지 않는다(등록 여부 · 레지스트리 존재는 relay · DB)"
  - "relay 감사 줄은 { dma(마스킹), broker, account(maskAccountNo), orderServer | rejected } — 44 는 보내지 않는다(와이어 무변경)"
  - "계좌 뷰 defaultOrderServer = servers[].isOrderServer 첫 행(증권사별) · 87 전용 계좌는 두 필드 null · removing 행 isOrder 무시"

patterns-established:
  - "지정 변경 경로: Express → relay → RPC → AccountOrderServers.reload(꼬리) → changed → 29-36 재수립"

requirements-completed: [ADMIN-06, ADMIN-08]

coverage:
  - id: D1
    description: "relay 계좌 주문 서버 지정 라우트 — RPC 저장 · 즉시 재적재 · 200 { ok, orderServer } · null 해제 · 400 · 409 3종 · 44 0건 · 감사 마스킹 · 재적재 실패 무영향"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#relay Admin 내부 HTTP — 계좌 주문 서버 지정 (29-37 G-1 ⑥) > O1~O5"
        status: pass
    human_judgment: false
  - id: D2
    description: "Express PUT /api/admin/…/order-server 프록시 — 경로 인코딩 · 바디 그대로 · 409/400 그대로 · 502 RELAY_FAILED · 503 · 403 · 형식 400 · 감사 줄"
    requirement: ADMIN-08
    verification:
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server — 계좌 주문 서버 지정 (29-37 G-1 ⑥)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Admin 개요 계좌 뷰 orderServer · defaultOrderServer 파생(shared 한 곳) + GET /api/admin/users 응답에 실림"
    requirement: ADMIN-08
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/admin-overview.test.ts#계좌 주문 서버 — 지정(orderServer) · 증권사 기본(defaultOrderServer) (29-37 G-1 ⑥)"
        status: pass
      - kind: integration
        ref: "server/tests/routes/admin-dma.test.ts#GET /api/admin/users — 계좌 뷰의 주문 서버 지정 · 기본값 (29-37 G-1 ⑥)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D4
    description: "계좌 put · 계좌 제거 · 유저 삭제 뒤 지정 즉시 재적재 · 생성 · 비밀번호 · reconcile 은 0회"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#relay Admin 내부 HTTP — 등록 해제 · 계좌 제거 · 유저 삭제 뒤 지정 재적재 (29-37 Task 3) > R1~R4"
        status: pass
    human_judgment: false
  - id: D5
    description: "운영 relay 에서 지정 변경 → 그 사용자 세션이 새 서버로 즉시 재수립(29-36 결선과의 실 결합)"
    verification: []
    human_judgment: true
    rationale: "실 Supabase RPC · 실 AccountOrderServers · 실 gh-trade 서버 2대가 필요한 다중 프로세스 동작 — 이 플랜 테스트는 대역 DB · reload 대역까지만 본다. 배포 뒤 UAT(29-38 화면과 함께)."

duration: 9min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 37: 계좌 주문 서버 지정 API Summary

**Admin 이 계좌 주문 서버를 고르는 경로를 끝에서 끝으로 세웠다 — Express PUT 프록시 → relay `order-server` 라우트 → RPC `dma_admin_set_account_order_server` → `AccountOrderServers` 즉시 재적재(29-36 재수립으로 연결) · 개요 계좌 뷰의 `orderServer` · `defaultOrderServer` 파생 · 등록 해제 · 계좌 제거 · 유저 삭제 뒤 재적재**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-10T16:10:00Z
- **Completed:** 2026-10-10T16:20:00Z
- **Tasks:** 3
- **Files modified:** 11 (+ deferred-items.md)

## Accomplishments

- relay `PUT /internal/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server` — zod `{ serverKey: SERVER_KEY_RE | null }`(누락 거부) · 레지스트리 밖 키 400 · RPC 거부 409(`ORDER_SERVER_NOT_REGISTERED` · `NO_SUCH_ACCOUNT` · `NO_DMA_USER`) · 지정 재적재를 기다린 뒤 200 `{ ok: true, orderServer }`. 44 를 보내지 않는다.
- Express 프록시 · zod `AdminOrderServerSchema`(+ 경로 `:broker` 와 키 접두 일치 400) · `RelayAdminClient.setAccountOrderServer` · 전용 해석 `relayOrderServer`(400/409 그대로 · 못 닿음 · 5xx · 모양 위반 502 · 미설정 503).
- shared 계좌 뷰 `orderServer` · `defaultOrderServer`(선택 필드 · 파생은 늘 채움) · `AdminOrderServerBody` · `AdminOrderServerResponse` — webapp 픽스처 무변경으로 typecheck 통과.
- 계좌 put · 계좌 제거 · 유저 삭제 성공 응답 전에 같은 재적재 — RPC 가 removing 전환과 함께 지운 지정이 60초를 기다리지 않고 라우팅에 반영.

## Task Commits

1. **Task 1: 트레이서 — Express PUT → relay PUT → RPC → 지정 재적재 → 200** — `eae89296` (test · RED) → `c81356d0` (feat · GREEN)
2. **Task 2: 개요 파생 — 계좌 뷰 orderServer · defaultOrderServer** — `6b064b45` (test · RED) → `9a29af8c` (feat · GREEN)
3. **Task 3: 계좌 put · 제거 · 유저 삭제 뒤 지정 재적재** — `5f752f23` (test · RED) → `a856afcb` (feat · GREEN)

**Plan metadata:** 이 SUMMARY 커밋 · STATE/ROADMAP 커밋(아래 해시는 커밋 메시지 참조)

_동시 세션(quick-261011-0yb) 커밋 `cd5c3b4a` 가 이 플랜 커밋 사이에 끼었다 — 위 6개만 이 플랜 몫이다(`commits: 6` 은 `git log --grep="(29-37)" plan_head_before..plan_head_after` 측정)._

## TDD Gate Compliance

| Task | RED | GREEN | RED 증거 (junit → `check tdd-red-evidence`) |
|------|-----|-------|------|
| 1 | `eae89296` | `c81356d0` | `RED_EVIDENCE_OK` — 대상 O1 이 첫 단언(`res.status` 404 ≠ 200)에서 실패 · 라우트 부재가 원인 · 로드/픽스처 오류 없음 |
| 2 | `6b064b45` | `9a29af8c` | `RED_EVIDENCE_OK` — 대상 「지정 KB121 …」 이 `toMatchObject` 에서 실패 · 파생이 두 필드를 내지 않음 |
| 3 | `5f752f23` | `a856afcb` | `RED_EVIDENCE_OK` — 대상 R3 이 200 · deleted true 뒤 `toHaveBeenCalledTimes(1)`(0회)에서 실패 · 라우트가 재적재하지 않음 |

REFACTOR 커밋 없음(정리할 것이 없었다). 트레이서 게이트(Task 1): interactive · end-of-phase · `<automated>` 만 → verify 재실행 통과 후 확장.

## Files Created/Modified

- `relay/src/admin/intent-store.ts` — `setAccountOrderServer` RPC 래퍼 · `ORDER_SERVER_NOT_REGISTERED` 허용 코드
- `relay/src/admin/admin-api.ts` — order-server 라우트 · `orderServers?` deps · `reloadOrderServers` · put/remove/delete 끝 재적재 · 감사 `orderServer` 변형 · 머리 계약
- `relay/src/index.ts` — `createAdminRouter` deps 에 `accountOrderServers` 결선
- `relay/tests/helpers/admin-db-fake.ts` — 대역 RPC `dma_admin_set_account_order_server` · put/remove 지정 해제 · `orderServerOf`
- `relay/tests/admin-api.test.ts` — O1~O5 · R1~R4 · 하네스 `orderServersReload`
- `server/src/routes/admin.ts` — PUT order-server 프록시 · `relayOrderServer`
- `server/src/services/relay-admin-client.ts` — `setAccountOrderServer` · `RelayOrderServerResult` · 계좌 경로 헬퍼
- `server/src/schemas/admin.ts` — `AdminOrderServerSchema`
- `server/tests/routes/admin-dma.test.ts` — 프록시 describe · GET /users 새 필드 단언
- `packages/shared/src/admin.ts` — 타입 · 파생
- `packages/shared/src/__tests__/admin-overview.test.ts` — 5 케이스 + 기존 계좌 뷰 `toEqual` 에 두 필드(null)

## Decisions Made

- `AdminApiDeps.orderServers` 를 선택 deps 로 — `quote-switch.test.ts`(이 플랜 파일 밖)의 라우터 하네스를 건드리지 않는다. 운영(index.ts)은 늘 결선.
- 유저 삭제는 `deleted` 와 무관하게 재적재 — 부분 settle(op 2 ok 서버)도 그 서버 등록 행(지정 포함)을 지운다. 무변화면 `changed` 가 없어 재수립도 없다.
- Express 가 `serverKey` 접두 ≠ 경로 `:broker` 를 400 으로 먼저 거른다(relay 는 같은 경우 DB 판정 409 `ORDER_SERVER_NOT_REGISTERED`).
- 감사: relay 는 `{ dma: 마스킹, broker, account: maskAccountNo, orderServer | rejected }`, Express 는 `op: dma-order-server` · `maskDma` · `broker` · `orderServer | rejected`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `orderServers` deps 를 필수 대신 선택으로**
- **Found during:** Task 1
- **Issue:** 필수로 두면 `relay/tests/quote-switch.test.ts`(플랜 파일 밖)의 `createAdminRouter` 호출이 `typecheck:tests` 에서 깨진다.
- **Fix:** `orderServers?` — 없으면 재적재 생략(60초 주기). index.ts 결선은 그대로.
- **Files modified:** relay/src/admin/admin-api.ts
- **Verification:** relay `typecheck:tests` · quote-switch 테스트 통과
- **Committed in:** c81356d0

**2. [Rule 2 - Missing Critical] Express 에서 serverKey 증권사 접두 검사**
- **Found during:** Task 1
- **Issue:** 경로 `:broker` 와 다른 증권사 키가 relay 까지 가서 409 로 돌아온다 — 형식 위반은 Express 가 먼저 400 으로 거르는 29-13 규율(계좌 put `checkServersMatchBroker`)과 어긋남.
- **Fix:** `brokerOfServerKey(serverKey) !== broker` → 400 `VALIDATION_FAILED`(relay 0회).
- **Files modified:** server/src/routes/admin.ts
- **Verification:** admin-dma 「serverKey 가 계좌 증권사 서버가 아님 → 400 · relay 0」
- **Committed in:** c81356d0

**3. [Rule 1 - Bug(테스트)] Express 감사 테스트를 감사 줄로 좁힘**
- **Found during:** Task 1 GREEN
- **Issue:** pino-http 접근 로그가 요청 URL 원문(계좌번호 포함)을 남겨 「로그 전체에 계좌번호 없음」 단언이 실패 — 이 라우트가 아니라 기존 Admin 경로 전체의 모양이다.
- **Fix:** 테스트는 `"audit":"admin"` 줄만 단언(마스킹 · 계좌번호 · DMA id 원문 없음). 근본(pino-http URL 마스킹)은 `deferred-items.md` 「29-37 실행 중」.
- **Files modified:** server/tests/routes/admin-dma.test.ts
- **Committed in:** c81356d0

**4. [범위 확장 — 정확성] 유저 삭제 재적재를 deleted true 에 한정하지 않음**
- **Found during:** Task 3
- **Issue:** 플랜 behavior 는 「deleted true 뒤 1회」. 그러나 deleted false 여도 op 2 ok 서버는 settle 로 지정 행을 지운다.
- **Fix:** 성공 응답이면 결과와 무관하게 재적재(테스트는 deleted true 1회를 단언).
- **Committed in:** a856afcb

---

**Total deviations:** 4 (1 blocking · 1 missing critical · 1 test 범위 · 1 정확성 확장)
**Impact on plan:** 모두 계약 · 보안 규율 유지용. 새 파일 · 새 의존성 없음.

## Issues Encountered

- 동시 세션(quick-261011-0yb)이 같은 트리에서 webapp 파일을 편집 · 커밋 중이었다 — 매 커밋 전 `git status -sb` 확인 후 이 플랜 경로만 지정 스테이징. webapp typecheck 는 그 편집이 섞인 트리에서도 통과.
- `gsd-tools windows append` 는 쓰지 않았다(스텁 · skip 테스트 · 미실행 verify 없음).

## Known Stubs

None.

## User Setup Required

None — 배포는 메인 세션 몫(relay 먼저 → server → push). 이 플랜은 커밋까지만.

## Next Phase Readiness

- 29-38(화면)이 부를 API(`PUT /api/admin/dma-users/:dma/accounts/:broker/:accountNo/order-server`)와 보일 값(계좌 뷰 `orderServer` · `defaultOrderServer`)이 준비됐다.
- 실 결합(지정 → 29-36 재수립 → 브라우저 1012 재접속)은 배포 뒤 UAT(D5).

## Self-Check: PASSED

- 수정 파일 7개(소스) 존재 확인 · 커밋 `eae89296` `c81356d0` `6b064b45` `9a29af8c` `5f752f23` `a856afcb` 전부 HEAD 조상.
- `check evaluation-scope --plan 29-37 --commits-only` → resolved · 이 플랜 커밋 6개.
- 플랜 verification 재실행: shared 51 · relay(admin-api · dispatcher · quote-switch) 87 · server(admin-dma · admin · relay-admin-client) 130 통과 · relay typecheck · typecheck:tests · server typecheck · webapp typecheck 통과.
- acceptance grep: `order-server` relay 3 · server 6 · `setAccountOrderServer` client 2 · `ORDER_SERVER_NOT_REGISTERED` intent-store 1 · `defaultOrderServer` shared 6 · `AdminOrderServerBody` 1.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*
