---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 17
subsystem: server-order-api
tags: [dma, orders, express, zod, axios, supabase, security, idor]
requires:
  - "15-16 `POST /internal/orders` — 200 / 202+ORDER_TIMEOUT / 4xx 3분류 계약과 `X-Relay-Secret` 관문"
  - "15-16 `orderRowId` 요구 — server 가 insert 한 `dma_orders.id` 를 반드시 실어야 상관이 성립한다"
  - "15-15 `session.allowedAccounts` — 계좌 소유권의 유일한 원천(relay 소관, server 는 형식만)"
  - "15-10 `stocks.isin` — 단축코드→ISIN 매핑의 원천 (D-28). 활성 42건은 아직 NULL"
  - "15-09 `dma_orders` 테이블 (CHECK 7종 · service_role 전용)"
  - "14-06 `requireAuth()` · 라우트별 rate-limit · `{error:{code,message}}` envelope"
provides:
  - "`POST /api/orders` — 인증 → allowlist → 형식 → 종목키 → 감사 → 릴레이 6단계"
  - "`GET /api/orders?date=` — KST 하루치 주문 목록 (bare array, 새로고침 복원)"
  - "`services/relay-client.ts` — relay 응답 3분류 매핑의 단일 지점 (202 ≠ 실패)"
  - "`services/dma-orders.ts` — allowlist 판정 · 단축코드→ISIN/market 변환 · 감사 insert/update · 목록 조회"
  - "`errors.ts` DMA 헬퍼 6종 (`DMA_NOT_ALLOWED`/`SESSION_NOT_READY`/`ORDER_TIMEOUT`/`RELAY_UNAVAILABLE` 502·503/`ACCOUNT_NOT_ALLOWED`)"
  - "`packages/shared` `DmaOrderRow` — `GET /api/orders` 응답 계약 (15-18 소비)"
affects:
  - "15-18(UI) — `DmaOrderRow` · 에러 코드 7종(`ISIN_UNAVAILABLE` 포함) 분기 · 클라이언트 타임아웃은 5.5초보다 길게"
  - "15-19(배포) — `deploy-server.sh` 에 `RELAY_INTERNAL_URL` env + `RELAY_ORDER_SECRET` secret 추가 필요. 미주입 시 주문만 503"
  - "`AppDeps` 에 `relayClient?` 추가 — `createApp` 를 부르는 테스트는 그대로 동작(옵션)"
tech-stack:
  added: []
  patterns:
    - "relay 응답은 3분류다 — 200(안다) / 202(모른다) / 4xx(거절). 두 분류로 줄이면 중복 주문이 난다"
    - "결과를 모르는 것과 안 나간 것을 다른 status 로 기록한다 (`timeout` vs `rejected`)"
    - "브라우저가 보낸 값으로 주문 대상을 정하지 않는다 — 종목 키는 서버가 `stocks` 에서 채운다"
    - "감사 기록은 relay 를 부르기 **전에** 남긴다. 나중에 남기면 그 사이 사고가 흔적을 지운다"
    - "감사 기록 실패가 사용자 응답을 바꾸지 않는다 — 접수된 주문이 실패로 보이는 것이 더 나쁘다"
    - "라우트 rate-limit 키는 IP 가 아니라 사용자 — 오주문은 계정 단위 사건이다"
key-files:
  created:
    - server/src/schemas/orders.ts
    - server/src/services/relay-client.ts
    - server/src/services/dma-orders.ts
    - server/src/routes/orders.ts
    - server/tests/routes/orders.test.ts
  modified:
    - server/src/config.ts
    - server/src/errors.ts
    - server/src/server.ts
    - server/src/app.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
key-decisions:
  - "relay 202 는 `OrderTimeout()`(502 `ORDER_TIMEOUT`) 로만 나간다. axios 기본 `validateStatus` 가 202 를 **성공으로 처리**하므로 `validateStatus: () => true` 로 상태 분기를 직접 한다 — 이 한 줄이 없으면 결과를 모르는 주문이 접수 성공으로 둔갑한다"
  - "클라이언트측 HTTP 타임아웃(ECONNABORTED/ETIMEDOUT)도 `ORDER_TIMEOUT` 이다. 요청은 나갔고 응답만 못 받았으므로 '실패'라고 말할 근거가 없다. `RELAY_UNAVAILABLE`(502) 은 **연결이 서지 않은** 경우로만 좁혔다 — 재시도가 안전한 유일한 분류다"
  - "relay 200 인데 본문을 해석할 수 없는 경우도 `ORDER_TIMEOUT`. 200 을 받았다는 것은 주문이 처리됐다는 뜻이므로 '연결 실패'로 말하면 거짓말이다"
  - "`RELAY_UNAVAILABLE` 은 코드 하나에 상태 둘이다 — 설정 부재 503(`RelayNotConfigured`), 런타임 도달 실패 502(`RelayUnavailable`). `ProxyUnavailable()` 선례와 같고 웹앱 분기는 하나면 된다"
  - "server 는 계좌 소유권을 재판정하지 않는다. 브라우저가 준 계좌 목록으로 2차 검증을 흉내 내면 더 약한 검사가 하나 늘 뿐이고, 원천은 relay 의 `session.allowedAccounts` 하나다 (T-15-01)"
  - "relay 왕복이 결과 없이 끝나면 요청 행을 `timeout`(모름) / `rejected`(안 나감) 로 갈라 기록한다. `requested` 로 방치하면 목록에 영원히 접수 중인 주문이 남고, 둘을 합치면 사용자가 '안 나간 주문'과 '모르는 주문'을 구별할 수 없다"
  - "`market` 변환(KOSPI→K / KOSDAQ→Q)은 `resolveIsinAndMarket` 한 곳에서만 하고 모르는 값은 기본값을 만들지 않는다 — 게이트웨이가 첫 글자만 읽으므로 지어낸 값이 엉뚱한 시장 주문이 된다"
  - "라우트 rate-limit 을 `requireAuth()` **뒤에** 둔다(30/60s, 키=`req.userId`). 순서가 뒤집히면 조용히 전원이 IP 한도를 공유한다"
  - "테스트는 relay 를 `vi.mock` 하지 않고 루프백 가짜 relay(`node:http`)에 진짜 클라이언트를 붙인다 — 202 처리는 실제 axios 왕복 위에서만 증명된다"
patterns-established:
  - "3분류 매핑: HTTP 상태와 에러 코드를 **둘 다** 본다. 코드가 우선이고 상태는 보조 — relay 가 상태코드를 바꿔도 의미는 코드가 지킨다"
  - "안전 우선 폴백: 애매하면 '실패'가 아니라 '결과 모름' 으로 떨어뜨린다. 실패로 오분류하면 사용자가 재주문한다"
  - "`.eq(\"user_id\")` 를 update 에도 건다 — 소유권 재확인이 아니라 셀렉터 사고 방어(조건이 전부 비면 update 가 테이블을 덮는다)"
requirements-completed: [RELAY-02]
duration: ~35min
completed: 2026-09-06
---

# Phase 15 Plan 17: 서버 주문 REST Summary

**브라우저와 relay 사이의 유일한 쓰기 경로를 만들었다 — `POST /api/orders` 가 인증·allowlist·형식·ISIN 매핑·감사 기록을 수행하고 relay 내부 HTTP 로 릴레이한 뒤, relay 응답 3분류(200 / 202+`ORDER_TIMEOUT` / 4xx)를 서로 구별되는 결과로 매핑한다.**

## Performance

- **Duration:** ~35분
- **Tasks:** 3/3
- **Files:** 11 (신규 5 · 수정 6)
- **Tests:** server 221 → **248** (+27, 회귀 0)

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `config.ts` | `RELAY_INTERNAL_URL`·`RELAY_ORDER_SECRET` optional + `ORDER_TIMEOUT_MS`(기본 5000) |
| `errors.ts` | `DmaNotAllowed`(403) · `SessionNotReady`(409) · `OrderTimeout`(502) · `RelayUnavailable`(502) · `RelayNotConfigured`(503) · `AccountNotAllowed`(403) |
| `schemas/orders.ts` | `OrderPostBody`(형식만, 한도 0건, 종목 키 미수령) · `OrderListQuery` |
| `services/relay-client.ts` | 사설 대역 가드 + `X-Relay-Secret` + **응답 3분류 매핑** |
| `services/dma-orders.ts` | allowlist · 단축코드→ISIN/market · 감사 insert/update · KST 하루치 조회 |
| `routes/orders.ts` | POST 6단계 + GET(bare array) + 실패 기록 규율 |
| `app.ts`·`server.ts` | `/api/orders` 결선 + `relayClient` DI(두 env 가 모두 있을 때만) |
| `packages/shared` | `DmaOrderRow` 계약 (Deviation 1) |

## Task 1 — 설정·에러·스키마·relay 클라이언트 (`eded0ea`)

**이 플랜에서 가장 값비싼 실수는 relay 응답을 잘못 분류하는 것이다.** 15-16 은 타임아웃에 504 대신 **202** 를 골랐다 — 504 는 인프라와 호출자가 "재시도해도 되는 게이트웨이 장애"로 읽고, 그것이 중복 주문이 나는 최악의 경로이기 때문이다. 그 선택은 server 가 202 를 제대로 받아 줄 때만 의미가 있다.

**그런데 axios 의 기본 `validateStatus` 는 2xx 를 전부 성공으로 처리한다.** 아무것도 하지 않으면 202 는 `res.data` 를 들고 성공 분기로 흘러들어가고, 거기서 `{error:{code:"ORDER_TIMEOUT"}}` 를 `CreateOrderResponse` 로 읽으려다 조용히 이상한 값이 되거나 — 더 나쁘게 — "결과를 모르는 주문"이 **접수 성공으로 화면에 뜬다**. 그래서 `validateStatus: () => true` 로 상태 분기를 직접 한다.

```
relay 200 → 본문 파싱 성공 → CreateOrderResponse 그대로       (결과를 안다)
relay 200 → 본문 파싱 실패 → ORDER_TIMEOUT                    (처리는 됐고 못 읽었을 뿐)
relay 202 → ORDER_TIMEOUT                                      (결과를 모른다)
relay 409 → SESSION_NOT_READY (409)
relay 403 → ACCOUNT_NOT_ALLOWED (403)
relay 400 → VALIDATION_FAILED (400, 원문은 로그에만)
relay 401 → INTERNAL_ERROR (500 generic — 오라클이 되지 않게)
그 외 4xx·5xx·404 → RELAY_UNAVAILABLE (502)
연결 실패(ECONNREFUSED 등) → RELAY_UNAVAILABLE (502)
응답 타임아웃(ECONNABORTED/ETIMEDOUT) → ORDER_TIMEOUT
```

마지막 두 줄의 구분이 계획서에 없던 판단이다(Deviation 3). "연결 실패 → 502" 만 보고 모든 네트워크 오류를 502 로 묶으면, **relay 가 5.5초 안에 답하지 못한 경우**까지 "주문 서버에 연결할 수 없어요"가 된다. 그런데 그때 요청은 이미 나갔고 게이트웨이까지 갔을 수 있다 — 재시도가 안전한 것은 **연결 자체가 서지 않은 경우뿐**이다.

**타임아웃 문구에 "실패"를 쓰지 않는다.** 상태코드는 5xx 로 두되(성공이 아니므로) 구분은 `code` 로 한다. 504 를 피한 이유는 relay 가 202 를 고른 이유와 같다.

**사설 대역 가드.** Bright Data 는 `https://` 를 강제했지만 여기는 VPC 내부 평문 http 라(D-08) 같은 가드를 쓸 수 없다. 대신 호스트가 `10.10.0.0/26`(Direct VPC Egress 서브넷) 안인지 부팅 시 확인한다 — 공유 비밀이 오타 하나로 인터넷의 임의 호스트로 나가느니 서버가 안 뜨는 편이 낫다. 비프로덕션에서만 루프백을 허용한다(Deviation 2).

## Task 2 — 주문 서비스 + 라우터 (`50ac0ef`)

```
POST /api/orders
  requireAuth()                    미인증 → 401 UNAUTHENTICATED       T-15-03
  ordersRateLimit (30/60s, key=userId)
  ① relayClient 미주입             → 503 RELAY_UNAVAILABLE (설정 부재)
  ② OrderPostBody.safeParse        → 400 VALIDATION_FAILED (한도 없음, D-20)
  ③ isDmaAllowed                   → 403 DMA_NOT_ALLOWED               T-15-01 ①
  ④ resolveIsinAndMarket           → 404 / 422 ISIN_UNAVAILABLE        T-15-50
  ⑤ insertOrderRequest             → dma_orders status='requested'     D-24
  ⑥ relayClient.postOrder          → 3분류 매핑 (계좌 판정은 relay)    T-15-01 ②
  ⑦ updateOrderResult              → 결과 기록 후 res.json
```

**브라우저가 보낸 값으로 주문 대상을 정하지 않는다.** 12자 표준코드를 바디에서 받으면 화면에 보이는 종목과 실제로 나가는 주문이 달라질 수 있다(T-15-50). 스키마에 `isin` 이 **0건**인 것이 그 방어선이고, acceptance 가 그 grep 을 검사한다. 서버는 6자 코드로 `stocks` 를 조회해 채운다.

**ISIN 부재는 이론이 아니라 실제 경우다.** 15-10 백필 후에도 활성 종목 42건이 NULL 이다. null 을 그대로 relay 로 흘리면 조립 단계에서 거부되지만, 그때는 이미 감사 행이 만들어졌고 왕복 비용도 치른 뒤다. 422 `ISIN_UNAVAILABLE` 로 먼저 끊고 relay 를 부르지 않는다.

**감사 기록을 relay 호출 *전에* 남긴다.** 나중에 남기면 그 사이에 프로세스가 죽었을 때 "나갔는지 모르는 주문"이 흔적 없이 사라진다. 그리고 반환된 `id` 가 relay 상관의 1순위 키(`orderRowId`)다 — 이것이 없으면 relay 는 `order_no` 로만 상관해야 하는데, 접수 전 거부는 주문번호가 없어 귀속이 모호해진다(15-16 인계 ①).

**결과 없이 끝났을 때 무엇을 적을 것인가**가 이 Task 에서 계획서를 넘어선 판단이다(Deviation 4).

| 끝난 방식 | `dma_orders.status` | 근거 |
|-----------|--------------------|------|
| relay 200 | relay 판정 그대로 | 결과를 안다 |
| `ORDER_TIMEOUT` | `timeout` | **모른다.** 나갔을 수 있다 |
| 4xx 거절·연결 실패 | `rejected` | 보내기 전에 끝났다 |
| (그대로 두기) | ~~`requested`~~ | 목록에 **영원히 접수 중인 주문**이 남는다 |

`timeout` 과 `rejected` 를 합치면 사용자는 "안 나간 주문"과 "모르는 주문"을 구별할 수 없고, 그 혼동이 곧 재주문으로 인한 중복 체결이다.

**계좌 소유권을 server 가 재판정하지 않는다.** 15-16 인계 ④ 는 "server 쪽 계좌 중복 검증이 여전히 필요하다"고 적었지만, server 가 대조할 수 있는 계좌 목록은 **브라우저가 상태 프레임으로 받은 사본**뿐이다. 그것으로 검사하면 방어선이 하나 느는 게 아니라 **더 약한 검사가 하나 느는 것**이고, 진짜 방어선이 relay 에 있다는 사실을 흐린다. server 는 형식(길이·문자)만 보고 relay 403 을 그대로 전달하며, 그 사실을 코드 주석에 남겼다(Deviation 5).

**rate-limit 키는 사용자다.** 목적이 비용이 아니라 오주문 방어이므로 계정 단위여야 하고, 같은 캐리어 NAT 뒤의 두 사용자가 서로의 한도를 갉아먹으면 안 된다. 그래서 `requireAuth()` **뒤**에 둔다 — 순서가 뒤집히면 `req.userId` 가 비어 조용히 전원이 IP 한도를 공유한다.

## Task 3 — 테스트 27건 (`51887c9`)

**relay 를 `vi.mock` 으로 스텁하지 않았다**(Deviation 6). 이 플랜에서 가장 값비싼 로직은 3분류 매핑이고 그것은 `relay-client.ts` 안에 있다. 클라이언트를 통째로 스텁하면 검증해야 할 코드가 테스트에서 빠지고, 특히 **axios 의 202 처리**는 실제 HTTP 왕복 위에서만 드러난다. 그래서 `node:http` 로 루프백 가짜 relay 를 띄우고 진짜 클라이언트를 붙였다(외부 네트워크 0). 덕분에 `X-Relay-Secret` 헤더와 **relay 가 실제로 받은 바디**까지 단언할 수 있다.

| 그룹 | 건수 | 내용 |
|------|------|------|
| 관문 | 3 | 미인증 401 · 잘못된 토큰 401 · `relayClient` 미주입 503 |
| 형식 | 6 | 코드 5자리 · 수량 0 · 가격 -1 · 수량 1.5 · 취소 원주문번호 부재 → 400, **한도 없음 회귀**(qty 1,000,000 / price 999,999 가 relay 까지 도달) |
| allowlist·종목키 | 4 | 매핑 없음 403 · 암호문 컬럼 미조회 · `isin` null 422 · 없는 종목 404 |
| 정상 | 2 | 서버가 채운 종목키 + `market` "K"/"Q" 가 relay 바디에 실림 · 감사 insert/update 각 1회 + 소유권 필터 |
| **응답 매핑** | 7 | 409 · 403 · **202 `ORDER_TIMEOUT`**(status='timeout', 문구에 "실패" 없음, 200 아님, **504 아님**) · 연결 실패 502(+`rejected` 기록) · 401 generic 500(비밀·기대값·원문 미노출) · 400 원문 미노출 · 200 본문 해석 실패 → 결과 모름 |
| GET | 5 | 미인증 401 · bare array + camelCase · **`WHERE user_id` 가 요청자 id** · KST 반열린 구간 · 존재하지 않는 날짜 400 |

검증: `server` **248 green**(221 → +27, 회귀 0) · `pnpm typecheck`(전 워크스페이스) exit 0 · `pnpm --filter @gh-radar/server run build` exit 0 · `shared` 99 green · `relay` 202 green.

acceptance grep 전건 통과: `schemas/orders.ts` 의 `isin` **0건** · 한도 정규식 **0건** · `dma-orders.ts` 의 암호문 컬럼 **0건** · `eq("user_id"` 5건 · `app.ts` 의 `/api/orders` 1건.

## Deviations from Plan

### 1. [Rule 2 - 누락 계약] `packages/shared` 에 `DmaOrderRow` 추가

- **문제:** `GET /api/orders` 는 bare array 를 반환하는데 그 원소 타입이 어디에도 없었다. 15-18 플랜은 `listOrders(date?): Promise<DmaOrderRow[]>` 를 명시하지만 그 타입이 존재하지 않는다(`grep` 으로 전 저장소 0건 확인). 서버에만 두면 webapp 이 같은 모양을 손으로 다시 적게 되고, `relay.ts` 의 docblock 이 선언한 "3자 공유 계약의 단일 진실 소스" 원칙과 어긋난다.
- **조치:** `packages/shared/src/relay.ts` 에 `DmaOrderRow`(+ index 재수출)를 추가했다. 파일 끝 append 라 병렬 작업 중인 15-13(webapp 전용)과 충돌면이 없다.
- **판단:** `userId` 는 **싣지 않는다** — 항상 요청자 본인 행만 나가므로 실을 이유가 없다. 대신 소유권 필터는 mock 이 기록한 `eq` 호출로 단언한다(더 강한 단언이다).
- **커밋:** `50ac0ef`

### 2. [Rule 2 - 개발 가능성] 사설 대역 가드에 비프로덕션 루프백 예외

- **문제:** 플랜은 "`10.10.0.0/26` 사설 IP 가 아니면 부팅 시 throw" 를 지시한다. 그대로 두면 로컬·테스트에서 가짜 relay 를 세울 방법이 전혀 없어 Task 3 의 실 HTTP 검증이 불가능해진다.
- **조치:** `nodeEnv !== "production"` 일 때만 `127.0.0.1`/`localhost`/`::1` 을 추가 허용한다. 프로덕션은 서브넷 밖 전부 throw 로 그대로다.
- **근거:** 이 가드가 막는 것은 "공유 비밀이 **인터넷의 임의 호스트**로 나가는 것"인데, 루프백은 그 정의상 머신 밖으로 나가지 않는다. 프로덕션 경로는 조금도 느슨해지지 않았다.
- **커밋:** `eded0ea`

### 3. [Rule 2 - 안전] 응답 타임아웃과 연결 실패를 다르게 매핑

- **문제:** RESEARCH Pattern 10 은 "relay 5xx/연결실패 → 502 `RELAY_UNAVAILABLE`" 만 적었다. 그대로 구현하면 **axios 클라이언트 타임아웃**(relay 가 5.5초 안에 답하지 못한 경우)도 "주문 서버에 연결할 수 없어요"가 된다. 그때 요청은 이미 나갔고 게이트웨이까지 갔을 수 있다 — 사용자가 "안 나갔구나" 하고 재주문하면 중복 체결이다.
- **조치:** `ECONNABORTED`/`ETIMEDOUT` → `ORDER_TIMEOUT`(결과 모름), 그 외 연결 오류 → `RELAY_UNAVAILABLE`(502). 재시도가 안전한 분류를 **연결이 서지 않은 경우로만** 좁혔다. 같은 이유로 relay 200 인데 본문을 해석하지 못한 경우도 `ORDER_TIMEOUT` 이다 — 200 을 받았다는 것은 처리됐다는 뜻이므로 "연결 실패"는 거짓말이다.
- **커밋:** `eded0ea` (테스트 ⑬·⑭-c)

### 4. [Rule 2 - 감사 공백] relay 왕복 실패 시 요청 행 마무리

- **문제:** 플랜은 `ORDER_TIMEOUT` 일 때 `status='timeout'` 만 지시하고 나머지 실패 경로(4xx 거절·연결 실패·설정 오류)는 언급하지 않았다. 그대로 두면 그 행들이 `requested` 로 남아 **오늘 주문 목록에 영원히 접수 중인 주문**이 쌓인다.
- **조치:** `recordFailure()` 를 두어 `ORDER_TIMEOUT` → `timeout`, 그 외 → `rejected` 로 갈라 기록한다. 기록 자체가 실패하면 `logger.error` 로 남기고 삼키지 않는다(S-5) — 다만 **사용자 응답은 바꾸지 않는다.** 주문은 이미 나갔는데 감사 기록 실패를 이유로 오류를 돌려주면 "실제로는 접수됐는데 실패로 보이는" 최악의 화면이 된다.
- **커밋:** `50ac0ef` (테스트 ⑫·⑬)

### 5. [계획 문구 조정] server 쪽 계좌 중복 검증을 넣지 않았다

- 15-16 인계 ④ 는 "server 쪽 계좌 중복 검증은 여전히 필요하다"고 적었다. 그러나 server 가 대조할 수 있는 계좌 목록은 **브라우저가 상태 프레임으로 받은 사본**뿐이고, 그것을 근거로 삼는 검사는 방어선이 아니라 **IDOR 그 자체**다(15-16 의 변이 시험이 정확히 그 변이를 잡아냈다).
- server 는 `accountNo` 의 **형식**(길이 1~12)만 보고, 소유권 판정은 relay 의 `session.allowedAccounts` 에 맡기며 403 을 그대로 전달한다. 그 사실을 라우터 주석에 남겼다. 플랜의 must_have("D-12: 미인증 401 / 매핑 없음 403 / Ready 세션 없음 409 가 구분된다")는 그대로 충족된다.
- 대신 server 가 실제로 지는 소유권 책임 — `GET` 의 `WHERE user_id`, `update` 의 이중 셀렉터 — 은 전부 명시 필터로 강제했다.

### 6. [계획 문구 조정] `vi.mock` 대신 루프백 가짜 relay

- 플랜 Task 3 은 "`vi.mock` 으로 `relay-client` 를 스텁한다(네트워크 없음)"를 지시했다. 그렇게 하면 이 플랜의 핵심 로직(3분류 매핑)이 **테스트에서 통째로 빠진다** — 특히 axios 가 202 를 성공으로 처리한다는 사실은 스텁 위에서는 절대 드러나지 않는다.
- `node:http` 루프백 서버로 바꿨다. "네트워크 없음"의 취지(외부 의존·비결정성 제거)는 그대로 지켜지고(127.0.0.1, 포트 0 자동 할당, 테스트마다 close), 얻는 것이 크다: 공유 비밀 헤더·경로·relay 가 실제로 받은 바디를 단언할 수 있다.
- 테스트 건수도 16 → **27** 로 늘었다(추가분: KOSDAQ market "Q", 없는 종목 404, 암호문 미조회, relay 400 원문 미노출, 200 본문 해석 실패, GET 날짜 경계 2건 등).

### 7. [Rule 2 - 버그 방어] `GET ?date=` 의 존재하지 않는 날짜

- `date=2026-13-45` 는 zod 정규식(`\d{4}-\d{2}-\d{2}`)을 통과하지만 `new Date(...)` 가 Invalid Date 를 낸다. 그대로 두면 `toISOString()` 이 `RangeError` 를 던져 **400 이어야 할 요청이 500** 이 된다.
- `kstDayRangeUtc()` 에서 `Number.isNaN(getTime())` 을 검사해 400 `VALIDATION_FAILED` 로 떨어뜨린다. 테스트 ⑯-e.

### 8. [정리] `RelayNotConfigured()` 헬퍼 추가 (플랜의 4개 → 6개)

- 플랜 Task 1 은 `RelayUnavailable()` 를 **502** 로 지정했고, Task 2 는 `relayClient` 미주입 시 **503** 을 지시했다(테스트 ③=503, ⑬=502). 한 헬퍼로는 둘을 만족할 수 없다.
- 코드는 `RELAY_UNAVAILABLE` 로 같게 두고(웹앱 분기 1개면 충분) 상태만 나눈 `RelayNotConfigured()`(503) 를 더했다. `ProxyUnavailable()`(설정 부재 503) 선례와 같은 구성이다.

### 9. [정리] `StockNotFound(code)` 재사용

- 플랜은 종목 부재 처리를 명시하지 않았다. `errors.ts` 의 기존 `StockNotFound(code)`(404) 를 그대로 쓴다 — 플랜 `read_first` 가 지목한 `stocks.ts` 선례와 같다. `ISIN_UNAVAILABLE`(422, "종목은 있는데 주문 키가 없다")과 의미가 다르므로 코드를 분리했다.

## 남은 리스크 · 후속 plan 인계 사항

1. **[미검증] 실계통 왕복.** 이 플랜의 검증 표면은 전부 루프백 가짜 relay다. 실제 relay·KB 게이트웨이 접속·실주문·배포는 **15-19 소관**이며 이 플랜에서 배포·`openconnect` 기동·실주문을 일절 수행하지 않았다.
2. **[15-19] `deploy-server.sh` env 주입이 남아 있다.** `RELAY_INTERNAL_URL`(env)·`RELAY_ORDER_SECRET`(secret)이 없으면 `POST /api/orders` 만 **503** 이고 나머지 라우트는 정상이다(의도된 부분 롤아웃). `--set-env-vars` 는 **전량 치환**이라 기존 키를 하나라도 빠뜨리면 초기화된다 — 15-19 플랜이 L143-144 수정 지점을 이미 지목하고 있다. 새 secret 버전 작성은 이 환경에서 차단되어 시도하지 않았다.
3. **[15-19] `dma_orders` 실제 write 는 여전히 미검증.** 이 플랜의 테스트는 mock 위에서 컬럼명·필터를 단언한다. 실제 CHECK 제약(`qty>0`·`price>0`·`filled_qty>=0`·`status` 7값) 충돌 여부는 첫 실주문에서 드러난다. `insert` 는 `status` 를 넣지 않아 DB 기본값 `'requested'` 를 쓰고, `update` 는 7값 도메인 안의 값만 쓴다.
4. **[15-18] 인계.** ① 에러 코드 7종을 분기할 것: `DMA_NOT_ALLOWED`(403) / `SESSION_NOT_READY`(409) / `ACCOUNT_NOT_ALLOWED`(403) / `ISIN_UNAVAILABLE`(422) / `ORDER_TIMEOUT`(502) / `RELAY_UNAVAILABLE`(502·503) / `VALIDATION_FAILED`(400). ② **`ORDER_TIMEOUT` 을 실패로 렌더하지 말 것** — "결과 확인 중, 미체결 목록을 확인하세요"이고 재주문 버튼을 막아야 한다. ③ 클라이언트 타임아웃은 **5.5초보다 길게**(예: 9,000ms) — server 는 relay 5초 + 여유 0.5초를 기다린다. ④ `GET /api/orders` 는 bare array 이고 원소는 `DmaOrderRow` 다.
5. **[운영] rate-limit 30/60s 는 추정값이다.** 오주문 방어가 목적이라 챗(20/60s)보다 촘촘히 잡았지만 실제 분할 주문 습관을 보고 조정할 여지가 있다. 값 변경 시 `routes/orders.ts` 한 곳이면 된다.
6. **[정책] 서버측 금액·수량 한도 없음(D-20)은 `accept` 된 리스크다.** 테스트 ⑮(qty 1,000,000 / price 999,999 통과)가 그 결정의 **회귀 방지**이자 기록이다. 오주문 사고 시 재검토 대상(Deferred Ideas). relay 의 int32 표현 범위 가드는 한도 정책이 아니라 와이어 문제이므로 이 결정과 충돌하지 않는다.

## Threat Flags

없음. 이 플랜이 만든 표면 — 공개 REST 2개(`POST`/`GET /api/orders`)와 relay 로의 내부 HTTP 호출 — 은 전부 플랜 `<threat_model>` 의 T-15-01/03/05/06/07/14/48/50/51 이 다룬다. 새 인증 경로(기존 `requireAuth()` 재사용)·파일 접근·스키마 변경은 없다. `packages/shared` 에 추가한 `DmaOrderRow` 는 타입 선언이라 런타임 표면이 없다.

## Known Stubs

없음.

## Self-Check: PASSED

- `server/src/schemas/orders.ts` — FOUND (`isin` 0건 · 한도 정규식 0건)
- `server/src/services/relay-client.ts` — FOUND (`X-Relay-Secret` 2 · `10.10.0` 2 · `validateStatus` 1)
- `server/src/services/dma-orders.ts` — FOUND (암호문 컬럼 0건 · `eq("user_id"` 5 · `ISIN_UNAVAILABLE` 1)
- `server/src/routes/orders.ts` — FOUND (`requireAuth()` 4 · `DmaNotAllowed` 2)
- `server/tests/routes/orders.test.ts` — FOUND (`ORDER_TIMEOUT` 6 · `ACCOUNT_NOT_ALLOWED` 3 · 한도 회귀 3)
- `server/src/config.ts` — FOUND (`relayInternalUrl` 2 · 같은 블록에 "503" 주석)
- `server/src/app.ts` — FOUND (`/api/orders` 1건)
- 커밋 `eded0ea` / `50ac0ef` / `51887c9` — FOUND
- `server` 248 green (221 → +27, 회귀 0) · `pnpm typecheck`(전 워크스페이스) exit 0 · `server build` exit 0 · `shared` 99 green · `relay` 202 green — PASS
- 배포·KB 게이트웨이 접속·실주문 **0건** (범위 밖, 15-19 소관) — PASS
