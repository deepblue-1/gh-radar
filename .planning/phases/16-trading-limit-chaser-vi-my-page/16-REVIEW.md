---
phase: 16-trading-limit-chaser-vi-my-page
reviewed: 2026-09-08T22:12:46Z
depth: standard
files_reviewed: 52
files_reviewed_list:
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/src/ws/protocol.ts
  - relay/src/order/notice-status.ts
  - relay/src/order/order-api.ts
  - relay/src/store/orders.ts
  - relay/src/store/symbols.ts
  - relay/src/index.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/index.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/vi-alert.ts
  - webapp/src/lib/orders-api.ts
  - webapp/src/lib/stock-api.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/limit-chaser-client.tsx
  - webapp/src/components/trading/vi-client.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/vi-settings-card.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/src/components/trading/dirty-action-bar.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/components/orderbook/order-panel.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/orderbook/orderbook-ladder.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/stock/stock-orderbook-section.tsx
  - webapp/src/app/layout.tsx
  - webapp/src/app/me/page.tsx
  - webapp/src/app/trading/vi/page.tsx
  - webapp/src/app/trading/limit-chaser/page.tsx
  - webapp/src/app/trading/limit-chaser/new/page.tsx
  - webapp/src/app/trading/limit-chaser/[key]/page.tsx
  - server/src/routes/orders.ts
  - server/src/services/dma-orders.ts
  - server/src/app.ts
  - server/src/config.ts
  - server/src/server.ts
  - server/src/schemas/orders.ts
  - server/src/errors.ts
  - supabase/migrations/20260908120000_dma_orders_origin.sql
  - scripts/deploy-server.sh
  - scripts/smoke-server.sh
  - relay/tests/ws-order.test.ts
  - relay/tests/order-store.test.ts
  - webapp/e2e/specs/orderbook.spec.ts
findings:
  critical: 4
  warning: 9
  info: 7
  total: 20
status: issues_found
---

# Phase 16: 코드 리뷰 보고서

**검토 일시:** 2026-09-08T22:12:46Z
**깊이:** standard
**검토 파일:** 52 (소스 중심, 위험 가중 — 주문 경로 · 계좌 상태 병합 · 계좌 격리)
**상태:** issues_found

## 요약

주문 경로의 wss 이관(D-02) 자체는 규율이 촘촘하다. 화이트리스트 대조는 `session.allowedAccounts` 한 곳뿐이고, 팬아웃은 `Map<userId>` 로만 대상을 고르며, 타임아웃을 「실패」로 말하지 않는 규율이 relay·webapp 양쪽에서 지켜진다. `ws-order.test.ts` 17케이스도 실제로 무언가를 지킨다(게이트웨이로 나간 바이트 수를 세고, 중복 요청에 대해 `orderReqs.length === 1` 을 단언한다).

문제는 **경계 밖**에 있다. 네 가지 Critical 은 모두 "각 모듈은 자기 규율을 지켰는데 모듈 사이의 계약이 틀린" 형태다.

1. `stock-orderbook-section` 이 계좌 패널에 **선택한 계좌**가 아니라 **마지막으로 수신한 계좌**의 상태를 넘긴다. 그 파일 자신의 주석(L138–141)이 "그 어긋남이 곧 엉뚱한 계좌의 주문을 취소하는 사고다"라고 적어 둔 바로 그 어긋남이다. 계좌 2개 이상에서 재현된다.
2. `findIdByOrderNo` 가 `order_no` 를 **전 사용자·전 날짜** 범위로 조회한다. 브로커 주문번호는 일별 재사용이므로 이 결함은 경주가 아니라 **운영 2일차부터의 정상 경로**다.
3. 전략 전체 비활성화(킬 스위치)가 소켓 미연결 시 **완전히 조용히** no-op 한다. 로그도 오류 표시도 없다.
4. 주문 통보 상관이 **ISIN 하나로만** 매칭한다. 같은 종목의 신규+취소가 5초 안에 겹치면 두 주문의 결과가 서로 바뀐다.

Warning 9건 중 절반은 이 phase 가 만든 계약이 소비되지 않는 문제다(`dma_orders.origin` 은 쓰기만 하고 읽는 경로가 없고, `orders-api.ts` 는 임포터가 0건이다).

---

## Critical Issues

### CR-01: 호가주문 탭의 계좌 패널이 「선택한 계좌」가 아니라 「마지막 수신 계좌」를 그린다 — 엉뚱한 계좌로 취소가 나간다

**File:** `webapp/src/components/stock/stock-orderbook-section.tsx:452`
**연관:** `webapp/src/lib/use-relay-socket.ts:376-380`, `webapp/src/components/orderbook/account-panel.tsx:252-262`

**Issue:**
`AccountPanel` 에 `selectedAccountNo={selectedAccountNo}`(사용자가 고른 계좌)와 `account={account}`(전역 상태의 「마지막으로 받은 계좌」)를 **서로 무관한 두 출처**에서 넘긴다.

`use-relay-socket.ts` 의 리듀서는 `case "acct"` 에서 `account: merged` 를 **어느 계좌의 프레임이든** 갱신한다(L379). 주석도 그 의미를 명시한다 — "`account` 는 「마지막으로 받은 계좌」라는 기존 의미를 그대로 유지한다 … 계좌 축 소비자는 `accountStates` 를 쓴다". 그런데 이 소비자는 `accountStates` 를 쓰지 않는다.

실패 시나리오(계좌 2개 이상, 이 phase 가 명시적으로 지원하는 구성):
1. 사용자가 호가주문 탭에서 계좌 **A** 를 선택한다.
2. 계좌 **B** 에서 체결이 나 67 델타가 도착한다 → `data.account` 가 **B** 의 상태가 된다.
3. 계좌 패널 머리는 여전히 **A** 를 표시하는데 미체결·잔고 행은 **B** 의 것이다.
4. 사용자가 그 행의 `✕ 취소` 를 누른다 → `handleCancelConfirmed` 가
   `accountNo: selectedAccountNo`(**A**) + `orgOrderNo: row.orderNo`(**B의 주문번호**) 로 `order.cancel` 을 보낸다.
5. relay 화이트리스트는 통과한다(A 는 그 사용자의 계좌다). 게이트웨이는 **계좌 A 에서 B 의 주문번호**를 취소하라는 요청을 받는다. 주문번호는 계좌별 시퀀스라 A 에 같은 번호의 주문이 살아 있으면 **엉뚱한 주문이 취소된다.**

잔고 탭의 평가손익도 같은 이유로 다른 계좌 값으로 계산된다.

같은 표면의 다른 세 소비자(`limit-chaser-client.tsx:356`, `vi-client.tsx:128`, `me-client.tsx:173`)는 전부 `accountStates.get(accountNo)` 를 쓴다. 이 파일만 남았다.

**Fix:**
```tsx
// stock-orderbook-section.tsx
// useRelaySubscription 의 반환 계약(RelaySocketState)에는 accountStates 가 없으므로
// 전역 컨텍스트에서 직접 고른다.
const { accountStates } = useRelayContext();
const selectedAccount = selectedAccountNo === ''
  ? null
  : (accountStates.get(selectedAccountNo) ?? null);

<AccountPanel
  selectedAccountNo={selectedAccountNo}
  account={selectedAccount}   // ← account (마지막 수신) 이 아니다
  …
/>
```
근본 해결은 `RelaySocketState` 에 `accountStates` 를 실어 `account`(마지막 수신) 를 계좌 축 소비자에게 노출하지 않는 것이다. 노출된 채로 두면 다음 소비자가 같은 실수를 반복한다.

---

### CR-02: `findIdByOrderNo` 가 사용자·날짜 경계 없이 `order_no` 를 조회한다 — 타 사용자 행 오염 + 자동주문 기록 소실

**File:** `relay/src/store/orders.ts:239-252` (`supabaseOrderLookupSink`)
**연관:** `relay/src/ws/order-handler.ts:286-302`, `relay/src/store/orders.ts:181-190` (`supabaseOrderSink`), `supabase/migrations/20260905120200_dma_orders.sql:76`

**Issue:**
```ts
.from("dma_orders").select("id").eq("order_no", orderNo).maybeSingle();
```
`user_id` 필터도 날짜 범위도 없다. 그리고 `dma_orders.order_no` 에는 **UNIQUE 제약이 없고**(`idx_dma_orders_order_no` 는 일반 인덱스다) 이 테이블에는 보존 정책·정리 잡도 없다. 브로커 주문번호는 **일별로 재사용되는 시퀀스**이므로 다음이 성립한다.

- **경로 A (단일 매치, 엉뚱한 행):** 어제의 `0000012345` 행이 하나 남아 있다. 오늘 상따 자동주문이 같은 번호를 받는다 → `findIdByOrderNo` 가 **어제 행의 id** 를 돌려준다 → `enqueueUpdate({...patch, orderRowId: 어제행})`. 결과: ① 오늘 자동주문의 행은 **끝내 만들어지지 않고**(감사 기록 소실 — 이 함수가 막으려던 Pitfall 18 그 자체), ② 어제 행의 `status`·`filled_qty`·`message`·`origin` 이 오늘 값으로 덮인다. 그 행이 **다른 사용자의 것**이면 테넌트 간 쓰기다.
- **경로 B (다중 매치):** 같은 번호가 2행 이상이면 `maybeSingle()` 이 PGRST116 을 던진다 → `order-handler.ts:288-296` 의 catch 가 `enqueueUpdate(patch)`(셀렉터 없음)로 열화한다 → `selectorOf` 가 `{column:"order_no"}` 를 고르고 → `supabaseOrderSink` 가 `.update(patch).eq("order_no", value)` 를 실행한다. **그 번호를 가진 모든 사용자·모든 날짜의 행이 한 번에 덮인다.**

경로 B 의 catch 주석은 "없으면 0행이라 무해하고, 있으면 기록이 남는다"라고 적혀 있는데, 그 전제(대상이 내 행 하나뿐)가 성립하지 않는다.

이 결함은 경주 조건이 아니다. 운영 2일차부터 `order_no` 충돌은 **기대값**이다. 테스트는 sink 를 스텁으로 대체하므로(`ws-order.test.ts` ⑬) 이 경계를 전혀 검사하지 않는다.

**Fix:**
```ts
// 1) 조회를 사용자·당일로 좁힌다 (셀렉터 계약도 함께 바꾼다).
export type OrderLookupSink = (userId: string, orderNo: string) => Promise<string | null>;

export function supabaseOrderLookupSink(supabase: SupabaseClient): OrderLookupSink {
  return async (userId, orderNo) => {
    const { from, to } = kstDayRangeUtc();           // server 의 동명 헬퍼와 같은 규칙
    const { data, error } = await supabase
      .from("dma_orders").select("id")
      .eq("user_id", userId)
      .eq("order_no", orderNo)
      .gte("created_at", from).lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) { logger.error({ error }, "[orders] order_no 조회 실패"); throw error; }
    return data?.[0]?.id ?? null;
  };
}

// 2) update 셀렉터도 사용자로 좁힌다 — order_no 단독 update 는 전역 쓰기다.
export type OrderSelector =
  | { column: "id"; value: string }
  | { column: "order_no"; value: string; userId: string };
// supabaseOrderSink: .update(patch).eq("order_no", v).eq("user_id", userId).gte("created_at", from)

// 3) DB 쪽 방어선: 부분 유니크 인덱스로 같은 사용자·같은 날 중복 order_no 를 구조적으로 막는다.
//    CREATE UNIQUE INDEX … ON dma_orders (user_id, order_no, (created_at AT TIME ZONE 'Asia/Seoul')::date)
//      WHERE order_no IS NOT NULL;
```

---

### CR-03: 전략 전체 비활성화(킬 스위치)가 소켓 미연결 시 조용히 사라진다 — 사용자는 껐다고 믿고 자동매매는 계속 돈다

**File:** `webapp/src/components/trading/strategy-status-card.tsx:368`, `webapp/src/components/trading/strategy-status-card.tsx:456`
**연관:** `webapp/src/lib/use-relay-socket.ts:850-854`

**Issue:**
```ts
// use-relay-socket.ts:850
const send = useCallback((msg: RelayInbound) => {
  const ws = socketRef.current;
  if (!ws || ws.readyState !== WS_READY_OPEN) return;   // ← 무로그 · 무반환 드롭
  ws.send(JSON.stringify(msg));
}, []);
```
`send` 는 전략 4종(`lc.set`/`vi.set`/`vi.confirm`/`strategies.disable`) 전부의 유일한 출구인데, 소켓이 열려 있지 않으면 **아무 신호 없이** 반환한다. 반환값도 없어 호출부가 실패를 알 방법이 없다.

`lc.set`/`vi.set`/`vi.confirm` 호출부는 `disabled={… || status !== 'ready'}` 로 가려져 있다. 그러나 **전체 비활성화 버튼만 세션 상태로 가려지지 않는다**:
```tsx
disabled={nothingToDisable || awaitingAck}   // status 를 보지 않는다
```
그리고 리듀서는 단절 시 데이터를 지우지 않고 `isStale` 만 세우므로(`use-relay-socket.ts:318`, `case "stale"`), 재접속 중에도 `limitChasers` 는 채워진 채다 → `nothingToDisable === false` → 버튼은 **활성**이다.

실패 시나리오:
1. 상따 3건이 무장된 상태에서 wss 가 끊긴다(status = `reconnecting`, 목록은 그대로 표시됨).
2. 사용자가 급하게 My page 에서 `전체 비활성화` → 확인 다이얼로그 → `전체 비활성화` 실행.
3. `handleConfirm` 이 `awaitingAck=true` 로 두고 다이얼로그를 닫고 `send({t:"strategies.disable"})` 을 부른다.
4. `send` 가 조용히 반환한다. **게이트웨이로 0바이트.**
5. 8초 뒤 `DISABLE_ACK_TIMEOUT_MS` 타이머가 `awaitingAck` 만 내린다 — 오류 문구도, 로그도, 재시도도 없다. 화면상 버튼은 그냥 다시 눌리는 상태가 된다.
6. 사용자는 전략이 꺼졌다고 믿고 자리를 뜬다. 상따 3건은 게이트웨이에서 그대로 돈다.

프로젝트 규율(PC-7 「무로그 fail-safe 금지」 / S-5)을 정면으로 위반하는 자리이고, 하필 그 대상이 킬 스위치다.

**Fix:**
```ts
// 1) send 가 성공 여부를 돌려주고, 드롭을 반드시 남긴다.
const send = useCallback((msg: RelayInbound): boolean => {
  const ws = socketRef.current;
  if (!ws || ws.readyState !== WS_READY_OPEN) {
    console.error(`[relay] 소켓 미연결 — 전송하지 않음 (t=${msg.t})`);
    return false;
  }
  ws.send(JSON.stringify(msg));
  return true;
}, []);
```
```tsx
// 2) 킬 스위치는 세션 준비 상태로 가리고, 전송 실패를 화면에 말한다.
const { status, send } = useRelayContext();
disabled={nothingToDisable || awaitingAck || status !== 'ready'}

const handleConfirm = (): void => {
  setDialogOpen(false);
  if (!send({ t: "strategies.disable" })) {
    setError('연결이 끊겨 비활성화 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.');
    return;                       // awaitingAck 를 세우지 않는다
  }
  ackBaseline.current = strategiesDisabled;
  setAwaitingAck(true);
};

// 3) 8초 ack 타임아웃도 조용히 지나가지 않게 한다 — 「반영을 확인하지 못했어요」를 남긴다.
```

---

### CR-04: 주문 통보 상관이 ISIN 하나로만 매칭한다 — 같은 종목의 신규+취소가 겹치면 두 주문의 결과가 뒤바뀐다

**File:** `relay/src/ws/order-handler.ts:232-245`

**Issue:**
```ts
deps.hub.on("order", ({ userId, notice }) => {
  for (const conn of byUser.get(userId) ?? []) {
    const state = conns.get(conn);
    if (state === undefined) continue;
    const index = state.pending.findIndex((p) => p.isin === notice.isin);   // ← ISIN 만 본다
    if (index < 0) continue;
    const [entry] = state.pending.splice(index, 1);
    entry?.settle(notice);
    return;
  }
  …
});
```
대기 항목이 같은 ISIN 으로 2건 이상 있으면 **먼저 등록된 것**이 무조건 정산된다. `PendingOrder` 는 `qty` 를 들고 있으면서도(L108) 매칭에 쓰지 않고, 통보가 실어 오는 `noticeType`·`orgOrderNo`·`price`·`quantity` 도 전혀 보지 않는다.

중복 가드(`claimKeys`)는 이 경우를 막지 못한다. 신규(`side "B"`)와 취소(`side "C"`)는 dup 키가 다르고, 값이 다른 두 신규도 마찬가지다.

실패 시나리오(호가주문 탭, 「취소하고 다시 걸기」 — 가장 흔한 조작):
1. 종목 X 를 5,000원에 매수 주문 → `pending[0]`(신규, rid-1).
2. 5초 안에 X 의 기존 미체결을 `✕ 취소` → `pending[1]`(취소, rid-2).
3. 취소확인(`notice_type:"C"`)이 먼저 도착한다 → `findIndex` 가 `pending[0]`(신규)을 고른다.
   - `dma_orders` 의 **신규 주문 행**에 `status:"cancelled"` + **취소 주문의 order_no** 가 기록된다.
   - `order.result{rid: rid-1}` 이 나가고 `OrderPanel` 은 "접수 · 주문번호 = 취소 주문번호" 를 보여 준다.
4. 뒤이어 신규 접수 통보가 도착 → 남은 `pending[1]`(취소)이 정산된다. 취소 행에 신규의 상태·번호가 들어간다.

결과: 두 주문의 감사 기록이 서로 뒤바뀌고, 화면은 **살아 있는 매수 주문을 「취소됨」으로**, 취소 요청을 「접수」로 표시한다. 사용자가 그 표시를 믿고 재주문하면 중복 체결이다 — 이 파일이 스스로 "최악의 결과"라고 적어 둔 상황이다.

연결 축 변형도 같은 뿌리다: `byUser` 루프는 **ISIN 이 일치하는 첫 연결**을 고르므로, 탭 A 의 통보가 탭 B 의 대기 주문을 정산하고 `order.result` 도 탭 B 로 간다.

**Fix:**
```ts
// 통보가 실어 오는 값으로 후보를 좁힌다. 취소확인/정정확인은 org_order_no 축, 나머지는 수량·가격 축.
function matches(p: PendingOrder, n: ParsedOrderResp): boolean {
  if (p.isin !== n.isin) return false;
  // 취소 대기 항목은 취소·정정 통보만 받는다(그 반대도 마찬가지다).
  const isCancelNotice = n.noticeType === "C" || n.noticeType === "M";
  if (p.isCancel !== isCancelNotice && n.noticeType !== "R" && n.noticeType !== "") return false;
  // 접수·거부 통보의 quantity 는 주문수량이다 — 수량이 다르면 다른 주문이다.
  if (n.noticeType !== "E" && n.quantity > 0 && n.quantity !== p.qty) return false;
  return true;
}
const index = state.pending.findIndex((p) => matches(p, notice));
```
`PendingOrder` 에 `isCancel`·`price` 를 실어 두고(`qty` 는 이미 있다), 어느 것으로도 못 좁히면 **가장 오래된 것**이 아니라 「매칭 실패」로 두어 `recordUnmatched` 로 보내는 편이 낫다 — 잘못 귀속된 기록은 없는 기록보다 나쁘다.

---

## Warnings

### WR-01: `recordUnmatched` 의 조회↔insert 사이에 in-flight 가드가 없다 — 같은 자동주문이 2행으로 남는다

**File:** `relay/src/ws/order-handler.ts:286-310`

**Issue:** 자동주문 하나에 대해 접수(`A`)·체결(`E`) 통보가 수십 ms 간격으로 온다. 첫 통보가 `await findIdByOrderNo` → `null` → `await insertRequest`(Supabase 왕복 100ms 안팎) 를 진행하는 동안 두 번째 통보가 같은 경로에 진입하면 **역시 `null` 을 보고** 두 번째 insert 를 한다. `order_no` 에 유니크 제약이 없으므로 DB 도 막지 않는다.

결과: My page·주문내역에서 같은 자동주문이 두 줄로 보이고 집계가 부풀려진다. `ws-04` 테스트 ⑬ 은 "행이 이미 있는" 경우만 검사하므로 이 경주를 잡지 못한다.

**Fix:** `orderNo` 단위 in-flight 맵을 두고 진행 중인 insert 를 재사용한다.
```ts
const inflight = new Map<string, Promise<string>>();
async function ensureRow(userId: string, notice: ParsedOrderResp): Promise<string | null> {
  const key = `${userId}|${notice.orderNo}`;
  const running = inflight.get(key);
  if (running !== undefined) return running;
  const p = (async () => { /* findIdByOrderNo → 없으면 insertRequest */ })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}
```
(CR-02 의 부분 유니크 인덱스가 들어가면 DB 가 2차 방어선이 된다.)

### WR-02: 중복 주문 가드가 **연결 스코프**라 두 번째 탭·재접속에서 무력화된다

**File:** `relay/src/ws/order-handler.ts:169-178`, `relay/src/ws/order-handler.ts:200-207`

**Issue:** `claims` 는 `ConnState`(연결 1개) 안에 있다. `RelayProvider` 는 문서(탭)당 소켓 1개를 여므로, 같은 종목 화면을 두 탭에 띄우면 **완전히 동일한 `(계좌,ISIN,side,가격,수량)` 주문 2건이 모두 통과**한다. 재접속 직후 사용자가 같은 주문을 다시 내는 경우도 같다(새 `Conn` → 새 `ConnState`).

T-16-03(대기 맵은 연결 스코프)과 T-16-10(중복 거부)은 서로 다른 요구인데 한 자료구조가 둘을 겸하고 있다. `order.result` 라우팅은 연결 스코프가 맞지만, **중복 판정은 사용자 스코프**여야 한다.

**Fix:** dup 키만 `Map<userId, Set<string>>` 로 올린다. `rid` 키는 연결 스코프로 남겨도 된다(브라우저가 만드는 값이라 탭 간 충돌이 없다).

### WR-03: 종목 검색 결과의 시장 구분을 브라우저가 `'K'` 로 추정한다 — D-28 위반

**File:** `webapp/src/components/trading/limit-chaser-client.tsx:834`
**연관:** `webapp/src/components/trading/limit-chaser-client.tsx:376`, `relay/src/ws/protocol.ts:102`

**Issue:**
```ts
market: row.market === 'KOSDAQ' ? 'Q' : 'K',
```
KOSDAQ 이 아닌 **모든** 값(KONEX, `null`, master-sync 의 미확인 sentinel 등)이 조용히 KOSPI 가 된다. 이 값은 `buildCfg` 를 거쳐 `lc.set.market` 으로 나가고, relay 는 `z.enum(["K","Q"])` 형식만 볼 뿐 `SymbolMap` 과 **대조하지 않는다**. 즉 `order.new` 에서는 relay 가 시장을 소유하는데(D-28), 전략 등록에서는 브라우저의 추측이 그대로 실계좌 자동발주 설정이 된다 — envelope.ts 가 Pitfall 7 로 적어 둔 "엉뚱한 시장으로 주문이 나간다"의 정확한 조건이다.

**Fix:** ① 검색 결과의 `market` 이 `"KOSPI"|"KOSDAQ"` 가 아니면 선택 자체를 막는다(`disabled` + 「주문 불가」 배지, `isin === null` 과 같은 취급). ② relay 의 `lc.set` 처리에서 `symbols.lookup(cfg.isin)?.market` 과 불일치하면 거부하고 사유를 프레임으로 돌려준다.

### WR-04: `webapp/src/lib/orders-api.ts` 가 통째로 죽은 코드다 — `GET /api/orders` 의 클라이언트가 0건

**File:** `webapp/src/lib/orders-api.ts:1-127`
**연관:** `server/src/errors.ts:56-64`, `server/src/routes/orders.ts:39`

**Issue:** 이 모듈을 import 하는 파일이 webapp 전체에 **하나도 없다**(`listOrders`·`isUnknownOutcome`·`orderErrorCode`·`orderErrorMessage`·`ORDER_ERROR_CODES` 전부 사용처 0). 결과:
- 파일 주석이 약속한 "새로고침 후 미체결·체결 목록을 복원하는 경로"(L96)가 **구현되어 있지 않다.** 서버의 `GET /api/orders` + `listTodayOrders` 도 호출자가 없다.
- `server/src/errors.ts:62-63` 의 "웹앱의 `lib/orders-api.ts` 는 `ORDER_ERROR_CODES` 를 **그대로 유지**한다 — 그것은 wss 결과 판정에 계속 쓰이는 브라우저 측 상수다" 는 **사실이 아니다.** 실제 판정은 `order-panel.tsx:370`·`account-panel.tsx:265` 이 `res.status === 'timeout'` 으로 인라인 수행한다.

**Fix:** 새로고침 복원을 이 phase 범위로 본다면 `listOrders` 를 실제로 결선하고, 아니라면 모듈과 `server/src/errors.ts` 의 잘못된 주석을 함께 제거한다. 어느 쪽이든 "있는데 안 쓰는 상태"는 다음 사람이 살아 있는 계약으로 오해한다.

### WR-05: `dma_orders.origin` 을 쓰기만 하고 읽는 경로가 없다 — 마이그레이션이 선언한 목적이 달성되지 않았다

**File:** `server/src/services/dma-orders.ts:53-54` (`ORDER_COLS`), `packages/shared/src/relay.ts:851-876` (`DmaOrderRow`)
**연관:** `supabase/migrations/20260908120000_dma_orders_origin.sql:5-7`

**Issue:** 마이그레이션은 목적을 "My page 전략 현황과 주문내역이 「내가 낸 주문」과 「전략이 낸 주문」을 갈라 보여줘야 한다"로 명시한다. relay 는 `origin` 을 insert·update 양쪽에 채운다. 그러나 `ORDER_COLS` 에 `origin` 이 없고 `DmaOrderRow` 에도 필드가 없다 — 브라우저가 그 값을 볼 방법이 전혀 없다. (WR-04 로 조회 자체가 호출되지도 않는다.)

**Fix:** `ORDER_COLS` 에 `origin` 을 추가하고 `DmaOrderRow.origin: "manual" | "limit_chaser" | "vi"` 를 계약에 싣는다. 열지 않을 거라면 마이그레이션 주석에서 목적 문장을 정정한다.

### WR-06: 시세가 없는 종목에서 매수 게이트를 켤 수 있다 — 발주가 0 · 수량 0 인 전략이 「매수 켜짐」으로 표시된다

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:305-317`, `webapp/src/components/trading/limit-chaser-form.tsx:337`
**연관:** `webapp/src/lib/limit-chaser.ts:89-92`, `server/src/mappers/stock.ts:118-119`

**Issue:** `mergeMasterAndQuote` 는 `stock_quotes` 행이 없으면 `upperLimit: 0`, `price: 0` 을 돌려준다. 검색으로 그런 종목을 고르면 `seedFromUpperLimit(0)` 이 모든 가격 칸을 0 으로 채운다. 폼의 `disabled` 는 `isin`·`accountNo`·`status` 만 보므로 매수 스위치를 켤 수 있고, `toggleGate` 가 확인 없이 즉시
`{buyEnabled:true, buyOrderPrice:0, buyOrderQty:0}` 을 보낸다(`UIntSchema` 는 0 을 통과시킨다).

화면은 「매수 켜짐」 배지를 그리고 산출 수량은 `—` 로만 표시한다. 사용자는 무장했다고 믿지만 그 전략은 영원히 발주하지 않는다 — 조용한 실패다.

**Fix:** `buyOrderPrice <= 0 || buyOrderQty <= 0` 이면 매수 스위치를 `disabled` 로 두고 사유를 한 줄로 말한다(매도·스윕 게이트도 동형). relay 쪽에서도 `buyEnabled === true && (buyOrderPrice === 0 || buyOrderQty === 0)` 를 거부 프레임으로 돌려주는 편이 안전하다.

### WR-07: VI 주문금액에 상한이 없다 — ulong 표현 범위를 넘으면 조용히 감싼다

**File:** `relay/src/ws/protocol.ts:150`, `relay/src/dma/envelope.ts:1014-1017`, `webapp/src/components/trading/vi-settings-card.tsx:558-565`

**Issue:** `orderAmountKrw` 는 zod `UIntSchema`(= `int().min(0)`, 상한 없음), envelope 은 `Number.isInteger && >= 0` 만 본다. UI 입력에도 `maxLength` 나 상한 검사가 없다. `SetVITrigger.order_amount_krw` 는 fbs 상 `ulong` 이라 `BigInt(1e21)` 같은 값은 `DataView.setBigUint64` 에서 **modulo 2^64 로 감싸** 전혀 다른 금액이 된다.

같은 파일이 `buyOrderPrice` 등 상따 필드에는 `toWireUint`(MAX_UINT32) 가드를 걸고 "넘기면 조용히 감싸 전혀 다른 값이 된다"고 적어 두었다. VI 경로만 그 규율에서 빠져 있다.

**Fix:** ① envelope 에 `cfg.orderAmountKrw > Number.MAX_SAFE_INTEGER` 거부를 추가하고, ② zod 에 현실적인 상한(예: `.max(10_000_000_000)`)을 두고, ③ UI 입력에도 같은 상한을 걸어 확인 다이얼로그가 그 값을 보여 주게 한다.

### WR-08: 사이드바의 ISIN→종목명 역매핑만 `account`(마지막 수신)를 읽는다 — 다른 계좌의 전략은 ISIN 원문으로 표시된다

**File:** `webapp/src/components/layout/app-sidebar.tsx:246-260`

**Issue:** 같은 역할의 다른 두 구현은 `accountStates` 전체를 순회한다(`limit-chaser-client.tsx:871-880`, `strategy-status-card.tsx:97-114`). 사이드바만 `account` 하나를 본다. 계좌 2개 이상에서 「마지막으로 프레임이 온 계좌」에 보유·미체결이 없는 종목의 전략은 3단 목록에 `KR7005930003` 같은 ISIN 으로 그려지고, 그 표시가 계좌 상태 프레임이 올 때마다 **왔다 갔다 한다**.

(복제 자체는 기존에 인지된 항목이지만, 세 사본의 **동작이 서로 다르다**는 점은 별개 결함이다.)

**Fix:** `accountStates` 를 순회하도록 맞추고(그리고 `useMemo` 로 감싼다 — 지금은 렌더마다 Map 을 새로 만든다), 세 사본을 `lib/` 의 공용 훅 하나로 합친다.

### WR-09: 종료 절차의 `flushNow()` 가 진행 중 플러시와 겹치면 큐를 비우지 않고 반환한다

**File:** `relay/src/store/orders.ts:390-392`, `relay/src/index.ts:199-200`

**Issue:**
```ts
async flushNow(): Promise<void> {
  if (this.#flushing) return;      // ← 진행 중이면 즉시 반환
  …
}
```
`start()` 의 200ms 인터벌 플러시가 돌고 있는 동안 SIGTERM 이 오면, `await orderStore.flushNow()` 는 **아무것도 기다리지 않고** 반환하고 곧바로 `close()` 가 인터벌을 끊는다. 진행 중 배치 이후에 큐에 들어간 갱신(마지막 체결 통보 등)은 그대로 사라진다. Cloud Run 의 SIGTERM→SIGKILL 유예가 짧은 환경에서 재현 가능하다.

**Fix:** 진행 중 플러시를 기다렸다가 다시 시도한다.
```ts
#current: Promise<void> | null = null;
async flushNow(): Promise<void> {
  while (this.#current !== null) await this.#current;
  if (this.#queue.length === 0) return;
  this.#current = this.#drain();
  try { await this.#current; } finally { this.#current = null; }
  if (this.#queue.length > 0) await this.flushNow();   // 재큐잉분까지 비운다
}
```

---

## Info

### IN-01: `PendingOrder.qty` 가 저장만 되고 읽히지 않는다

**File:** `relay/src/ws/order-handler.ts:108`, `relay/src/ws/order-handler.ts:613-620`
`finish()` 는 클로저의 `msg.qty` 를 쓰고(L585), `entry.qty` 는 어디서도 참조되지 않는다. CR-04 가 필요로 하는 매칭 축이 자료구조에는 이미 있는데 쓰이지 않는 상태다. CR-04 수정 시 함께 소비하면 된다.

### IN-02: `CreateOrderResponse` 가 계약에 남아 있다 — 자기 주석이 "16-16 에서 제거된다"고 적었다

**File:** `packages/shared/src/relay.ts:820-836`, `packages/shared/src/index.ts:43`
사용처 0건. 주석이 스스로 제거 예정이라고 선언한 타입이 export 로 남아 있으면 다음 사람이 살아 있는 계약으로 읽는다. 삭제 권장.

### IN-03: 인증 왕복 중 도착한 프레임마다 warn 을 남긴다 — 미인증 피어의 로그 증폭

**File:** `relay/src/ws/fanout.ts:464-467`, `relay/src/ws/fanout.ts:457-462`
`#onFirstMessage` 는 `t !== "auth"` 검사를 `authInFlight` 검사보다 **먼저** 하므로 ① 브라우저가 `auth` 와 `sub` 을 파이프라인하면 연결이 close(4400) 된다(현재 계약상 브라우저는 ACK 를 기다리므로 미발현), ② 인증 왕복(수백 ms) 동안 들어오는 모든 `auth` 프레임이 건마다 `logger.warn` 을 만든다. 같은 파일의 인바운드 상한이 "로그가 곧 두 번째 DoS 다"라며 경고를 1회로 묶는 규율과 어긋난다. `authInFlight` 검사를 앞으로 옮기고 경고를 1회로 묶을 것.

### IN-04: `relayOrderSecret` 이 실질적으로 아무 라우트도 지키지 않는다

**File:** `relay/src/order/order-api.ts:132-151`, `relay/src/order/order-api.ts:187`
REST 주문 라우트가 사라진 뒤 이 Express 앱에 남은 라우트는 `/healthz` **하나뿐**이고, 그 경로는 가드가 명시적으로 통과시킨다(L134). 즉 공유 비밀은 「404 를 401 로 바꾸는」 역할만 한다. 그럼에도 `RELAY_ORDER_SECRET` 은 relay 부팅 필수 env 로 남아 있다(deploy-server.sh 주석이 "relay 가 `/healthz` 관문에 계속 쓴다"고 적었지만 실제로는 healthz 가 면제 대상이다). 의도를 문서와 코드 중 한쪽에 맞출 것.

### IN-05: `DmaOrderRow` 주석이 D-03 이전 상태를 설명한다

**File:** `packages/shared/src/relay.ts:841`
"server 가 요청을 insert 하고" — D-03 으로 insert 도 relay 가 한다. 계약 문서가 소유권을 틀리게 말하면 다음 사람이 server 에 쓰기 경로를 다시 만든다.

### IN-06: 서버 통지 로그가 버퍼 넘침 시 전체를 다시 기록한다

**File:** `webapp/src/components/trading/limit-chaser-client.tsx:322-336`
`messages.indexOf(seen)` 는 참조 동일성 비교인데, `MAX_MESSAGES`(20) 를 넘겨 `seen` 이 버퍼에서 밀려나면 `idx < 0` 이 되어 **20건 전부**가 전략 로그에 다시 쌓인다. 렌더 사이에 20건 이상이 몰리는 경우(전체 비활성화 직후 에코 폭주 등)에 발현한다. 단조 증가 시퀀스나 `receivedAt+t` 복합 키로 비교할 것.

### IN-07: `checkRate` 음수 허용 경로가 UI 에서 도달 불가능하다

**File:** `relay/src/ws/protocol.ts:152`, `relay/src/dma/envelope.ts:1026`, `webapp/src/components/trading/vi-settings-card.tsx:747-750`
`parseDigits` 가 `[^0-9]` 를 전부 제거하므로 부호를 입력할 수 없다. "하락 감시를 막지 않으려고 음수를 허용한다"는 두 곳의 근거 주석이 실제로는 아무 경로도 열지 않는다. 하락 감시가 요구사항이면 입력에 부호를 허용하고, 아니면 스키마를 `min(0)` 으로 좁혀 근거를 일치시킬 것.

---

## 검토했으나 결함을 찾지 못한 영역

- **계좌 화이트리스트 대조** (`fanout.ts:712-727`, `order-handler.ts:471-478`) — 근거가 `session.allowedAccounts` 하나로 유지되고, 인바운드 바디·상태 프레임 사본을 쓰는 경로가 없다. 로그 마스킹(`maskAccountNo`)도 일관된다.
- **사용자 간 팬아웃 격리** (`fanout.ts:848-852`, `subscription-hub.ts` 전역) — 캐시 키가 전부 `userId|` 접두어이고 전역 브로드캐스트 함수가 없다. `#onOrderNotice` 도 `#fanout(userId, …)` 만 쓴다.
- **`mergeAccountState` ↔ `mergeAccount` 대칭** (relay `subscription-hub.ts:883-919` ↔ webapp `use-relay-socket.ts:493-539`) — 스냅샷 0행 필터·델타 0행 삭제·`rm` 을 upsert 뒤에 적용하는 순서까지 동일하다.
- **`ws-order.test.ts` 17케이스** — 단언이 실효적이다(게이트웨이로 나간 `DirectOrderReq` 개수를 세고, 중복 요청에 대해 `orderReqs.length === 1` 과 `inserts.length === 1` 을 함께 확인한다). 다만 sink 를 스텁으로 대체하므로 CR-02 의 Supabase 쿼리 경계는 검사 범위 밖이다.
- **`orderbook.spec.ts` REST 감시자** — `expect(restHits).toEqual([])` 로 `POST /api/orders` 부재를 실제로 강제한다.
- **`dma-gate` 3표면 게이팅** — `isLoading` 중 게이트를 세우지 않는 규율이 세 표면에 동일하게 적용되고, `lc.set`/`vi.set`/`vi.confirm` 호출부는 전부 `status !== 'ready'` 로 가려져 있다(CR-03 의 킬 스위치만 예외).

---

_Reviewed: 2026-09-08T22:12:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
