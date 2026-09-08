---
phase: 16-trading-limit-chaser-vi-my-page
plan: 16
subsystem: api
tags: [order, rest-removal, relay, wss, cloud-run, deploy, attack-surface, express]

# Dependency graph
requires:
  - phase: 16-08
    provides: relay wss 주문 핸들러 + `order/notice-status.ts`(statusOf·filledQtyOf·5초 상한 공용 정본)
  - phase: 16-10
    provides: 웹앱 주문·취소의 wss 전환 (REST 호출부가 이미 0건)
  - phase: 16-13
    provides: 상따 화면 (wss 주문 경로 E2E green)
  - phase: 16-14
    provides: VI 자동매수 화면
  - phase: 16-15
    provides: My page
provides:
  - "주문 경로가 wss 하나 — `POST /api/orders` 와 `POST /internal/orders` 가 모두 사라졌다 (D-02)"
  - "`GET /api/orders?date=` 조회 라우트 존치 (D-03/D-24 새로고침 복원)"
  - "server 에 relay 결선 0 — RelayClient·RELAY_INTERNAL_URL·RELAY_ORDER_SECRET·ORDER_TIMEOUT_MS 제거"
  - "relay 내부 HTTP 는 `/healthz` 하나 + `relaySecretGuard` 유지"
  - "deploy-server.sh 정리 + 16-17 `--remove-env-vars`/`--remove-secrets` 후속 조치 안내 주석"
  - "「라우트가 정말 없다」 회귀 4종 (server 2 · relay 2) — 변이 주입으로 실효성 실측"
affects: [16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "제거는 「호출부 0건 확인 → 라우트 삭제 → 라우트 부재를 단언하는 테스트로 교체」 순이다. 삭제만 하면 그 자리는 다음 사람이 무심코 되메운다"
    - "삭제 커밋과 수정 커밋을 섞지 않는다 — 되돌릴 수 있어야 한다"
    - "배포 스크립트 수정 ≠ 리비전 정리. env 는 전량 치환이지만 secret 바인딩은 **병합**이라 목록에서 빼도 사라지지 않는다"
    - "지워지는 파일에 공용 로직을 두지 않는다(16-08 규율)의 **수확 시점** — `notice-status.ts` 덕분에 `order-api.ts` 를 528줄 → 232줄로 잘라내도 wss 경로가 그대로 돌았다"

key-files:
  created: []
  modified:
    - server/src/routes/orders.ts
    - server/src/app.ts
    - server/src/server.ts
    - server/src/config.ts
    - server/src/errors.ts
    - server/src/schemas/orders.ts
    - server/src/services/dma-orders.ts
    - server/tests/routes/orders.test.ts
    - webapp/src/lib/orders-api.ts
    - relay/src/order/order-api.ts
    - relay/src/index.ts
    - relay/tests/order-api.test.ts
    - scripts/deploy-server.sh
  deleted:
    - server/src/services/relay-client.ts

key-decisions:
  - "삭제한 파일은 `server/src/services/relay-client.ts` **단 하나**다. `notice-status.ts` 는 16-08 이 남긴 경고대로 손대지 않았고, `order-api.ts` 는 `/healthz`+관문만 남겨 존치했다"
  - "`server/src/errors.ts` 의 주문 에러 7종을 함께 지웠다 — 플랜의 files_modified 밖이지만 `RelayNotConfigured` 는 `RELAY_INTERNAL_URL` 을 문서화한 채 죽은 코드로 남고, acceptance grep 이 그것을 잡는다. 사본을 남기면 「어느 쪽 문구가 진짜인가」를 두 곳에서 관리하게 된다"
  - "`schemas/orders.ts` 의 `OrderPostBody` 는 **남겼다**. 플랜의 제거 목록 밖이고, `stockCode.test.ts` 의 KRX 영문 단축코드 회귀(quick-260908-fis)가 거기 걸려 있다. 대신 「어떤 라우트에도 결선돼 있지 않다 · 새 경로의 근거로 쓰지 말 것」을 파일에 못박았다"
  - "`isDmaAllowed` 도 함께 지웠다. 플랜은 4개를 열거했지만 「listTodayOrders 만 남긴다」가 상위 규칙이고, allowlist 판정의 정본은 relay `store/credentials.ts` 다 — server 사본은 아무도 부르지 않는 두 번째 판정이었다"
  - "deploy-server.sh 의 **배포 전 relay 비밀 존재 검증 루프**도 제거했다(플랜 미기재). server 가 읽지 않는 secret 의 부재가 server 배포를 막고 있었다 — relay 를 아직 안 세운 환경에서 무관한 배포까지 실패한다"
  - "`ordersRateLimit` 은 함께 사라졌다. GET 에는 걸려 있지 않음을 실측 확인했고(`ordersRouter.get` 은 `requireAuth()` 뿐), 새 경로의 상한은 16-07 의 연결당 토큰 버킷이 담당한다 (T-16-06 accept)"
  - "「없어졌다」를 단언하는 테스트는 **상태코드를 구별해야** 의미가 있다. server ⓪ 은 404 를 요구한다 — 라우트가 살아 있으면 503(relay 미주입)·403(allowlist)·400(형식) 중 하나가 오기 때문이다. relay ⑪ 도 같은 이유로 404 이며, 변이 주입(더미 POST 라우트 재등록)으로 실제로 400 에서 실패함을 실측했다"

patterns-established:
  - "제거 plan 의 acceptance grep 은 **비주석 라인 기준**으로 읽는다. 「왜 지웠는가」와 「16-17 에서 무엇을 더 해야 하는가」를 주석으로 남기는 것이 grep 0건보다 중요하다"
  - "관문(`relaySecretGuard`)은 마지막 라우트가 사라져도 남긴다 — 경로 존재 여부(404 vs 401)도 정보다"

requirements-completed: [TRADE-03]

# Metrics
duration: 22min
completed: 2026-09-09
---

# Phase 16 Plan 16: REST 주문 경로 제거 Summary

**주문 접수 경로를 wss 하나로 좁혔다 — `POST /api/orders`(server) 와 `POST /internal/orders`(relay) 를 같은 흐름에서 지워 두 경로가 같은 `dma_orders` 행을 다투는 기간을 만들지 않았고, 조회(`GET /api/orders`)·`/healthz`·공유 비밀 관문·`notice-status.ts` 는 전부 살아 있다. 1,973줄이 사라지고 289줄이 들어왔으며, 삭제된 파일은 `relay-client.ts` 하나다.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-09T02:00:30Z
- **Completed:** 2026-09-09T02:22:25Z
- **Tasks:** 3 (커밋 3건)
- **Files modified:** 13 modified, 1 deleted

## Accomplishments

- **주문 접수 경로가 하나가 됐다.** `grep -rn "ordersRouter.post" server/src/` = 0, `grep -rn "internal/orders" relay/src/` = 주석 1건(제거 사유). 두 경로가 공존하면 REST 는 server 가 insert 한 `orderRowId` 로, wss 는 relay 가 만든 행 id 로 같은 행을 갱신해 화면의 주문 상태가 갈린다 — 그 기간을 0으로 만들었다 (T-16-11).

- **16-08 의 인계 경고를 지켰다.** `relay/src/order/notice-status.ts` 는 손대지 않았고, 삭제 전 `grep -rn "notice-status" relay/src/` 로 소비자(`ws/order-handler.ts` · `tests/ws-order.test.ts`)를 확인했다. `order-api.ts` 를 524줄 → 232줄로 잘라냈는데도 wss 주문 17종이 전부 green 인 것이 그 분리의 값이다. **파일을 통째로 지우는 대신 `/healthz`+관문만 남겨 존치**했다 — uptime check 대상이 거기 있다.

- **「없어졌다」를 테스트가 잠근다.** 삭제는 테스트를 지우기만 하면 커버리지가 조용히 줄어든다. 그래서 제거한 케이스(server 15종 · relay 14종) 자리에 **라우트 부재를 단언하는 4종**을 넣었다:
  | # | 위치 | 단언 |
  |---|---|---|
  | ⓪ | server | 인증된 POST 도 **404** (403·503·400 이면 라우트가 살아 있다) + 쓰기 0건 |
  | ⓪-b | server | 미인증 POST 도 404 (401 이면 `requireAuth` 붙은 라우트가 남아 있다는 뜻) |
  | ⑪ | relay | 올바른 비밀로도 `/internal/orders` 는 404 |
  | ⑪-b | relay | 비밀 없는 `/internal/orders` 는 404 조차 못 받고 401 (경로 존재 여부도 정보다) |

- **변이 주입으로 실효성을 실측했다.** `order-api.ts` 에 더미 `POST /internal/orders`(400 반환)를 잠시 되살려 ⑪ 이 실제로 실패함을 확인하고(`Tests 1 failed | 14 passed`) 원복했다(`diff` 로 바이트 동일 확인). 첫 실행 green 을 그대로 믿지 않는다는 16-08 규율을 이어받았다.

- **배포 스크립트까지 정리했고, 정리로 끝나지 않는다는 사실을 남겼다.** env·secret·IAM 바인딩·배포 후 검증 출력 4곳을 지웠지만 **실행 중인 리비전은 그대로다.** 특히 `--update-secrets` 는 병합이라 목록에서 빼도 바인딩이 사라지지 않는다 — 16-17 에서 `--remove-env-vars=RELAY_INTERNAL_URL,ORDER_TIMEOUT_MS --remove-secrets=RELAY_ORDER_SECRET` 를 함께 넘겨야 한다는 안내를 스크립트 주석 2곳에 박았다.

- **E2E 케이스 6 「REST 라우트는 한 번도 안 탄다」가 삭제 후에도 성립한다.** orderbook 11종 전부 green (30.8s). 감시자는 클라이언트 측 `page.route` 라 서버 라우트 유무와 무관하며, 웹앱이 그 경로를 부르지 않는다는 사실만 본다 — 그 사실이 바뀌지 않았음을 실제 브라우저에서 확인했다.

## Task Commits

1. **Task 1: server POST 라우트 · relay-client · config 제거** — `b93681b` (refactor)
2. **Task 2: webapp createOrder 제거 + relay 내부 HTTP 주문 라우트 제거** — `2932fc2` (refactor)
3. **Task 3: deploy-server.sh env 정리 + 전 워크스페이스 회귀** — `c59e3aa` (chore)

## Files Created/Modified

**deleted (1건 — 계획된 것 전부, 그 외 0건)**
- `server/src/services/relay-client.ts` — relay 내부 HTTP 클라이언트. 응답 3분류(200 / 202+`ORDER_TIMEOUT` / 4xx) 매핑째 사라졌다. 같은 규율은 relay 의 `order.result` 3분류(16-08)와 브라우저의 `isUnknownOutcome`(존치)이 잇는다

**modified — server**
- `routes/orders.ts` (186 → 56줄) — `ordersRouter.post` · `recordFailure` · `ordersRateLimit` 제거. 상단 주석을 D-02(조회 전용)로 교체하고 「함께 사라진 것」을 열거
- `app.ts` — `RelayClient` import · `AppDeps.relayClient` · `app.locals.relayClient` 제거. `app.use("/api/orders", ordersRouter)` 는 유지(GET 이 남는다)
- `server.ts` — `createRelayClient` import + 결선 블록 제거
- `config.ts` — `relayInternalUrl`·`relayOrderSecret`·`orderTimeoutMs` + 미사용이 된 `optional()` 헬퍼 제거
- `errors.ts` — REST 주문 전용 에러 7종 제거, 그 자리에 「여기에 없다 + 웹앱 `ORDER_ERROR_CODES` 는 유지」 근거
- `schemas/orders.ts` — `OrderPostBody` 존치 + 「어떤 라우트에도 결선돼 있지 않다」 경고 (아래 Deviations 3)
- `services/dma-orders.ts` (282 → 118줄) — 쓰기 5함수 제거, `listTodayOrders`/`kstDayRangeUtc` 만
- `tests/routes/orders.test.ts` (673 → 258줄) — 가짜 relay 하네스 통째 제거, GET 7종 + 부재 회귀 2종

**modified — webapp / relay / scripts**
- `webapp/src/lib/orders-api.ts` — `createOrder`·`ORDER_REQUEST_TIMEOUT_MS` 제거. `listOrders`·`ORDER_ERROR_CODES`·`OrderErrorCode`·`UNKNOWN_OUTCOME_CODES`·`isUnknownOutcome`·`orderErrorCode`·`orderErrorMessage` **전부 유지**
- `relay/src/order/order-api.ts` (524 → 232줄) — `ORDERS_PATH` 라우트 + 대기 큐·타이머·`OrderRequestSchema`·`PendingOrder` 제거. `/healthz`·`relaySecretGuard`·`RelayApiError`·404·errorHandler 유지
- `relay/src/index.ts` — `createOrderApi` 에서 `orders`/`orderStore` 인자 제거. `orderStore` 는 `WsFanout` 주입만. 헤더 주석의 「내부 HTTP 는 두 개」를 정정
- `relay/tests/order-api.test.ts` (626 → 262줄) — flatbuffers·Hub·FakeSession 하네스 제거(healthz 테스트에 필요 없다), 부재 회귀 2종 추가
- `scripts/deploy-server.sh` — env 2종·secret 바인딩·IAM accessor·사전 존재 검증·배포 후 요약 출력 제거 + 16-17 후속 조치 안내

## Decisions Made

**1. `order-api.ts` 는 지우지 않고 잘라냈다.**
플랜의 제거 대상은 「`ORDERS_PATH` 라우트 블록(`/healthz` 유지)」이지 파일이 아니다. uptime check 가 그 `/healthz` 를 보고 있고(15-19), `relaySecretGuard` 는 앞으로 추가될 어떤 내부 경로에도 선행해야 한다. 파일명이 `order-api.ts` 로 남은 것이 어색하지만 **이름을 바꾸면 배포·문서·스크립트의 참조가 함께 흔들린다** — 대신 파일 첫 블록에 「주문 라우트는 여기에 없다」를 못박았다.

**2. `statusOf`/`filledQtyOf` 는 옮기지 않았다.**
플랜은 「남기거나 공용 모듈로 옮긴다(옮긴다면 import 경로를 함께 갱신)」였는데, 16-08 이 **이미** `order/notice-status.ts` 로 옮겨 두었다. 이 plan 에서 한 일은 `order-api.ts` 의 import 와 재export 를 지운 것뿐이고 `notice-status.ts` 는 바이트 하나 바뀌지 않았다. 소비자는 `ws/order-handler.ts` 와 `tests/ws-order.test.ts` 로 그대로다.

**3. `RELAY_ORDER_SECRET` 은 relay 에서 required 그대로다.**
`/healthz` 가 남는 한 관문도 남아야 하고, 관문에는 비밀이 필요하다. Secret Manager 의 `gh-radar-relay-order-secret` 도 **삭제하지 않는다** — 지우면 relay 부팅이 깨진다. 지운 것은 **server 쪽 바인딩**뿐이다 (T-16-08).

**4. 「없어졌다」의 단언은 404 여야 한다.**
`expect(r.status).not.toBe(200)` 같은 느슨한 단언은 라우트가 403·503 을 뱉는 상태(= 살아 있음)를 통과시킨다. server ⓪ 은 이전 코드에서 실제로 **503** 이 나오던 요청이고(옛 케이스 ③ 이 그것을 단언했다), 지금 404 라는 사실이 라우트 부재의 증거다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `server/src/errors.ts` 의 주문 에러 7종 제거 (files_modified 밖)**
- **Found during:** Task 1
- **Issue:** `RelayNotConfigured()` 는 doc 주석에 `RELAY_INTERNAL_URL` 을 담은 채 죽은 코드로 남고, Task 1 의 acceptance grep(`RELAY_INTERNAL_URL` 0건)이 그것을 잡는다. `OrderTimeout`·`RelayUnavailable`·`AccountNotAllowed`·`SessionNotReady`·`DmaNotAllowed` 도 유일한 소비자(`relay-client.ts`·POST 라우트)가 사라져 전부 dead 였다.
- **Fix:** 7종을 제거하고 그 자리에 「여기에 없다 + 거부 사유는 relay 가 `order.result` 로 직접 답한다 + 웹앱 `ORDER_ERROR_CODES` 는 유지」 근거 블록.
- **Files modified:** `server/src/errors.ts`
- **Verification:** `pnpm --filter @gh-radar/server test` 251종 green, `tsc --noEmit` exit 0
- **Committed in:** `b93681b`

**2. [Rule 3 - Blocking] `isDmaAllowed` 도 함께 제거 (플랜 열거 4개 밖)**
- **Found during:** Task 1
- **Issue:** 플랜은 `insertOrderRequest`·`updateOrderResult`·`patchFromRelayResult`·`resolveIsinAndMarket` 4개를 열거했지만 상위 지시는 「`listTodayOrders` 만 남긴다」였다. `isDmaAllowed` 의 유일한 호출부는 지워지는 POST 라우트였다.
- **Fix:** 삭제 전 relay 대응 구현을 grep 으로 확인(`store/credentials.ts` — D-12 allowlist 정본이 거기다) 후 제거.
- **Files modified:** `server/src/services/dma-orders.ts`
- **Verification:** `grep -rn "isDmaAllowed" server/` 0건, server 테스트 green
- **Committed in:** `b93681b`

**3. [Rule 4 회피 - 보수적 존치] `schemas/orders.ts` 의 `OrderPostBody` 는 남겼다**
- **Found during:** Task 1
- **Issue:** POST 라우트가 사라지면 이 스키마도 dead 다. 그러나 (a) 플랜의 제거 목록·files_modified 어디에도 없고, (b) `schemas/__tests__/stockCode.test.ts` 의 KRX 영문 포함 단축코드 회귀(quick-260908-fis) 6종이 이 스키마에 걸려 있다. 지우면 그 회귀 테스트까지 손대야 하는데 그것은 이 plan 의 범위 밖이다.
- **Fix:** 존치하되 doc 주석에 **「더 이상 어떤 라우트에도 결선돼 있지 않다 · 접수 형식 검사의 정본은 relay 의 `RelayOrderNewSchema`(16-03) · 이 값을 새 경로의 근거로 쓰지 말 것」** 을 명시. 아래 Deferred 에 남긴다.
- **Files modified:** `server/src/schemas/orders.ts`
- **Committed in:** `b93681b`

**4. [Rule 3 - Blocking] `deploy-server.sh` 의 relay 비밀 사전 존재 검증 루프 제거 (플랜 미기재 지점)**
- **Found during:** Task 3
- **Issue:** 플랜은 `:188,189,205,208,230~233` 을 지목했지만, 스크립트 상단(`:88~103`)에 **두 블록**이 더 있었다 — ① server SA 의 `gh-radar-relay-order-secret` accessor 바인딩, ② 그 secret 이 없으면 `exit 1` 하는 사전 검증. ②는 server 가 더 이상 읽지 않는 secret 의 부재로 **server 배포 전체를 막는다** (relay 를 안 세운 환경에서 무관한 배포까지 실패).
- **Fix:** 두 블록 모두 제거. Secret Manager 의 secret 자체와 relay SA 바인딩(`setup-relay-iam.sh` 소관)은 건드리지 않았음을 주석에 명시.
- **Files modified:** `scripts/deploy-server.sh`
- **Verification:** `bash -n` 문법 통과, 비주석 라인의 relay env/secret 참조 0건
- **Committed in:** `c59e3aa`

**5. [Rule 1 - Bug] `relay/src/index.ts` 헤더 주석의 사실 오류 정정**
- **Found during:** Task 2
- **Issue:** `:18` 이 「내부 HTTP 는 `/healthz` + `POST /internal/orders` 두 개다」라고 단언하고 있었다. 라우트를 지운 뒤에는 거짓 서술이고, 다음 사람이 이 주석을 근거로 라우트를 되메울 수 있다.
- **Fix:** 「`/healthz` 하나 · `OrderStore` 는 `WsFanout` 에만 주입 · 다시 넘기면 지운 경로가 되살아난다」 + `RELAY_ORDER_SECRET` required 유지 근거로 교체.
- **Files modified:** `relay/src/index.ts`
- **Committed in:** `2932fc2`

---

**Total deviations:** 5 auto-fixed (3 blocking, 1 bug, 1 보수적 존치)
**Impact on plan:** 전부 제거 작업이 남긴 dead code·거짓 주석·잘못된 배포 결합을 정리한 것으로, 새 기능은 0건이다. 3번은 **의도적으로 덜 지운** 경우이며 Deferred 에 명시했다.

## Deferred Issues

| 항목 | 위치 | 사유 |
|---|---|---|
| `OrderPostBody` + `stockCode.test.ts` 의 `describe("OrderPostBody.code")` 6종 | `server/src/schemas/orders.ts` · `server/src/schemas/__tests__/stockCode.test.ts` | 라우트 없는 스키마 + 그 스키마를 통해 `SHORT_CODE_RE` 를 검사하는 회귀 테스트. 정리하려면 테스트를 `SHORT_CODE_RE` 직접 검사로 옮겨야 하는데 그 회귀(quick-260908-fis)의 소유는 이 plan 이 아니다. 파일에 「새 경로의 근거로 쓰지 말 것」 경고를 남겼다 |
| Cloud Run 리비전의 `RELAY_INTERNAL_URL`·`ORDER_TIMEOUT_MS`·`RELAY_ORDER_SECRET` 실제 제거 | 실행 중 server 리비전 | 스크립트 수정으로는 사라지지 않는다. **16-17 재배포에서 `--remove-env-vars` / `--remove-secrets` 필수** (아래 Next Phase Readiness) |
| `server/src/errors.ts` 의 `ProxyUnavailable` 등 기존 에러 | — | 이 plan 과 무관, 손대지 않음 |

## Threat Flags

없음 — 이 plan 은 **공격면을 늘리지 않고 줄이기만** 했다. 새 엔드포인트·인증 경로·파일 접근·스키마 변경 0건.

| Threat ID | 처리 |
|---|---|
| T-16-11 (남아 있는 REST 주문 라우트, mitigate) | 제거 완료. grep 게이트 + 부재 회귀 4종으로 고정 |
| T-16-08 (`RELAY_ORDER_SECRET` 바인딩, mitigate) | server 스크립트에서 바인딩·IAM·사전검증 제거. **실 리비전 제거는 16-17**. Secret 자체는 relay 가 쓰므로 존치 |
| T-16-06 (`ordersRateLimit` 제거, accept) | POST 전용이었음을 실측 확인 후 함께 제거. 새 경로 상한은 16-07 연결당 토큰 버킷 |
| T-16-04 (`GET /api/orders`, mitigate) | 라우트 자체는 건드리지 않았고 `requireAuth()` + 서비스 계층 `WHERE user_id` 유지. 테스트 ⑯-a2/⑯-c 가 고정 |

## Issues Encountered

**1. 워크트리 base 가 stale 이었다.**
`git merge-base --is-ancestor 80e845f2 HEAD` 가 실패했다 — 워크트리가 `9790bec`(wave 6 이후 quick 커밋)에서 갈라져 있어 16-13~16-15 의 산출물이 없었다. 지시대로 `git merge 80e845f2 --no-edit` 로 끌어올린 뒤 진행했다. **이 plan 에서 특히 중요한 확인이었다** — stale base 위에서 삭제를 커밋했다면 wave 11~12 의 작업이 되돌려졌을 것이다. 최종 `git merge-base HEAD 80e845f2` = `80e845f28878312ced86007ee5fb3d1a713cd1a4`.

**2. 플랜의 E2E 필터명이 실제 패키지명과 달랐다.**
`pnpm --filter gh-radar-webapp` → `No projects matched the filters`. 실제 이름은 `@gh-radar/webapp` 이다. `pnpm --filter @gh-radar/webapp exec playwright test orderbook` 으로 실행했다.

**3. 워크트리에 E2E env 가 없었다.**
`webapp/.env.test.local` / `.env.local` 은 gitignore 대상이라 워크트리에 딸려오지 않는다. 메인 체크아웃에서 복사해 E2E 를 돌린 뒤 **삭제**했다(`git check-ignore` 로 커밋 위험 0 확인, 최종 `git status` 깨끗). 워크트리에서 E2E 를 돌리는 후속 plan 은 같은 절차가 필요하다.

**4. acceptance grep 과 「제거 사유를 주석으로 남긴다」가 충돌했다.**
`grep -c "RELAY_INTERNAL_URL" scripts/deploy-server.sh == 0` 과 「`--remove-env-vars` 후속 조치 안내 주석이 존재」는 동시에 만족할 수 없다(안내 주석이 그 이름을 적어야 하므로). **안내 쪽을 택했고**, 검증은 비주석 라인 기준으로 했다:
- `grep -vE '^\s*#' scripts/deploy-server.sh | grep "RELAY_INTERNAL_URL|ORDER_TIMEOUT_MS|RELAY_ORDER_SECRET"` → **0건**
- `server/src/` 도 동일: 비주석 라인 0건, 남은 3건은 전부 제거 사유 주석

## Verification

| 검증 | 결과 |
|---|---|
| `pnpm typecheck` | exit 0 (shared·relay·server·webapp·workers 12종 전부) |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 (root typecheck 가 relay `tests/` 를 exclude 하므로 별도 실행 — 인계 blindspot ②) |
| `pnpm -r test` | exit 0 — 13 패키지 전부 green (server 31파일/251종 · relay 17파일/315종 · webapp 57파일/628종 + 12 skipped/todo) |
| `pnpm --filter @gh-radar/webapp exec playwright test orderbook` | **11 passed (30.8s)** — 케이스 6「REST 라우트는 한 번도 안 탄다」포함 (인계 blindspot ①) |
| 변이 주입 (relay ⑪) | 더미 `POST /internal/orders` 재등록 → `1 failed | 14 passed` 로 실패 확인 → 원복 후 `diff` 바이트 동일 (인계 blindspot ③) |
| `bash -n scripts/deploy-server.sh` | 문법 OK |

**acceptance grep 실측**

```
grep -rn "ordersRouter.post" server/src/            → 0건
grep -rn "relayClient|RelayClient|RELAY_INTERNAL_URL|ORDER_TIMEOUT_MS" server/src/
                                                     → 비주석 0건 (주석 3건 = 제거 사유)
test -f server/src/services/relay-client.ts          → 없음
grep -c "ordersRouter.get" server/src/routes/orders.ts        → 1
grep -c "listTodayOrders" server/src/services/dma-orders.ts   → 1
grep -rn "createOrder\b" webapp/src/                 → 비주석 0건 (주석 1건)
grep -c "isUnknownOutcome|UNKNOWN_OUTCOME_CODES" webapp/src/lib/orders-api.ts → 4 (≥2 요구)
grep -rn "internal/orders" relay/src/                → 비주석 0건 (주석 1건)
grep -c "HEALTH_PATH|/healthz" relay/src/order/order-api.ts   → 10 (≥1 요구)
grep -c "relaySecretGuard" relay/src/order/order-api.ts       → 2 (≥1 요구)
grep -c "remove-env-vars" scripts/deploy-server.sh            → 2
git diff --diff-filter=D --name-only 80e845f2 HEAD  → server/src/services/relay-client.ts (1건, 계획된 것)
```

## User Setup Required

None — 이 plan 은 코드·스크립트 정리이고 새 외부 설정이 없다.

⚠️ 단, **배포 시점에 사람이 넘겨야 하는 플래그가 있다** (16-17 소관, 아래).

## Next Phase Readiness

**16-17 이 반드시 해야 할 것 — 이것을 빠뜨리면 이 plan 의 절반이 무효다:**

```bash
gcloud run services update gh-radar-server --region=asia-northeast3 \
  --remove-env-vars=RELAY_INTERNAL_URL,ORDER_TIMEOUT_MS \
  --remove-secrets=RELAY_ORDER_SECRET
```

또는 `deploy-server.sh` 재실행 시 위 두 플래그를 함께 넘긴다. `--set-env-vars` 는 전량 치환이라 **env 2종은 재배포만으로 사라지지만**, `--update-secrets` 는 **병합**이라 `RELAY_ORDER_SECRET` 바인딩은 `--remove-secrets` 없이는 남는다. (Phase 09.1 KIS 정리 선례와 동형.)

**절대 하지 말 것:** Secret Manager 의 `gh-radar-relay-order-secret` 삭제. relay 가 `/healthz` 공유 비밀 관문에 쓰고 있고, 지우면 relay 부팅이 깨진다.

**준비된 것**
- 주문 경로가 하나라 16-17 의 전량 E2E 는 wss 경로만 확인하면 된다
- server 는 relay 와 무관해졌다 — relay 가 내려가도 `/api/orders` 조회·나머지 라우트는 정상이다
- 방화벽 8091 규칙 · `relaySecretGuard` · `RELAY_ORDER_SECRET`(relay) 는 `/healthz` 가 남는 한 그대로 유지 (CONTEXT deferred 유지)

**우려**
- `OrderPostBody`(dead schema)가 남아 있다. 새 검증을 추가할 때 여기를 고치면 아무 효과가 없다 — 파일에 경고를 남겼지만 언젠가 정리 대상이다
- `relay/src/order/order-api.ts` 는 이름과 내용이 어긋난다(주문 없음, health 만). 개명은 배포·문서 참조를 흔들어 이 plan 에서 하지 않았다

## Self-Check: PASSED

- 존치를 주장한 파일 7종 전부 FOUND (`16-16-SUMMARY.md` · `routes/orders.ts` · `services/dma-orders.ts` · `webapp/lib/orders-api.ts` · `relay/order/order-api.ts` · **`relay/order/notice-status.ts`** · `scripts/deploy-server.sh`)
- 삭제를 주장한 `server/src/services/relay-client.ts` — CONFIRMED DELETED
- 커밋 3건 전부 FOUND: `b93681b` · `2932fc2` · `c59e3aa`
- `git diff --diff-filter=D --name-only 80e845f2 HEAD` = 1건 (계획된 삭제만, 계획 밖 삭제 0건)
- STATE.md / ROADMAP.md 미수정 확인 (orchestrator 소관)

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*
