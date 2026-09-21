# Phase 18: gh-trade 신규 기능 UI — 통합 트레이딩 작업대 · 예약/시간외종가 발주 · NXT VI - Pattern Map

**Mapped:** 2026-09-21
**Files analyzed:** 32 (신규 24 · 수정 8 계열)
**Analogs found:** 30 / 32

> 이 문서는 「새 파일이 **무엇을 베껴야 하는가**」만 답한다. 규칙·근거는 `18-RESEARCH.md`, 레이아웃 정본은 목업 2개(`18-workbench-mockup.html` · `18-orderbook-tab-mockup.html`) 가 정본이다. 여기에 규칙표·밴드 수치를 복사하지 않는다.
> 아래 아날로그 경로는 전부 `git ls-files` 로 추적 상태를 확인했다.

---

## File Classification

### A. 계약 수직 슬라이스 (Wave 0 — UI 보다 먼저)

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/2026MMDD_dma_orders_modify_offhours.sql` (신규) | migration | batch/DDL | `supabase/migrations/20260905120200_dma_orders.sql` | exact |
| `packages/shared/src/relay.ts` (수정 — `RelayOrderModifyMsg`·`OrderType`·`pieceCount`/`krxSession`·`RelayRateCrossItem.name/code`) | model/계약 | request-response | 같은 파일 `RelayOrderCancelMsg`(:500~510) | exact |
| `relay/src/ws/protocol.ts` (수정 — zod 3종) | middleware(검증) | request-response | 같은 파일 `RelayOrderCancelSchema`(:278~287) | exact |
| `relay/src/dma/envelope.ts` (수정 — `toWireOrderType` "M" · 조건부 piece/session · price 0) | service(와이어 빌더) | transform | 같은 파일 `buildDirectOrderReq`(:925~985) | exact |
| `relay/src/ws/order-handler.ts` (수정 — 3분기·dupKey·insert) | controller | request-response | 같은 파일 `handle`(:758) · `dupKey`(:248~256) | exact |
| `relay/src/hub/subscription-hub.ts` (수정 — 돌파 name/code decorate, D-30) | service | pub-sub | 같은 파일 `#enrichViOrder`(:1123~1130) | exact |
| `webapp/src/lib/relay-provider.tsx` (수정 — `buildOrderFrame` 확장) | provider/번역기 | request-response | 같은 파일 `buildOrderFrame`(:144~175) | exact |
| `relay/src/ws/__tests__/protocol.test.ts` (신규 — 디렉터리 자체가 없음) | test | — | `relay/src/dma/__tests__/envelope.test.ts` | role-match |

### B. 라우트 · 셸

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `webapp/src/app/trading/page.tsx` (신규) | route(server) | request-response | `webapp/src/app/trading/vi/page.tsx` (라우트 엔트리 + AppShell) | exact |
| `webapp/src/app/trading/limit-chaser/page.tsx`·`new/page.tsx`·`vi/page.tsx` (→ redirect) | route(server) | request-response | `webapp/src/app/trading/limit-chaser/page.tsx` (현행 `redirect()` 선례) | exact |
| `webapp/src/app/trading/limit-chaser/[key]/page.tsx` (→ `?focus=`) | route(server) | request-response | 같은 파일 현행 `decodeURIComponent`(:25) + 위 redirect 선례 | exact |
| `webapp/src/components/layout/app-sidebar.tsx` (수정 — 그룹 제목 링크·3단 재구성) | component | event-driven | 같은 파일 `GroupHeading`(:163) · `StrategyItem`(:179) · `limitChaserHref`(:99) | exact |

### C. 작업대 (`components/trading/workbench/`)

| 신규 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `trading-workbench.tsx` | component(셸) | event-driven | `webapp/src/components/trading/limit-chaser-client.tsx` (`LimitChaserClient`:190 · `useLeaveWarning`:1607) | exact |
| `workbench-status-bar.tsx` | component | request-response | `limit-chaser-client.tsx` `StatusBar`(:1087)·`Dot`(:1259) | exact |
| `vi-settings-rows.tsx` | component | request-response | `webapp/src/components/trading/vi-settings-card.tsx` (`vi.set` 송신 :369~376) | exact |
| `vi-trigger-strip.tsx` | component | event-driven | `webapp/src/components/trading/vi-order-list.tsx` (`isConfirmable`:154) | exact |
| `breakout-strip.tsx` | component | event-driven | `vi-order-list.tsx` (칩+표 조합) · `today-orders-card.tsx` | role-match |
| `stock-add-bar.tsx` | component | request-response | `limit-chaser-client.tsx` `StockSearchField`(:1259)·`isPickable`(:1247) — **승격**(현재 비공개) | exact |
| `card-grid.tsx` | component(레이아웃) | — | 없음 (§「No Analog Found」) | none |
| `shared-panels.tsx` | component | CRUD | `webapp/src/components/orderbook/account-panel.tsx` · `strategy-log.tsx` | role-match |

### D. 카드 (`components/trading/card/`)

| 신규 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `strategy-card.tsx` | component | event-driven | `limit-chaser-client.tsx` `LimitChaserSurface`(:201) — **카드 1장의 몸통 그 자체** | exact |
| `card-header.tsx` | component | — | `limit-chaser-client.tsx` `StrategyStatus`(:1029)/`strategyStatusOf`(:1052) + `latch-led.tsx` | exact |
| `quote-grid-10.tsx` | component | — | `limit-chaser-client.tsx` `QuoteCell`(:979)·`priceText`(:1013)·`priceTone`(:1024) | exact |
| `card-body.tsx` | component(레이아웃) | — | `limit-chaser-client.tsx:542` `@container/lc` 선언 + 본문 그리드 | exact |
| `manual-order-form.tsx` | component | request-response | `webapp/src/components/orderbook/order-panel.tsx` (**다이어트 재작성**) | exact |
| `stock-info-modal.tsx` | component(모달) | — | `webapp/src/components/orderbook/order-confirm-dialog.tsx`(:117~136 Dialog 골격) | role-match |

### E. 순수 로직 · 훅 (`webapp/src/lib/`)

| 신규 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `breakout-list.ts` | utility | transform | `webapp/src/lib/vi-alert.ts:137~158` (SSR 가드 localStorage) + `limit-chaser.ts` 순수 판정 | exact |
| `queued-window.ts` | utility | transform | `vi-order-list.tsx` `isConfirmable`(:154) 스타일의 **단일 판정 함수** | role-match |
| `use-breakout-quotes.ts` | hook | pub-sub | `webapp/src/lib/relay-provider.tsx` `useRelaySubscription`(:307~324) | exact |
| `alert-tone.ts` | utility | — | `vi-alert.ts` (SSR 가드·기본 꺼짐 규율) | role-match (Web Audio 자체는 코드베이스 최초) |

### F. 종목상세 호가 탭

| 수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `stocks/[code]` 호가주문 탭 본문 → `card-body.tsx` 로 교체 | component | — | `webapp/src/app/stocks/[code]/page.tsx:23` 주석(넓은 컨테이너 규율) | exact |

### G. 테스트

| 신규/수정 | Role | Analog | Match |
|---|---|---|---|
| `webapp/e2e/specs/trading-workbench.spec.ts` (신규) | e2e | `webapp/e2e/specs/trading-limit-chaser.spec.ts` 케이스 9(:513)·11(:627)·12(:758)·13(:796) | exact |
| `webapp/e2e/specs/sidebar-tree.spec.ts` (재작성) | e2e | 같은 파일 현행 | exact |
| `webapp/src/lib/__tests__/breakout-list.test.ts` 외 lib 테스트 | unit | `webapp/src/lib/__tests__/` 기존 | exact |
| `webapp/src/components/trading/__tests__/*.test.tsx` | unit(RTL) | 같은 디렉터리 기존 | exact |

---

## Pattern Assignments

### `supabase/migrations/…_dma_orders_modify_offhours.sql` (migration)

**Analog:** `supabase/migrations/20260905120200_dma_orders.sql`

바꿀 제약 원문 (`:53~60`) — 주석까지 그 파일의 문법(제약 뒤 `--` 로 근거)을 잇는다:
```sql
  order_type   text NOT NULL CHECK (order_type IN ('N','C')),    -- N=신규 C=취소 (정정 M 은 v1 범위 밖, D-21)
  org_order_no text,                                             -- 취소 시 원주문번호 (신규는 NULL)
  qty          integer NOT NULL CHECK (qty > 0),
  price        integer NOT NULL CHECK (price > 0),               -- 보통가 고정 (order_condition "0", D-21)
```
- `BEGIN;` … `COMMIT;` 트랜잭션 감싸기는 원본 `:46` 그대로.
- `price` 완화는 **감사 컬럼 `krx_session` 을 함께 추가해야** `CHECK (price > 0 OR krx_session IN ('G2','G3'))` 형태가 성립한다(RESEARCH 표 C-2 #4).
- ⚠️ 이 파일이 없으면 relay 가 게이트웨이 송신 **전에** insert 실패로 자체 거부한다 → Wave 0 최선행.

---

### `packages/shared/src/relay.ts` — `RelayOrderModifyMsg` 신설

**Analog:** 같은 파일 `RelayOrderCancelMsg`(:494~510) — 바로 아래에 붙인다.

```typescript
/**
 * 취소 주문 (`DirectOrderReq(2)` 취소, D-02).
 * `qty` 는 미체결 잔량 전부다 — `0` 은 조립 단계에서 거부된다 (D-21).
 * `market` 을 싣지 않는 이유와 `accountNo` 의 책임 경계는 `RelayOrderNewMsg` 와 같다.
 */
export type RelayOrderCancelMsg = {
  t: "order.cancel";
  rid: string;
  isin: string;
  exchange: RelayExchange;
  /** 원주문번호 — 취소는 필수다. */
  orgOrderNo: string;
  qty: number;
  price: number;
  accountNo: string;
};
```
복사할 것: ① 타입 위 블록 주석에 **와이어 근거 + 왜 이 필드가 없는가**를 적는 관례 ② 필드 순서(`t · rid · isin · exchange · [side] · qty · price · accountNo`) ③ 특이 필드에만 인라인 `/** */`. 정정은 `side` 를 **싣는다**(취소와 다르다).
유니온 `RelayInbound`(:513~) 에 새 멤버를 추가하는 것을 잊지 말 것 — zod 쪽과 쌍이다.

**돌파 항목 보강(D-30):** `RelayRateCrossItem`(:907~921) 에 optional `name?`/`code?` 2필드. 선례는 같은 파일의 `RelayViOrderItem.name` · `RelayLimitChaser.name/code`.

---

### `relay/src/ws/protocol.ts` — `RelayOrderModifySchema`

**Analog:** 같은 파일 `RelayOrderCancelSchema`(:271~287)

```typescript
/**
 * 취소 주문 (`order.cancel`, D-02).
 *
 * `orgOrderNo` 는 필수다 — 원주문번호 없는 취소는 조립 단계에서 어차피 실패한다.
 * `qty` 는 미체결 잔량 전부이고 `0` 은 거부다 (D-44).
 */
export const RelayOrderCancelSchema = z.object({
  t: z.literal("order.cancel"),
  rid: RidSchema,
  isin: IsinSchema,
  exchange: ExchangeSchema,
  orgOrderNo: z.string().min(1),
  qty: z.number().int().positive(),
  price: z.number().int().positive(),
  accountNo: AccountNoSchema,
});

export const RelayInboundSchema = z.discriminatedUnion("t", [ …, RelayOrderCancelSchema ]);
```
복사할 것: 공용 브랜드 스키마(`RidSchema`·`IsinSchema`·`ExchangeSchema`·`AccountNoSchema`) 재사용, `z.literal(t)` 판별, `positive()` 규율, 그리고 **union 배열에 추가**.
`price` 완화는 `nonnegative()` + `superRefine`(0 은 `krxSession` G2/G3 일 때만) — 무조건 열지 않는다.
⚠️ zod 는 미지의 키를 **조용히 버린다**(Pitfall 3): 스키마에 `pieceCount`/`krxSession` 을 넣기 전에 webapp 이 먼저 실어 보내면 값이 소리 없이 사라진다. Wave 0 순서(shared → zod → 조립기 → webapp)가 그래서 계약이다.

---

### `relay/src/dma/envelope.ts` — 조립기 확장

**Analog:** 같은 파일 `buildDirectOrderReq`(:925~985)

가드 → 문자열 선생성 → `addXxx` 순서를 그대로 잇는다:
```typescript
  const orgOrderNo = req.orgOrderNo ?? "";
  if (orderType === "C" && orgOrderNo === "") {
    throw new OrderBuildError("ORG_ORDER_NO_REQUIRED", "취소 주문에는 원주문번호가 필요합니다");
  }

  const b = new flatbuffers.Builder(256);
  // 문자열은 테이블을 **열기 전에** 만든다 …
  // ★ 위치 인자 `createDirectOrderReq` 를 쓰지 않는다 … 인자 수가 11 → 13 으로 늘어 호출부가
  //   깨졌다. 타입이 우연히 맞는 조합이었다면 **조용히** 한 칸 밀린 채 실계좌 발주가 나갔을 것이다.
  DirectOrderReq.startDirectOrderReq(b);
  …
  DirectOrderReq.addOrgOrderNo(b, orgOrderNoOffset);
  // `piece_count`(24) · `krx_session`(26) 은 **싣지 않는다** (D-12). 미송신이 곧 기존 수동주문
  // 경로의 바이트 무변경이다 — 예약/장전/시간외종가 발주 UI 는 Phase 18 소관이다.
  const order = DirectOrderReq.endDirectOrderReq(b);
```
이 phase 의 변경은 정확히 3군데: `toWireOrderType`(:857~862) 에 `"M"` 허용 · 위 가드를 `"C" || "M"` 으로 · 마지막 주석을 **조건부 `addPieceCount`/`addKrxSession`** 으로 교체(RESEARCH 예 1). **부재가 기본값**이므로 값이 없거나 1이면 호출 자체를 건너뛴다.
`OrderBuildError(code, 한국어 메시지)` 쌍과 「조립기가 마지막 관문」 규율(:806)은 유지.

---

### `relay/src/ws/order-handler.ts` — 2분기 → 3분기

**Analog:** 같은 파일. 현행 분기 지점 원문:
```typescript
function dupKey(msg: RelayOrderNewMsg | RelayOrderCancelMsg): string {
  if (msg.t === "order.cancel") {
    return `dup:${msg.accountNo}|${msg.isin}|C|${msg.orgOrderNo}`;
  }
  return `dup:${msg.accountNo}|${msg.isin}|${msg.side}|${msg.price}|${msg.qty}`;
}
```
```typescript
  async function handle(conn, userId, msg: RelayOrderNewMsg | RelayOrderCancelMsg): Promise<void> {
    const isCancel = msg.t === "order.cancel";
```
insert·조립 두 곳이 같은 표현을 쓴다 — **둘 다** 고쳐야 한다:
```typescript
        side,
        orderType: isCancel ? "C" : "N",
        orgOrderNo: orgOrderNo === "" ? undefined : orgOrderNo,
```
```typescript
    } catch (err) {
      // 기록에 실패했으면 **보내지 않는다.** 감사 기록 없는 실주문을 만드는 것보다,
      // 사용자에게 지금 못 보낸다고 말하는 편이 낫다 (D-24).
      release(state, keys);
      reject(conn, msg.rid, "주문 기록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
```
복사할 것: `release(state, keys)` + `reject(...)` + `return` **3종 세트**(어느 이탈 경로에서도 키를 놓는다), 마스킹 로그(`maskAccountNo`), 「연결 생존 재확인」 순서. 정정의 `side` 는 취소와 달리 **요청 값을 쓴다**(취소가 `"S"` 로 적는 이유는 원주문 방향을 모르기 때문 — 정정은 안다).

---

### `relay/src/hub/subscription-hub.ts` — 돌파 항목 name/code decorate (D-30)

**Analog:** 같은 파일 `#enrichViOrder`(:1123~1130)
```typescript
  /**
   * VI 주문 행에 종목명을 채운다. `#enrichNames`(계좌 계열)와 같은 규율이다 —
   * 맵에 없으면 **필드를 비워 둔다**. ISIN 을 이름 자리에 넣으면 UI 가 "이름이 없다"와
   * "이름이 ISIN 이다"를 구분하지 못한다.
   */
  #enrichViOrder(item: RelayViOrderItem): RelayViOrderItem {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name };
  }
```
(이 한 줄 형태 — 맵에 없으면 **원본 객체를 그대로 돌려준다** — 를 그대로 쓴다.)

삽입 지점은 `#onRateCrossAlert`(:848) 과 `#onRateCrossSnapshot`(:868) 의 **팬아웃 직전** 한 줄씩:
```typescript
  #onRateCrossAlert(userId: string, session: HubSession, item: RelayRateCrossItem): void {
    this.#rateCrossItems.set(rateCrossKey(userId, item.isin, item.exchange), item);
    if (!session.isReady) { … return; }
    this.#fanout(userId, { t: "rate.cross", item });
  }
```
⚠️ 캐시(`#rateCrossItems`)의 「서버 집합을 그대로 보관」 규율과 전량 교체(:868~878)는 **건드리지 않는다**.

---

### `webapp/src/lib/relay-provider.tsx` — `buildOrderFrame` 확장

**Analog:** 같은 파일 `buildOrderFrame`(:144~175)
```typescript
function buildOrderFrame(
  req: RelayOrderRequest,
  rid: string,
): { ok: true; frame: RelayOrderNewMsg | RelayOrderCancelMsg } | { ok: false; reason: string } {
  if (req.isin.length === 0) return { ok: false, reason: "주문 종목을 확인하지 못했어요." };
  if (req.accountNo.length === 0) return { ok: false, reason: "주문 계좌를 선택해 주세요." };
  if (!(req.qty > 0)) return { ok: false, reason: "주문 수량을 확인해 주세요." };
  if (!(req.price > 0)) return { ok: false, reason: "주문 가격을 확인해 주세요." };

  const common = { rid, isin: req.isin, exchange: req.exchange, qty: req.qty, price: req.price, accountNo: req.accountNo };

  if (req.kind === "cancel") {
    if (req.orgOrderNo == null || req.orgOrderNo.length === 0) {
      return { ok: false, reason: "취소할 원주문번호를 확인하지 못했어요." };
    }
    return { ok: true, frame: { t: "order.cancel", ...common, orgOrderNo: req.orgOrderNo } };
  }

  if (req.side == null) return { ok: false, reason: "매수·매도 구분을 확인하지 못했어요." };
  return { ok: true, frame: { t: "order.new", ...common, side: req.side } };
}
```
복사할 것: **throw 하지 않는 `{ok}` 결과형**, 존댓말 한국어 사유, `common` 스프레드 후 kind 별 필드. `modify` 분기는 cancel 분기 바로 위/아래에 같은 모양으로. `price > 0` 가드는 **`krxSession` 이 G2/G3 일 때만** 0 을 통과시키도록 조건부로 완화(표 C-2 #1).
⚠️ `sendOrder` 의 「어떤 경로에서도 reject 하지 않는다」(:110~119) 와 `newRid` 유일성 규율은 그대로.

---

### `webapp/src/lib/use-breakout-quotes.ts` (hook, pub-sub)

**Analog:** `webapp/src/lib/relay-provider.tsx` `useRelaySubscription`(:307~324)
```typescript
export function useRelaySubscription({ isin, exchange, enabled = true }: UseRelaySubscriptionOptions): RelaySocketState {
  const relay = useRelayContext();
  const { subscribe, unsubscribe } = relay;
  const active = enabled && isin.length > 0;

  useEffect(() => {
    if (!active) return;
    subscribe(isin, exchange);
    // 키가 바뀌면 **이전 키**를 해제한다 — 클로저가 붙잡은 isin/exchange 가 정확히 그것이다.
    // 빠뜨리면 relay 참조계수가 새고 업스트림 구독이 영원히 남는다.
    return () => unsubscribe(isin, exchange);
  }, [active, isin, exchange, subscribe, unsubscribe]);
```
복사할 것: ① `useRelayContext()` 에서 `subscribe`/`unsubscribe` 를 꺼내 쓰고 **`sub` 프레임을 직접 만들지 않는다** ② cleanup 이 같은 키를 해제 ③ 훅이 계좌·종목을 **대신 고르지 않는다**(소비자가 `relayQuoteKey(isin,ex)` 로 고른다).
차이는 키가 집합이라는 것뿐 — 안정 문자열 시그니처로 effect 재실행을 값 변화로만 유발한다(RESEARCH Pattern 1 코드). 구독 거래소는 `"KRX"` 고정, 자율 상한 상수 1개.

---

### `webapp/src/lib/breakout-list.ts` (utility, transform)

**Analog:** `webapp/src/lib/vi-alert.ts:137~158`
```typescript
export function readViAlertEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(VI_ALERT_STORAGE_KEY) === "on";
  } catch {
    // Safari 프라이빗 모드 등 — 저장소가 막혀 있으면 「꺼짐」이다.
    return false;
  }
}

export function writeViAlertEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VI_ALERT_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // 저장 실패는 다음 방문에 꺼짐으로 읽히는 것뿐이라 화면 동작을 막지 않는다.
  }
}
```
복사할 것: `typeof window` SSR 가드 → `try/catch` → **안전한 기본값으로 수렴**(throw 없음), 키 상수 1개, 「서버로 보내지 않는다」 주석. 날짜 키 집합은 `{ d, ids }` 형태로 저장하고 **날짜가 다르면 빈 집합**(리셋 타이머 없음).
순수 판정 함수(이탈·무장·유예)는 `vi-order-list.tsx` `isConfirmable` 처럼 **「판정의 유일 지점」 한 함수**로 export 하고 컴포넌트와 테스트가 같은 함수를 쓴다.

---

### `webapp/src/lib/queued-window.ts` (utility, transform)

**Analog:** `webapp/src/components/trading/vi-order-list.tsx:148~163`
```typescript
/**
 * 확인 체크를 열 수 있는가 — **잠금 판정의 유일 지점**이다 (④).
 *
 * 체크박스의 `disabled` 와 전송 가드가 **같은 함수**를 쓴다. 두 곳에 따로 적으면 한쪽만
 * 고쳐지고, 그때 뚫리는 것이 「비활성인데 눌리면 나가는 확인」이다 …
 */
export function isConfirmable(item: Pick<RelayViOrderItem, 'orderNo' | 'confirmLocked'>, disabled = false): boolean {
  if (disabled) return false;
  if (item.orderNo === '') return false;
  // 서버 계산값이다. 클라가 119초를 다시 재지 않는다.
  return !item.confirmLocked;
}
```
복사할 것: 「**유일 지점**」 선언 주석 + `Pick<>` 로 최소 입력만 받기 + 「클라가 다시 재지 않는다」 규율. `affordanceOf(window, exchange, orderType)` 는 `undefined` = 모름 = 전부 false 로 접고, **벽시계를 읽지 않는다**(현재 시각 상수를 이 파일에 들이지 말 것).

---

### `webapp/src/components/trading/card/strategy-card.tsx` (component, event-driven)

**Analog:** `webapp/src/components/trading/limit-chaser-client.tsx` `LimitChaserSurface`(:201~978) — 이것이 곧 카드 1장의 몸통이다. `routeKey` prop → `initialKey`.

컨테이너 선언은 **이동**이다(복제 아님). 현행 선언 위치 `limit-chaser-client.tsx:542` 부근의 `@container/lc` 래퍼를 카드 `<article>` 로 옮기면 `@min-[700px]/lc:`·`@min-[830px]/lc:`·`@min-[992px]/lc:` 43줄이 한 글자도 안 바뀐 채 카드 폭을 잰다.

서버 진실 취급 주석 문법도 함께 가져온다:
```typescript
  /**
   * KRX 정규장 종가(`QuoteState.krx_close_price`). **오늘 종가가 아니면 `0`** 이다 (D-11).
   *
   * ★ 스냅샷 props 로 폴백하지 않는다 — `0` 은 「아직 안 왔다」가 아니라 「오늘 종가가
   *   아니다」라는 **서버의 답**이라, 다른 출처로 메우면 없는 사실을 지어내는 것이 된다.
   * ★ **벽시계로 판정하지 않는다.** …
   */
  const closePrice = quote?.kc ?? 0;
```

**더티 바 포털** — 컴포넌트가 아니라 **호출부**의 사정이다. `limit-chaser-form.tsx:1046~1060` 의 주석 블록을 그대로 승계하고 `hint` 에 종목명만 더한다:
```tsx
      {/*
        ★ 액션 바는 `document.body` 로 포털한다 — 장식이 아니라 필수다 (260912-k2x).
          상따 본문 래퍼가 `container-type:inline-size` 를 쓰는데, 그것은 layout containment
          를 걸고 … 포털을 걷으면 이 바가 뷰포트 하단이 아니라 **본문 끝**에 앉고 …
        ★ 공유 컴포넌트(`dirty-action-bar.tsx`)는 한 줄도 고치지 않았다 …
        ★ SSR 가드 — 서버 렌더에는 `document` 가 없다. 마운트된 뒤에만 포털을 만든다.
      */}
```
탭/2열 전환 클래스 패턴도 같은 파일에서:
```tsx
        <div data-pane="sell" className={cn('min-w-0', tab !== 'sell' && 'hidden @min-[700px]/lc:block')}>
```

---

### `webapp/src/components/trading/card/manual-order-form.tsx` (component, request-response)

**Analog:** `webapp/src/components/orderbook/order-panel.tsx`(693줄) — **다이어트 재작성**. 파일 머리 주석의 5규율 중 **살아남는 것과 바뀌는 것**을 명시해야 한다:
```
 * ② ★ 오조작 방지 5규율 …
 *   1. **색·위치·문구 3중 일치** — 매수 = `--up`(빨강) · **왼쪽** 탭 · `매수`, 매도 = `--down`(파랑) …
 *   2. **단일 제출 버튼** — 매수·매도 버튼을 나란히 두지 않는다. 인접 오클릭이 구조적으로 불가능해진다.
 *   3. **확인 다이얼로그 필수** — 제출은 언제나 다이얼로그를 거친다. 기본 포커스는 취소다.
 *   4. **제출 후 즉시 재활성 금지** — 응답 전까지 비활성 + `주문 전송 중…` + 중복 제출 가드.
 * ③ ★ 결과는 세 가지다 — 접수 / **결과 모름** / 거부 … `status:"timeout"` 은 **실패가 아니다.**
 * ④ ★ LOCKED 색 규칙 … accent 파랑 토큰은 `--down` 과 값이 완전히 같다 → 이 파일에 등장하지 않는다.
```
⚠️ **규율 2 는 D-20 이 명시적으로 뒤집는다**(「매수·매도·정정·취소」 4버튼 한 줄, gh-trade WinForms 종합주문창 동형). 재작성 시 파일 머리 주석에 **왜 뒤집혔는지**(사용자 결정 D-20 · 정본 WinForms)를 적고, 대신 규율 3(확인 다이얼로그)·4(재활성 금지)·③(timeout≠실패)·④(색 토큰)는 **한 글자도 완화하지 않는다.** `catch` 를 만들지 않는 것도 그대로.

제거 대상(D-20): 계좌 행 · 가격 ± 버튼 · 비율(10/25/50/100%) 버튼 · 「호가 사다리를 누르면…」 안내.

---

### `webapp/src/components/trading/card/stock-info-modal.tsx` (모달)

**Analog:** `webapp/src/components/orderbook/order-confirm-dialog.tsx:117~136`
```tsx
    <Dialog open={detail !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" …>
            <DialogHeader>
              <DialogTitle>미체결 주문을 취소할까요?</DialogTitle>
              <DialogDescription>취소 수량은 미체결 잔량 전부예요.</DialogDescription>
            </DialogHeader>
```
복사할 것: `@/components/ui/dialog` 배럴 import 목록, `open`/`onOpenChange` 제어형, `DialogTitle`+`DialogDescription` 필수(a11y). 폰 전체화면 시트 / 700+ 960px 은 `DialogContent` 의 `className` 으로 — **뷰포트 분기 신설 금지(D-28)** 이지만 모달은 컨테이너 밖이라 기존 `sm:` 유틸 관례를 따른다(목업이 정본).
내용 3탭은 `webapp/src/app/stocks/[code]/page.tsx` 의 탭 본문을 **그대로 재사용**(새 데이터 경로 없음).

---

### `webapp/src/components/trading/workbench/vi-settings-rows.tsx`

**Analog:** `webapp/src/components/trading/vi-settings-card.tsx`

폐기할 상수(정확한 지점 `:96`):
```typescript
/**
 * 이 카드가 편집하는 거래소 (17-06 / D-18) — **리터럴을 흩뿌리지 않는 단 하나의 자리**다.
 * … Phase 18 이 NXT 편집을 열 때는 **이 상수를 상태로 바꾸면 끝나게** 두었다.
 */
export const VI_EDIT_EXCHANGE: RelayExchange = 'KRX';
```
소비처 4곳(`:105` 캡션 · `:376` `vi.set` 송신 · `:863` 요약행 · `:12` 주석)을 **줄의 거래소 prop** 으로 바꾼다. 송신부 형태:
```typescript
      { t: 'vi.set', …, exchange: VI_EDIT_EXCHANGE }   // → exchange: props.exchange
```
⚠️ Pitfall 8: 상수를 한 곳이라도 남기면 NXT 줄이 KRX 전략을 덮는다.
`VI_ACK_TIMEOUT_MS = 3_000`(:110) 의 「타이머는 잠금을 풀 뿐 아무것도 다시 보내지 않는다」 규율과 시작/중지 확인 다이얼로그는 그대로 승계.

---

### `webapp/src/components/trading/workbench/stock-add-bar.tsx`

**Analog:** `limit-chaser-client.tsx` `StockSearchField`(:1259~) · `isPickable`(:1247) — 파일 내부 비공개 → **승격**. 존재 이유 주석을 함께 옮긴다:
```
 * `components/search/global-search.tsx` 를 쓰지 않는 이유: 그쪽은 인자를 받지 않고 선택 시
 * **종목 상세로 라우팅**한다. 여기서 필요한 것은 「고른 종목을 이 화면에 남기는 것」…
 * ★ `isin` 이 없는 종목은 고를 수 없다(ETP 등 …, D-28).
 * ★ **시장구분을 알 수 없는 종목도 같은 취급**이다 (WR-03). …
```
첫 항목 자동 활성화 · ↓/Enter 키보드 왕복(e2e 케이스 14 가 단언)을 유지한다.

---

### 사이드바 `webapp/src/components/layout/app-sidebar.tsx`

**Analog:** 같은 파일.
```typescript
/** 전략 3단 항목의 경로. 키의 `:` 때문에 인코딩이 **필수**다(위 ③). */
export function limitChaserHref(key: string): string {
  return `/trading/limit-chaser/${encodeURIComponent(key)}`;
}

function samePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  try { return decodeURIComponent(pathname) === decodeURIComponent(href); } catch { return false; }
}

function GroupHeading({ label, icon: Icon }: { label: string; icon: NavIcon }) {
  return (
    <li className="flex items-center gap-2 px-3 pt-2 pb-1 text-[length:var(--t-sm)] font-semibold tracking-[0.02em] text-[var(--muted-fg)]">
```
- `limitChaserHref` 는 **이름을 유지하고 본문만** `/trading?focus=…` 로 — 호출부 2곳(`StrategyItem`, `strategy-status-card.tsx:152`)이 무수정으로 산다.
- `GroupHeading` 을 링크로 승격할 때 `StrategyItem`(:179) 의 `<Link href aria-current={active ? "page" : undefined} data-nav-item …>` + `LINK_ACTIVE`/`LINK_IDLE` 조합을 그대로 쓴다.
- `StrategyItem` 주석의 「240px 폭에서 종목명이 3~4글자로 잘렸다」 근거는 유지 — LED 3점 요약은 그 폭 예산 안에서.

---

### 리다이렉트 라우트 4개

**Analog:** `webapp/src/app/trading/limit-chaser/page.tsx` (파일 전문)
```typescript
import { redirect } from 'next/navigation';

/**
 * `/trading/limit-chaser` — 화면이 없다. **`/new` 로 보낸다** (UI-SPEC P1).
 * …
 * 서버 컴포넌트로 두어 리다이렉트가 **네트워크 왕복 한 번에** 끝나게 한다 — 클라이언트에서
 * 밀면 빈 화면이 한 프레임 그려진 뒤 이동한다.
 */
export default function LimitChaserIndexPage() {
  redirect('/trading/limit-chaser/new');
}
```
`[key]` 는 현행 `decodeURIComponent`(:25) 를 거친 뒤 `redirect('/trading?focus=' + encodeURIComponent(key))`. `next.config` 로 옮기지 않는다(키가 `:` 를 품는다).

---

### e2e `webapp/e2e/specs/trading-workbench.spec.ts`

**Analog:** `webapp/e2e/specs/trading-limit-chaser.spec.ts`
- 잘림 판정 헬퍼(`:126` 부근 `overflowX` 검사)를 **재사용**한다 — 새 판정식을 쓰지 말 것.
- 이식할 케이스: `9.`(:513 390px 2열/탭) · `11.`(:627 본문 700 경계) · `12.`(:758 뷰포트 360·390·768·1023 램프) · `13.`(:796 컨테이너 832·880·960).
- 테스트 제목 관례: `'번호. 한국어 행동 서술 (근거 ID)'`.
- relay 픽스처는 spec 단위로 포트 8090 (`playwright.config.ts:71~75`), webServer 는 `PORT=3100`(:131) — 포트를 가정하지 말 것.

---

## Shared Patterns

### 1. 「판정의 유일 지점」 함수
**Source:** `vi-order-list.tsx:154 isConfirmable` · `latch-led.tsx:113 latchLedStateOf` · `limit-chaser.ts:147 dirtyFieldsOf`
**Apply to:** `breakout-list.ts` · `queued-window.ts` · 카드 헤더 상태 배지 · 수동주문 정정/취소 활성 판정
규칙: 표시와 전송 가드가 **같은 함수**를 부른다. 조건식을 두 번 적지 않는다.

### 2. 서버 진실 불가침 주석 (`★`)
**Source:** `limit-chaser-client.tsx:538~546` · `subscription-hub.ts:845~847` · `relay-provider.tsx:110~119`
**Apply to:** 돌파 목록 · 77 라벨 · VI 에코 · 주문 결과 표시 전부
규칙: 「폴백하지 않는다」·「벽시계로 판정하지 않는다」·「재계산하지 않는다」를 **코드 옆 주석으로** 남긴다(D-27).

### 3. SSR 안전 localStorage
**Source:** `webapp/src/lib/vi-alert.ts:137~158`
**Apply to:** `breakout-list.ts`(울린/지운 집합) · `alert-tone.ts`(토글) · 격자 단 수
규칙: `typeof window` 가드 → `try/catch` → 안전 기본값. throw 금지.

### 4. 이탈 경로 3종 세트 (relay 주문)
**Source:** `relay/src/ws/order-handler.ts:853~866`
**Apply to:** `order.modify` 의 모든 거부 분기
규칙: `release(state, keys)` → `reject(conn, rid, 한국어 사유)` → `return`. 감사 기록 없는 주문을 만들지 않는다.

### 5. 컨테이너 쿼리 — 이름 `lc` 이동, 표 복사 금지
**Source:** `webapp/src/styles/globals.css` §2.2b · 현행 선언 `limit-chaser-client.tsx:542`
**Apply to:** `strategy-card.tsx`(선언 이동) · 호가 탭 본문(같은 이름 선언) · `trading-workbench.tsx`(새 이름 `wb`)
규칙: §2.2b 에 **3~4줄만 덧붙인다**(측정 대상이 둘이 되었다). 숫자를 다시 적지 않는다(CLAUDE.md Conventions). 목업의 760px 헤더 경계는 밴드 표로 승격시키지 말고 카드 헤더 로컬 규칙 + 「밴드 표와 무관」 주석.

### 6. 더티 액션 바 포털
**Source:** `limit-chaser-form.tsx:1046~1060`(호출부) · `dirty-action-bar.tsx:66~93`(공유 컴포넌트 — 무수정)
**Apply to:** 카드마다. `hint` 에 종목명.
⚠️ Pitfall 5: 폰에서 z-40 fixed 바가 z-20 sticky 공용 패널을 덮는다 — 레이어 예산을 계획에 명시.

### 7. 주문 확인 다이얼로그
**Source:** `order-confirm-dialog.tsx:84~136`
**Apply to:** 수동주문 4버튼 전부 · 취소 · VI 시작/중지
규칙: 기본 포커스는 취소 버튼, 중복 제출 가드, `DialogTitle`+`DialogDescription` 필수.

### 8. 빌드 순서 게이트
**Source:** config `build_command` 의 `pnpm --filter @gh-radar/shared build &&` 첫 항
**Apply to:** 계약을 건드리는 모든 태스크
⚠️ 낡은 `packages/shared/dist` 가 남으면 relay·webapp typecheck 가 **통과해 버린다**(Pitfall 4).

---

## No Analog Found

| 파일 | Role | Data Flow | 이유 / 대안 |
|---|---|---|---|
| `webapp/src/components/trading/workbench/card-grid.tsx` | component(레이아웃) | — | 「펼친 카드 각 한 칸 + 접힌 카드 스택 한 칸」 정렬이 코드베이스에 없다. **목업 `18-workbench-mockup.html:370~373`(격자 열 수)·설계 메모가 정본** — RESEARCH 「목업에서 추출한 수치」 표를 그대로 구현 |
| `webapp/src/lib/alert-tone.ts` | utility | — | `AudioContext`/`new Audio(` 사용처가 코드베이스에 **0건**. 구조·가드는 `vi-alert.ts` 를 따르되 합성 자체는 신작(RESEARCH 권장 파라미터: sine 880Hz · 160ms · gain 0→0.18→0) |

---

## Metadata

**Analog search scope:** `webapp/src/{app,components,lib,e2e}` · `relay/src/{ws,dma,hub,store}` · `packages/shared/src` · `supabase/migrations`
**Files scanned:** 28 (targeted read/grep)
**Tracked-source gate:** 인용한 모든 아날로그 경로를 `git ls-files` 로 확인 — 미러 경로 없음
**Pattern extraction date:** 2026-09-21
