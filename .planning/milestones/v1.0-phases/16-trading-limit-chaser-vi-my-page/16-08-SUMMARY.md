---
phase: 16-trading-limit-chaser-vi-my-page
plan: 08
subsystem: api
tags: [relay, websocket, order, dma, correlation, timeout, audit, supabase, typescript]

# Dependency graph
requires:
  - phase: 16-03
    provides: RelayOrderNewSchema / RelayOrderCancelSchema 인바운드 계약 (market 미수신 · orgOrderNo 필수)
  - phase: 16-05
    provides: parseOrderResp 의 origin 원문 + toOrderOrigin + ParsedOrderResp.originKind
  - phase: 16-06
    provides: Hub 전략 캐시 (getLimitChasers / getViTrigger) — 자동주문 행의 계좌 출처
  - phase: 16-07
    provides: FanoutSessions.get · #onAuthedMessage 분기 자리 · #send · keyOf 좁히기 선행 배치
provides:
  - "wss 주문 요청/응답 5초 상관 — order.new/order.cancel → order.result (D-02)"
  - "상관은 **연결 스코프** — order.result 는 요청 연결에만, 51 푸시는 사용자 전 연결 (T-16-03)"
  - "OrderStore.insertRequest / findIdByOrderNo — dma_orders insert·update 를 relay 가 전담 (D-03)"
  - "SymbolInfo.market + toOrderMarket — ISIN → 단축코드·시장, 모르면 null (T-16-05)"
  - "자동주문(상따·VI) 통보의 insert 분기 — 0행 update 로 사라지던 감사 기록 복구 (T-16-07)"
  - "order/notice-status.ts — statusOf·filledQtyOf·ORDER_RESP_TIMEOUT_MS 의 HTTP·wss 공용 정본"
  - "relay/tests/ws-order.test.ts 17종 (변이 주입 10종으로 실효성 실측)"
affects: [16-09, 16-10, 16-11, 16-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "중복 판정은 `await` **앞에서 동기적으로** 잡는다 — pending 만 보는 검사는 insert 대기 중 두 번째 클릭을 통과시킨다"
    - "16-16 에서 지워질 파일에 공용 로직을 두지 않는다 — 삭제가 곧 다른 경로의 붕괴다"
    - "테스트가 첫 실행에 green 이면 변이 주입으로 실측한다. 이번엔 그 실측이 **공허한 단언 2건**을 찾아냈다"
    - "「관측 가능한 경계」를 고른다 — 닫힌 소켓에는 `#send` 가 어차피 안 쓰므로 프레임 부재는 타이머 정리를 증명하지 못한다"

key-files:
  created:
    - relay/src/ws/order-handler.ts
    - relay/src/order/notice-status.ts
    - relay/tests/ws-order.test.ts
  modified:
    - relay/src/store/symbols.ts
    - relay/src/store/orders.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/src/order/order-api.ts
    - relay/tests/symbols.test.ts
    - relay/tests/order-store.test.ts
    - relay/tests/account-state.test.ts
    - relay/tests/strategy-hub.test.ts

key-decisions:
  - "`OrderResp(51)` 에는 **계좌번호 필드가 아예 없다**(fbs 원문 확인). 플랜이 가정한 「통보 값」이 존재하지 않아, 자동주문 행의 계좌를 게이트웨이가 에코한 **전략 등록값**(60 상따 / 61 VI)에서 얻는다 — 지어낸 값이 아니라 서버가 준 값이다. 없으면 세션의 **단일** 허용 계좌, 그것도 없으면 빈 문자열 + warn (감사 우선, 오귀속 금지)"
  - "거부·타임아웃 프레임의 `resultCode` 는 `-1` 이다. 게이트웨이 코드는 0 이상이라 음수가 곧 「relay 자체 판정」이 된다 — `0` 을 쓰면 계약상 「성공」으로 읽힌다. 이 값은 DB 에 쓰지 않는다"
  - "모든 거부를 `{t:\"order.result\", status:\"rejected\"}` 로 닫는다. 전략과 달리 주문에는 `rid` 가 있어 상태 프레임·`{t:\"msg\"}` 로 답하면 브라우저의 제출 버튼이 영원히 잠긴다"
  - "중복 판정 스코프는 **연결**이다. T-16-10 이 지목한 것은 재전송·더블클릭이고 둘 다 같은 연결에서 일어난다. 사용자 단위로 넓히면 두 탭의 정당한 동일 주문을 막는다"
  - "`statusOf`/`filledQtyOf`/`ORDER_RESP_TIMEOUT_MS` 를 `order/notice-status.ts` 로 옮겼다. 플랜은 `order-api.ts` 에서 import 하라고 했지만 그 파일은 **16-16 에서 삭제**된다 — 거기에 두면 삭제와 함께 wss 경로가 무너진다"
  - "기록에 실패하면 주문을 **보내지 않는다**. 감사 없는 실주문보다 「지금 못 보낸다」가 낫다 (D-24)"
  - "취소 행의 `side` 는 표시용이 아니다. 취소 통보에 매매구분이 없어(Pitfall 8) CHECK 통과용 \"S\" 를 쓰고, 방향의 정본은 `org_order_no` 가 가리키는 원주문 행이다 — 수동·자동 두 경로에 같은 규율을 적었다"

patterns-established:
  - "wss 인바운드 분기 골격에 주문 2종이 합류했다: 상한 → 재인증 가드 → unauthorized 가드 → 전략 4종 → **주문 2종** → keyOf 좁히기 → 시세 구독"
  - "핸들러는 소켓을 모른다. `send` 를 주입받아 `WsFanout.#send` 하나만 탄다 (T-16-02 전송 경로 추가 0)"

requirements-completed: [TRADE-03]

# Metrics
duration: 26min
completed: 2026-09-08
---

# Phase 16 Plan 08: 주문 wss 이관 Summary

**브라우저가 ISIN 만 보내면 relay 가 단축코드·시장을 풀고 `dma_orders` 행을 만든 뒤 게이트웨이로 보내 5초 안에 `order.result` 로 답한다 — 상관은 연결 스코프(T-16-03), 계좌 근거는 `allowedAccounts` 단독(T-16-01), 5초 초과는 「실패」가 아니라 「결과 모름」(Pitfall 9), 그리고 대기열에 없는 상따·VI 통보는 조용히 사라지는 대신 새 행으로 남는다(T-16-07)**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-08T11:45:00Z
- **Completed:** 2026-09-08T12:11:28Z
- **Tasks:** 3 (커밋 4건 — Task 2 의 「이동만 하는 변경」을 별도 커밋으로 분리)
- **Files:** created 3, modified 9

## Accomplishments

- **주문 경로가 wss 로 이어졌다.** `order.new`/`order.cancel` 이 16-07 이 비워 둔 자리(전략 4종 옆, `keyOf` 좁히기 **앞** — Pitfall 14)에 붙었고, `order-api.ts:340~565` 의 ①~⑤ 순서·`statusOf`·`filledQtyOf`·타임아웃 문구를 **그대로** 옮겼다. 재구현 0건이다(`grep -cE "function (statusOf|filledQtyOf)"` = 0).
- **브라우저가 정하던 두 값을 relay 가 뺏어 왔다.** `market`·`stock_code` 는 이제 `SymbolMap.lookup(isin)` 이 채운다. 모르는 시장은 **`null` 이고 거부**다 — 기본값 `"K"` 로 메우면 코스닥 주문이 코스피로 나간다(T-16-05). 테스트 ⑥ 이 「게이트웨이로 0바이트」로 이 방어를 못박는다.
- **`dma_orders` 의 insert 가 relay 로 왔다** (D-03). `insertRequest` 는 큐잉하지 않고 `await` 한다 — 반환 `id` 가 상관 1순위 키(A10)라 게이트웨이로 보내기 **전에** 손에 쥐고 있어야 한다. update 는 여전히 큐다(D-32 규율 불변, 테스트 ⑬ 이 고정).
- **자동주문 감사 구멍을 막았다.** PostgREST 의 update 는 대상이 0행이어도 에러가 아니다 — 조회 없이 `order_no` 로 갱신만 하던 기존 경로에서는 **상따·VI 자동주문 통보가 통째로 사라지고 있었다**. 이제 `origin` 이 `manual` 이 아니면 행 유무를 먼저 묻고, 없으면 새 행을 만든다.
- **중복 주문 방어를 `await` 앞으로 당겼다.** 대기열만 보는 검사는 insert 를 기다리는 동안 들어온 두 번째 클릭을 **비어 있는 큐**를 보고 통과시킨다. 그래서 요청 키(`rid` · `(계좌,ISIN,side,가격,수량)`)를 동기적으로 먼저 잡고 어느 경로로 끝나든 놓는다. 테스트 ⑦ 이 「거부 2건, 게이트웨이로 나간 것은 1건」으로 고정한다.
- **전송 경로 추가 0.** `grep -c "new WebSocket|conn.ws.send("` 가 이 plan 전후로 **똑같이 2** 다. 핸들러는 소켓을 모르고 `WsFanout.#send` 를 주입받는다 (T-16-02).
- **주기 타이머 추가 0** (D-13). 핸들러의 `setInterval` 은 0건이고, `setTimeout` 은 요청 1건당 1개이며 정산·거부·송신실패·연결종료 어느 경로로 끝나든 `clearTimeout` 된다.
- **변이 주입 10종으로 실효성을 실측했고, 그 실측이 공허한 단언 2건을 찾아냈다** (아래 Verification). 이것이 이 plan 에서 가장 중요한 결과다.

## Task Commits

1. **Task 1: `SymbolMap.market` + `OrderStore` insert 경로** — `cf95de6` (feat)
2. **Task 2-①: `statusOf`·`filledQtyOf`·5초 상한을 중립 모듈로 이동 (동작 변화 0)** — `e249a0e` (refactor)
3. **Task 2-②: wss 주문 핸들러 + fanout·index 결선** — `7a6288b` (feat)
4. **Task 3: 자동주문 insert 분기 + ws-order 테스트 17종** — `6abdd2f` (feat)

## Files Created/Modified

**created**
- `relay/src/ws/order-handler.ts` — `createOrderHandler<C>`. 「결정 근거 / 함정 / 하지 않는 것」 3블록 주석, ①~⑤ 번호 주석 보존, 연결 스코프 `Map<C, ConnState>`, `claims`/`pending` 분리, 자동주문 `autoInsertRow`/`strategyOf`/`soleAccountOf`
- `relay/src/order/notice-status.ts` — `ORDER_RESP_TIMEOUT_MS` · `statusOf` · `filledQtyOf` (HTTP·wss 공용 정본)
- `relay/tests/ws-order.test.ts` — 17 케이스

**modified**
- `relay/src/store/symbols.ts` — `SymbolInfo.market` · `toOrderMarket`(이식) · select 확장
- `relay/src/store/orders.ts` — `insertRequest` · `findIdByOrderNo` · `OrderSinks`/`supabaseOrderSinks` · `rowPatchOf` 의 `origin` · `stats().inserted` · 파일 상단 D-03 근거로 교체
- `relay/src/ws/fanout.ts` — `orderStore`/`symbols`/`orderTimeoutMs` deps, `#orders` 핸들러, 주문 2종 분기(catch-all 제거), `#onClose`/`closeAll` 정리
- `relay/src/index.ts` — `supabaseOrderSinks` + `OrderStore` 를 `WsFanout` 앞으로 이동해 주입
- `relay/src/order/order-api.ts` — 세 심볼을 import 로 전환, `ORDER_RESP_TIMEOUT_MS` 재export
- 테스트 픽스처 4종 (`symbols` · `order-store` · `account-state` · `strategy-hub`)

## Decisions Made

**1. `OrderResp(51)` 에 계좌번호가 없다 — 플랜의 가정이 와이어와 어긋났다.**
플랜은 자동주문 행의 「`accountNo` 는 통보 값」이라고 적었지만, `StockDMA.fbs` 의 `table OrderResp` 에는 `account_no` 필드 자체가 없다(stock_code·side·order_no·result_code·price·quantity·message·notice_type·org_order_no·origin·exchange 가 전부다). 그런데 `dma_orders.account_no` 는 NOT NULL 이다.

지어내지 않고 **게이트웨이가 에코한 전략 등록값**을 썼다: 상따는 그 ISIN 의 전략(`getLimitChasers`)이, VI 는 세션의 VI 설정(`getViTrigger`)이 계좌의 정본이다. 둘 다 없으면 세션의 **단일** 허용 계좌(둘 이상이면 고르지 않는다 — 고르는 순간 지어내는 것이다), 그것도 없으면 빈 문자열 + `warn` 이다. **감사 우선**이라 계좌를 몰라도 행은 남긴다 — 빈 값은 「모른다」의 표현이고, 아무 계좌나 골라 적어 **남의 계좌로 귀속되는 기록**을 만드는 것보다 압도적으로 낫다.

**2. `statusOf`/`filledQtyOf` 를 중립 모듈로 옮겼다 (플랜이 허용한 「또는 공용 모듈」).**
플랜의 acceptance 는 「`order-api.ts`(또는 공용 모듈)에서 import」였고, `ORDER_RESP_TIMEOUT_MS` 도 그 파일이 이미 export 하고 있었다. 그대로 import 하면 동작은 같지만 **16-16 에서 `order-api.ts` 를 지우는 순간 wss 주문 경로가 무너진다.** 두 경로가 같은 판정을 써야 한다는 요구는 「한 파일에 있어야 한다」가 아니라 「한 정의여야 한다」이므로, 어느 표면에도 속하지 않는 곳으로 옮기고 `order-api.ts` 는 재export 만 남겼다(기존 소비자 무영향). 이동만 하는 커밋으로 갈라 회귀 시 이분 탐색이 두 변경을 함께 되돌리지 않게 했다.

**3. 거부는 전부 `order.result` 로 닫는다 — 상태 프레임·`{t:"msg"}` 를 쓰지 않는다.**
16-07 이 전략에서 세운 규율(세션 상태는 `{t:"state"}`, 요청 사유는 `{t:"msg", src:"Relay"}`)을 주문에는 **적용하지 않았다.** 전략과 달리 주문에는 `rid` 가 있고 브라우저는 그 `rid` 의 답을 기다리며 제출 버튼을 잠근다. 상태 프레임으로 답하면 `rid` 가 영원히 미결로 남아 버튼이 풀리지 않는다. 부수 효과로 상류 인계가 경고한 `src:"Account"` 오독 함정을 **구조적으로 회피**한다 — 이 경로는 `{t:"msg"}` 를 아예 만들지 않는다.

**4. 거부·타임아웃의 `resultCode` 는 `-1` 이다.**
계약이 `resultCode: number` 를 요구하는데 「모른다」를 표현할 값이 없다. `0` 은 계약상 "성공"이라 거부 프레임에 실리면 최악의 오독이다. 게이트웨이 코드는 0 이상이므로 **음수 = relay 자체 판정**이 자연스러운 구분이 된다. 이 값은 DB 에 쓰지 않는다 — `dma_orders.result_code` 에는 게이트웨이가 준 코드만 남긴다(테스트 ⑧ 이 타임아웃 갱신에 `resultCode` 가 없음을 단언).

**5. 중복 판정 스코프는 연결이다.**
T-16-10 이 지목한 것은 「재전송·더블클릭」이고 둘 다 같은 연결에서 일어난다. 사용자 단위로 넓히면 두 탭에서의 **정당한** 동일 주문(같은 가격에 10주를 두 번)까지 막는다. 연결 스코프는 T-16-03 이 대기 맵에 요구한 것과 같은 원칙이기도 하다.

**6. 기록에 실패하면 주문을 보내지 않는다.**
`insertRequest` 가 던지면 게이트웨이 송신을 건너뛰고 거부한다. 감사 기록 없는 실주문을 만드는 것보다 「지금 못 보낸다」고 말하는 편이 낫다(D-24 — 기록은 Supabase + stdout 두 벌이 정본이다). 테스트 ⑯ 이 「게이트웨이로 0바이트」로 고정한다.

**7. 취소 행의 `side` 는 표시용이 아니다.**
취소·정정 통보에는 매매구분이 없고(Pitfall 8) `order.cancel` 인바운드도 `side` 를 싣지 않는다. `dma_orders.side` CHECK 는 B/S 둘만 받으므로 취소 행은 `"S"` 로 적되, **방향의 정본은 `org_order_no` 가 가리키는 원주문 행**임을 수동·자동 두 경로에 같은 문구로 주석했다. 원주문을 조회해 방향을 복사하는 방법도 있으나, 취소는 시간이 걸린 경로라 송신 전에 DB 왕복을 하나 더 넣지 않았다.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `OrderResp` 에 계좌번호 필드가 없어 자동주문 계좌 출처를 바꿨다

- **Found during:** Task 3
- **Issue:** 플랜은 자동주문 insert 의 `accountNo` 를 「통보 값」으로 지정했으나 `StockDMA.fbs` 의 `OrderResp` 에 해당 필드가 없다. `dma_orders.account_no` 는 NOT NULL 이라 행을 만들 수 없다.
- **Fix:** `OrderNoticeSource` 에 `getLimitChasers`/`getViTrigger` 를 더해 **게이트웨이가 에코한 전략 등록값**에서 계좌를 얻는다. 폴백은 세션의 단일 허용 계좌 → 빈 문자열 + warn(감사 우선).
- **Files:** `relay/src/ws/order-handler.ts`
- **Verification:** 테스트 ⑫ 가 `accountNo: SAMPLE_ACCOUNT_NO` 로 실린 것을 단언 / 변이 M8 red
- **Committed in:** `6abdd2f`

### 2. [Rule 3 - Blocking] 공용 판정 3종을 `order-api.ts` 밖으로 옮겼다

- **Found during:** Task 2
- **Issue:** 플랜대로 `order-api.ts` 에서 import 하면 16-16 의 파일 삭제가 wss 주문 경로를 무너뜨린다.
- **Fix:** `relay/src/order/notice-status.ts` 신설(로직 변경 0), `order-api.ts` 는 import + 재export.
- **Verification:** `pnpm typecheck` · relay 327 tests green / `order-api.test.ts` 무수정 통과
- **Committed in:** `e249a0e`

### 3. [Rule 2 - Missing Critical] 중복 판정을 `await` 앞으로 당기고 `claims` 를 분리했다

- **Found during:** Task 2
- **Issue:** 플랜의 「같은 `rid`/파라미터가 **대기 중**이면 거부」를 `pending` 배열만으로 구현하면, `insertRequest`(`await`)를 기다리는 동안 도착한 두 번째 클릭이 **아직 비어 있는 큐**를 보고 통과한다 — T-16-10 이 막으려는 바로 그 중복 주문이다.
- **Fix:** 요청 키 2종을 `ConnState.claims` 에 **동기적으로** 먼저 잡고, 거부·정산·송신실패·타임아웃 어느 경로로 끝나든 놓는다.
- **Verification:** 테스트 ⑦ / 변이 M6 red
- **Committed in:** `7a6288b`

### 4. [Rule 2 - Missing Critical] 조립 실패·송신 실패에도 행 상태를 갱신한다

- **Found during:** Task 2
- **Issue:** 기록은 송신 **전에** 남으므로(T-15-32), 조립·송신이 실패하면 `status='requested'` 인 행이 영원히 남는다 — 감사에서 「보냈는지 모르는 주문」으로 보인다.
- **Fix:** 두 경로 모두 `enqueueUpdate({orderRowId, status:"rejected", message})`.
- **Verification:** 테스트 ⑩ 이 송신 실패 시 `status:"rejected"` 갱신을 단언
- **Committed in:** `7a6288b`

### 5. [테스트 보강] 공허한 단언 2건을 변이 주입으로 발견해 고쳤다

- **Found during:** Task 3 (변이 주입)
- **Issue:** ② 와 ⑪ 이 **첫 실행에 green** 이었지만 해당 회귀를 주입해도 여전히 green 이었다. ② 는 두 번째 연결이 주문을 낸 적이 없어 핸들러 자료구조에 등록조차 되지 않았고(브로드캐스트 회귀가 아무에게도 안 닿는다), ⑪ 은 닫힌 소켓에 `#send` 가 어차피 아무것도 쓰지 않아 프레임 부재가 타이머 정리를 증명하지 못했다.
- **Fix:** ② 는 두 연결이 **각각 다른 종목**으로 주문을 대기시키게 바꿨고, ⑪ 은 `send` 보다 먼저 호출되는 `enqueueUpdate({status:"timeout"})` 부재로 단언을 옮겼다.
- **Verification:** 재실측 결과 M5'·M10'·M12 전부 red
- **Committed in:** `6abdd2f`

### 6. [범위 안 조정] 테스트 픽스처 3파일

`SymbolInfo` 에 `market` 이 필수가 되면서 `account-state.test.ts`·`strategy-hub.test.ts`·`symbols.test.ts` 의 픽스처를 갱신했다. `account-state.test.ts` 는 **루트 `pnpm typecheck` 가 못 보는 곳**이라 `typecheck:tests` 가 아니었으면 놓쳤을 지점이다.

---

**Total deviations:** 6 (2 blocking, 2 missing-critical, 1 테스트 보강, 1 범위 안 조정)
**Impact on plan:** 1·2 는 플랜의 전제가 실제 와이어·향후 삭제 계획과 어긋난 지점을 정정한 것이고, 3·4 는 threat register(T-16-10 / T-15-32)의 방어선을 실제로 성립시킨 것이다. 스코프 크립 없음 — 신규 3파일 외에는 `files_modified` 와 그 테스트 픽스처만 건드렸다.

## Verification

**게이트 (전부 exit 0)**
- `pnpm --filter @gh-radar/relay run typecheck` — src
- `pnpm --filter @gh-radar/relay run typecheck:tests` — **별도 실행**(루트 `pnpm typecheck` 는 relay `tests/` 를 exclude 한다). 실제로 `account-state.test.ts` 의 픽스처 누락을 여기서만 잡았다
- `pnpm typecheck` — 13 패키지 전량
- `pnpm --filter @gh-radar/relay test` — **17 파일 327 케이스** (base 302 + 신규 25)
- `pnpm --filter @gh-radar/relay build`

**acceptance 게이트 실측**

| 항목 | 기대 | 실측 |
|---|---|---|
| `grep -c "code, name, isin, market, is_delisted"` symbols.ts | 1 | 1 |
| `grep -c "toOrderMarket"` symbols.ts | ≥ 2 (+ `return null` 존재) | 3 (+ 있음) |
| `grep -c "insertRequest"` orders.ts | ≥ 2 | 4 |
| `grep -c "행을 만드는 것은 server 다"` orders.ts | 0 | 0 |
| `grep -c "origin"` orders.ts | ≥ 2 | 8 |
| `statusOf`/`filledQtyOf` 재구현 | 0건 | 0 (import 1줄) |
| `grep -c "ORDER_RESP_TIMEOUT_MS"` order-handler.ts | ≥ 1, 5000 재선언 없음 | 2 / `5000` 0건 |
| `grep -c "Map<string, PendingOrder"` | 0 | 0 |
| `grep -c "allowedAccounts"` order-handler.ts | ≥ 1 | 4 |
| 타임아웃 블록의 「실패」 | 0건 | 0 (문구는 「결과를 확인하지 못했습니다」) |
| ws-order 케이스 수 | ≥ 11 | **17** |
| `grep -c "new WebSocket\|conn.ws.send("` fanout.ts | base 와 동일 | 2 (base 2) |
| order-handler 의 `setInterval` | 0 (D-13) | 0 |

**변이 주입 10종 — 10/10 red (테스트 실효성 실측)**

| # | 주입한 결함 | red 가 된 케이스 |
|---|---|---|
| M1 | `toOrderMarket` 이 모르는 값을 `"K"` 로 메움 | symbols ⑥ · toOrderMarket |
| M2 | select 에서 `market` 컬럼 누락 | symbols ⑦ |
| M3 | `insertRequest` 가 실패를 삼킴 | order-store ⑫ |
| M4 | 계좌 화이트리스트 대조 무력화 | ws-order ⑤ |
| M5' | `order.result` 를 사용자 전 연결로 브로드캐스트 | ws-order ② |
| M6 | 중복 가드 제거 | ws-order ⑦ |
| M7 | `market === null` 을 `"K"` 로 메움 | ws-order ⑥ |
| M8 | 자동주문 insert 분기 제거(update 만) | ws-order ⑫ · ⑬ |
| M9 | 타임아웃을 「주문 실패」로 렌더 | ws-order ⑧ |
| M10' | 연결 종료 시 타이머 미정리 | ws-order ⑪ |
| M12 | `closeConn` 을 통째로 no-op | ws-order ⑪ |

**M5' 와 M10' 은 1차 실측에서 살아남았다** — 그것이 이 검증의 성과다. 두 케이스가 회귀를 못 잡는 공허한 단언이었고(Deviation 5), 고친 뒤 재실측해 red 를 확인했다. 「첫 실행 green」을 신뢰하지 않은 것이 실제로 결함 2건을 찾아냈다.

## Issues Encountered

**1. worktree 베이스가 wave 6 이전이었다.** `e018095`(quick-260908-py9 직후)에서 갈라져 있어 의존하는 16-07 산출물이 트리에 없었다. 오케스트레이터가 준 `baa9e814` 를 **merge** 로 당겨 해결했다(`reset --hard`/`clean`/`stash` 사용 안 함, 충돌 0건). `git merge-base HEAD baa9e814` = `baa9e814`.

**2. 새 worktree 라 `node_modules`·`packages/shared/dist` 가 없었다.** `pnpm install --frozen-lockfile` + shared build 로 해결(16-05 가 남긴 것과 같은 함정).

**3. `RelayOrderCancelSchema.orgOrderNo` 가 `min(1)` 이라 핸들러의 ③ 재확인은 wss 로 도달 불가다.** 빈 원주문번호는 `parseInbound` 에서 `null` 이 되어 close(4400) 으로 끝난다(테스트 ④ 가 이 실제 동작을 고정). 그래도 분기를 남긴 이유는 `order-api.ts` 의 ③ 과 같다 — 조립 앞 관문은 **모든** 호출 경로에 대해 성립해야 한다. 도달 불가 분기가 테스트되지 않은 채 남지 않도록 ⑮ 가 핸들러를 직접 호출해 친다.

## Known Stubs

없음. 다만 **아직 브라우저가 이 경로를 쓰지 않는다** — 웹앱은 16-16 까지 REST(`POST /api/orders`)를 계속 쓰고, `order.new`/`order.cancel` 을 보내는 코드는 16-09 이후에 생긴다. 그래서 이 plan 이 만든 표면은 테스트 외에는 소비자가 없다(설계된 중간 상태이며, 사용자에게 보이는 화면을 바꾸지 않는다).

`createOrderApi` 결선도 **의도적으로 그대로 뒀다**(플랜 지시). 두 경로가 공존하지만 같은 행을 다투지는 않는다 — REST 는 server 가 insert 한 `orderRowId` 를, wss 는 relay 가 만든 행의 id 를 쓴다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다. 주문 인바운드는 **이미 인증된** wss 표면(15-04/16-07)에 분기를 하나 더한 것이고, `dma_orders` 는 기존 테이블·기존 서비스롤 경로다(`origin` 컬럼은 16-05 이전에 이미 마이그레이션됐다).

플랜 `<threat_model>` 6종 전부 mitigate 로 구현하고 테스트로 고정했다:

| Threat | 구현 | 고정 케이스 |
|---|---|---|
| T-16-01 IDOR | ② 단계 `session.allowedAccounts` 단독 대조 | ⑤ (거부 시 게이트웨이로 0바이트 + 로그 마스킹) |
| T-16-03 Spoofing | 연결 스코프 대기 맵, 전역 `rid` 맵 0 | ② (두 연결 각각 대기) · ⑰ (사용자 간 비교차) |
| T-16-10 중복 주문 | `await` 앞 동기 claim 2종 | ⑦ |
| T-16-07 Repudiation | 자동주문 insert 분기 + `origin` 기록 | ⑫ · ⑬ · ⑭ |
| T-16-05 Tampering | `market === null` 명시 거부 | ⑥ |
| T-16-09 정보 노출 | 로그 `maskAccountNo`, 인바운드 원문 미기록 | ⑤ |

## User Setup Required

None — 외부 서비스 설정이 필요하지 않다. `dma_orders.origin` 마이그레이션은 이미 적용돼 있다.

## Next Phase Readiness

**16-09 이후(웹앱)로 넘길 것:**
- **`order.new` 에 `market` 을 싣지 말 것.** 스키마가 거부한다 — relay 가 ISIN 으로 푼다 (D-28).
- **`status: "timeout"` 은 실패가 아니다.** 제출 버튼을 다시 열지 말고 「결과 확인 중 — 미체결 목록을 확인하세요」를 표시한다. 여기를 실패로 렌더하면 사용자가 재주문해 중복 체결이 난다 (S-8).
- **`resultCode < 0` 은 relay 자체 판정**이다(게이트웨이 거부코드가 아니다). 코드 표에서 찾지 말고 `message` 를 그대로 보여 준다.
- **`order.result` 는 요청한 연결에만 온다.** 다른 탭은 `{t:"order"}` 51 푸시로만 상태를 안다 — 탭 간 상태 동기화를 `order.result` 에 기대면 안 된다.
- 거부는 전부 `order.result(status:"rejected")` 로 온다. `rid` 는 반드시 닫힌다(세션 부재·계좌 거부·ISIN 미해석·기록 실패·송신 실패 전부).

**16-16(REST 제거)로 넘길 것:**
- `order-api.ts` 를 지울 때 **`order/notice-status.ts` 는 남긴다** — wss 경로가 쓴다.
- `index.ts` 의 `createOrderApi(...)` 결선과 `orderApiServer` 만 걷으면 된다. `orderStore` 는 이미 `WsFanout` 앞에서 만들어 두 곳이 공유한다.
- `relay/tests/order-api.test.ts` 도 그때 함께 지운다(지금은 REST 가 살아 있으므로 회귀 테스트로 존치).

**우려 1건:** 자동주문 행의 계좌는 전략 캐시가 비어 있으면(세션 재접속 직후 프리페치 전에 통보가 오는 좁은 창) 세션의 단일 계좌 폴백을 타고, 계좌가 둘 이상이면 빈 값으로 남는다. 감사 기록 자체는 남지만 계좌 컬럼이 빈 행이 생길 수 있다 — 실서버에서 `accountNo === ""` 인 `dma_orders` 행이 관측되면 그 창을 좁히는 것(프리페치 완료 전 통보 버퍼링)이 후속 과제다. `logger.warn` 「자동주문 계좌 미상」이 그 신호다.

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*

## Self-Check: PASSED

- 파일 6/6 존재 확인 (`ws/order-handler.ts` · `order/notice-status.ts` · `tests/ws-order.test.ts` · `store/symbols.ts` · `store/orders.ts` · 본 SUMMARY)
- 커밋 4/4 브랜치에 존재 확인 (`cf95de6` · `e249a0e` · `7a6288b` · `6abdd2f`)
- 삭제된 추적 파일 0건 (`--diff-filter=D` 빈 출력), untracked 잔여 0건
- 변이 주입 잔여 0건 (`if (false)` / `if (true) {` / `주문 실패` grep 0)
