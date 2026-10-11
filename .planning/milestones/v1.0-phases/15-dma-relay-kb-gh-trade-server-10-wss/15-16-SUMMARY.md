---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 16
subsystem: relay-order-account
tags: [dma, flatbuffers, orders, account-state, security, backpressure]
requires:
  - "15-15 `DmaSession.allowedAccounts` — 서버 대조를 통과한 계좌 목록 (주문 화이트리스트의 유일한 원천)"
  - "15-15 `ready` 의 새 의미 — 계좌 전량 등록 확인 완료. 이 plan 의 계좌 스냅샷 요청 트리거"
  - "15-04 `SubscriptionHub` — `\"fanout\"` 이벤트 계약, 세션 결선·generation 규율"
  - "15-05 `createOrderApi` — `X-Relay-Secret` 관문 + `TODO(D-25)` 자리"
  - "15-09 `dma_orders` 테이블 (CHECK 7종 · service_role 전용)"
  - "15-02 `envelope.ts` 조립·파싱 규약 (`takeCount` · 필드 가드 · 드롭 카운터)"
  - "15-10 `stocks.isin` — server 가 주문 요청에 실어 보내는 12자 ISIN 의 원천 (D-28)"
provides:
  - "`buildGetAccountStateReq(accountNo=\"\")` / `parseAccountState(env, isSnapshot)` — 잔고·미체결 경계"
  - "`SubscriptionHub` 계좌 캐시 + `getAccountStates(userId)` — 새 탭 즉시 응답 (D-37 동형)"
  - "`toWireSide`/`toWireMarket`/`toWireOrderType`/`ORDER_CONDITION` — 단일 문자 필드의 유일한 변환 지점 (D-21)"
  - "`buildDirectOrderReq` — 수량 0·형식 위반을 조립 전 `OrderBuildError` 로 차단"
  - "`parseOrderResp` + `sideTrusted` — 취소·정정 통보의 매매구분 불신 규율 (Pitfall 8)"
  - "`OrderStore` — `dma_orders` 비동기 갱신 큐 (`enqueueUpdate` 동기 O(1) · 200ms tick · 재시도 1회)"
  - "`POST /internal/orders` — 세션·계좌·형식 3단 검증 + 첫 통보 5초 대기 + 주문자 전용 푸시"
  - "`SubscriptionHub` `\"order\"` 이벤트 — 파싱된 통보 원문 (상관·DB 갱신용)"
affects:
  - "`HubStats` 에 `cachedAccountCount` 추가 — 필드 화이트리스트를 단언하는 테스트가 있으면 갱신 필요"
  - "`OrderApiSessions` 에 `get(userId)` 추가 — 스텁을 넣던 곳은 이제 두 메서드를 만족해야 한다"
  - "`createOrderApi` 는 `orders`+`orderStore` 를 **둘 다** 받아야 주문 라우트를 연다 (하나라도 없으면 라우트 부재)"
  - "wss 인증 직후 계좌 스냅샷이 추가로 1~N 프레임 나간다 — 브라우저는 `{t:\"acct\", snap:true}` 를 전량 교체로 처리해야 한다"
  - "`index.ts` 종료 절차에 5단계(`orderStore.flushNow`)가 생겼다"
tech-stack:
  added: []
  patterns:
    - "수신 콜백은 큐에 넣기만 한다 — 동기 O(1) `enqueueUpdate` + 별도 tick flush (D-32 백프레셔 방어)"
    - "셀렉터 없는 update 는 드롭 — `WHERE` 부재가 곧 테이블 전체 파괴이므로 형식 오류가 아니라 안전 문제로 다룬다"
    - "지어내지 않기 — 모르는 매매구분(`fromWireSide`)·모르는 주문수량(`statusOf`)은 기본값을 만들지 않고 행 스킵/`undefined`"
    - "캐시는 기계적으로만 병합한다 — 브라우저와 한 글자도 다른 규약을 쓰면 새 탭과 기존 탭이 다른 화면을 본다"
    - "타임아웃은 실패가 아니라 무지 — 202 + `ORDER_TIMEOUT` (504 는 재시도 대상 신호라 중복 주문을 부른다)"
key-files:
  created:
    - relay/src/store/orders.ts
    - relay/tests/account-state.test.ts
    - relay/tests/order-store.test.ts
  modified:
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/order/order-api.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/order-api.test.ts
    - relay/tests/helpers/frames.ts
decisions:
  - "주문 계좌 판정의 원천은 `session.allowedAccounts` **하나뿐**이다. 상태 프레임의 계좌 사본도 요청 바디도 근거로 쓰지 않는다 — 변이 시험으로 이 한 줄이 T-15-01 을 막고 있음을 확인했다"
  - "타임아웃 응답은 HTTP **202** + `{error:{code:\"ORDER_TIMEOUT\"}}`. 504 는 인프라·호출자가 재시도 대상으로 읽어 중복 주문을 부르고, 200 은 결과를 안다는 뜻이 된다. 202 = \"접수했고 처리가 끝나지 않았다\""
  - "`OrderConfirm(52)`·`TradeExecution(53)` 을 브라우저로 흘리지 않는다 — gh-trade 서버에 두 테이블의 **생성 경로가 없고**, 가격·수량이 없는 프레임을 `{t:\"order\"}` 로 지어내면 화면에 \"0주 @0\" 이 뜬다"
  - "체결 통보의 `quantity` 만 `filled_qty` 로 쓴다. 접수·거부·취소확인의 `quantity` 는 **주문**수량이라 그대로 쓰면 접수 즉시 전량 체결로 기록된다"
  - "상관 밖 체결 통보는 `status` 를 정하지 않는다 — 원주문 수량을 모르는 채 \"부분체결\"을 적으면 전량 체결이 부분체결로 남는다. `filled_qty` 만 갱신하고 판정은 행의 `qty` 를 쥔 쪽에 맡긴다"
  - "미체결 행의 매매구분이 깨지면 그 행을 **버린다**. 기본값 \"B\" 로 메우면 취소 주문이 반대 방향으로 나간다 — 계좌 목록 스킵(15-15)과 같은 규율이지만 이유가 더 무겁다"
  - "`int` 표현 범위 가드(2^31-1)는 **한도 정책이 아니다** (D-20 은 한도를 두지 않는다). 넘기면 wrap 되어 전혀 다른 수량으로 주문이 나가는 와이어 문제다"
  - "계좌 상태 캐시 병합은 기계적이다 — 수량 0 잔고를 정리하지 않는다. 브라우저가 적용하는 규약(`snap:false` = 키 upsert + `rm` 제거)과 어긋나면 탭마다 화면이 달라진다"
  - "주문 통보 파싱은 Hub 한 곳이다. 팬아웃(`{t:\"order\"}`)과 상관(`\"order\"` 이벤트)이 같은 파싱 결과를 나눠 쓴다 — 전송 경로를 두 벌 만들면 한쪽이 대상 선택을 틀리는 순간 타인 체결이 샌다"
  - "`RelayOrderMsg` 에 `side` 를 추가하지 않았다. 취소·정정 통보의 매매구분은 믿을 수 없으므로(Pitfall 8) 애초에 내려보내지 않고 UI 는 `nt` 로 \"취소\"/\"정정\" 을 고른다 — `packages/shared` 무변경"
metrics:
  duration: "~40분"
  completed: 2026-09-06
  tasks: 3
  commits: 4
  files_changed: 11
  tests: "relay 151 → 202 (+51)"
---

# Phase 15 Plan 16: 주문·계좌 축 Summary

relay 의 주문·계좌 축을 완성했다. 계좌 상태(66/67) 팬아웃, `DirectOrderReq(2)` 조립, 내부 HTTP 주문 라우트(5초 `OrderResp` 대기 + 상관), `dma_orders` 비동기 갱신 큐 4가지다. 플랜이 지목한 두 위험 — 체결·잔고가 주문자 아닌 사용자에게 새는 것(T-15-02), DMA 수신 콜백에서 DB 를 await 해 게이트웨이가 연결을 끊는 것(T-15-09) — 을 **구조로** 막고, 그 구조가 실제로 방어선인지를 변이 시험으로 확인했다.

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `envelope.ts` 계좌 경계 | `buildGetAccountStateReq` · `parseAccountState` · `fromWireExchange` · `fromWireSide` · 잔고/미체결/삭제표식 500·1000·1000 클램프 · 항목 스킵 카운터 |
| `envelope.ts` 주문 경계 | `toWireSide`/`toWireMarket`/`toWireOrderType` · `ORDER_CONDITION` · `buildDirectOrderReq`(수량 0 throw) · `parseOrderResp`(+`sideTrusted`) · `OrderBuildError` |
| `subscription-hub.ts` | 66/67 팬아웃 + 병합 캐시 + `getAccountStates` · 51 팬아웃 + `"order"` 이벤트 · `ready` 한 자리에서 재구독+계좌 재요청 |
| `store/orders.ts` (신규) | `OrderStore` — 동기 `enqueueUpdate` · 200ms tick · 재시도 1회 · 큐 상한 10k · `flushNow` · `supabaseOrderSink` |
| `order-api.ts` | `POST /internal/orders` — zod → 세션 → 계좌 → 조립 → 5초 대기 → 200/202 |
| `ws/fanout.ts` · `index.ts` | 인증 직후 계좌 캐시 전달 · `OrderStore` 결선 + 종료 절차 5단계 |
| 테스트 3파일 | `account-state.test.ts` 8건(신규) · `order-store.test.ts` 10건(신규) · `order-api.test.ts` 11 → 25건 · `envelope.test.ts` 39 → 57건 |

## Task 1 — 계좌 상태 팬아웃 (`8148620`)

```
session ready ──┬─ resubscribeAll(userId)          (기존, Pitfall 4)
                └─ requestAccountState(userId)      GetAccountStateReq(25){account_no:""}
                     ↓
                   66 스냅샷 (계좌당 1프레임) → {t:"acct", snap:true}  → 그 userId 소켓 집합
                   67 델타                    → {t:"acct", snap:false} → 그 userId 소켓 집합
                     ↓
                   캐시 `${userId}|${accountNo}` = 병합된 **전량 뷰** (snap:true)
```

**설계 판단 3가지**

1. **와이어와 캐시가 비대칭이다.** 와이어로는 받은 그대로(스냅샷/델타) 흘리고 캐시에만 전량 뷰를 둔다. 브라우저가 이미 같은 병합 규약(`snap:false` = 키 upsert + `rm` 제거)을 구현하므로, 델타를 전량으로 부풀려 보내면 프레임만 커지고 얻는 것이 없다. 캐시가 전량인 이유는 새 탭에 **1프레임으로** 내려보내야 하기 때문이다.
2. **병합은 기계적으로만 한다.** 수량 0 이 된 잔고 행을 "정리"하고 싶은 유혹이 있지만, 브라우저 규약과 한 글자라도 달라지면 새 탭과 기존 탭이 다른 화면을 본다. 무엇을 지울지는 서버가 `removed_order_nos` 로 말해 준다. `rm` 은 upsert **뒤에** 적용한다 — 같은 프레임이 한 주문을 갱신하면서 동시에 지우라고 하면 최종 상태는 "없음"이어야 한다.
3. **매매구분을 지어내지 않는다.** `fromWireSide` 가 "B"/"S" 를 못 읽으면 그 미체결 행을 버린다. 기본값으로 메우면 그 행의 취소 버튼이 **반대 방향 주문**을 낸다. 계좌 목록 항목 스킵(15-15)과 같은 규율이지만, 여기서는 대가가 오주문이라 더 무겁다.

계좌 데이터는 종목 구독과 무관하므로 참조계수 경로에 얹지 않았다. 아무 종목도 열지 않은 탭도 자기 잔고는 봐야 한다 — 그래서 `fanout.ts` 가 `sub` 을 기다리지 않고 인증 직후 캐시를 내려보낸다(Deviation 1).

## Task 2 — 주문 조립 + `dma_orders` 큐 (`a97e42c`)

**단일 문자 필드는 함수 3종에서만 만든다.** 서버가 `side`/`market`/`order_type`/`order_condition` 의 **첫 글자만** 읽기 때문에, 호출부마다 문자열을 지어내면 `"Kospi"` 가 우연히 통하고 어느 날 `"KOSDAQ"` 이 `K` 로 읽혀 **엉뚱한 시장으로 주문이 나간다**. 타입이 1차 방어이고 런타임 검사가 2차인데, 입력이 HTTP JSON 이라 2차가 실제로 필요하다.

`buildDirectOrderReq` 가 던지는 경우: ISIN 12자 위반 · 계좌번호 형식 · 거래소 화이트리스트 · **수량 0/음수/소수** · 가격 0 이하 · int 표현 범위 초과 · 취소인데 원주문번호 부재. 수량 0 은 게이트웨이까지 보내서 거부를 받아 오는 대신 여기서 막는다 — 왕복 5초를 태우고 "거부"라고 말하는 것보다 보내기 전에 이유를 정확히 말하는 편이 낫다.

**`OrderStore` 의 존재 이유는 한 줄이다: 수신 콜백에서 Supabase 를 await 하지 않는 것.** 게이트웨이는 연결당 송신 큐를 1024프레임/4MB 로 잡고 Notice 급이 그것을 넘기면 연결을 끊는다. relay 가 통보를 받고 그 자리에서 DB 왕복을 기다리면 수신이 밀리고 → 서버 큐가 차고 → 원인 불명의 주기적 연결 종료가 된다.

| 규율 | 이유 |
|------|------|
| `enqueueUpdate` 는 동기 O(1) (`await` 0건) | 위 문단 전체 (D-32) |
| 셀렉터 없으면 **드롭 + error** | `WHERE` 없는 update 는 `dma_orders` 전체를 덮는다. 형식 오류가 아니라 안전 문제다 |
| 셀렉터 우선순위 `id` → `order_no` | 같은 종목·계좌·가격 2건이 1초 안에 나가면 접수 전 거부의 귀속이 모호하다 (A10) |
| 재시도 **1회** 후 드롭 + 카운터 | 무한 재시도는 장애 중인 Supabase 를 두드리며 큐만 키운다. 드롭 수 = 감사 기록 결손량 (S-5) |
| 재큐잉은 **다음 tick** | 같은 루프에서 다시 때리면 초당 수십 번이 된다 |
| 큐 상한 10k, 오래된 것부터 | 상한이 없으면 Supabase 장애가 곧 e2-micro(1GB) OOM |
| `filled_qty` 음수는 0 으로 | `filled_qty >= 0` CHECK 위반 시 그 행의 갱신이 **통째로** 사라진다 |

## Task 3 — `POST /internal/orders` (`4958f4b`)

```
zod (형식만, 한도 없음)          위반 → 400 VALIDATION_FAILED
  ↓
sessions.get(userId).isReady    부재/미준비 → 409 SESSION_NOT_READY   (lazy 로그인 없음, D-15)
  ↓
accountNo ∈ session.allowedAccounts   불일치 → 403 ACCOUNT_NOT_ALLOWED  ★ T-15-01
  ↓
취소면 orgOrderNo 필수           부재 → 400
  ↓
buildDirectOrderReq → session.send()   송신 실패 → 즉시 409 (5초 기다리지 않는다)
  ↓
pending FIFO 등록 (userId → ISIN) + 5초 타이머
  ↓
첫 OrderResp(51)  → 200 {orderNo, resultCode, message, status}
5초 초과          → 202 {error:{code:"ORDER_TIMEOUT"}} + dma_orders.status='timeout'
이후 통보(E/C)    → Hub 가 주문자 wss 로만 푸시 + order_no 로 좁힌 DB 갱신
```

**T-15-01 이 이 plan 의 가장 중요한 한 줄이다.** 허용 계좌의 원천은 `session.allowedAccounts`(15-15 가 서버 응답과 대조해 확정한 목록) **하나뿐**이다. 상태 프레임의 계좌 목록은 브라우저로 내려간 사본이고, 요청 바디의 `accountNo` 는 애초에 신뢰 대상이 아니다. 테스트 ⑤ 는 403 을 "계좌번호 문자열이 특정 값이라서"가 아니라 "목록에 없어서"로 증명한다 — 같은 계좌번호를 `allowedAccounts` 에 넣으면 200 이 된다.

**타임아웃을 어떻게 말할 것인가**가 두 번째로 어려운 결정이었다. 504 는 "게이트웨이가 죽었다"는 뜻이고 인프라·호출자가 재시도 대상으로 읽는다 — 그것이 중복 주문이 나는 최악의 경로다. 200 은 "결과를 안다"는 뜻이 된다. **202 Accepted**("접수했고 처리가 끝나지 않았다")가 "보냈는지 안 보냈는지 모른다"의 정확한 번역이고, 바디는 S-1 의 `{error:{code,message}}` 형식이라 server 가 그대로 재매핑한다.

**상관은 `userId` → ISIN 2단으로 좁힌다.** 통보는 그 사용자의 세션에서 왔으므로 다른 사용자의 대기 주문과 섞일 수 없고(1차 격리), 그 안에서 ISIN FIFO 로 다시 좁힌다. 테스트 ⑬ 이 "같은 사용자의 다른 종목 통보가 대기 중인 주문을 깨우지 않음"을 단언한다 — 남의 통보로 응답하느니 타임아웃이 낫다.

## 테스트

| 파일 | 건수 | 내용 |
|------|------|------|
| `relay/tests/account-state.test.ts` (신규) | 8 | ① Ready → `GetAccountStateReq` 1건(빈 계좌번호) ② 66 팬아웃 ③ 67 upsert ④ `removed_order_nos` 제거 ⑤ 600→500 클램프 ⑥ 타 사용자 미수신 ⑦ 재접속 재요청 ⑧ 캐시 즉시 응답 |
| `relay/tests/order-store.test.ts` (신규) | 10 | 동기성 · tick flush · 셀렉터 부재 드롭 · 재시도 1회 후 드롭 · 재시도 성공 · 큐 상한 · 셀렉터 우선순위 · `rowPatchOf` 경계 |
| `relay/tests/order-api.test.ts` | 11 → 25 | 관문 10건(기존, ⑤ 는 404 → 400 으로 갱신) + 주문 14건 |
| `relay/src/dma/__tests__/envelope.test.ts` | 39 → 57 | 주문 조립 8 · 계좌 상태 파싱 6 · 수신 정규화 등 |
| relay 전체 | **151 → 202** | 회귀 0 |

**변이 시험으로 방어선의 유효성을 확인했다.**

| 변이 | 실패한 테스트 |
|------|--------------|
| 계좌 허용 판정의 원천을 `session.allowedAccounts` → 요청 바디로 (전형적 IDOR) | order-api ⑤ |
| 주문 통보를 전 사용자에게 팬아웃 | order-api ⑪ |
| 계좌 캐시 키에서 `userId` 제거 | account-state ③④⑥⑧ |
| `holdings` 벡터의 `takeCount` 클램프 제거 | account-state ⑤ |

기타 검증: `pnpm typecheck`(전 워크스페이스) exit 0, `typecheck:tests` exit 0, `@gh-radar/shared` 99 green, `server` 221 green, `sync-relay-schema.sh --check` 무변경(생성 41개 중 신규/변경 0).

## Deviations from Plan

### 1. [Rule 2 - 누락 기능] `ws/fanout.ts` 결선 추가 (Task 1 파일 목록 밖)

- **문제:** 계좌 스냅샷 요청 트리거가 `ready` 하나뿐이라, 세션이 이미 Ready 인 상태에서 **두 번째 탭이 붙으면** 다음 델타가 올 때까지 잔고가 빈 화면으로 남는다. 플랜의 Task 1 테스트 ⑧("캐시 hit 시 신규 wss 연결에 즉시 스냅샷 전달")이 요구하는 동작인데 그것을 실제로 수행할 결선이 파일 목록에 없었다.
- **조치:** 인증 직후 상태 프레임 전송 바로 뒤에 `hub.getAccountStates(userId)` 전량 전달을 추가(3줄). 계좌 데이터는 종목 구독과 무관하므로 `sub` 을 기다리지 않는다.
- **커밋:** `8148620`

### 2. [Rule 2 - 누락 기능] `index.ts` 결선 + 종료 절차 (Task 3 파일 목록 밖)

- **문제:** `OrderStore` 를 만들고 `orders`/`orderStore` 를 주입하지 않으면 운영에서 주문 라우트가 아예 열리지 않고 큐 tick 도 돌지 않는다. 만들어 놓고 결선하지 않은 코드는 "동작하는 척"이라 더 나쁘다.
- **조치:** `new OrderStore(supabaseOrderSink(supabase))` + `start()` + `createOrderApi({orders: hub, orderStore})`. 종료 절차에 5단계(`await orderStore.flushNow()` → `close()`)를 추가 — 없으면 마지막 체결 통보가 `dma_orders` 에 남지 않아 감사 기록에 구멍이 난다.
- **커밋:** `4958f4b`

### 3. [Rule 2 - 검증 공백] `relay/tests/order-store.test.ts` 신규 (플랜 파일 목록 밖)

- **문제:** 플랜은 Task 2 에 테스트 파일을 두지 않았다. 그런데 `OrderStore` 의 리스크는 SQL 이 아니라 **타이밍과 실패 처리**(재시도·드롭·큐 상한·셀렉터 부재)이고, 그것들은 order-api 테스트에서 간접적으로만 스쳐 지나가 무증명으로 남는다. 특히 "셀렉터 없는 update 가 테이블 전체를 덮지 않는다"는 단언이 없는 채로 넘어갈 수 없었다.
- **조치:** 쓰기 sink 를 주입 가능하게 설계(`OrderUpdateSink`)하고 Supabase 없이 큐 규율만 시험하는 10건을 추가.
- **커밋:** `a97e42c`

### 4. [계획 문구 조정] `parseOrderResp` 의 `filled_qty`

- 플랜 Task 2 는 "`order_no`, `notice_type`, `result_code`, `message`, `filled_qty` 등"을 요구했으나 **`OrderResp` 스키마에 `filled_qty` 필드가 없다**(fbs L184-227). 있는 것은 `quantity` 이고, 그 의미는 통보 종류에 따라 갈린다 — 체결 통보에서만 체결수량이고 접수·거부·취소확인에서는 **주문**수량이다(서버 `Server.cpp` L314 `useExecuted` 분기).
- `notice_type === "E"` 일 때만 `quantity` 를 `filled_qty` 로 쓰는 `filledQtyOf()` 를 두었다. 무조건 쓰면 **접수 즉시 전량 체결로 기록**된다.

### 5. [계획 문구 조정] `OrderConfirm(52)`·`TradeExecution(53)` 을 푸시하지 않는다

- 플랜 Task 3 액션 ⑥ 은 51/52/53 을 모두 주문자 wss 로 푸시하라고 지시한다. 그러나 gh-trade 서버에 **52·53 을 만드는 경로가 없다** — 체결도 51 의 `notice_type:"E"` 로 온다(fbs L221-228 · `Server.cpp` L307 명시, `grep` 으로 서버 소스에 빌더 부재 확인).
- 억지로 `{t:"order"}` 로 바꾸면 `OrderConfirm` 에는 가격·수량이 없어 화면에 **"0주 @0"** 이 뜬다. gh-trade 서버 주석이 바로 그 위험(`rc=-2` 화면을 보고 "안 나갔다"로 읽어 재주문)을 경고한다. 그래서 두 타입은 수신 시 `warn` 만 남기고 흘리지 않는다 — 오면 그 자체가 이상 신호다.
- 플랜의 must_have("이후 체결·취소확인은 주문자 wss 로만 푸시된다")는 51 하나로 완전히 충족된다.

### 6. [계획 문구 조정] 타임아웃 HTTP 상태 코드 = 202

- 플랜은 "`504` 가 아니라 `{code:\"ORDER_TIMEOUT\"}` 형태"라고만 적어 코드를 지정하지 않았다. 202 Accepted 를 골랐다 — 근거는 위 Task 3 절.

### 7. [계획 문구 조정] 상관 밖 체결 통보는 `status` 를 정하지 않는다

- 접수 이후 도착하는 체결 통보는 대기 항목이 이미 사라져 **원주문 수량을 모른다.** `filled` 와 `partially_filled` 를 가르려면 그 값이 필요하다. 모르는 채로 "부분체결"을 적으면 전량 체결이 부분체결로 남는다.
- `statusOf(notice, null)` 이 `undefined` 를 돌려주고 `filled_qty`·`notice_type` 만 갱신한다. 전량/부분 판정은 행의 `qty` 를 쥔 쪽(server 15-17 · UI 15-18)이 한다.

### 8. [Rule 2 - 안전] `int` 표현 범위 가드 추가 (플랜에 없음)

- `DirectOrderReq.price`/`quantity` 는 fbs 상 `int`(32비트)다. 2^31-1 을 넘기면 FlatBuffers 가 조용히 감싸(wrap) **전혀 다른 수량으로 주문이 나간다.**
- D-20("금액·수량 한도 없음")과 충돌하지 않는다. 한도 **정책**이 아니라 와이어 표현 가능 범위의 문제이고, 상수 이름(`MAX_INT32`)과 에러 코드(`INT32_OVERFLOW`)·주석에 그것을 명시했다. `order-api.ts` 의 한도 부재 grep(`(max|limit).*(qty|price|amount)` == 0)도 그대로 통과한다(가드는 `envelope.ts` 소관).

### 9. [계획 문구 조정] `sideTrusted` 는 wss 계약에 싣지 않는다

- 플랜은 "파싱 결과에 `sideTrusted` 를 함께 반환해 UI 가 표기를 고를 수 있게" 하라고 했다. 그런데 `RelayOrderMsg`(15-01 계약)에는 **`side` 자체가 없다** — 취소·정정 통보의 매매구분을 애초에 내려보내지 않는 설계이고, UI 는 `nt`("C"/"M")로 "취소"/"정정"을 고른다.
- 따라서 `sideTrusted` 는 relay 내부 소비자를 위한 값으로 두고 `"order"` 이벤트에만 실었다. `packages/shared` 는 건드리지 않았다 — 계약을 늘리면 webapp·server 3자가 동시에 흔들리는데, 얻는 정보는 이미 `nt` 에 있다.

### 10. [계획 문구 조정] 테스트 건수

- Task 3 은 12건을 요구했고 14건을 썼다(+⑬ ISIN 상관 격리, +⑭ 송신 실패 즉시 409). 기존 관문 테스트 10건과 합쳐 파일 전체 25건이다. 기존 ⑤("주문 라우트가 없으므로 404")는 라우트가 생겼으므로 "관문 통과 후 바디 검증에서 400"으로 갱신하고, 경로 부재 404 는 ⑤-b 로 분리했다.

### 11. [정리] `ORDER_RESP_TIMEOUT_MS` 리터럴 표기

- `5_000` → `5000`. `session.ts` 의 형제 상수 2종(`LOGIN_RESP_TIMEOUT_MS`·`ACCOUNT_RESP_TIMEOUT_MS`)과 같은 계열이라 표기를 맞췄다.
- **커밋:** `21abeac`

## 남은 리스크 · 후속 plan 인계 사항

1. **[미검증] 실계통 왕복.** 이 plan 의 검증 표면은 전부 로컬 가짜 게이트웨이다. KB 게이트웨이(`10.41.1.120`) 접속·실주문·배포는 범위 밖이며 15-19 소관이다. 특히 **실제 `OrderResp` 의 `notice_type` 채움 여부**(교보 브로커는 채우지 않아 체결도 기본값 'A' 로 온다는 gh-trade 주석)는 실계통에서만 확인된다 — 구 서버 대비 fallback(`resultCode` 판정)은 넣어 두었다.
2. **취소 주문의 첫 통보가 "A" 인지 "C" 인지 미확인.** 상관은 `noticeType` 을 보지 않고 **첫 통보**를 잡으므로 어느 쪽이 와도 응답은 나간다. 다만 `statusOf` 매핑상 "C" 면 즉시 `cancelled`, "A" 면 `accepted` 로 기록되므로 실계통에서 취소 1건을 관찰해 볼 것.
3. **`dma_orders` 실제 write 미검증.** `supabaseOrderSink` 는 타입 수준으로만 확인했다(테스트는 sink 를 주입해 큐 규율만 본다). 실제 컬럼명·CHECK 위반 여부는 15-19 첫 주문에서 드러난다 — `status` 7값·`filled_qty >= 0`·`notice_type` CHECK 부재를 마이그레이션과 대조해 맞춰 두었다.
4. **15-17(server) 인계.** ① 요청에 `orderRowId`(insert 한 행의 `id`)를 **반드시** 실어야 한다 — 없으면 relay 가 `order_no` 로만 상관해 접수 전 거부가 모호해진다. ② `isin` 은 `stocks.isin` 에서 채운다(단축코드 산술 유도 금지, D-28). ③ relay 응답 3종을 구분할 것: 200(결과 확정) / 202+`ORDER_TIMEOUT`(결과 모름 — **실패로 매핑 금지**) / 4xx·409(요청 거절). ④ server 쪽 계좌 중복 검증은 여전히 필요하다 — relay 는 최후 방어선이지 유일 방어선이 아니다.
5. **15-18(UI) 인계.** `{t:"acct"}` 의 `snap` 이 전량 교체/증분 병합을 가른다. `rm` 은 upsert 뒤에 적용해야 한다(relay 캐시와 같은 순서). `{t:"order"}` 의 `nt` 가 "C"/"M" 이면 매수/매도 대신 "취소"/"정정" 을 표기한다.

## Threat Flags

없음. 이 plan 이 만든 표면 — 내부 HTTP 주문 라우트 1개(`POST /internal/orders`), 계좌·주문 팬아웃, `dma_orders` update — 는 전부 플랜 `<threat_model>` 의 T-15-01/02/07/09/14/15/48/49 가 다룬다. 새로운 인증 경로·파일 접근·스키마 변경은 없다. 주문 라우트는 기존 `X-Relay-Secret` 관문 뒤에 있고(15-05), 관문 자체는 이 plan 이 건드리지 않았다.

## Known Stubs

없음.

## Self-Check: PASSED

- `relay/src/store/orders.ts` — FOUND
- `relay/tests/account-state.test.ts` — FOUND
- `relay/tests/order-store.test.ts` — FOUND
- `relay/src/dma/envelope.ts` (`buildGetAccountStateReq` 1, `MAX_HOLDING_COUNT`=500, `MAX_UNFILLED_COUNT`=1000, `unfilledQty` 1, 단일 문자 변환 3종, `ORDER_CONDITION`="0", `sideTrusted` 3) — FOUND
- `relay/src/hub/subscription-hub.ts` (`removed` 2, `acct` 1) — FOUND
- `relay/src/order/order-api.ts` (`TODO(D-25)` **0**, `SESSION_NOT_READY` 2, `ACCOUNT_NOT_ALLOWED` 1, `ORDER_TIMEOUT` 1, `5000` 1, 한도 grep **0**) — FOUND
- `relay/src/store/orders.ts` (`queue` 13, `dma_orders` 11, `flushNow` 6, `enqueueUpdate` 본문 `await` **0**) — FOUND
- 커밋 `8148620` / `a97e42c` / `4958f4b` / `21abeac` — FOUND
- `pnpm --filter @gh-radar/relay test` 202 green · `typecheck` + `typecheck:tests` exit 0 · `pnpm typecheck`(전체) exit 0 · shared 99 green · server 221 green · `sync-relay-schema.sh --check` 무변경 — PASS
