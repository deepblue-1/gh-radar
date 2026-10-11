---
phase: 16-trading-limit-chaser-vi-my-page
reviewed: 2026-09-09T03:42:42Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/session-manager.ts
  - relay/src/dma/session.ts
  - relay/src/index.ts
  - relay/src/order/order-api.ts
  - relay/src/store/orders.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/src/ws/protocol.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/fanout.test.ts
  - relay/tests/order-api.test.ts
  - relay/tests/order-store.test.ts
  - relay/tests/protocol.test.ts
  - relay/tests/session-manager.test.ts
  - relay/tests/ws-order.test.ts
  - relay/README.md
  - scripts/smoke-relay.sh
  - server/src/errors.ts
  - server/src/services/dma-orders.ts
  - server/tests/routes/orders.test.ts
  - supabase/migrations/20260909120000_dma_orders_user_order_no_unique.sql
  - webapp/e2e/fixtures/relay.ts
  - webapp/e2e/specs/trading-limit-chaser.spec.ts
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/stock/stock-orderbook-section.tsx
  - webapp/src/components/stock/__tests__/orderbook.test.tsx
  - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
  - webapp/src/components/trading/limit-chaser-client.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/vi-settings-card.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx
  - webapp/src/lib/isin-labels.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/vi-alert.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
findings:
  critical: 7
  warning: 21
  info: 11
  total: 39
findings_gap_closure:
  critical: 3
  warning: 12
  info: 4
  total: 19
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

---

## 갭 클로징 재리뷰 (16-18 ~ 16-26)

**검토 일시:** 2026-09-09T03:42:42Z
**깊이:** standard
**범위:** `git diff 584b49c..HEAD` 의 소스 47파일 (계획 산출물 제외, `scripts/dma-credentials.*` · `infra/relay/README.md` 제외)
**상태:** issues_found — Critical 3 · Warning 12 · Info 4 → **2라운드 갭 클로징(16-27~16-35)에서 19건 전부 종결 — 상세는 항목별 `> **종결:**` 표시 참조.** 처리 표는 `16-VALIDATION.md` §Gap Closure 2라운드 (16-27 ~ 16-35). 원문 Issue·Fix 는 근거를 되짚을 수 있도록 **지우지 않았다**.

> ⚠️ **이 절의 Fix 스니펫을 그대로 베끼지 말 것.** `GC-WR-03` 의 제안(`sideTrusted && side !== ""`)은 실행해 보니 **그 자체로 새 버그**였다 — 취소거부가 살아 있는 신규 매수를 「거부됨」으로 정산한다. 기존 테스트 ②가 그것을 잡았고 16-34 가 `noticeType ∈ {A, E}` 가드를 한 겹 더 걸어 닫았다. 리뷰의 스니펫은 방향이지 정답이 아니다.

이 절은 **새 ID 네임스페이스**(`GC-CR-`/`GC-WR-`/`GC-IN-`)를 쓴다. 위쪽 CR-01~04 · WR-01~09 · IN-01~07 은 클로징 **이전** 리뷰이고 `deferred-items.md` 가 그 앵커를 참조하므로 건드리지 않았다.

### 요약

아홉 개 갭 클로징 플랜이 각자 선언한 것은 대체로 실제로 구현돼 있다: `order_no` 셀렉터의 3축 좁히기(16-18)는 타입 수준에서 `userId` 를 요구하고, `market` 소유권 이전(16-25)은 zod 스키마에서 필드 자체를 지웠으며, `MAX_VI_ORDER_AMOUNT_KRW` 는 zod·envelope·UI 세 층이 같은 상수를 본다. 테스트도 대체로 실효적이다(`fakeDmaOrders` 는 필터를 **실제로 적용해** 영향 행을 계산하고, `insertGate` 는 경주를 결정론적으로 재현한다).

문제는 **새로 도입된 상관 로직**에 있다. 세 Critical 은 모두 「기록이 조용히 사라지거나 엉뚱한 주문에 붙는」 형태이고, 그중 하나(`GC-CR-01`)는 16-22 가 스스로 「최악의 결과」라고 적어 둔 시나리오를 **후보가 1개일 때** 그대로 남겨 두었다.

---

### Critical

#### GC-CR-01: `narrowPending` 의 「후보 1개」 지름길이 **모든 상관 축을 건너뛴다** — 살아 있는 주문이 「취소됨」으로 정산된다

> **종결:** 16-27 — 「후보 1건 지름길」을 없애고, 통보가 **실어 온** 강한 축(비어 있지 않은 `orgOrderNo` · 취소성 `noticeType` C/M)을 후보 수와 무관한 **하드 필터**로 승격했다(0건이면 `null`). 비어 있는 축은 그대로 건너뛰어 구 게이트웨이 호환 유지. 통보 소비 루프의 warn 조건도 `candidates.length > 0 && picked === null` 로 넓혔다. — 근거: 커밋 `eeb3a6e` · `pnpm --filter @gh-radar/relay test -- order`

**File:** `relay/src/ws/order-handler.ts:863-865`

```ts
export function narrowPending(candidates: PendingOrder[], n: ParsedOrderResp): PendingOrder | null {
  // 후보 1개는 지금까지의 정상 경로다(대부분의 실사용). 여기서 회귀가 없어야 한다.
  if (candidates.length <= 1) return candidates[0] ?? null;
```

**Issue:**
후보 수집 필터는 `entry.isin === notice.isin` **하나뿐**이다(`order-handler.ts:340`). 따라서 후보가 1건이면 통보가 무엇을 실어 왔든 그 대기가 정산된다 — `orgOrderNo` 가 채워진 취소확인이든, 이 relay 가 낸 적 없는 주문의 통보든 상관없다. 16-22 의 docstring 이 「폴백이 있던 시절의 실패」로 적어 둔 시나리오가 **후보 1개 경로에서 그대로 재현된다**:

- 사용자가 A 종목 매수(신규)를 낸다 → 대기 1건.
- 5초 안에 같은 종목의 **다른 경로** 통보가 도착한다. 경로는 최소 셋이다:
  - 다른 탭·다른 단말에서 이미 정산돼 대기열에서 빠진 취소 요청의 취소확인("C" + `orgOrderNo`),
  - 상따·VI 자동주문의 취소확인,
  - **세션 합류로 들어오는 남의 통보** — `notice-status.ts:51` 이 "정정은 v1 이 만들지 않지만 **세션 합류로 남의 통보가 올 수 있다**"고 명시한다(같은 DMA 세션에 붙은 WinForms 클라이언트 등).
- `narrowPending` 은 후보가 1개이므로 축을 보지 않고 그 대기를 고른다 → `finish(notice)` 가 실행된다.

결과는 둘 다 실계좌 사고다.
1. 브라우저는 `{t:"order.result", status:"cancelled"}`(`statusOf` 의 `"C" → "cancelled"`, `notice-status.ts:48-49`)를 받는다. **살아 있는 매수 주문이 화면에 「취소됨」으로 뜬다.** 사용자가 그 표시를 믿고 재주문하면 중복 체결이다 — 이 파일이 스스로 「최악의 결과」라고 부른 상황이다.
2. `dma_orders` 행에 **남의 `order_no`** 가 기록된다(`finish` 의 `enqueueUpdate({orderRowId, orderNo: notice.orderNo, …})`, L749-758). 감사 기록이 다른 주문을 가리키게 된다.

단위 테스트(`ws-order.test.ts` — "유일 후보는 축을 보지 않는다")가 이 동작을 **의도로 못박아** 두었으므로, 회귀가 아니라 설계 결함이다. 근거로 든 「구 서버가 축을 비워 보낸다」는 **비어 있는 축을 건너뛸** 이유이지, **통보가 실제로 실어 온 축을 무시할** 이유가 아니다.

**Fix:** 통보가 실어 온 강한 축(취소 원주문번호 · 취소성 통보종류)은 후보 수와 **무관하게** 하드 필터로 적용한다. 비어 있으면 적용하지 않으므로 구 서버 호환은 유지된다.

```ts
export function narrowPending(candidates: PendingOrder[], n: ParsedOrderResp): PendingOrder | null {
  if (candidates.length === 0) return null;

  // ★ 통보가 **실어 온** 축은 후보 수와 무관하게 하드 필터다. 비어 있는 축만 건너뛴다
  //   (구 서버 호환의 원래 의미). 이 둘이 어긋난 통보는 이 대기의 것이 아니다.
  const isCancelNotice = n.noticeType === "C" || n.noticeType === "M";
  const hard = candidates.filter(
    (p) =>
      (n.orgOrderNo === "" || (p.isCancel && p.orgOrderNo === n.orgOrderNo)) &&
      (!isCancelNotice || p.isCancel),
  );
  if (hard.length === 0) return null; // 아무것도 정산하지 않는다 — 5초 타임아웃이 진실이다.
  if (hard.length === 1) return hard[0] ?? null;

  let pool = hard;
  /* … 기존 ①~④ 단계적 좁히기 그대로 … */
}
```

테스트도 함께 바꿔야 한다: "유일 후보는 축을 보지 않는다" 케이스를 **"유일 후보라도 취소확인은 신규 대기를 정산하지 않는다"** 로 뒤집는다.

---

#### GC-CR-02: 좁히지 못한 **수동** 통보는 존재하지 않는 `order_no` 행을 갱신한다 — 접수·체결 기록이 로그도 없이 사라진다

> **종결:** 16-33 — 수동 통보도 `findIdByOrderNo`(`:427`) 조회를 거치고, **행이 있음이 확인된 경우에만** `orderRowId` 로 갱신한다(`:444`). 없으면 통보 원문(`orderNo`·`noticeType`·`resultCode`·`isin`·수량·가격)을 `logger.error` 로 남기고 **갱신을 큐에 넣지 않는다**(`:452-462`). D-24 의 두 번째 감사 사본으로 `subscription-hub.ts:708-716` stdout 1줄을 함께 넣었다. — 근거: 커밋 `0ce0e2d` · `pnpm --filter @gh-radar/relay test -- order` (변이 실증 4건)

**File:** `relay/src/ws/order-handler.ts:395-403`, `relay/src/ws/order-handler.ts:665-681`

**Issue:**
수동 주문의 insert 는 `order_no` 를 **싣지 않는다**(`handle` ③-2, L665-681 — 접수 전이라 주문번호를 모른다). `order_no` 는 `finish` 가 정산할 때 큐로 채운다(L749-758).

그런데 `recordUnmatched` 의 `manual` 분기는 `{...patch, userId}` 를 큐에 넣고(L402), `selectorOf` 는 이를 `{column:"order_no", …}` 셀렉터로 만든다(`store/orders.ts:607-609`). **그 시점에 그 사용자의 오늘 행 중 `order_no = notice.orderNo` 인 행은 없다.** PostgREST 의 update 는 0행이어도 에러가 아니므로 이 갱신은 아무것도 하지 않고 조용히 끝난다 — 이 모듈이 파일 머리말에서 「Pitfall 18」이라고 부르며 없애겠다고 선언한 바로 그 침묵이다.

발생 경로는 둘 다 실사용에서 재현된다.
1. **좁히기 실패** — 같은 종목·같은 수량·같은 가격의 매수/매도가 동시에 대기하면 `narrowPending` 이 `null` 을 돌려준다(테스트 ㉑ 이 그 상태를 고정한다). 이때 `logger.warn` 은 후보 수와 축만 남기고 **통보 내용은 남기지 않는다**.
2. **연결 종료** — `closeConn` 이 `state.pending` 을 비운 뒤 도착한 통보는 후보가 0건이라 같은 분기를 탄다. 이 경로는 `candidates.length > 1` 이 아니므로 **경고 로그조차 없다**.

`SubscriptionHub#onOrderNotice`(`subscription-hub.ts:690-703`)도 통보를 stdout 에 남기지 않는다. 즉 D-24 가 약속한 「두 번째 감사 사본(stdout)」이 이 경로에는 **없다.** 그 결과 실제로 접수·체결된 주문이 `dma_orders` 에 `status:'requested'` → (5초 뒤) `status:'timeout'`, `order_no: null` 로 남고, 브로커 주문번호와 대조할 수단이 사라진다.

**Fix:** 수동 분기도 자동 분기와 **같은 조회**를 거쳐 `orderRowId` 로 좁히고, 행이 없으면 최소한 통보 원문을 error 로 남긴다. `order_no` 셀렉터는 「행이 있음이 확인된」 경우에만 쓴다.

```ts
if (notice.originKind === "manual") {
  const id = await deps.orderStore
    .findIdByOrderNo(userId, notice.orderNo)
    .catch(() => undefined); // 조회 실패는 아래 열화 경로로 간다

  if (typeof id === "string") {
    deps.orderStore.enqueueUpdate({ ...patch, orderRowId: id });
    return;
  }
  // 행이 없다 = 갱신은 0행이다. **조용히 보내지 않는다** — 감사 사본을 stdout 에 남긴다 (D-24/S-5).
  logger.error(
    { orderNo: notice.orderNo, noticeType: notice.noticeType, resultCode: notice.resultCode,
      isin: notice.isin, qty: notice.quantity, price: notice.price },
    "[WS-order] 대기·행 어디에도 붙지 않는 수동 통보 — stdout 이 유일한 기록이다",
  );
  if (id === undefined) deps.orderStore.enqueueUpdate({ ...patch, userId }); // 조회 실패 시 열화 갱신
  return;
}
```

---

#### GC-CR-03: `handle` 의 `await insertRequest` 중에 연결이 닫히면 **회수되지 않는 대기·타이머**가 남고, 체결된 주문이 `timeout` 으로 기록된다

> **종결:** 16-27 — `await insertRequest` 직후·`buildDirectOrderReq` 이전(`order-handler.ts:701` vs `:719`)에 `conns.get(conn) !== state` 재확인을 두어 왕복 중 탭이 닫히면 **게이트웨이로 나가기 전에** 중단한다(`logger.warn` + `status:"rejected"`). 고아 `ConnState` 대기·타이머가 생기지 않는다. — 근거: 커밋 `909a217` · 변이 실증 ㉕(가드 무력화 시 `DirectOrderReq` 1건 송신으로 실패)

**File:** `relay/src/ws/order-handler.ts:663-689`(await), `:770-786`(타이머·대기 등록), `:816-835`(`closeConn`)

**Issue:**
`handle` 은 `deps.orderStore.insertRequest(...)` 를 `await` 한다(Supabase 왕복 수십~수백 ms). 그 사이에 사용자가 탭을 닫거나 다른 페이지로 이동하면 `closeConn` 이 먼저 돌아 `state.pending` 을 비우고 `state.claims`/`state.dupKeys` 를 지우고 `conns`·`byUser` 에서 그 연결을 제거한다. 그 **뒤에** `handle` 이 재개해서:

- `setTimeout(() => finish(null), timeoutMs)` 를 새로 걸고(L770) — `closeConn` 은 이미 지나갔으므로 **이 타이머를 걷을 주체가 없다**,
- `state.pending.push(entry)`(L786) 로 **`conns` 에서 이미 떨어져 나간 고아 `ConnState`** 에 대기를 등록하고,
- `session.send(payload)` 로 **주문을 실제로 게이트웨이에 보낸다**(L789).

결과:
1. 통보 상관은 `byUser.get(userId)` → `conns.get(conn)` 을 훑는데(L336-338) 그 연결이 없으므로 이 대기는 **영원히 후보가 되지 않는다.** 접수·체결 통보는 `GC-CR-02` 의 침묵 경로로 흘러간다.
2. 5초 뒤 고아 타이머가 `finish(null)` 을 실행해 `enqueueUpdate({orderRowId, status:"timeout"})` 을 큐에 넣는다 — **실제로 접수·체결된 주문이 감사 기록에 `timeout` 으로 확정된다.** 이 값은 나중에 정정할 경로도 없다(그 행을 가리키는 `orderRowId` 를 아는 주체가 사라졌다).
3. `release` 는 `state.dupKeys.delete` 가 false 를 돌려 조기 반환하므로(L298) 정리 자체는 안전하지만, 그 안전장치가 **고아 대기의 존재를 감춘다.**

**Fix:** 연결이 살아 있는지를 `await` **직후에** 다시 확인하고, 죽었으면 조립·송신 이전에 중단한다. 「보내기 전에 확인한다」가 유일한 안전한 순서다.

```ts
// ③-2 insert 직후 — `await` 중에 연결이 닫혔는지 확인한다. 닫혔으면 **보내지 않는다**.
if (conns.get(conn) !== state) {
  logger.warn({ ...logCtx, orderRowId }, "[WS-order] 요청 처리 중 연결 종료 — 주문을 보내지 않는다");
  deps.orderStore.enqueueUpdate({
    orderRowId, status: "rejected", message: "요청 처리 중 연결이 끊겨 주문을 보내지 않았습니다.",
  });
  return; // 대기 등록·타이머 생성 이전이다 — 회수할 것이 없다.
}
```

(설계상 「이미 보낸 뒤 연결이 끊기는」 경우는 여전히 존재하지만, 그때는 통보가 `recordUnmatched` 로 가면 되므로 `GC-CR-02` 의 수정이 그 구멍을 메운다.)

---

### Warning

#### GC-WR-01: `void recordUnmatched(...)` — `.catch` 가 없어 한 번의 예외가 **relay 프로세스 전체**를 내린다

> **종결:** 16-33 — 예외 격리를 두 겹으로 했다: 호출부 `void recordUnmatched(...).catch`(`:374`) + `autoInsertRow` 를 `insertOnly` 의 try 안으로(`:547`/`:548`). `index.ts` 의 `unhandledRejection` 이 `logger.fatal` + 프로세스 종료라 한 겹만으로는 통보 1건의 파손이 전 사용자의 DMA 세션을 끊는다. 두 겹이 **각각 독립으로** 잠긴 것을 변이 2종으로 실증. — 근거: 커밋 `49db808`

**File:** `relay/src/ws/order-handler.ts:367`, `relay/src/index.ts:220-223`

`recordUnmatched` → `ensureRow` 안에서 `autoInsertRow(userId, notice)`(L454)와 그 안의 `deps.symbols.lookup` · `deps.hub.getLimitChasers` · `deps.hub.getViTrigger` 호출은 **try 밖**에 있다. 여기서 예외가 나면 `task` 가 reject 되고, `await task` 를 거쳐 `recordUnmatched` 가 reject 되며, 호출부가 `void` 라 아무도 잡지 않는다. `index.ts:220` 의 핸들러는 `unhandledRejection` 을 `logger.fatal` + **프로세스 종료**로 다룬다 — 통보 1건의 파손이 그 순간 접속한 **모든 사용자의 DMA 세션**을 끊는다.

**Fix:** `void recordUnmatched(userId, notice).catch((err) => logger.error({ err, orderNo: notice.orderNo }, "[WS-order] 통보 기록 경로 예외"));` 그리고 `autoInsertRow` 호출을 `ensureRow` 의 try 안으로 옮긴다.

---

#### GC-WR-02: `ensureRow` 의 inflight 키가 **빈 주문번호에서 충돌**한다 — 서로 다른 자동주문 거부가 한 행에 겹쳐 쓰인다

> **종결:** 16-33 — `ensureRow:500` 이 `orderNo === ""` 를 in-flight 키(`:524`) 밖으로 뺀다. 합치면 그 사용자의 **모든** 접수 전 거부("R")가 `"user|"` 하나를 공유해 서로 다른 거부가 같은 `row.id` 를 덮어썼다. `findIdByOrderNo` 는 이 값에서 항상 `null` 이라 dedup 의 의미도 없다. — 근거: 커밋 `49db808` · 변이 실증 ㉘

**File:** `relay/src/ws/order-handler.ts:435`, `relay/src/store/orders.ts:428`

키는 `${userId}|${notice.orderNo}` 다. 접수 전 거부("R")는 `orderNo === ""` 로 오므로 그 사용자의 **모든** 빈 주문번호 통보가 같은 키 `"user|"` 를 공유한다. 동시에 도착한 두 개의 서로 다른 자동주문 거부는 첫 번째의 Promise 를 재사용해 **같은 `row.id`** 를 받고, 두 통보의 `patch` 가 그 한 행에 차례로 덮어써진다 — 한 건의 거부 기록이 사라진다. (덧붙여 `OrderStore.findIdByOrderNo` 는 `orderNo === ""` 에서 항상 `null` 을 돌려주므로(orders.ts:428) 이 키에는 dedup 의 의미가 애초에 없다.)

**Fix:** 빈 주문번호는 inflight 를 태우지 않는다.

```ts
async function ensureRow(userId: string, notice: ParsedOrderResp): Promise<EnsureResult> {
  // 빈 주문번호는 상관 키가 아니다 — 합치면 서로 다른 거부가 한 행에 겹친다.
  if (notice.orderNo === "") return insertOnly(userId, notice);
  const key = `${userId}|${notice.orderNo}`;
  …
}
```

---

#### GC-WR-03: `narrowPending` 에 **매매구분 축이 없다** — 매수/매도 동시 대기가 둘 다 「결과 모름」으로 끝난다

> **종결:** 16-34 — `PendingOrder.side`(`:179`) 신설 + `narrowPending:1050-1073` 에 `refine` 축 추가. **다만 이 절의 Fix 스니펫(`sideTrusted && side !== ""`)을 그대로 넣으면 새 버그가 된다** — 파서의 `sideTrusted = noticeType !== "C" && !== "M"` 는 거부("R")에도 `true` 를 주는데 "R" 은 취소 요청에도 오고 취소 통보의 side 는 브로커 기본값이므로, 축을 걸면 **취소거부가 살아 있는 신규 매수를 「거부됨」으로 정산**한다(기존 테스트 ②가 실제로 깨져 이것을 잡았다). `noticeType ∈ {A, E}` 한 겹을 더 걸었다. 정규화는 `fromWireSide`(envelope.ts) 재사용 — 모르는 값은 `null` 로 축을 건너뛴다. — 근거: 커밋 `770da64`

**File:** `relay/src/ws/order-handler.ts:874-889`

`ParsedOrderResp` 는 `side` 와 「믿어도 되는가」를 말하는 `sideTrusted` 를 **둘 다** 싣는다(`envelope.ts:1183-1192`). 그런데 `narrowPending` 은 이 축을 전혀 쓰지 않는다. 테스트 ㉑ 이 고정한 「매수 10@70000 + 매도 10@70000」은 `sideTrusted === true` 인 접수 통보 하나로 **완전히 가를 수 있는데도** 좁히기에 실패해 두 주문 모두 `timeout` 으로 끝난다 — 사용자는 실제로 접수된 두 주문에 대해 「결과를 확인하지 못했습니다」를 본다.

**Fix:** ② 뒤에 축 하나를 추가한다. `sideTrusted` 가 false 면(취소·정정 통보) 적용하지 않는다.

```ts
// ②-1 매매구분 축. 취소·정정 통보에는 매매구분이 없다 (Pitfall 8) — 그때는 쓰지 않는다.
if (n.sideTrusted && n.side !== "") {
  const noticeSide: OrderSide = n.side.startsWith("S") ? "S" : "B";
  refine((p) => !p.isCancel && p.side === noticeSide);
}
```
(`PendingOrder` 에 `side` 를 싣는 변경이 함께 필요하다 — `handle` 이 이미 `const side` 를 계산해 둔다, L660.)

---

#### GC-WR-04: `lc.set` 의 **삭제(`crud:"D"`)도** ISIN 해석 실패로 거부된다 — 상장폐지·마스터 미로딩 종목의 전략을 지울 수 없다

> **종결:** 16-29 — 철거(`crud:"D"` ∨ 게이트 4종 전부 OFF)를 `#teardownMarket` 이 받아 **에코 캐시(`getLimitChasers`) → `SymbolMap` → 상수 폴백** 순으로 풀고 **절대 거부하지 않는다**. 등록·수정은 `#strategyMarket` 그대로라 16-25 의 엄격함(T-16-42)이 유지된다. 폴백이 안전한 근거는 `strategyKey()` = `ISIN:계좌:거래소` 라 철거 프레임의 `market` 이 **무엇을 지울지에 관여하지 않는다**는 사실이다. `#isTeardown` 은 `crud` 하나에 의존하지 않고 `isDeleteIntent()` 와 같은 네 항을 함께 본다. — 근거: 커밋 `e1c627e` · 변이 실증 ⑰-e·⑰-e2

**File:** `relay/src/ws/fanout.ts:579-581`, `:761-790`

`#strategyMarket` 은 `crud` 를 보지 않는다. `SymbolMap` 이 그 ISIN 을 못 풀면(상장폐지로 `stocks` 에서 빠졌거나, relay 부팅 직후 `symbols.start()` 가 아직 안 끝났거나) **등록·수정·삭제가 전부** 「이 종목은 지금 전략을 등록할 수 없습니다」로 막힌다. 즉 사용자가 자기 전략을 **내릴 수 없는** 상태가 만들어진다 — `limit-chaser-form.tsx` 가 T-16-44 로 "무장 해제를 막으면 그게 더 위험하다"고 적어 둔 것과 정확히 같은 종류의 위험이 서버 쪽에 남아 있다. (`strategies.disable` 이 게이트만 내리는 우회로이지만, 그것은 삭제가 아니고 단건 지정도 UI 에 없다.)

**Fix:** 삭제·전 게이트 off 요청은 시장 해석을 요구하지 않는다. 캐시된 에코의 `market` 을 쓰고, 그것도 없으면 `"K"` 가 아니라 **요청을 통과시키되 게이트웨이가 키로만 지우도록** 한다.

```ts
const cached = this.#strategyEcho(userId, cfg.isin, cfg.accountNo, cfg.exchange)?.market;
const market =
  cfg.crud === "D"
    ? (cached ?? this.#strategyMarketOrNull(cfg.isin))   // 삭제는 해석 실패로 막지 않는다
    : this.#strategyMarket(conn, userId, msg.t, cfg.isin);
if (cfg.crud !== "D" && market === null) return;
```

---

#### GC-WR-05: relay 의 무장 가드가 UI 보다 **느슨하다** — `sellWatchQty === 0` · 한방 게이트가 서버에서 통과한다

> **종결:** 16-29 — `#strategyArmable` 의 `reason` 이 `buy`·`sell`·`sweep` 3갈래가 됐다. `sellWatchQty === 0` 과 한방 게이트가 이제 서버에서 통과하지 못한다. 삭제에는 이 가드가 걸리지 않으며 그 예외를 호출부가 아니라 **함수 자신이** 소유한다. — 근거: 커밋 `b059be8` · 변이 실증 ⑰-g·⑰-h·⑰-h2

**File:** `relay/src/ws/fanout.ts:796-812` vs `webapp/src/components/trading/limit-chaser-form.tsx:343-368`

UI 는 `canArmSell = sellOrderPrice > 0 && sellWatchQty > 0`, `canArmSweep = sweepWatchPrice > 0 && canArmBuy` 로 판정한다. relay 의 `#strategyArmable` 은 `sellEnabled && sellOrderPrice === 0` 하나만 보고 **`sellWatchQty` 도 `sweepEnabled` 도 보지 않는다.** 그런데 이 검사의 존재 이유가 "UI 를 우회한 경로(직접 wss, 옛 탭)가 있어도 무장 상태가 만들어지면 안 된다"(주석 T-16-43)이므로, 마지막 관문이 첫 관문보다 느슨하면 그 문장은 성립하지 않는다. 특히 `sellWatchQty === 0` 은 계약 자체가 "**0 이면 서버가 매도 활성화를 거부**(눕힘)한다"(`packages/shared/src/relay.ts:167`)고 못박은 값이라, 조용한 부분 거부가 그대로 재현된다.

**Fix:** 두 조건을 relay 쪽에도 추가한다(UI 의 `canArm*` 세 식을 그대로 이식).

```ts
const reason =
  cfg.buyEnabled && (cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0) ? "buy"
  : cfg.sellEnabled && (cfg.sellOrderPrice === 0 || cfg.sellWatchQty === 0) ? "sell"
  : cfg.sweepEnabled && (cfg.sweepWatchPrice === 0 || cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0) ? "sweep"
  : null;
```

---

#### GC-WR-06: `send()` 의 boolean 을 **4곳 중 1곳만** 읽는다 — `vi.confirm` 은 보내지 못한 요청에 낙관 반영을 건다

> **종결:** 16-31(상따 폼 2곳) · 16-32(VI 2곳) — `send()` 의 boolean 을 **4곳 전부** 읽는다. 상따: `toggleGate` 가 `setForm` 낙관 반영을 전송 **뒤로** 옮겼고 `handleSubmit` 은 실패 시 `submitting` 을 되돌린다(`data-slot="lc-submit-error"`, `role="alert"`). VI: `toggle` 의 실패 `return`(`:255`)이 `setOptimistic`(`:258`)·`setSending`(`:259`)보다 **앞**이다 — 이 화면에서 잠금을 푸는 유일한 신호가 서버 73 델타라 요청이 나가지 않으면 행이 **영구히** 회색으로 남는다. VI 설정 `submit` 은 `blocked`(사유가 카드에 이미 있음 → 닫는다)와 `failed`(사유가 아직 없음 → **열어 둔다**)를 가른다. — 근거: 커밋 `a44dd66`·`551d89c` · 변이 실증 3+3건

**File:** `webapp/src/components/trading/vi-order-list.tsx:230-233`, `webapp/src/components/trading/limit-chaser-form.tsx:398,412`, `webapp/src/components/trading/vi-settings-card.tsx`

16-19 가 `send` 를 `void → boolean` 으로 바꾼 목적은 "호출부가 반환값으로 「보내지 않았음」을 알 수 있어야 한다"(`use-relay-socket.ts:863-874`)이다. 실제로 그것을 읽는 곳은 `strategy-status-card.tsx:354` 하나뿐이다.

`vi-order-list.tsx` 가 특히 문제다:

```ts
send({ t: 'vi.confirm', orderNo: item.orderNo, confirmed: next });
setOptimistic((prev) => new Map(prev).set(item.orderNo, next));
setSending((prev) => new Set(prev).add(item.orderNo));
```

전송이 실패해도 체크박스는 「확인됨」으로 바뀌고 행은 `sending` 으로 잠긴다. 잠금을 푸는 신호는 서버의 73 델타인데 **요청이 나가지 않았으므로 그 델타는 오지 않는다** — 사용자는 확인했다고 믿고 행은 영구히 회색으로 남는다. `disabled` 가드(`status !== 'ready'`)가 대부분을 막지만, `ready` 표시와 소켓 `readyState` 가 어긋나는 창(재접속 직전 · `onclose` 직전)이 정확히 이 경로다.

**Fix:** 세 호출부 모두 반환값으로 분기한다.

```ts
if (!send({ t: 'vi.confirm', orderNo: item.orderNo, confirmed: next })) {
  setError('연결이 끊겨 확인을 보내지 못했어요. 다시 시도해 주세요.');
  return; // 낙관 반영·잠금 어느 것도 걸지 않는다.
}
```

---

#### GC-WR-07: `everReadyCount` 래치는 **프로세스 메모리**다 — 장애 중 relay 가 재시작되면 진짜 게이트웨이 장애가 `ok/200` 으로 보고된다

> **종결:** 16-30(코드) · 16-35(배포·실측) — 판정을 `(everReadyCount === 0 && stalledCount === 0) || readyCount > 0` 으로 바꿔, 「생성 후 `STALE_SESSION_MS`(5분)가 지나도록 한 번도 Ready 가 아닌 세션」(`stalledCount`)을 함께 센다. 16-21 의 부팅 직후 유예는 유지된다. 시각을 `DmaSession` 이 아니라 매니저 `Entry.createdAt` 에 얹어 `relay/src/dma/session.ts` diff **0줄**(T-16-26). — 근거: 커밋 `51a66c8` · 변이 실증 ⑧-d·⑩ · **프로덕션 실측은 `16-VALIDATION.md` §Deployment Verification (16-35)**

**File:** `relay/src/order/order-api.ts:223`, `relay/src/dma/session-manager.ts:208-218`

`sessionsOk = everReadyCount === 0 || readyCount > 0` 으로 바뀌면서, **한 번도 Ready 인 적 없는** 세션들만 있는 상태는 항상 `ok` 다. `hasBeenReady` 는 `DmaSession` 인스턴스의 인메모리 래치이므로 relay 컨테이너가 재시작하면 0 으로 초기화된다. 게이트웨이가 죽어 있는 동안 relay 가 재배포·OOM·크래시로 한 번만 재시작하면, 그 뒤로는 사용자가 아무리 붙어도 `everReadyCount === 0` 이라 **uptime check 가 영원히 초록**이다. 예전 규칙(`sessionCount > 0 && readyCount === 0` → degraded)이 잡던 사례가 통째로 빠졌다. `vpn` 신호는 인터페이스 존재만 보므로(터널은 살아 있고 게이트웨이 프로세스만 죽은 경우) 이를 대체하지 못한다.

**Fix:** 「생성된 지 N분이 지났는데 한 번도 Ready 가 아닌 세션」을 별도로 세어 판정에 넣는다. 부팅 직후의 정상 구간은 그 유예로 흡수된다.

```ts
// stats() 에 추가: 생성 후 STALE_SESSION_MS 가 지나도록 Ready 를 못 본 세션 수
const stalledCount = /* now - entry.createdAt > STALE_SESSION_MS && !hasBeenReady */;
const sessionsOk = (stats.everReadyCount === 0 && stats.stalledCount === 0) || stats.readyCount > 0;
```

---

#### GC-WR-08: 새 부분 UNIQUE 인덱스의 `23505` 를 **어느 경로도 다루지 않는다** — 경주가 「두 벌 기록」에서 「기록 소실」로 바뀌었을 뿐이다

> **종결:** 16-28 — insert sink 가 `23505` 이고 `orderNo` 가 비어 있지 않을 때만 같은 3축으로 재조회해 **기존 행 id 로 수렴**하고 warn 을 남긴다(`origin`·SQLSTATE 만 — 계좌·주문번호 원문 없음). 다른 코드는 전후 완전히 동일하게 throw. `order_no` 를 채우는 **갱신**의 `23505` 는 재시도해도 결과가 같으므로 사유 있는 error 로그로 끝내 `#dropped` 를 오염시키지 않는다(S-5) — 분기 조건을 셀렉터가 아니라 **patch** 에 걸었다. — 근거: 커밋 `f7435e9` · 변이 실증 ⓻·⓽

**File:** `supabase/migrations/20260909120000_dma_orders_user_order_no_unique.sql:73-75`, `relay/src/store/orders.ts:269-298`, `:239-260`

인덱스 도입으로 `(user_id, order_no, KST일)` 중복 insert 는 이제 `23505` 를 던진다. 그런데:

- `supabaseOrderInsertSink` 는 모든 에러를 동일하게 throw 한다 → `ensureRow` 가 `{kind:"unavailable"}` 로 접고(order-handler.ts:469-475) **그 통보를 드롭한다.** 「행이 이미 있다」는 신호가 「기록 불가」로 열화된다.
- `finish` 가 수동 행에 `order_no` 를 채우는 update(L749-758)도 같은 인덱스에 걸릴 수 있다. 자동 분기가 그 사이 같은 `order_no` 로 행을 만들어 두면(GC-CR-01/02 의 좁히기 실패 뒤에 충분히 가능하다) 이 update 가 `23505` 로 실패하고, `OrderStore` 는 1회 재시도 후 **드롭**한다(`orders.ts:551-569`) — 그 주문 행은 `order_no` 도 최종 상태도 영원히 못 받는다.

**Fix:** `23505` 를 「이미 있다」로 해석해 재조회로 수렴시킨다. 그 코드만 특별 취급하고 나머지는 그대로 던진다.

```ts
if (error) {
  if ((error as { code?: string }).code === "23505") {
    // 같은 사용자·같은 날의 같은 주문번호 — 경주에서 진 쪽이다. 새 행이 아니라 **그 행**을 쓴다.
    const existing = await supabaseOrderLookupSink(supabase)(row.userId, row.orderNo ?? "");
    if (existing !== null) return existing;
  }
  logger.error({ error, origin: row.origin }, "[orders] dma_orders insert 실패");
  throw error;
}
```

---

#### GC-WR-09: `handleSubmit` 이 `gateBlocked` 를 **읽지 않는다** — 파일 머리말의 「전송 직전 가드」 주장이 사실이 아니다

> **종결:** 16-31 — 가드를 `setSubmitting(true)` **앞**에 뒀고(잠근 뒤 막으면 60 에코가 안 와 버튼이 영구히 죽는다), **켜져 있는 게이트만** 본다 — 게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다(T-16-44 확장). 파일 머리말의 「전송 직전 가드가 `gateBlocked` 를 함께 읽는다」가 이제 사실이다. — 근거: 커밋 `a44dd66` · 변이 실증 ⑭ 2건

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:405-415`, 주석 `:26`

머리말은 "판정은 `gateBlocked()` 하나이고 **렌더의 `disabled` 와 전송 직전 가드가 그것을 함께 읽는다**"고 적었지만, 실제로 읽는 것은 `toggleGate`(L394)뿐이다. 「수정」 버튼 경로(`handleSubmit`)는 `submitting || disabled` 만 본다. 서버 에코로 `buyEnabled: true` 를 받은 상태에서 시세가 끊겨 가격 칸이 0 이 되면(이 파일이 `ARM_BLOCKED_TEXT` 에서 설명하는 바로 그 상황), 「수정」은 relay 의 `#strategyArmable` 에 통째로 거부된다 — 사용자는 **아무 값도 저장하지 못하고** 원인은 일반 거부 프레임 한 줄뿐이다.

**Fix:** `handleSubmit` 도 같은 판정을 지나게 한다.

```ts
const blocked = (['buyEnabled','sellEnabled','sweepEnabled'] as const)
  .find((k) => formRef.current[k] && gateBlocked(k, true));
if (blocked !== undefined) { setSubmitError(ARM_BLOCKED_TEXT[…]); return; }
```

---

#### GC-WR-10: 취소 중복 키에 **원주문번호가 없다** — 동일 가격·수량의 미체결 2건을 연달아 취소할 수 없다

> **종결:** 16-34 — `dupKey:244-247` 에서 취소는 `(accountNo,isin,"C",orgOrderNo)` 로 가르고 **신규 키는 문자열 한 글자도 바뀌지 않았다**(두 탭 동시 발주 차단 = 16-22 truth 25 유지). 취소 수량은 언제나 미체결 잔량 전부라(UI D-21) 가격·수량은 취소의 식별자가 아니다. 같은 `orgOrderNo` 연타는 여전히 거부. 키 회수 경로(`release`·`closeConn`·`dropUserDupKeys`)는 `claimKeys` 쌍 관례 덕에 **변경 0건**. — 근거: 커밋 `e86dfa1` · 변이 실증 ㉚·㉛

**File:** `relay/src/ws/order-handler.ts:215-218`

```ts
const side = msg.t === "order.new" ? msg.side : "C";
return `dup:${msg.accountNo}|${msg.isin}|${side}|${msg.price}|${msg.qty}`;
```

취소 요청의 정체성은 **`orgOrderNo`** 인데 키에 들어 있지 않다. 같은 종목·같은 가격·같은 잔량의 미체결이 2건 있으면(다른 단말·전일 잔여·자동주문으로 흔히 생긴다) 두 번째 취소가 「같은 주문이 이미 처리 중입니다」로 **최대 5초 거부**된다. 급락 국면에서 미체결 일괄 취소가 막히는 것은 자산 위험이다.

**Fix:** 취소 키에 원주문번호를 넣는다. 신규는 지금과 동일하다.

```ts
return msg.t === "order.cancel"
  ? `dup:${msg.accountNo}|${msg.isin}|C|${msg.orgOrderNo}`
  : `dup:${msg.accountNo}|${msg.isin}|${msg.side}|${msg.price}|${msg.qty}`;
```

---

#### GC-WR-11: 스모크 프로브가 **토큰을 argv 로 넘기고**, 판정 문자열이 이어 붙으면 FAIL 이 SKIP 으로 강등된다

> **종결:** 16-30 — ① 액세스 토큰을 `node ... "$token"` argv 대신 `SMOKE_TOKEN` **env** 로 넘긴다(T-16-56). ② 판정을 **변수 대입 + 단일 출력 지점**으로 바꿔 `printf 'inconclusive'` 덧붙임을 없앴다(T-16-57); `case *` 갈래는 이제 관측 문자열 원문을 남긴다. 격리 실측: 수정 전 argv 토큰 1건 · 판정 `reachable\ninconclusive` → 수정 후 argv 토큰 **0건** · 판정 `inconclusive`. — 근거: 커밋 `024ce72`. **주의:** 16-35 의 프로덕션 smoke 도 `SMOKE_AUTH_TOKEN` 부재로 조기 반환 갈래(SKIP)만 탔다 — 프로브 본체는 아직 프로덕션에서 한 번도 돌지 않았다

**File:** `scripts/smoke-relay.sh:465-468`

두 가지다.
1. `node "$js" "wss://${HOST}/ws" "$ws_module" "$token"` — Supabase 액세스 토큰이 **프로세스 목록(`ps`)에 노출**된다. 같은 호스트의 다른 사용자·프로세스가 읽을 수 있다. 옛 구현의 `curl -H` 도 같은 문제였지만, 새로 쓰는 코드에서 반복할 이유는 없다.
2. 프로브가 판정을 stdout 에 찍은 **뒤** 비정상 종료하면 `rc != 0` 분기가 `inconclusive` 를 **덧붙인다**(L468). 결과 문자열이 `reachableinconclusive` 가 되어 `case` 의 `reachable`/`unreachable` 중 어느 것에도 매치하지 않고 `*` → **SKIP** 이 된다. 즉 실패 판정이 조용히 「확인 안 함」으로 바뀔 수 있다 — 이 검사가 3갈래인 이유를 스스로 무너뜨린다.

**Fix:**
```bash
SMOKE_TOKEN="$token" node "$js" "wss://${HOST}/ws" "$ws_module" || rc=$?   # 프로브는 process.env.SMOKE_TOKEN 을 읽는다
…
verdict="$(…)"
if [[ "$rc" -ne 0 ]]; then verdict="inconclusive"; fi   # 덧붙이지 않고 **덮어쓴다**
printf '%s' "$verdict"
```

---

#### GC-WR-12: 무장 불가 안내 문구가 **가장 흔한 원인을 잘못 짚는다**

> **종결:** 16-31 — `armBlockedTextOf(key, values)` 하나가 매수 2·매도 2·한방 2 갈래를 내고, 그룹 사유줄과 전송 차단 문구가 **같은 함수**를 읽는다. e2e 가 고정한 실제 재현 조건은 「시세 없음」이 아니라 **금액 부족**(기본 10만원으로 127,400원 종목 → 0주)이었다. 매도 문구는 「예상 매도수량」이 아니라 **감시 호가잔량**을 가리키게 바로잡았다. — 근거: 커밋 `f76daa3` · 변이 실증 ⑮·⑬ 3건

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:113-118`

`ARM_BLOCKED_TEXT.buy` 는 "**시세를 받지 못해** 발주가·수량이 0 이에요"라고 단정한다. 그런데 같은 phase 의 e2e(`trading-limit-chaser.spec.ts:181-192`)가 고정한 실제 재현 조건은 **"기본 주문금액 10만원으로 127,400원 종목을 사면 `floor(10만/12.74만) = 0주`"** 다 — 시세는 정상이고 금액이 부족한 것이다. 안전 게이트의 안내가 원인을 틀리게 말하면 사용자는 엉뚱한 곳(재접속·새로고침)을 만진다.

**Fix:** 두 원인을 값으로 가른다.
```ts
const buyBlockReason =
  form.buyOrderPrice === 0
    ? '시세를 받지 못해 매수가격이 0 이에요. 가격을 입력하면 켤 수 있어요.'
    : '주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.';
```

---

### Info

#### GC-IN-01: `gateBlocked` 의 `useCallback` 의존성이 매 렌더 새 객체다

> **종결:** 16-31 — `canArm` 을 `useMemo`(세 파생 boolean 의존)로 감싸 `gateBlocked` 의 `useCallback` 이 실제로 메모된다. eslint `react-hooks/exhaustive-deps` 경고가 **1건 → 0건**으로 소멸하는 것을 실측했다. — 근거: 커밋 `f76daa3`

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:373-390`
`canArm` 은 렌더마다 새로 만드는 객체 리터럴이므로 `[disabled, canArm]` 는 항상 바뀐다 — `useCallback` 이 아무것도 메모하지 않는다. `canArm` 을 `useMemo` 로 감싸거나, 세 boolean 을 개별 의존성으로 넘길 것.

#### GC-IN-02: `row.isin as string` 타입 단언

> **종결:** 16-31 — `isPickable` 을 타입 서술자(`row is StockDetailResponse & { isin: string }`)로 만들어 `as string` 단언이 파일에서 **1 → 0**. — 근거: 커밋 `8e3227c`

**File:** `webapp/src/components/trading/limit-chaser-client.tsx:851`
`isPickable(row)` 이 이미 `row.isin !== null` 을 확인하지만 TS 가 좁히지 못해 단언으로 메웠다. `isPickable` 을 타입 서술자로 만들면 단언이 사라진다: `function isPickable(row: StockDetailResponse): row is StockDetailResponse & { isin: string }`.

#### GC-IN-03: `latestAccountTime` 이 `HH:MM:SS` 문자열 비교다

> **종결:** 16-32 — 비교 키를 `st` **원문**에서 만들고(`dated` 가 첫 번째 축) 승자의 원문에서 표시값을 뽑는다. **epoch 승격을 고르지 않은 이유**: `HH:MM:SS` 만 오는 값은 날짜를 몰라 「오늘」을 가정해야 하고 그 가정이 정확히 버그의 원인이다. 표시 형식·`null` 계약·「계좌가 하나면 결과가 같다」는 16-23 보장은 그대로. `latestAccountTime` 에 첫 테스트가 생겼다(`me-client.test.tsx`, 그전까지 0건). — 근거: 커밋 `821486f` · 변이 실증 3건

**File:** `webapp/src/components/trading/me-client.tsx:88-97`
`formatServerTime` 이 날짜를 버리고 시각만 남기므로, 자정을 넘긴 계좌 프레임(혹은 한쪽만 `YYYYMMDDHHMMSS` 로 오는 경우) 사이에서 「가장 최근」이 뒤집힌다. 표시 전용이라 영향은 작지만, 비교는 정규화 **전** 값(또는 epoch)으로 하는 편이 맞다.

#### GC-IN-04: `ORDER_FLUSH_MAX_ROUNDS = ORDER_MAX_RETRIES + 2` 의 `+2` 가 설명되지 않은 상수다

> **종결:** 16-28 — 「이론상 2회면 끝난다」와 식(=3)이 다른 수를 말하던 상태를 없애고, 라운드 1 첫 배치 / 2 재시도분 / **3 동시 유입 확인**(`flushNow` 가 `await` 하는 사이 동기 `enqueueUpdate` 로 들어온 항목)을 docstring 에 명시했다. 식은 유지. — 근거: 커밋 `a31f529`

**File:** `relay/src/store/orders.ts:78`
주석은 "이론상 2회면 끝난다"고 하지만 식은 `+2`(=3)다. 「첫 배치 + 재시도 + 종료 확인」이라는 근거를 식 옆에 적거나 `ORDER_MAX_RETRIES + 1` 로 맞출 것.

---

### 검토했으나 결함을 찾지 못한 영역 (갭 클로징분)

- **`market` 소유권 이전(16-25)** — `RelayLimitChaserInput` 에서 필드가 빠졌고, zod 스키마에서도 지워졌고(`z.object` 가 미지 키를 떨어뜨린다), `buildSetLimitChaserReq` 는 기본값 없이 호출부가 채우도록 시그니처를 바꿨다. 웹앱은 `SelectedStock`·`LimitChaserFormProps`·`LimitChaserFormValues` 세 곳에서 모두 제거됐다. 구 클라이언트가 `market` 을 실어 보내도 조용히 무시되고 relay 해석값이 이긴다 — 계약 드리프트가 남지 않는다(`protocol.test.ts` 가 그 경로를 명시적으로 잠근다).
- **`MAX_VI_ORDER_AMOUNT_KRW` 단일 정본(16-24)** — zod(`min(0).max(상수)`) · `buildSetVITriggerReq` · UI(`MAX_VI_ORDER_AMOUNT_MANWON = krwToManwon(상수)`) 세 층이 같은 export 를 참조한다. 층별 숫자 하드코딩이 없고, 상한값 자체와 0 을 통과시키는 테스트가 과잉 차단도 함께 막는다.
- **`flushNow` 상태 기계(16-24)** — `#current` 를 `#runDrain` 의 `finally` 에서 반드시 비우고, `#tick` 은 건너뛰고 `flushNow` 는 기다리는 두 규율이 코드와 테스트(⑮~⑰) 양쪽에서 일치한다. `while (this.#current !== null)` 루프는 마이크로태스크 순서상 최대 1회 추가 대기로 끝나므로 종료를 무한히 막지 않는다.
- **`userDupKeys` 소유권 회수(16-08 수정분)** — `release` 의 `if (!state.dupKeys.delete(...)) return;` 이 「`closeConn` 이 이미 회수한 뒤 늦게 놓는」 경우에 다른 탭의 키를 풀지 않도록 정확히 막는다. `closeConn` → `dropUserDupKeys` → `Set` 이 비면 사용자 항목 삭제까지 누수 없이 닫힌다.
- **`kstDayRangeUtc` 반열린 구간** — `+09:00` 오프셋을 명시해 만들고 `[from, to)` 로 쓰며, 마이그레이션의 `(created_at AT TIME ZONE 'Asia/Seoul')::date` 와 같은 경계를 가리킨다. `fakeDmaOrders` 가 필터를 실제로 적용해 「어제 행·남의 행이 영향 범위에 없음」을 단언하므로 이 축은 실효적으로 잠겨 있다.
- **`isin-labels` 통합(16-23)** — 세 사본이 하나로 합쳐졌고, `accountStates` 전체를 훑으며 빈 값이 기존 값을 지우지 않는 병합 규칙이 유지된다. `useMemo` 의존성도 정확하다.

---

_Reviewed: 2026-09-09T03:42:42Z (갭 클로징 재리뷰)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
