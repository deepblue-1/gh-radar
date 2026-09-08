# Phase 16: Trading 메뉴 — 상따·VI 전략 설정 + 종목검색 재편 + My page - Pattern Map

**Mapped:** 2026-09-08
**Files analyzed:** 47 (신규 27 · 수정 18 · 삭제 2)
**Analogs found:** 43 / 47

> 이 문서는 **「새 파일이 어느 기존 파일을 베끼는가」** 하나만 답한다. 무엇을 만들지는
> `16-CONTEXT.md`(결정) · `16-RESEARCH.md`(계약·통합 지점) · `16-UI-SPEC.md`(시각·상호작용)에 있다.
> planner 는 각 plan 의 action 에 **아래 analog 파일 경로 + 줄 번호**를 그대로 인용한다.
>
> **이 phase 의 지배적 사실: 신규 아키텍처가 0개다.** relay 3층(codec / hub / fanout), shared 계약,
> webapp 프로바이더·폼·표·E2E 전부 Phase 15 에 **같은 모양의 선행 사례**가 있다. 「analog 없음」 4건은
> 전부 UI 조합 컴포넌트이며, 그마저 근접 analog 를 명시했다.

---

## File Classification

### Tier 1 — relay (Node, W0~W2)

| New/Modified File | 상태 | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `relay/src/generated/stock-dma/**` | 재생성 | generated | — | (스크립트 산출물) | n/a |
| `relay/src/dma/msg-type.ts` | 수정 | config (상수 정본) | request-response | 자기 자신 (`MSG` 블록 확장) | exact |
| `relay/src/dma/envelope.ts` | 수정 | utility (codec) | transform | 같은 파일 `buildGetQuoteReq`(:332) / `parseAccountState`(:930) | exact |
| `relay/src/ws/protocol.ts` | 수정 | middleware (validation) | request-response | 같은 파일 `RelaySubSchema`(:47) / `RelayInboundSchema`(:60) | exact |
| `relay/src/hub/strategy-*` (Hub 확장) | 수정 | service (cache + fanout) | pub-sub | `subscription-hub.ts` `#accountStates` 계열(:185, :344, :505, :699, :712) | exact |
| `relay/src/ws/fanout.ts` | 수정 | controller (wss 라우터) | pub-sub | 같은 파일 `#onFirstMessage`(:341) / `#onAuthedMessage`(:402) | exact |
| `relay/src/ws/order-handler.ts` (또는 fanout 내부) | **신규** | service (요청/응답 상관) | request-response | `order/order-api.ts` :340~565 (HTTP → wss 이식) | role-match |
| `relay/src/store/orders.ts` | 수정 | model/store | CRUD | 같은 파일 `supabaseOrderSink`(:111) + `server/src/services/dma-orders.ts` `insertOrderRequest` | exact |
| `relay/src/order/order-api.ts` | 수정 | controller (HTTP) | request-response | 같은 파일 (`ORDERS_PATH` 블록 제거, `/healthz` 유지) | exact |
| `relay/src/index.ts` · `config.ts` | 수정 | config (결선) | — | 같은 파일 `createOrderApi({orders, orderStore})` 결선 | exact |
| `relay/tests/helpers/fake-gateway.ts` | 수정 | test helper | event-driven | 같은 파일 `pushQuote` / `respondLogin`(:76, :94) | exact |
| `relay/tests/strategy-hub.test.ts` | **신규** | test | pub-sub | `relay/tests/hub.test.ts` (`decodeReq` 규율) | exact |
| `relay/tests/ws-order.test.ts` | **신규**(재작성) | test | request-response | `relay/tests/order-api.test.ts` | role-match |
| `relay/src/dma/__tests__/{codec,envelope}.test.ts` | 수정 | test | transform | 자기 자신 | exact |

### Tier 2 — shared 계약

| New/Modified File | 상태 | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `packages/shared/src/relay.ts` | 수정 | model (계약 타입) | transform | 같은 파일 `RelayAccountState`(:267) · `RelayOrderMsg`(:293) · `CreateOrderRequest`(:365) | exact |

### Tier 3 — webapp lib / provider

| New/Modified File | 상태 | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `webapp/src/lib/relay-provider.tsx` | **신규** | provider (전역 컨텍스트) | pub-sub | `webapp/src/hooks/use-watchlist-set.tsx` (Provider+hook 형태) + `use-relay-socket.ts` (내용) | role-match |
| `webapp/src/lib/use-relay-socket.ts` | 수정 | hook | streaming | 자기 자신 (옵션에서 `isin`/`exchange` 분리) | exact |
| `webapp/src/lib/limit-chaser.ts` | **신규** | utility (순수함수) | transform | `webapp/src/lib/limit-up-format.ts` + `envelope.ts` `toWireSide`(:671) | role-match |
| `webapp/src/lib/orders-api.ts` | 수정 | api client | request-response | 자기 자신 (`createOrder` 제거, 오류코드 판정 유지) | exact |
| `webapp/src/app/layout.tsx` | 수정 | config (Provider 중첩) | — | 자기 자신 (:39~49) | exact |

### Tier 4 — webapp 라우트 셸

| New/Modified File | 상태 | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `webapp/src/app/trading/limit-chaser/new/page.tsx` | **신규** | route | — | `webapp/src/app/watchlist/page.tsx` (22줄 전체) | exact |
| `webapp/src/app/trading/limit-chaser/[key]/page.tsx` | **신규** | route (동적) | — | `webapp/src/app/stocks/[code]/page.tsx` | exact |
| `webapp/src/app/trading/vi/page.tsx` | **신규** | route | — | `watchlist/page.tsx` | exact |
| `webapp/src/app/me/page.tsx` | **신규** | route | — | `watchlist/page.tsx` | exact |
| `.../trading/limit-chaser-client.tsx` · `vi-client.tsx` · `me-client.tsx` | **신규** | client shell | streaming | `webapp/src/components/stock/stock-orderbook-section.tsx` | role-match |

### Tier 5 — webapp 컴포넌트

| New/Modified File | 상태 | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `webapp/src/components/ui/checkbox.tsx` | **신규**(shadcn) | ui primitive | — | `webapp/src/components/ui/switch.tsx` (동일 Radix 래핑 규약) | exact |
| `webapp/src/components/layout/app-sidebar.tsx` | 수정 | component (nav) | — | 자기 자신 (`NAV` 배열 :28~36) | exact |
| `webapp/src/components/trading/strategy-badge.tsx` | **신규** | component (표시) | transform | `orderbook/relay-status-bar.tsx` 배지 블록 (:180~) | role-match |
| `webapp/src/components/trading/limit-chaser-form.tsx` | **신규** | component (폼) | request-response | `orderbook/order-panel.tsx` (`FormRow` · 탭 · 확인 · 제출 가드) | role-match |
| `webapp/src/components/trading/dirty-action-bar.tsx` | **신규** | component | — | **analog 없음** (근접: `order-panel.tsx` `ResultBanner` 인라인 배너) | none |
| `webapp/src/components/trading/vi-settings-card.tsx` | **신규** | component (폼) | request-response | `order-panel.tsx` `FormRow` + `<select>` 블록 (:451~473) | role-match |
| `webapp/src/components/trading/vi-order-list.tsx` | **신규** | component (표/카드) | event-driven | `orderbook/account-panel.tsx` 미체결 표 | role-match |
| `webapp/src/components/trading/strategy-log.tsx` | **신규** | component (누적 로그) | event-driven | `orderbook/relay-status-bar.tsx` `data-slot="relay-alerts"`(:218~) | role-match |
| `webapp/src/components/trading/dma-gate.tsx` | **신규** | component (빈상태) | — | `order-panel.tsx` `status === 'unauthorized'` 게이트 + `stock-orderbook-section.tsx` 빈상태 | role-match |
| `webapp/src/components/orderbook/account-panel.tsx` | 수정 | component (표) | CRUD | 자기 자신 (`createOrder` → wss, `.rlist` 추가) | exact |
| `webapp/src/components/orderbook/order-panel.tsx` | 수정 | component (폼) | request-response | 자기 자신 (:337 `handleConfirmed`) | exact |
| `webapp/src/components/orderbook/orderbook-ladder.tsx` | 수정 | component (표) | streaming | 자기 자신 (`depth` prop 확장 + 체결 열) | exact |
| `webapp/src/components/stock/stock-orderbook-section.tsx` | 수정 | component (섹션) | streaming | 자기 자신 (:155 훅 호출 1줄 교체) | exact |

### Tier 6 — server 정리 · Supabase · 배포

| New/Modified File | 상태 | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `server/src/routes/orders.ts` | 수정 | route | request-response | 자기 자신 (POST 블록 삭제, GET 유지) | exact |
| `server/src/{app,server,config}.ts` | 수정 | config | — | 자기 자신 | exact |
| `server/src/services/relay-client.ts` | **삭제** | service | — | — | n/a |
| `server/src/services/dma-orders.ts` | 수정 | service | CRUD | 자기 자신 (`insertOrderRequest` 를 relay 로 이식) | exact |
| `scripts/deploy-server.sh` | 수정 | 배포 스크립트 | — | 자기 자신 | exact |
| `supabase/migrations/2026____dma_orders_origin.sql` | **신규** | migration | — | `supabase/migrations/20260905120200_dma_orders.sql` | exact |

### Tier 7 — 테스트 (webapp)

| New/Modified File | 상태 | Role | Data Flow | Closest Analog | Match |
|-------------------|------|------|-----------|----------------|-------|
| `webapp/src/lib/__tests__/limit-chaser.test.ts` | **신규** | unit | transform | `webapp/src/lib/__tests__/stock-api.test.ts` | role-match |
| `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` | **신규** | unit(RTL) | request-response | `orderbook/__tests__/account-panel.test.tsx` | exact |
| `webapp/src/components/trading/__tests__/vi-order-list.test.tsx` | **신규** | unit(RTL) | event-driven | `orderbook/__tests__/account-panel.test.tsx` | exact |
| `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` | **신규** | unit(RTL) | — | `orderbook/__tests__/relay-status-bar.test.tsx` | role-match |
| `webapp/e2e/fixtures/relay.ts` | 수정 | test fixture | event-driven | 자기 자신 (`pushQuoteFixture`:269 · `LocalRelay`:88) | exact |
| `webapp/e2e/specs/trading-limit-chaser.spec.ts` | **신규** | e2e | streaming | `webapp/e2e/specs/orderbook.spec.ts` | exact |
| `webapp/e2e/specs/trading-vi.spec.ts` | **신규** | e2e | streaming | `orderbook.spec.ts` | exact |
| `webapp/e2e/specs/me.spec.ts` | **신규** | e2e | streaming | `orderbook.spec.ts` | exact |
| `webapp/e2e/specs/sidebar-tree.spec.ts` | **신규** | e2e | — | `webapp/e2e/specs/auth-guards.spec.ts` | role-match |

---

## Pattern Assignments

### `relay/src/dma/msg-type.ts` (config, request-response)

**Analog:** 자기 자신 — 상수 객체 + 화이트리스트 Set 두 블록.

**확장할 구조** (`msg-type.ts:27~96`):

```ts
export const MSG = {
  // --- 요청 (relay → 게이트웨이) ---
  /** 로그인. 세션 수립의 첫 프레임. */
  LoginReq: 1,
  ...
} as const;

export type MsgTypeValue = (typeof MSG)[keyof typeof MSG];

export const INBOUND_MSG_TYPES: ReadonlySet<number> = new Set<number>([
  MSG.LoginResp, MSG.OrderResp, ... MSG.TradeTapePush,
]);
```

**⚠ 파일 상단 주석(:19)이 「상따/VI 계열(10·11·27·33·57·72·73 등)도 같은 이유로 제외한다」로 못 박혀 있다.**
값만 추가하고 주석을 그대로 두면 코드와 문서가 갈린다 — **주석을 같은 커밋에서 뒤집는다**(D-01 근거 명시).
`__tests__/codec.test.ts` 가 생성 enum 과 `MSG` 를 대조하므로 두 파일은 항상 한 커밋이다.

---

### `relay/src/dma/envelope.ts` (utility/codec, transform)

**Analog:** 같은 파일. 빌더 · 단일문자 변환 · 파서 3종의 형태가 이미 확정돼 있다.

**요청 빌더 패턴** (`envelope.ts:331~340` — 24/34 빈 요청 3개가 이 축약형):
```ts
/** 호가 스냅샷 조회 (MsgType 28). 응답은 58 이다. */
export function buildGetQuoteReq(isin: string, exchange: RelayExchange): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = GetQuoteReq.createGetQuoteReq(b, b.createString(isin), b.createString(exchange));
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.GetQuoteReq);
  Envelope.addGetQuoteReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
```
**⚠ `SetLimitChaser`(37필드)만은 이 `createXxx` 위치인자 형태를 쓰면 안 된다** — RESEARCH Pitfall 1.
`startSetLimitChaser(b)` + `addXxx(b,v)` 개별 호출 + `endSetLimitChaser(b)` 로만 조립한다.
위 excerpt 는 **`GetQuoteReq` 처럼 필드 3개 이하인 요청**(21/24/33/34)에만 그대로 복사한다.

**단일문자 wire 변환 패턴** (`envelope.ts:664~697` — 전략 필드의 `"K"/"Q"`·`"B"/"S"` 도 여기에만 추가):
```ts
/**
 * 매매구분 → 와이어 1자. **단일 문자 필드 변환은 전부 이 계열 함수 3종에서만** 한다 (D-21).
 * 서버는 이 필드들의 **첫 글자만** 읽는다. …"KOSDAQ" 이 `K` 로 읽혀 엉뚱한 시장으로 주문이 나간다.
 */
export function toWireSide(side: OrderSide): "B" | "S" {
  if (side !== "B" && side !== "S") {
    throw new OrderBuildError("BAD_SIDE", `알 수 없는 매매구분: ${String(side)}`);
  }
  return side;
}
```

**조립 전 검증 + 던지기 패턴** (`envelope.ts:722~752`) — `lc.set` 인바운드의 형식 검사(D-02)가 이 순서를 그대로 쓴다:
```ts
export function buildDirectOrderReq(req: DirectOrderInput): Uint8Array {
  if (!isValidIsin(req.isin)) throw new OrderBuildError("BAD_ISIN", `ISIN 형식 위반 (12자 필요, ${req.isin.length}자)`);
  if (!isValidAccountNo(req.accountNo)) throw new OrderBuildError("BAD_ACCOUNT_NO", "계좌번호 형식 위반");
  if (!isValidExchange(req.exchange)) throw new OrderBuildError("BAD_EXCHANGE", `알 수 없는 거래소: ${String(req.exchange)}`);
  const side = toWireSide(req.side); const market = toWireMarket(req.market);
  if (!Number.isInteger(req.qty) || req.qty <= 0) throw new OrderBuildError("BAD_QTY", "…(0 은 즉시 거부)");
  if (req.qty > MAX_INT32 || req.price > MAX_INT32) throw new OrderBuildError("INT32_OVERFLOW", "…int 표현 범위를 넘었습니다");
```

**응답 파서 패턴** (`envelope.ts:930~1017` `parseAccountState` — `parseLimitChaser`/`parseViOrderList` 의 정본):
```ts
export function parseAccountState(env: Envelope, isSnapshot: boolean): RelayAccountState | null {
  const msgType = isSnapshot ? MSG.GetAccountStateResp : MSG.AccountStateDelta;
  const st = env.accountState();
  if (st === null) return dropField("slot-null", msgType, { slot: "account_state" });
  …
  const holdScratch = new HoldingState();        // ← scratch 객체 재사용 (루프 밖 1회 생성)
  for (let i = 0; i < holdN; i += 1) {
    const h = st.holdings(i, holdScratch);
    if (h === null) { skipAccountStateItem("entry-null", "holding", i, ""); continue; }
    const isin = h.isin() ?? "";
    if (!isValidIsin(isin)) { skipAccountStateItem("bad-isin", "holding", i, `len=${isin.length}`); continue; }
    hold.push({ isin, qty: h.stockQty(), sellableQty: h.sellableQty(), avgPrice: h.avgPrice() });
  }
```
복사할 규율 4개: ① 슬롯 null → `dropField` 후 `null` 반환(**throw 하지 않는다**) ② **행 하나가 깨지면 그 행만 건너뛰고 프레임은 살린다** ③ 상한 클램프(`takeCount`) ④ `toNum(bigint, label)` 로 64비트 좁히기(D-34).

**신규 추가 위치:** 빌더 3종(21/24/34) + `buildSetLimitChaserReq` / `buildSetVITriggerReq` / `buildDisableStrategiesReq` / `buildConfirmVIOrderReq`, 파서 4종(60/61/64·65/72·73/56). **BasisPoints(`sweep_min_rate`)·bigint 변환은 이 파일 밖으로 새지 않는다.**

---

### `relay/src/ws/protocol.ts` (middleware/validation, request-response)

**Analog:** 같은 파일 — zod 스키마 + `discriminatedUnion` + total parser.

**스키마 + 유니온 패턴** (`protocol.ts:30~64`) — `IsinSchema`/`ExchangeSchema` 를 **재사용**한다(새로 정의 금지):
```ts
const IsinSchema = z.string().length(12).regex(/^[A-Z]{2}[A-Z0-9]{10}$/);
const ExchangeSchema = z.enum(["KRX", "NXT"]);

export const RelaySubSchema = z.object({ t: z.literal("sub"), isin: IsinSchema, ex: ExchangeSchema });

export const RelayInboundSchema = z.discriminatedUnion("t", [
  RelayAuthSchema, RelaySubSchema, RelayUnsubSchema,   // ← 여기에 lc.set / vi.set / vi.confirm /
]);                                                    //    strategies.disable / order.new / order.cancel append
```

**total parser 패턴** (`protocol.ts:73~92`) — 그대로 유지, 확장 없음:
```ts
export function parseInbound(raw: string): RelayInbound | null {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { logger.warn({ bytes: raw.length }, "[WS] JSON 파싱 실패 — 프로토콜 위반"); return null; }
  const parsed = RelayInboundSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    logger.warn({ path: issue?.path.join("."), code: issue?.code }, "[WS] 인바운드 스키마 위반 — 프로토콜 위반");
    return null;
  }
  return parsed.data;
}
```
**⚠ 로그에 원문을 싣지 않는 규율(T-15-04)을 전략 스키마에도 유지한다** — `lc.set` 바디에는 계좌번호가 들어 있다.
**⚠ 파일 상단 주석 :18 「주문 메시지를 받지 않는다. 주문은 `POST /api/orders` 전용이다 (D-08)」 를 D-02 로 뒤집는다.**

---

### relay 전략 캐시 (Hub 확장) — service, pub-sub

**Analog:** `relay/src/hub/subscription-hub.ts` 의 **계좌 상태 캐시 4점 세트**. 전략 캐시는 이 4점을 그대로 복제한다.

**① 캐시 맵 선언** (`subscription-hub.ts:178~185`):
```ts
  /**
   * `${userId}|${accountNo}` → **누적 반영된 전량 스냅샷** (D-23/D-37).
   * 델타(67)를 받아도 여기에는 항상 `snap:true` 인 전량 뷰를 둔다 — 새 탭이 붙었을 때
   * 그대로 1프레임으로 내려보낼 수 있어야 하기 때문이다.
   */
  readonly #accountStates = new Map<string, RelayAccountState>();
```
→ 전략은 `#limitChasers: Map<`${userId}|${strategyKey}`, RelayLimitChaser>` · `#viTriggers: Map<userId, …>` · `#viOrders: Map<`${userId}|${orderNo}`, …>` 3맵.

**② Ready 프리페치** (`subscription-hub.ts:344~356` + `:699~705`):
```ts
  requestAccountState(userId: string): void {
    const session = this.#sessions.get(userId);
    if (session === undefined || !session.isReady) {
      logger.warn({ userId, hasSession: session !== undefined }, "[HUB] 계좌 상태 요청 생략 — 세션이 준비되지 않았다");
      return;
    }
    session.send(buildGetAccountStateReq(""));
    logger.info({ userId }, "[HUB] Ready — 전 계좌 상태 스냅샷 요청");
  }

  #onReady(userId: string, session: HubSession): void {
    if (this.#sessions.get(userId) !== session) return;
    // 재구독과 계좌 스냅샷 재요청은 **같은 트리거 한 자리**에서만 일어난다 (Pitfall 4).
    this.resubscribeAll(userId);
    this.requestAccountState(userId);
    // ← requestStrategySnapshot(userId) 를 여기 한 줄로 추가 (24/21/34 3연발)
  }
```

**③ 프레임 수신 분기** (`subscription-hub.ts:418~464`) — 60/61/64/65/72/73/56 에 **명시 case 를 만든다**(`default:` 조용한 드롭 금지):
```ts
  #onFrame(userId: string, session: HubSession, e: TransportFrameEvent): void {
    // 세션이 교체됐다면 옛 리스너는 아무것도 보고하지 않는다 (15-03 generation 규율 동형).
    if (this.#sessions.get(userId) !== session) return;
    switch (e.msgType) {
      case MSG.GetAccountStateResp:
      case MSG.AccountStateDelta: {
        const state = parseAccountState(e.env, e.msgType === MSG.GetAccountStateResp);
        if (state !== null) this.#onAccountState(userId, state);   // null 이면 파서가 이미 사유·카운터를 남겼다
        return;
      }
```

**④ 캐시 upsert → 팬아웃** (`subscription-hub.ts:513~531` + `:708~711`):
```ts
  #onAccountState(userId: string, rawState: RelayAccountState): void {
    const state = this.#enrichNames(rawState);
    const key = `${userId}|${state.a}`;
    this.#accountStates.set(key, this.#mergeAccountState(key, state));
    logger.info({ userId, accountNo: maskAccountNo(state.a), snap: state.snap, … }, "[HUB] 계좌 상태 수신");
    this.#fanout(userId, state);
  }

  /** **대상은 언제나 userId 하나**다. 전역 브로드캐스트 경로를 만들지 않는다 (T-15-02). */
  #fanout(userId: string, msg: RelayOutbound): void { this.emit("fanout", { userId, msg }); }
```

**⑤ 세션 교체 시 캐시 폐기** (`subscription-hub.ts:712~723`) — **3맵을 반드시 여기 추가**:
```ts
  #clearCaches(userId: string): void {
    const prefix = userPrefix(userId);
    for (const key of [...this.#quotes.keys()]) if (key.startsWith(prefix)) this.#quotes.delete(key);
    …
    for (const key of [...this.#accountStates.keys()]) if (key.startsWith(prefix)) this.#accountStates.delete(key);
```
누락하면 **재로그인 후 옛 전략이 화면에 남는다.** `stats()`(:392)·`closeAll()`(:406)에도 3맵을 더한다.

**⑥ 스냅샷 조회 getter** (`subscription-hub.ts:367~375`) — `getLimitChasers`/`getViTrigger`/`getViOrders` 가 이 형태:
```ts
  getAccountStates(userId: string): RelayAccountState[] {
    const prefix = userPrefix(userId);
    const out: RelayAccountState[] = [];
    for (const [key, state] of this.#accountStates) if (key.startsWith(prefix)) out.push(state);
    return out;
  }
```

---

### `relay/src/ws/fanout.ts` (controller, pub-sub)

**Analog:** 같은 파일. 삽입 지점 2곳이 이미 코드로 표시돼 있다.

**auth 직후 스냅샷 팬아웃** (`fanout.ts:427~429` — 전략 3프레임을 **이 루프 바로 뒤**에):
```ts
    // 잔고·미체결 캐시가 있으면 즉시 내린다 (D-23/D-37). 계좌 데이터는 종목 구독과
    // 무관하므로 `sub` 을 기다리지 않는다 — 기다리면 아무 종목도 열지 않은 탭이
    // 영원히 빈 잔고를 본다.
    for (const acct of this.#hub.getAccountStates(userId)) this.#send(conn, acct);
```

**인바운드 분기 + `unauthorized` 가드** (`fanout.ts:402~417`):
```ts
  #onAuthedMessage(conn: Conn, userId: string, msg: RelayInbound): void {
    if (msg.t === "auth") { logger.warn({ userId }, "[WS] 이미 인증된 연결의 재인증 시도 — 무시"); return; }

    if (conn.unauthorized) {
      logger.warn({ userId, t: msg.t }, "[WS] 권한 없는 사용자의 구독 요청 — 거부");
      this.#send(conn, { t: "state", s: "unauthorized" });
      return;
    }

    const key = keyOf(msg.isin, msg.ex);   // ⚠ RESEARCH Pitfall 14 — 이 줄을 sub/unsub 분기 안으로 밀어 넣는다
```
**⚠ `keyOf` 가 가드 직후 무조건 실행된다.** 전략·주문 메시지에는 `isin`/`ex` 가 없으므로 그대로 두면 `undefined` 키가 만들어진다. **전략/주문 분기는 `conn.unauthorized` 가드 바로 뒤 · `keyOf` 앞**이다.

**권한 없음 응답 패턴** (`fanout.ts:376~383`) — 전략·주문 메시지 거부도 같은 프레임(D-04):
```ts
    if (creds === null) {
      // 연결을 끊지 않는다 — 호가창이 "권한 없음" 배지를 그려야 한다 (D-12).
      conn.unauthorized = true;
      logger.warn({ userId }, "[WS] dma_credentials 미등록 — 연결 유지, 구독 거부");
      this.#send(conn, { t: "state", s: "unauthorized" });
      return;
    }
```

---

### wss 주문 핸들러 (신규) — service, request-response

**Analog:** `relay/src/order/order-api.ts:340~565`. **HTTP 껍데기만 벗기고 5단계 순서를 그대로 이식**한다(D-02).

**상관 자료구조 + 통보 소비** (`order-api.ts:277~283`, `:352~382`):
```ts
type PendingOrder = { orderRowId: string; isin: string; qty: number; timer: NodeJS.Timeout;
                      settle: (notice: ParsedOrderResp | null) => void };

/** userId → 대기 중인 주문 FIFO. 사용자별로 나누는 것이 상관의 1차 격리다. 그 안에서 ISIN 으로 다시 좁힌다. */
const pending = new Map<string, PendingOrder[]>();

deps.orders.on("order", ({ userId, notice }: HubOrderEvent) => {
  const queue = pending.get(userId);
  const index = queue?.findIndex((p) => p.isin === notice.isin) ?? -1;
  if (queue === undefined || index < 0) {
    // 접수 이후의 통보다. `order_no` 로 행을 좁혀 갱신한다 (A10 셀렉터 2순위).
    orderStore.enqueueUpdate({ orderNo: notice.orderNo, status: statusOf(notice, null), … });
    return;                          // ← D-03: 여기서 "행을 못 찾음" = 상따/VI 자동주문 → insert 분기 추가 지점
  }
  const [entry] = queue.splice(index, 1);
  if (queue.length === 0) pending.delete(userId);
  entry?.settle(notice);
});
```

**5단계 처리 순서** (`order-api.ts:400~560` — 번호 주석 ①~⑤ 를 그대로 옮긴다):
```ts
// ① 활성 Ready 세션이 있어야 한다. 여기서 대신 로그인하지 않는다 (D-15).
const session = deps.sessions.get(body.userId);
if (session === undefined || !session.isReady) { … "SESSION_NOT_READY" }

// ② **계좌 화이트리스트 대조** — relay 쪽 최후 방어선이다 (T-15-01 / D-20).
//    원천은 `session.allowedAccounts`(서버 응답과 대조된 목록)뿐이다.
const allowed = session.allowedAccounts.some((a) => a.accountNo === body.accountNo);
if (!allowed) { logger.error(logCtx, "…403"); … }

// ③ 취소는 원주문번호가 필수다.
// ④ 대기 등록을 **송신보다 먼저** 한다. 통보가 송신 직후 동기적으로 돌아오는
//    테스트·저지연 환경에서 순서가 뒤바뀌면 응답을 영원히 놓친다.
// ⑤ 송신. 실패하면 대기를 즉시 걷어낸다 — 5초를 기다릴 이유가 없다.
if (!session.send(payload)) { …큐에서 제거 + clearTimeout… }
```

**타임아웃 = 「결과 모름」** (`order-api.ts:461~473`) — 문구·의미를 **한 글자도 바꾸지 않고** `{t:"order.result", status:"timeout"}` 프레임으로 옮긴다:
```ts
if (notice === null) {
  // 5초를 넘겼다 = **"보냈는지 안 보냈는지 모른다"** (Pitfall 9). "실패"로 단정하지 않는다.
  orderStore.enqueueUpdate({ orderRowId: body.orderRowId, status: "timeout" });
  logger.error({ ...logCtx, timeoutMs }, "[order-api] 첫 주문 통보 미수신 — 결과 확인 필요");
  res.status(202).json({ error: { code: "ORDER_TIMEOUT",
    message: "주문 결과를 확인하지 못했습니다. 미체결 목록을 확인해 주세요." } });
  return;
}
```
`statusOf`(:246) · `filledQtyOf`(:272) 는 **순수함수라 그대로 import 해 재사용**한다(재작성 금지).
`timer.unref?.()` (:508) 도 유지 — 종료 절차가 5초 타이머에 매달리지 않게.

**로그 마스킹** (`order-api.ts:393~399`): `accountNo: maskAccountNo(body.accountNo)` — 화면은 전체, 로그는 마스킹(T-15-15).

---

### `relay/src/store/orders.ts` (model/store, CRUD)

**Analog:** 같은 파일의 update 경로 + `server/src/services/dma-orders.ts` 의 insert 경로. **둘을 합친다.**

**update sink** (`orders.ts:111~120`) — 그대로 유지:
```ts
export function supabaseOrderSink(supabase: SupabaseClient): OrderUpdateSink {
  return async (sel, patch) => {
    const { error } = await supabase.from("dma_orders").update(patch).eq(sel.column, sel.value);
    if (error) { logger.error({ error, column: sel.column }, "[orders] dma_orders update 실패"); throw error; }
  };
}
```

**insert 패턴** (이식 원본 — `server/src/services/dma-orders.ts` `insertOrderRequest`):
```ts
export async function insertOrderRequest(supabase: SupabaseClient, userId: string, payload: OrderRequestInsert): Promise<string> {
  const { data, error } = await supabase.from("dma_orders").insert({
      user_id: userId, account_no: payload.accountNo, isin: payload.isin, stock_code: payload.code,
      exchange: payload.exchange, market: payload.market, side: payload.side, order_type: payload.orderType,
      org_order_no: payload.orgOrderNo ?? null, qty: payload.qty, price: payload.price,
    }).select("id").single();
  if (error || !data) throw DbError("주문 기록에 실패했습니다.");
  return (data as { id: string }).id;
}
```
**⚠ insert 는 큐잉하지 않는다** — 반환 `id` 가 상관 1순위 키라 동기적으로 필요하다. **update 만 큐잉**(파일 상단 D-32 근거: 수신 콜백에서 Supabase 를 await 하면 게이트웨이 송신 큐가 차서 연결이 끊긴다).
**⚠ 파일 상단 「하지 않는 것: `insert` 를 하지 않는다. 행을 만드는 것은 server 다」 주석을 D-03 으로 뒤집는다.**
`origin` 컬럼 매핑은 `rowPatchOf`(:275, **camelCase↔snake_case 경계의 유일 지점**)에만 추가한다.

---

### `packages/shared/src/relay.ts` (model/계약, transform)

**Analog:** 같은 파일. 「타입 + 필드별 JSDoc + 유니온 append」 형태가 확정돼 있다.

**아웃바운드 프레임 타입 패턴** (`relay.ts:266~287`):
```ts
/** 계좌 상태 (`AccountState`) — 잔고·미체결 전량/델타. */
export type RelayAccountState = {
  t: "acct";
  a: string;
  /**
   * true=전량 교체, false=키 upsert + 0행/`rm` 제거.
   * 서버가 0/0 원소를 맵에서 지우므로 **수량 0 행이 곧 삭제 신호**다 …
   */
  snap: boolean;
  hold: RelayHolding[]; unf: RelayUnfilled[]; rm: string[]; st: string;
};
```
→ `{t:"lc.snap", items}` · `{t:"vi.list", snap, items}` 가 이 `snap` 규약을 그대로 승계한다.

**유니온 append 지점** (`relay.ts:104~105` 인바운드 / `:330~337` 아웃바운드):
```ts
export type RelayInbound = RelayAuthMsg | RelaySubMsg | RelayUnsubMsg;
export type RelayOutbound =
  | RelayStateMsg | RelayQuote | RelayTape | RelayAccountState | RelayOrderMsg | RelayServerMsg;
```
**⚠ 이름 충돌:** 기존 아웃바운드 `RelayOrderMsg.t === "order"`(:293). **인바운드는 `order.new`/`order.cancel`, 응답은 `order.result`** 로 둔다(RESEARCH Pitfall 15).
**⚠ 와이어는 전부 `number`** (D-34) — bigint 를 계약에 넣지 않는다. `protocol.ts` `encode`(:102)가 런타임에 throw 한다.
**⚠ 문서 주석 D-22(`POST /api/orders` 동기 응답)를 D-02 로 갱신한다.**

---

### `webapp/src/lib/relay-provider.tsx` (provider, pub-sub) — **신규**

**Analog(형태):** `webapp/src/hooks/use-watchlist-set.tsx` — Provider + 컨텍스트 + 훅 + 「Provider 밖 안전 폴백」.
**Analog(내용):** `webapp/src/lib/use-relay-socket.ts` — 연결·인증·리듀서를 **그대로 옮긴다**(재작성 금지).

**Provider 골격** (`use-watchlist-set.tsx:36~64`, `:105~126`):
```tsx
"use client";
export interface WatchlistSetValue { set: Set<string>; count: number; … }

const EMPTY_VALUE: WatchlistSetValue = { set: new Set<string>(), count: 0, … };
const WatchlistSetContext = createContext<WatchlistSetValue | null>(null);

export function WatchlistSetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();          // ← AuthProvider 안쪽 배치 요구의 근거
  …
  return <WatchlistSetContext.Provider value={value}>{children}</WatchlistSetContext.Provider>;
}

/**
 * Hook — Provider 바깥에서는 빈 Set + no-op 을 반환. 테스트 환경에서 Provider 없이도
 * WatchlistToggle 이 throw 하지 않도록 함.
 */
export function useWatchlistSet(): WatchlistSetValue { return useContext(WatchlistSetContext) ?? EMPTY_VALUE; }
```
**이 폴백 규율을 반드시 복사한다** — `RelayProvider` 없이 렌더되는 RTL 테스트(기존 `account-panel.test.tsx` 등)가 throw 하면 회귀가 난다.

**옮겨올 내용** (`use-relay-socket.ts:128~158` 반환 계약 · `:203~236` 리듀서 · `:237~290` `applyFrame`):
```ts
export interface RelaySocketState {
  status: RelayStatus; statusLabel: string; statusMessage: string; attempt: number;
  accounts: RelayAccount[]; quote: RelayQuote | null; tape: RelayTapeEntry[];
  account: RelayAccountState | null; orders: RelayOrderMsg[]; messages: RelayServerMessageEntry[];
  isStale: boolean;
  /** 구독 제어 전용 송신구. **주문을 여기로 보내지 않는다** — 주문은 REST 전용(D-08). */
  send: (msg: RelayInbound) => void;
  reconnect: () => void;
}
```
**⚠ 위 `send` JSDoc 이 D-02 로 뒤집힌다** — 주문·전략 메시지가 이 송신구로 나간다.

```ts
    default:
      // 알 수 없는 `t` 는 무시한다 — 서버가 앞서 나가도 브라우저가 터지지 않는다(T-15-41).
      return state;
```
→ **전략 프레임 5종(`lc`/`lc.snap`/`vi`/`vi.list`/`vi.notice`)을 `applyFrame` 에 case 로 추가**한다. 이 default 덕분에 구버전 브라우저는 안전하다.

**구독 ref-count**: `SubscriptionHub` 의 `#refs`(`subscription-hub.ts:168`) 규율을 브라우저에서 재현 — `Map<key, count>`, 0→1 에서만 `sub`, 1→0 에서만 `unsub`.
**소비자 교체**: `stock-orderbook-section.tsx:155` 의 `useRelaySocket({isin, exchange, enabled})` → `useRelaySubscription(...)` **한 줄**. 반환 형태를 동일하게 유지하면 나머지 499줄 무변경.

---

### `webapp/src/app/layout.tsx` (config)

**Analog:** 자기 자신 (:39~49).
```tsx
        <ThemeProvider>
          <AuthProvider>
            {/* ChatProvider 는 AuthProvider 안쪽 — FAB/시트가 useChat + useAuth 둘 다 소비. */}
            <ChatProvider>
              <WatchlistSetProvider>{children}</WatchlistSetProvider>
              <ChatFab /><ChatSheet />
            </ChatProvider>
          </AuthProvider>
        </ThemeProvider>
```
→ `AuthProvider > RelayProvider > ChatProvider > WatchlistSetProvider`. **주석으로 배치 근거(세션 필요 = Auth 안쪽)를 남기는 것까지 복사한다.**

---

### `webapp/src/components/layout/app-sidebar.tsx` (component, nav)

**Analog:** 자기 자신. **NAV 배열 + `data-nav-item` + `aria-current` 3점 계약**이 정본이며 트리로 바뀌어도 항목 레벨에서는 동일하다.

```tsx
const NAV = [
  { href: "/", label: "홈", icon: Home },
  { href: "/scanner", label: "스캐너", icon: Activity },   // → "상승률 상위" (D-15)
  …
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주 메뉴" className="flex h-full flex-col justify-between">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;         // ⚠ 정확 일치 — [key] 하위에서 부모 활성 표시하려면 startsWith 분기 필요
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} data-nav-item
                className={cn("flex items-center gap-2 rounded-[var(--r)] px-3 py-2 text-[length:var(--t-sm)]",
                  active ? "bg-[var(--accent)] text-[var(--accent-fg)] font-semibold"
                         : "text-[var(--muted-fg)] hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)] hover:text-[var(--fg)]")}>
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
```

**Drawer 자동 닫힘 계약** (`app-shell.tsx:68~84`) — 그룹 소제목을 `<button>` 으로 만들면 안 되는 이유가 여기다:
```tsx
              onClick={(e) => {
                // 내부 nav 링크/버튼 클릭 시 Drawer 자동 닫힘.
                let node: HTMLElement | null = e.target as HTMLElement;
                while (node && node !== e.currentTarget) {
                  const tag = node.tagName;
                  if (tag === 'A' || (tag === 'BUTTON' && node.hasAttribute('data-nav-item'))) {
                    setSheetOpen(false); return;
                  }
                  node = node.parentElement;
                }
              }}
```
→ 소제목은 `<li>` + 시각 스타일만(D-16 / UI-SPEC N2).

---

### `webapp/src/app/{trading/**,me}/page.tsx` (route)

**Analog:** `webapp/src/app/watchlist/page.tsx` — **22줄 전체가 템플릿이다.**
```tsx
'use client';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { WatchlistClient } from '@/components/watchlist/watchlist-client';

/**
 * `/watchlist` — 로그인 사용자의 관심종목 페이지.
 * … AppShell + AppSidebar 를 두르고 WatchlistClient 에서 모든 데이터/폴링/렌더 책임을 맡는다.
 */
export default function WatchlistPage() {
  return (<AppShell sidebar={<AppSidebar />}><WatchlistClient /></AppShell>);
}
```
→ 페이지는 **셸만**, 데이터·wss 소비는 전부 `*-client.tsx` 로 내린다. 동적 세그먼트는 `app/stocks/[code]/page.tsx` 를 참조하고 **`key` 는 `encodeURIComponent` 로 인코딩**한다(UI-SPEC P2).

---

### `webapp/src/components/trading/limit-chaser-form.tsx` (component/폼, request-response) — **신규**

**Analog:** `webapp/src/components/orderbook/order-panel.tsx`. 이 phase 에서 가장 많이 베낄 파일이다.

**파일 상단 규율 헤더** (`order-panel.tsx:3~40`) — 같은 형식으로 「이 파일의 존재 이유 = 오조작 방지」를 적는다:
```
 * ② ★ 오조작 방지 5규율 — 이 파일의 존재 이유 …
 *   1. **색·위치·문구 3중 일치** — 매수 = `--up`(빨강) · **왼쪽** 탭 · `매수`, …
 *   3. **확인 다이얼로그 필수** — 제출은 언제나 다이얼로그를 거친다. 기본 포커스는 취소다.
 *   4. **제출 후 즉시 재활성 금지** — 응답 전까지 비활성 + `주문 전송 중…` + 중복 제출 가드.
 * ④ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보)
 *   shadcn 의 기본 accent 파랑 토큰은 `--down`(매도 파랑)과 값이 **완전히 같다**. 그래서
 *   이 파일에는 그 토큰 이름이 **한 글자도 등장하지 않는다** …
 * ⑤ 토스트를 쓰지 않는다
```
**⚠ 상따 폼은 규율 3(확인 다이얼로그)이 D-05 로 뒤집힌다** — 스위치는 확인 없이 즉시. 그 예외를 헤더에 명시하고, 대신 「크기 44×26 + 최소 8px 간격」이 오터치 방어라고 적는다.

**모바일 매수/매도 세그먼트 탭** (`order-panel.tsx:426~449`) — UI-SPEC R7 의 탭이 이 마크업 그대로:
```tsx
        <div role="tablist" aria-label="매매 구분" className="grid grid-cols-2 gap-[var(--s-1)]">
          {(['B', 'S'] as const).map((s) => {
            const active = side === s;
            return (
              <button key={s} type="button" role="tab" aria-selected={active} onClick={() => setSide(s)}
                className={cn('h-8 rounded-[var(--r)] border text-[length:var(--t-sm)] font-semibold …',
                  active && s === 'B' && 'border-[var(--up)] bg-[var(--up-bg)] text-[var(--up)]',
                  active && s === 'S' && 'border-[var(--down)] bg-[var(--down-bg)] text-[var(--down)]',
                  !active && 'border-[var(--border)] bg-transparent text-[var(--muted-fg)] hover:bg-[var(--muted)]')}>
                {s === 'B' ? '매수' : '매도'}
```
**⚠ Radix `ToggleGroup` 을 쓰지 않는 이유가 주석(:422)에 있다** — 단일선택 ToggleGroup 은 `role="radio"` 를 강제해 `tablist`/`tab` 대응이 깨진다. 같은 판단을 상따 폼에도 적용한다.
**⚠ 비활성 pane 은 `hidden` 속성 + `[hidden]{display:none!important}`**(UI-SPEC R7 / RESEARCH Pitfall 13).

**라벨 컬럼 폼 행 + 네이티브 `<select>`** (`order-panel.tsx:451~473`) — `--lw` 72/60px 폼 행이 이 `FormRow` 의 변형:
```tsx
        <FormRow htmlFor="order-account" label="계좌">
          <select id="order-account" value={selectedAccountNo} onChange={(e) => onAccountChange(e.target.value)}
            disabled={accountOptions.length === 0}
            className="mono h-8 w-full min-w-0 rounded-[var(--r)] border border-[var(--input)] bg-[var(--bg)] px-2 text-[length:var(--t-caption)] text-[var(--fg)] disabled:opacity-50">
            {accountOptions.length === 0 ? <option value="">계좌 확인 중…</option>
              : accountOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </FormRow>
```
계좌 옵션 라벨 조립도 그대로: `` `${a.accountNo} · ${a.name}` `` (:400, 계좌번호 **전체 표시**).

**제출 가드 + 결과 3분류** (`order-panel.tsx:326~406`) — 스위치 즉시 전송·「수정」 전송이 이 구조를 쓴다:
```ts
  const handleSubmitClick = useCallback(() => {
    if (submitting || blocked) return;   // 중복 제출 가드 ①
    setConfirm({ mode: 'new', side, … });
  }, […]);

  const handleConfirmed = useCallback(async () => {
    if (submitting || blocked) return;   // 중복 제출 가드 ②
    setSubmitting(true); setConfirm(null); setResult(null);
    try {
      const res = await createOrder({ … });
      if (res.status === 'timeout') { setResult({ kind: 'unknown' }); setBlocked(true); }
      else if (res.status === 'rejected' || res.resultCode !== 0) { setResult({ kind: 'rejected', … }); }
      else { setResult({ kind: 'accepted', orderNo: res.orderNo }); }
    } catch (err) {
      if (isUnknownOutcome(err)) {
        // ★ 여기가 이 파일에서 가장 중요한 분기다. 결과를 모르면 잠근다.
        setResult({ kind: 'unknown' }); setBlocked(true);
```
**⚠ `createOrder(...)` 호출부가 D-02 로 wss 전송(`{t:"order.new", rid}` + `order.result` 대기)으로 바뀐다.** `isUnknownOutcome`/`orderErrorCode`/`orderErrorMessage`(`lib/orders-api.ts`)는 **유지·재사용**한다.

**권한 게이트** (`order-panel.tsx:409`):
```ts
  // 권한이 없으면 패널 자체를 렌더하지 않는다(주문 진입점 미노출, T-15-21).
  if (status === 'unauthorized') return null;
```
→ 상따/VI/My page 는 `null` 대신 `<DmaGate>` 를 렌더한다(D-19, UI-SPEC A14/B9/C6).

---

### `webapp/src/components/trading/vi-order-list.tsx` · My page 계좌 섹션 (component/표, event-driven)

**Analog:** `webapp/src/components/orderbook/account-panel.tsx`.

**Props 계약** (`account-panel.tsx:80~101`) — My page 계좌별 반복(D-21)이 이 컴포넌트를 N회 렌더한다:
```ts
export interface AccountPanelProps {
  accounts: RelayAccount[]; selectedAccountNo: string; onAccountChange: (accountNo: string) => void;
  account: RelayAccountState | null;
  code: string; name: string; isin: string | null; currentPrice?: number;
  /** 세션 상태. `ready` 가 아니면 표를 흐리고 취소를 막는다. */
  status: RelayStatus;
  onCancelSubmitted?: (res: CreateOrderResponse) => void; className?: string;
}
```
**⚠ `.rlist` 모바일 리플로우는 이 파일 안에 한 번만 넣는다**(UI-SPEC 재사용 표 — 상따·VI·My page 3표면 공유).
**⚠ My page 는 종목 축이 없다** — `code`/`name`/`isin`/`currentPrice` 를 optional 로 넓히거나 계좌 전용 모드 prop 을 더한다(재량).

**취소 잠금 + 행 단위 키** (`account-panel.tsx:120~172`):
```ts
  /** 결과를 모르는 취소가 나간 주문번호 — 다시 누를 수 없게 잠근다. */
  const [lockedOrderNos, setLockedOrderNos] = useState<ReadonlySet<string>>(new Set());
  …
      const res = await createOrder({
        // 그 **행의** 단축코드를 쓴다. 화면에 열려 있는 종목(`code`)을 쓰면 다른 종목의
        // 미체결을 취소할 때 엉뚱한 종목으로 취소가 나간다.
        code: row.code ?? code, …
        // 취소 수량은 **미체결 잔량 전부**다 (D-21). 부분 취소 경로는 만들지 않는다.
        qty: row.unfilledQty, price: row.price,
      });
      if (res.status === 'timeout') { setCancelResult({ kind: 'unknown' }); setLockedOrderNos((prev) => new Set(prev).add(row.orderNo)); }
```
→ VI 「확인 체크」(`ConfirmVIOrderReq 33`)의 `confirm_locked` 비활성도 **같은 `ReadonlySet<string>` 잠금 패턴**을 쓴다(D-10).

---

### `webapp/src/components/trading/{strategy-badge,strategy-log,dma-gate}.tsx` (component)

**Analog:** `webapp/src/components/orderbook/relay-status-bar.tsx`.

**Props + data-slot + data-status 계약** (`relay-status-bar.tsx:180~181` · props 블록):
```ts
export interface RelayStatusBarProps {
  status: RelayStatus; statusMessage?: string; attempt?: number;
  accounts?: RelayAccount[];
  /** ServerMessage 누적(최신 우선). 최근 3건만 렌더한다. */
  messages?: RelayServerMessageEntry[];
  lastTradeAt?: string; exchange?: RelayExchange; className?: string;
}
```
```tsx
      data-slot="relay-status-bar"
      data-status={status}
      …
        data-slot="relay-alerts"
              data-slot="relay-alert-row"
```
**`data-slot` + `data-status` 는 E2E 의 유일한 앵커다**(`orderbook.spec.ts:60~68`). 신규 컴포넌트도 전부 `data-slot="strategy-log"` / `data-slot="strategy-badge"` / `data-slot="dma-gate"` 를 갖는다.
**전략 로그(D-73 재량)는 `relay-alerts` 의 누적 리스트를 그대로 확장**한다 — 토스트 미도입(UI-SPEC D3), 상태 영역 누적 채널 하나.

**상태 배지 라벨 원천:** `RELAY_STATE_LABELS`(`@gh-radar/shared`) — 브라우저가 상태→문구 switch 를 중복 구현하지 않는 규약(shared `relay.ts:68`). **전략 상태 배지 6종도 같은 방식으로 shared 또는 `strategy-badge.tsx` 한 곳에 상수 맵을 둔다.**

---

### `supabase/migrations/2026____dma_orders_origin.sql` (migration)

**Analog:** `supabase/migrations/20260905120200_dma_orders.sql`. **머리말 주석 + BEGIN/COMMIT + 보안 3줄** 전체 형식.

**보안 boilerplate (필수 복사 — 자동 메모리 `feedback_supabase_rpc_revoke`)** (`20260905120200_dma_orders.sql` 말미):
```sql
-- 서비스롤 전용: dma_credentials 와 동일 구성 (RLS 활성 + 접근 규칙 0개 = default deny).
ALTER TABLE public.dma_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.dma_orders FROM PUBLIC;
REVOKE ALL ON public.dma_orders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_orders TO service_role;

COMMIT;
```
**⚠ `origin` 컬럼 추가 마이그레이션은 위 3줄을 다시 실행하지 않는다** — 테이블 단위 권한이 이미 확정이고 정책도 추가하지 않는다(RESEARCH §Supabase). 새 파일은 `BEGIN;` + `ALTER TABLE … ADD COLUMN origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','limit_chaser','vi'));` + `COMMIT;` 와 **머리말 주석**(결정 근거 D-03 / 함정 / 하지 않는 것)만 갖는다.
**머리말 주석 형식** (`:1~44`) — `Phase NN Plan NN — REQ-ID: 무엇 (D-xx)` / `결정 근거:` / `함정:` / `하지 않는 것:` 4블록.
**⚠ `supabase db push` 는 [BLOCKING] 게이트다** (Phase 15 15-09 선례).

---

### E2E — `webapp/e2e/specs/trading-*.spec.ts` · `me.spec.ts` · `sidebar-tree.spec.ts`

**Analog:** `webapp/e2e/specs/orderbook.spec.ts` (+ `webapp/e2e/fixtures/relay.ts`).

**spec 골격** (`orderbook.spec.ts:1~72`):
```ts
import { test, expect, type Page } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { DMA_MSG, RELAY_WS_URL, withLocalRelay, type LocalRelay } from '../fixtures/relay';

/**
 * ③ 왜 serial 인가
 *   relay wss 포트는 8090 **고정**이다 … 워커 2개가 같은 포트를 잡으면 즉시 EADDRINUSE 다.
 *   그래서 파일 전체를 직렬로 고정하고 relay 를 `beforeAll` 한 번만 띄운다.
 */
test.describe.configure({ mode: 'serial' });

const statusBar = (page: Page) => page.locator('[data-slot="relay-status-bar"]');
const ladder = (page: Page) => page.locator('[data-slot="orderbook-ladder"]');

async function waitForReady(page: Page): Promise<void> {
  await expect(statusBar(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
}

test.describe('…', () => {
  let relay: LocalRelay;
  test.beforeAll(async () => { relay = await withLocalRelay(); });
  test.afterAll(async () => { await relay.stop(); });
  test.beforeEach(async ({ page }) => { relay.reset(); await setupStockDetail(page); });
```
**⚠ 8090 고정 포트 직렬화(RESEARCH Pitfall 20):** 신규 spec 4개가 각자 `withLocalRelay()` 를 띄우면 **파일 간에도 EADDRINUSE 가 난다.** `mode:'serial'` 은 파일 **내부**만 직렬화한다 — planner 는 신규 spec 을 하나의 `test.describe` 로 묶거나 Playwright 프로젝트 단위 직렬화를 plan 에 명시해야 한다.
**⚠ 실서버 리터럴 0건** — KB 게이트웨이 IP 를 spec·픽스처·주석 어디에도 적지 않는다(D-27 / acceptance grep).

**픽스처 확장 지점** (`fixtures/relay.ts:88~109` `LocalRelay` 인터페이스, `:269` `pushQuoteFixture`):
```ts
export interface LocalRelay {
  readonly wsUrl: string;
  seedDmaCredential(userId?: string): void;
  clearDmaCredentials(): void;
  requestLog(): number[];
  setRespondingExchanges(exchanges: readonly string[]): void;
  reset(): void; logs(): string; stop(): Promise<void>;
}
```
→ `respondLimitChaserList` · `pushLimitChaserEcho` · `respondViTrigger` · `pushViOrderList` · `pushOrderResp` 를 `relay/tests/helpers/fake-gateway.ts`(`pushQuote`:94 · `respondLogin`:76 형태)에 먼저 만들고 여기 노출한다.

---

### RTL 테스트 — `webapp/src/components/trading/__tests__/*.test.tsx`

**Analog:** `webapp/src/components/orderbook/__tests__/account-panel.test.tsx`.

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * 잠그는 규칙:
 *   - 미체결 잔량 0 행에는 취소 버튼이 **없다**(③) — 반드시 거부되는 버튼은 오조작을 부른다
 *   - 취소도 확인 다이얼로그를 거치고 기본 포커스는 닫기다(④)
 *   - 취소 버튼은 채움이 아니라 테두리다(⑥) — `--destructive` == `--up` 충돌
 *   - 계좌번호는 마스킹 없이 전체 표시한다(⑨, D2)
 */
const createOrderMock = vi.fn();
vi.mock('@/lib/orders-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/orders-api')>();
  return { ...actual, createOrder: (...args: unknown[]) => createOrderMock(...args) };
});

function accountState(over: Partial<RelayAccountState> = {}): RelayAccountState { … }
```
복사할 규율: ① **「잠그는 규칙」 목록을 파일 상단에 명시** ② `vi.mock` + `importOriginal` 부분 모킹 ③ **팩토리 함수 + `Partial<T>` override** 로 픽스처 생성.
**⚠ `createOrder` 모킹이 D-02 후에는 `RelayProvider` 의 `send` 모킹으로 바뀐다** — 전략 폼 테스트는 컨텍스트 주입형 모킹이 필요하다(재량).

---

## Shared Patterns

### S-1. 파일 상단 「결정 근거 / 함정 / 하지 않는 것」 3블록 주석

**Source:** `relay/src/dma/msg-type.ts:1~20` · `relay/src/store/orders.ts:1~31` · `supabase/migrations/20260905120200_dma_orders.sql:1~44`
**Apply to:** 이 phase 의 **모든 신규 파일**

```
/**
 * Phase 15 Plan 16 — RELAY-02. `dma_orders` **비동기 갱신 큐** (D-24 / D-32).
 *
 * 이 모듈의 존재 이유는 하나다: **DMA 수신 콜백에서 Supabase 를 await 하지 않는 것.**
 * …
 * 결정 근거:
 *   D-24  주문 기록은 Supabase `dma_orders` + relay stdout 두 벌이다. …
 *   S-5   실패는 **반드시 로그와 카운터를 남긴다.** 조용한 드롭 금지. …
 *
 * 하지 않는 것:
 *   - `insert` 를 하지 않는다. 행을 만드는 것은 server 다 …
 */
```
저장소 전체가 이 형식이다. **「하지 않는 것」이 특히 중요하다** — Phase 16 은 Phase 15 의 「하지 않는 것」 3건(protocol 주문 미수신 / msg-type 전략 제외 / orders insert 금지)을 뒤집으므로, **뒤집는 커밋마다 그 문장을 새 근거로 교체**해야 문서와 코드가 갈리지 않는다.

### S-2. 조용한 실패 금지 (자동 메모리 `feedback_silent_failure_max_tokens`)

**Source:** `relay/src/dma/envelope.ts:154~172` (`drop`/`dropField`) · `subscription-hub.ts:452`
**Apply to:** relay 전략 파서·변환·거부 전 경로
```ts
      case MSG.GetQuoteResp: {
        const quote = parseQuoteState(e.env, …);
        // null 이면 파서가 이미 사유·카운터를 남겼다 — 여기서 다시 로그하지 않는다.
        if (quote !== null) this.#onQuote(userId, quote);
```
**규율:** 드롭은 **한 곳에서만** 로그 + 카운터. 상위는 재로그하지 않는다. `ServerMessage(54)` ERROR·전략 변환 실패는 **브라우저 상태 영역과 pino 양쪽**에 남긴다(CONTEXT 운영 규칙).

### S-3. userId 단일 대상 팬아웃 (T-15-02)

**Source:** `subscription-hub.ts:708~711` · `fanout.ts:504` `#deliver`
```ts
  /** **대상은 언제나 userId 하나**다. 전역 브로드캐스트 경로를 만들지 않는다 (T-15-02). */
  #fanout(userId: string, msg: RelayOutbound): void { this.emit("fanout", { userId, msg }); }
```
**Apply to:** 전략 에코·스냅샷·주문 결과 전부. 전송 경로를 두 벌 만들면 한쪽이 대상 선택을 틀리는 순간 타인의 전략·체결이 샌다.

### S-4. 계좌 화이트리스트 = `session.allowedAccounts` (T-15-01 / D-20)

**Source:** `order-api.ts:410~420`
```ts
// ② **계좌 화이트리스트 대조** — relay 쪽 최후 방어선이다 (T-15-01 / D-20).
//    원천은 `session.allowedAccounts`(서버 응답과 대조된 목록)뿐이다. 상태 프레임의
//    계좌 사본이나 요청 바디를 근거로 삼으면 IDOR 이 그대로 열린다.
const allowed = session.allowedAccounts.some((a) => a.accountNo === body.accountNo);
```
**Apply to:** `order.new`/`order.cancel` **및 `lc.set`/`vi.set`**(전략도 계좌를 지정한다 — D-02 형식 검사 동형).

### S-5. 계좌번호 — 화면 전체, 로그 마스킹 (D2 / T-15-15)

**Source:** `order-api.ts:395` `maskAccountNo(body.accountNo)` · `account-panel.test.tsx` 「계좌번호는 마스킹 없이 전체 표시한다(⑨, D2)」
**Apply to:** 상따 계좌 `<select>`, My page 계좌 카드 헤더, 전략 행 계좌번호(전부 `.mono` 전체 표시) / relay·server 로그(전부 마스킹).

### S-6. `--destructive` == `--up` · `--primary` == `--down` 토큰 충돌

**Source:** `order-confirm-dialog.tsx:17~24`
```
 * ③ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보)
 *   `--destructive` 와 `--up`(매수)의 oklch 값이 **완전히 같다**. 그래서 취소 버튼을
 *   채움 빨강 variant 로 만들면 매수 주문 버튼과 시각적으로 구분되지 않는다.
 *   취소는 반드시 **테두리 + `--destructive` 텍스트 + `✕`**(투명 배경)다.
 *   … 실행 버튼의 글자색에는 shadcn 기본 accent 전경 토큰 대신 값이 완전히
 *   동일한 `--destructive-fg`(light #FFFFFF / dark oklch(0.10 0 0))로 대체한다
```
**Apply to:** 「전체 비활성화」·「중지」·「전체 취소」·「✕ 취소」 = 전부 테두리형(UI-SPEC C5). 「시작」·「수정」 채움 버튼의 글자색 = `--destructive-fg`.

### S-7. 확인 다이얼로그 — 기본 포커스는 취소

**Source:** `order-confirm-dialog.tsx:88~112`
```tsx
  /** 기본 포커스 대상(취소/닫기). 실행 버튼에 포커스가 가면 Enter 한 번에 주문이 나간다. */
  const dismissRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = async () => {
    if (!detail || busy) return; // 중복 제출 가드 — 연타해도 한 번만 나간다.
    setBusy(true); setError(false);
    try { await onConfirm(); }
    catch { setError(true); }   // 부모가 인라인 배너로 그리지만 여기서도 삼켜 unhandled rejection 을 막는다
    finally { setBusy(false); }
  };
  …
      <DialogContent showCloseButton={false} …>
```
**Apply to:** UI-SPEC D6 의 확인 다이얼로그 **4개**(VI 시작 · VI 중지 · 전체 비활성화 · 미체결 전체취소). `detail !== null` 제어형 · `showCloseButton={false}` · `onOpenAutoFocus` 가로채기까지 그대로.

### S-8. 「결과 모름」은 실패가 아니다 (Pitfall 9)

**Source:** `order-api.ts:461~473` · `order-panel.tsx:378~381` · `lib/orders-api.ts` `UNKNOWN_OUTCOME_CODES`
**Apply to:** wss 주문 결과(`order.result`), VI/상따 자동주문 통보 표시, `dma_orders.status='timeout'`.
「실패」라는 단어를 쓰지 않고, 미체결 확인을 안내하며, **제출 버튼을 다시 열지 않는다.**

### S-9. E2E 앵커는 `data-slot` / `data-status` / `data-testid`

**Source:** `relay-status-bar.tsx:180`, `orderbook-ladder.tsx:251,365`, `order-panel.tsx:412`
**Apply to:** 신규 컴포넌트 전부. UI-SPEC 이 요구하는 `role="switch"` / `role="tablist"` / `role="progressbar"` / `aria-current` 는 **접근성 계약이자 E2E 셀렉터**다.

### S-10. 그리드 자식 `min-width:0` (tasks/lessons.md 등재)

**Source:** UI-SPEC R8 · `.lc3` / `.lc2` / `.acct-grid`
**Apply to:** 신규 3표면의 **모든 그리드 자식**. 누락 시 `overflow-hidden` 아래에서 스크롤이 아니라 **조용한 잘림**이 된다(목업 R2 ① 회귀 원인).

---

## No Analog Found

| File | Role | Data Flow | Reason | 대안 |
|------|------|-----------|--------|------|
| `components/trading/dirty-action-bar.tsx` | component | — | 하단 고정 액션 바가 저장소에 없다. sticky/fixed 하단 바 선례 0건 | UI-SPEC A10/B4(높이 56px·모바일 96px·`--primary` 상단선) 를 정본으로. 인라인 배너 형태는 `order-panel.tsx` `ResultBanner` 참조 |
| VI 110/119초 데드라인 진행바 | component | 시간축 | `progress` 미설치 + 카운트다운 UI 선례 0건 | UI-SPEC B6 (`role="progressbar"` 단일 div, ≥20초 `--muted-fg` / <20초 `--destructive`). 타이머는 `use-relay-socket.ts` 의 `stale` 타이머(:555~) 형태 |
| VI 마감알림 (Notification API + localStorage) | utility | event-driven | 저장소에 Notification API 사용처·localStorage 설정 키 선례 0건 | 네임스페이스 `gh-radar:vi-alert` 권고(RESEARCH). 권한 요청 시점·`vi_end_time` 타이머는 Claude 재량 |
| 사이드바 3단 전략 목록 원 아이콘 (10px×2) | component | — | 기존 사이드바에 상태 인디케이터가 없다 | UI-SPEC N3 (`role="img"` + `aria-label="매수 켜짐 · 매도 꺼짐"`, ON=채움 / OFF=1.5px 속빔) |

> 위 4건은 전부 **시각 계약이 UI-SPEC 에 픽셀 단위로 확정**돼 있다. 「analog 없음」이 「자유롭게 만들라」는 뜻이 아니다 — 목업 3건이 정본이다(UI-SPEC 머리말: **본 문서와 목업이 어긋나면 목업이 정본**).

---

## Metadata

**Analog search scope:**
`relay/src/**` · `relay/tests/**` · `packages/shared/src/**` · `webapp/src/{app,components,lib,hooks}/**` ·
`webapp/e2e/{specs,fixtures}/**` · `server/src/{routes,services}/**` · `supabase/migrations/**`

**Files scanned:** 38 (전문 읽기 9 · 타깃 구간 읽기 17 · 구조 스캔 12)

**Pattern extraction date:** 2026-09-08

**planner 를 위한 핵심 3줄:**
1. **relay 3층은 전부 「같은 파일의 계좌 상태 경로」를 복제**한다 — 캐시 맵 / `#onReady` 프리페치 / `#onFrame` case / `#clearCaches` / auth 직후 스냅샷. 새 아키텍처를 제안하는 plan 은 근거를 대야 한다.
2. **주문 wss 이관은 재작성이 아니라 이식**이다. `statusOf`·`filledQtyOf`·5단계 순서·타임아웃 문구를 **그대로 옮기고 HTTP 껍데기만 벗긴다.**
3. **Phase 15 가 「하지 않는다」고 못 박은 3개 주석**(`protocol.ts:18` · `msg-type.ts:19` · `orders.ts:26)을 뒤집는 것이 이 phase 의 코드 표면 대부분이다. 뒤집는 커밋에서 **그 주석을 새 근거로 교체**하지 않으면 다음 phase 가 반대로 읽는다.
