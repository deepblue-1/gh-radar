---
phase: 18-gh-trade-ui-nxt-vi
reviewed: 2026-09-22T12:50:00Z
depth: standard
files_reviewed: 96
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/store/orders.ts
  - relay/src/ws/__tests__/protocol.test.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/src/ws/protocol.ts
  - relay/tests/rate-cross.test.ts
  - relay/tests/ws-order.test.ts
  - supabase/migrations/20260921120000_dma_orders_modify_offhours.sql
  - webapp/e2e/overflow.ts
  - webapp/e2e/specs/a11y.spec.ts
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/orderbook.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/app/trading/limit-chaser/[key]/page.tsx
  - webapp/src/app/trading/limit-chaser/new/page.tsx
  - webapp/src/app/trading/limit-chaser/page.tsx
  - webapp/src/app/trading/page.tsx
  - webapp/src/app/trading/vi/page.tsx
  - webapp/src/components/chat/__tests__/chat-fab.test.tsx
  - webapp/src/components/chat/chat-fab.tsx
  - webapp/src/components/chat/fab-clearance.ts
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  - webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/orderbook/order-confirm-dialog.tsx
  - webapp/src/components/orderbook/order-panel.tsx
  - webapp/src/components/orderbook/orderbook-ladder.tsx
  - webapp/src/components/stock/__tests__/orderbook.test.tsx
  - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
  - webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx
  - webapp/src/components/stock/stock-orderbook-section.tsx
  - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
  - webapp/src/components/trading/__tests__/card-body.test.tsx
  - webapp/src/components/trading/__tests__/card-grid.test.tsx
  - webapp/src/components/trading/__tests__/card-header.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
  - webapp/src/components/trading/__tests__/quote-grid-10.test.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
  - webapp/src/components/trading/__tests__/stock-add-bar.test.tsx
  - webapp/src/components/trading/__tests__/stock-info-modal.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
  - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/src/components/trading/card/card-body.tsx
  - webapp/src/components/trading/card/card-header.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/card/quote-grid-10.tsx
  - webapp/src/components/trading/card/stock-info-modal.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/dirty-action-bar.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/workbench/card-grid.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/workbench/stock-add-bar.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/lib/__tests__/alert-tone.test.ts
  - webapp/src/lib/__tests__/breakout-list.test.ts
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/lib/__tests__/queued-window.test.ts
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
  - webapp/src/lib/__tests__/use-vi-server-error.test.ts
  - webapp/src/lib/alert-tone.ts
  - webapp/src/lib/breakout-list.ts
  - webapp/src/lib/isin-labels.ts
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/lib/queued-window.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/trading-focus.ts
  - webapp/src/lib/use-breakout-quotes.ts
  - webapp/src/lib/use-leave-warning.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/use-vi-end-alerts.ts
  - webapp/src/lib/use-vi-server-error.ts
  - webapp/src/styles/globals.css
findings:
  critical: 2
  warning: 7
  info: 3
  total: 12
status: issues_found
---

# Phase 18: 코드 리뷰 보고서

**리뷰 시각:** 2026-09-22T12:50:00Z
**깊이:** standard
**리뷰 파일 수:** 96
**상태:** issues_found

## 요약

실주문 경로(shared 타입 → relay zod → 조립기 → order-handler → `dma_orders` insert)와 작업대 카드 집합·미체결 선택·구독 훅을 중심으로 리뷰했다. 테스트 파일은 가볍게만 봤다. 검증 결과는 relay `vitest` 500/500, webapp `tsc --noEmit` 통과, webapp `vitest` 1323 통과(skip 1)다.

신규 주문의 가격 0 게이트(zod superRefine · 조립기 priceFloor · DB CHECK)와 정정의 원주문번호 필수, 계좌 대조 순서, `piece_count`/`krx_session` 조건부 송신은 계약대로 맞물린다. 마이그레이션의 제약 탐색 정규식(`\m…\M`)도 `avg_price` 같은 컬럼을 잘못 잡지 않는다.

그런데 가격 0 을 **신규에만** 열어 둔 탓에 새 결함이 생겼다. 시간외종가 원주문의 **취소** 경로가 네 겹 모두에서 여전히 `price > 0` 을 요구한다. 설계가 「정정 불가 → 취소 후 재등록」을 유일한 정정 수단으로 정했는데, 그 취소가 서버 설정(`close_price_mode="zero"`)에 따라 통째로 막힌다(CR-01). 또 VI 설정 줄은 서버에 등록된 전략의 계좌를 무시하고 상태줄 계좌로 `vi.set` 을 보낸다. 그래서 「수정」 한 번에 가동 중인 VI 자동매수가 다른 계좌로 조용히 옮겨 갈 수 있다(CR-02).

## Critical Issues

### CR-01: 가격 0 인 미체결(시간외종가 원주문) 취소가 네 겹 모두에서 막힌다

**File:** `webapp/src/lib/relay-provider.tsx:170-173` · `relay/src/ws/protocol.ts:310` · `supabase/migrations/20260921120000_dma_orders_modify_offhours.sql:91-92` · 호출부 `webapp/src/components/trading/card/manual-order-form.tsx:330`, `webapp/src/components/orderbook/account-panel.tsx:383`

**Issue:** 취소 프레임은 원주문 행의 가격을 그대로 싣는다(`price: selected.price` / `row.price`). 그런데 gh-trade `preopen-offhours-order.md:39,79` 를 보면, 명시 세션 발주의 가격은 서버가 채우고 `close_price_mode="zero"` 에서는 **0** 이다. 이렇게 0 으로 접수된 G2/G3 미체결 행을 취소하면 다음과 같이 막힌다.
1. webapp 번역기가 `offHours = req.kind === "new" && …` 이므로 취소는 양수만 통과시키고, 「주문 가격을 확인해 주세요.」로 거부한다. 사용자가 **살아 있는 실주문을 웹에서 취소할 수 없다.**
2. 이 가드를 우회해도 relay `RelayOrderCancelSchema.price` 가 `positive()` 라 프로토콜 위반이 된다. 그러면 **소켓이 close(4400) 로 끊겨** 모든 구독과 대기 주문이 함께 끊긴다.
3. relay 까지 통과해도 취소 행 insert 는 `price = 0 AND krx_session IS NULL` 이므로 `dma_orders_price_check` 에 걸려 「주문 기록에 실패」로 끝난다.

설계(D-21, `MODIFY_LOCK_OFFHOURS_ORDER`)가 시간외종가 원주문의 유일한 조치로 「취소 후 재등록」을 안내하는데, 그 취소가 막히는 셈이다. 현재 기본 모드가 `close` 라서 드러나지 않았을 뿐이고, 설정을 한 줄 바꾸면 실계좌에서 재현된다. 취소에서 가격은 게이트웨이가 쓰지 않는 값이라, 이 차단에는 안전상 이점도 없다.

**Fix:** 취소에서는 가격을 검증 축에서 빼거나 0 을 허용한다. 세 층을 함께 바꿔야 한다.
```ts
// relay-provider.tsx buildOrderFrame
const priceOk =
  req.kind === "cancel"
    ? Number.isInteger(req.price) && req.price >= 0
    : req.price > 0 || (offHours && req.price === 0);
if (!priceOk) return { ok: false, reason: "주문 가격을 확인해 주세요." };

// protocol.ts RelayOrderCancelSchema
price: z.number().int().nonnegative(),
```
```sql
-- 후속 마이그레이션: 취소 행은 가격 0 허용
ALTER TABLE public.dma_orders DROP CONSTRAINT dma_orders_price_check;
ALTER TABLE public.dma_orders ADD CONSTRAINT dma_orders_price_check
  CHECK (price > 0
         OR (price = 0 AND krx_session IN ('G2','G3'))
         OR (price = 0 AND order_type = 'C'));
```
조립기(`buildDirectOrderReq`)의 `priceFloor` 도 `orderType === "C"` 이면 0 이 되게 맞춘다. G2/G3 행(가격 0) 취소 회귀 테스트를 relay `ws-order.test.ts` 와 webapp `relay-provider.test.tsx` 에 추가한다.

### CR-02: VI 설정 「수정」·스위치가 서버 전략의 계좌를 무시하고 상태줄 계좌로 `vi.set` 을 보낸다

**File:** `webapp/src/components/trading/workbench/vi-settings-rows.tsx:385-393` (전송) · `:219-220` (계좌 주입) · `:476-487` (「수정」 버튼, 다이얼로그 없음)

**Issue:** VI 전략은 세션당 **거래소별 1건**이고 `RelayViTrigger.accountNo` 가 그 전략의 계좌다. 옛 `vi-settings-card.tsx` 는 `formFromServer` 로 `server.accountNo` 를 폼 값에 넣고 계좌 변경을 더티로 추적했다(c6d1594 판 `:192, :201`). 새 줄은 `server.accountNo` 를 전혀 읽지 않고, 작업대 상태줄의 `accountNo` 를 그대로 싣는다. 상태줄의 기본값은 `accounts[0]` 이다(`trading-workbench.tsx:202-205`).

재현 시나리오는 다음과 같다. 계좌가 2개인 사용자가 계좌 B 로 KRX VI 를 가동 중이다. `/trading` 을 열면 상태줄은 계좌 A 다. 이 상태에서 상승률만 고치고 줄 끝 「수정」을 누르면 **확인 다이얼로그 없이** `vi.set {accountNo: A, run: true}` 가 나간다. 그러면 가동 중인 자동매수가 계좌 A 로 옮겨진다. 줄에는 계좌 표시가 없으므로(D-05) 사용자는 이 사실을 알 수 없다. 중지 다이얼로그도 계좌를 보여 주지 않는다. 실돈이 엉뚱한 계좌로 주문되는 경로다.

**Fix:** 등록된 전략이 있으면 그 계좌를 정본으로 쓴다. 상태줄 계좌와 다르면 잠그거나 명시적으로 확인받는다.
```tsx
// ViSettingsRow
const effectiveAccount = server != null ? server.accountNo : accountNo;
const accountMismatch = server != null && server.accountNo !== accountNo;
const locked = disabled || server === undefined || effectiveAccount === '' || accountMismatch;
// … msg.accountNo = effectiveAccount
// accountMismatch 면 줄에 「이 VI 는 계좌 {server.accountNo} 로 가동 중 — 상태줄 계좌를 바꾸세요」 표시
```
최소한 「수정」도 시작 다이얼로그처럼 계좌를 요약에 넣은 확인을 거치게 한다.

## Warnings

### WR-01: 시간외종가 선택 상태에서 세션을 못 고르면 숨겨진 옛 가격으로 **지정가** 주문이 만들어진다

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:383-405`

**Issue:** `offHours` 가 참인데 `offHoursSessionOf(queuedWindow)` 가 `null` 이면(창이 닫힌 직후, 복귀 effect 가 돌기 전 렌더) `session === null` 이 되고 `validateNew(... offHours: false)` 로 떨어진다. 그러면 화면에서 「—」로 잠겨 숨겨진 `priceText`(이전 지정가 값)로 `kind:'new'` 지정가 요청이 만들어진다. 확인 다이얼로그는 `orderType:'offhours'` 라서 「시간외종가 · 가격 0」을 보여 준다. 사용자가 본 내용과 실제로 나가는 주문이 다르다. 또 `offHoursSessionOf` 는 거래소를 보지 않으므로, NXT 로 전환된 같은 창에서는 NXT 주문에 `krxSession` 이 실린다. 창은 짧지만 실주문 경로라 방어가 필요하다.

**Fix:**
```ts
if (offHours) {
  const session = exchange === 'KRX' ? offHoursSessionOf(queuedWindow) : null;
  if (session === null) {
    setValidation('시간외종가 창이 닫혔어요. 주문유형을 다시 확인해 주세요.');
    return;
  }
}
```

### WR-02: 카드 펼침/접힘이 카드를 다시 마운트해 미전송 편집·「결과 모름」 잠금·에코 상관이 사라진다

**File:** `webapp/src/components/trading/workbench/card-grid.tsx:141-155` · `webapp/src/components/trading/card/strategy-card.tsx:617,669-677` · `webapp/src/components/trading/card/manual-order-form.tsx:221,436`

**Issue:** `CardGrid` 는 펼친 카드와 접힌 카드를 **서로 다른 부모**(`card-cell` 직계와 `card-stack`)에 그린다. 그래서 토글하면 같은 `key` 여도 React 가 서브트리를 다시 만들고, 그때 다음이 전부 초기화된다.
- `LimitChaserForm` 의 미전송 더티 값이 확인 없이 사라진다(이탈 경고는 페이지 이동만 막는다).
- `ManualOrderForm.blocked` 는 timeout 뒤 재주문을 막는 **중복 체결 방지 잠금**인데, 접었다 펴기만 해도 풀린다.
- `pendingRef`/`fired` 도 초기화되어, 에코가 remount 뒤에 오면 「사용자가 껐다」를 구분하지 못한다.

`selectUnfilled → focusCard` 로 접힌 카드가 자동으로 펼쳐질 때도 같은 일이 생긴다.

**Fix:** 카드를 한 부모 아래에 두고, 순서는 CSS `order` 로만 바꿔 마운트 정체성을 보존한다. 아니면 `blocked`·더티 값을 작업대의 ISIN 축 상태로 끌어올린다. 더티가 있는 카드를 접을 때는 확인을 거친다.

### WR-03: 취소·정정 대기를 구분하지 못해, 같은 원주문의 취소와 정정이 서로의 통보로 정산될 수 있다

**File:** `relay/src/ws/order-handler.ts:1036-1037` (`isCancel: needsOrg`) · `:1214-1229` (`narrowPending` 하드 필터) · `:264-270` (`dupKey`)

**Issue:** 정정 대기가 `isCancel: true` 로 합류했다. `narrowPending` 은 `noticeType` "C"/"M" 을 한 묶음(`isCancelNotice`)으로 보고 `isCancel` 대기 전체를 후보로 남긴다. 그런데 `dupKey` 는 취소(`…|C|org`)와 정정(`…|M|org|price|qty`)을 다른 키로 보므로 둘이 동시에 대기할 수 있다. 예를 들어 다른 탭이나 공용 패널에서 같은 원주문을 취소하는 동시에 카드에서 정정을 누르는 경우다. 이때 취소확인 "C" 가 정정 대기에 매칭되면 정정 행이 `cancelled` 로 기록되고 UI 에는 접수로 뜬다. 반대로 "M" 이 취소 대기를 `accepted` 로 정산할 수도 있다. 이후 ③④ 축(가격·수량)이 우연히 가르지 못하면 오정산이다.

**Fix:** `PendingOrder` 에 `kind: "N" | "M" | "C"` 를 두고, 하드 필터에서 `noticeType === "C"` 이면 `kind === "C"`, `"M"` 이면 `kind === "M"` 대기만 남긴다. 기존 `isCancel` 은 원주문번호 축 판정에만 쓴다.

### WR-04: 미체결 행을 선택해도 받을 카드가 없으면 조용히 아무 일도 일어나지 않는다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:372-378, 544-551`

**Issue:** 선택은 `isin`·`exchange`·`c.accountNo === accountNo` 가 모두 맞는 카드에만 전달된다. 다음 경우 공용 패널에서 행이 「선택됨」으로 강조되지만 정정·취소 버튼을 가진 폼이 어디에도 없다.
- 카드가 없는 종목의 미체결
- NXT 미체결인데 카드가 KRX 인 경우
- 카드 계좌(생성 시 고정)가 상태줄 계좌와 다른 경우

사용자는 선택이 먹었다고 믿고 카드를 찾아 헤맨다. 급락 국면의 취소가 지연되는 UX 결함이다.

**Fix:** 선택 시 매칭 카드가 없으면 그 행의 `isin/exchange` 와 상태줄 계좌로 카드를 추가하고 펼친다(`addCard` 확장). 아니면 선택을 거부하고 사유를 `title` 로 보여 준다. 계좌만 어긋나면 「이 카드는 계좌 X — 공용 패널의 취소 버튼을 쓰세요」를 안내한다.

### WR-05: ISIN 당 카드 1장 규칙 때문에 같은 종목의 두 번째 등록 전략이 작업대에서 보이지 않는다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:247-248` · `:143-157` (`withFocusedCard`)

**Issue:** 같은 ISIN 에 전략이 두 개(계좌 A·B, 또는 KRX·NXT) 등록돼 있으면 두 번째는 `continue` 로 버려진다. 그래서 작업대 어디에도 그 전략을 끄는 스위치가 없다. `?focus=`·사이드바 포커스로 두 번째 키를 요청해도 `withFocusedCard` 는 같은 ISIN 의 **다른 키** 카드를 펼칠 뿐이다. 클릭한 전략이 아닌 전략이 화면에 뜨는 것이다. 가동 중인 실전략을 끌 수단이 사라지는 경로다.

**Fix:** 카드 정체성을 ISIN 에서 전략 키(`isin:account:exchange`)로 바꾸거나, 포커스된 키와 카드 키가 다르면 카드의 `accountNo/exchange` 를 그 키로 전환한다(미등록 카드일 때만). 최소한 숨은 전략이 있다는 사실을 카드 헤더에 표시한다.

### WR-06: 정정 수량을 미체결 잔량 기준으로 검증·갱신하지 않는다

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:283-292, 347-366`

**Issue:** 수량 칸은 선택 순간의 `unfilledQty` 로 한 번만 채워진다(키는 주문번호). 그 뒤 부분체결로 잔량이 줄어도 칸은 옛 값 그대로이고, 정정 요청은 잔량을 넘는 수량을 싣는다. 사용자가 원주문 수량(칩에 `orderQty` 로 표시된다)을 보고 입력해도 같은 문제가 생긴다. 서버가 거부하겠지만, 확인 다이얼로그는 옛 잔량 기준 금액을 보여 준다.

**Fix:** 정정 제출 시 `qty > selected.unfilledQty` 면 「정정 수량은 미체결 잔량(N주) 이하여야 해요」로 막는다. 잔량이 입력값보다 작아지면 입력값을 잔량으로 내린다.

### WR-07: 사이드바 포커스 요청이 없는 전략 키를 잡고 있다가 나중에 엉뚱하게 펼칠 수 있다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:270-283, 237-242`

**Issue:** 키를 못 찾으면 `pendingFocus.current = f` 로 보류하고 영원히 들고 있다. 이미 삭제된 전략이나 오래된 링크의 키가 보류된 채로 있다가, 나중에 같은 키로 전략이 새로 등록되면 사용자 조작 없이 카드가 튀어나와 펼쳐지고 스크롤된다. 스냅샷 **이후**에 찾지 못한 경우는 보류하면 안 된다.

**Fix:** 첫 64 스냅샷을 받았는지(`limitChasers` 가 한 번이라도 갱신됐는지) 추적한다. 스냅샷 이후의 미스는 버리고, 보류는 스냅샷 전에만 허용한다.

## Info

### IN-01: 정정 개방 뒤에도 남아 있는 옛 주석

**File:** `relay/src/dma/envelope.ts:33` · `relay/src/order/notice-status.ts:51`

**Issue:** 「정정(`order_type` "M")… 만들지 않는다 (D-21)」, 「정정은 v1 이 만들지 않지만」이 Phase 18 에서 사실이 아니게 됐다. 이제 "M" 통보는 자기 정정의 정상 결과다.

**Fix:** 두 주석을 Phase 18 D-21 기준으로 고친다.

### IN-02: `PendingOrder.isCancel` 이름이 정정을 포함한다

**File:** `relay/src/ws/order-handler.ts:190-198`

**Issue:** 주석이 이름과 의미가 어긋남을 인정하고 있다. WR-03 을 고칠 때 `refersOrg` 같은 이름으로 바꾸고 `kind` 를 추가하는 편이 오독을 막는다.

**Fix:** `isCancel` 을 `refersOrg` 로 바꾸고 `kind` 필드를 추가한다.

### IN-03: 더티 바 높이 관찰이 effect 시점의 바만 본다

**File:** `webapp/src/components/trading/workbench/shared-panels.tsx:98-117`

**Issue:** `visible` 이 계속 참인 동안 두 번째 카드의 더티 바가 새로 나타나면 `ResizeObserver` 가 그 요소를 관찰하지 않는다. 그 바가 더 높으면 공용 패널이 바에 가린다.

**Fix:** 더티 카드 수를 의존성에 넣거나 `MutationObserver` 로 바 추가를 감지한다.

---

_리뷰 시각: 2026-09-22T12:50:00Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
