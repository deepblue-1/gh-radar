---
phase: quick-260923-dmb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
  - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/exchange-tag.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
autonomous: true
requirements: [DMB-01, DMB-02]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "작업대 VI 칩 줄의 첫 칩(가장 왼쪽)과 펼친 VI 발동 표의 첫 행이 가장 최근 발동이다. 72 스냅샷이 오래된 순(게이트웨이 원순서)으로 와도 마찬가지다 (D2 · DMB-02)"
    - "73 델타로 새 발동이 오면 칩 맨 앞 · 표 맨 위로 들어간다. 이미 있는 행의 갱신(확인·체결·접수 전→접수)은 자리가 바뀌지 않는다. 정렬 키가 발동마다 고정된 deadline110Ms 라서다 (D2 · DMB-02)"
    - "칩·표 시각(HH:MM[:SS])은 위에서 아래로(왼쪽에서 오른쪽으로) 줄어든다. 정렬 키가 화면 시각의 원천(acceptedClock = deadline110Ms − 110초)과 같은 필드다 (D2)"
    - "사이드바 「트레이딩」 아래 VI 는 한 줄이고 라벨은 「VI」다. 오른쪽에는 가동 중인 거래소의 ExchangeTag 만 선다 — KRX 만 / NXT 만 / 둘 다(KRX → NXT 순). 옛 「가동」 배지 글자는 없다 (D1 · DMB-01)"
    - "KRX·NXT 가 둘 다 꺼짐·미등록·모름이면 VI 줄이 DOM 에 없다(숨김이 아니라 미렌더). VI 도 전략도 없으면 빈 3단 목록 요소도 그리지 않는다 (D1 · DMB-01)"
    - "VI 줄의 접근 가능한 이름이 가동 거래소를 말한다 — 「VI — KRX 가동」 / 「VI — NXT 가동」 / 「VI — KRX·NXT 가동」. 링크는 /trading 이고 aria-current 를 받지 않는다 (D1)"
    - "VI 확인 체크 · 110초 타이머 · 낙관 반영 · vi.confirm 송신은 동작이 바뀌지 않는다 (D3)"
  artifacts:
    - path: "webapp/src/lib/use-relay-socket.ts"
      provides: "sortViOrdersNewestFirst — vi.list 리듀서의 72 교체 · 73 병합 두 갈래를 모두 최신순으로 정렬하는 유일한 정렬기"
      contains: "sortViOrdersNewestFirst"
    - path: "webapp/src/components/trading/exchange-tag.tsx"
      provides: "ExchangeTag 원자 컴포넌트(KRX 테두리형 · NXT 채움형) — 사이드바·VI 표·VI 설정·계좌 패널 공용"
      exports: ["ExchangeTag"]
    - path: "webapp/src/components/layout/app-sidebar.tsx"
      provides: "트레이딩 3단의 VI 한 줄(가동 거래소 태그만) · 둘 다 꺼지면 미렌더"
      contains: "data-sidebar-item=\"vi\""
    - path: "webapp/e2e/specs/trading-workbench.spec.ts"
      provides: "GC2 — 실브라우저에서 VI 칩 첫 칩·표 첫 행이 최신 발동, 73 신규는 맨 앞, 73 갱신은 자리 유지"
    - path: "webapp/e2e/specs/sidebar-tree.spec.ts"
      provides: "VI 한 줄 e2e — 61 에코로 KRX/NXT 가동을 켜고 끄며 태그 집합과 줄 미렌더를 본다"
  key_links:
    - from: "webapp/src/lib/use-relay-socket.ts (relayReducer case vi.list)"
      to: "webapp/src/components/trading/workbench/vi-trigger-strip.tsx"
      via: "viOrders(정렬 끝난 배열) → trading-workbench → ViTriggerStrip items → 칩 줄 + ViOrderList(workbench)"
      pattern: "sortViOrdersNewestFirst\\("
    - from: "webapp/src/components/layout/app-sidebar.tsx"
      to: "webapp/src/components/trading/exchange-tag.tsx"
      via: "viTriggers[ex]?.run === true 인 거래소만 ExchangeTag 로 그린다"
      pattern: "ExchangeTag"
---

<objective>
사용자 요청 두 건을 한 번에 처리한다.

1. **작업대 VI 발동 목록을 최신순으로** (D2 · DMB-02) — 접힌 칩 줄은 가장 최근 발동이 **맨 왼쪽**, 펼친 표는 **맨 위**에 온다.
2. **사이드바 VI 한 줄** (D1 · DMB-01) — 「KRX VI」·「NXT VI」 두 줄을 「VI」 한 줄로 합친다. 오른쪽에는 가동 중인 거래소의 ExchangeTag 만 둔다. 둘 다 꺼져 있으면 줄을 그리지 않는다.

**D2 근본 원인 (코드로 확인함 — 실행자가 다시 조사할 필요 없음):** 최신순 정렬을 하는 층이 **하나도 없었다.**
- (a) gh-trade 게이트웨이의 72 스냅샷은 `VIOrderWatch::Snapshot` 이 `m_items` 벡터를 **생성 순서**대로 담은 것이다 (`/Users/alex/repos/gh-trade/server/src/trade/strategy/VIOrderWatch.cpp:691`). 즉 오래된 것이 먼저다.
- (b) relay `#onViOrderList` 는 72·73 을 **받은 그대로** 팬아웃한다. 캐시 `#viOrders` Map 도 삽입 순서 그대로다 (`relay/src/hub/subscription-hub.ts:1290-1310`). 돌파 목록에는 `sortRateCrossNewestFirst` 가 있지만 VI 에는 짝이 없다.
- (c) webapp `mergeViOrders` 는 Map 을 upsert 한다. 기존 키는 자리를 지키고 **새 키는 맨 뒤에 붙는다**. 접수 전→접수 전이는 자리표시 키를 지우고 주문번호 키로 다시 넣으므로 이것도 맨 뒤로 간다 (`webapp/src/lib/use-relay-socket.ts:692-704`).
- (d) 표시층 두 곳(`vi-trigger-strip.tsx` ④ · `vi-order-list.tsx:607`)의 주석은 최신순을 서버 병합기의 몫이라고 적어 두었다. 그러나 (a)(b) 어디에도 그 정렬은 없다.

결과적으로 화면은 「오래된 것 먼저 + 새로 온 것은 끝」 순서였다. **클라이언트 정렬만으로 충분하고, 사실 그곳이 유일하게 가능한 자리다.** 73 은 바뀐 행만 싣고 오므로 전체 순서는 목록을 병합하는 쪽에서만 알 수 있다. 72 교체와 73 병합이 모두 `relayReducer` 의 `case "vi.list"` 하나를 지나므로 그 한 곳에서 정렬한다. relay 는 바꾸지 않는다(D2 — relay 배포는 사용자 게이트).

**정렬 키:** `deadline110Ms` 내림차순이다. 와이어에는 수신 시각 필드가 없다. gh-trade 는 이 값을 발동(접수 전 생성) 시점에 VI 해제 예정시각에서 **한 번** 계산하고 뒤에 미루지 않는다(연장 시에도 그대로). 그래서 행마다 고정된 값이다. 화면 시각 `acceptedClock` 도 같은 필드에서 역산하므로, 정렬 결과와 사용자가 보는 시각이 어긋나지 않는다. 동률을 깨는 규칙은 Task 1 에 적었다.

Purpose: 트레이더가 방금 발동한 VI 를 칩 줄 맨 앞에서 바로 본다. 사이드바는 VI 가 켜진 거래소만 한 줄로 말한다.
Output: 리듀서 정렬기 + 테스트, 사이드바 VI 한 줄 + ExchangeTag 원자 분리, e2e 2건 갱신/추가.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@webapp/src/lib/use-relay-socket.ts
@webapp/src/components/trading/workbench/vi-trigger-strip.tsx
@webapp/src/components/trading/vi-order-list.tsx
@webapp/src/components/layout/app-sidebar.tsx

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 필요한 계약을 옮겨 둔다. -->

packages/shared/src/relay.ts — `RelayViOrderItem`: isin, exchange('KRX'|'NXT'), market, accountNo, orderNo(''=접수 전), orderQty, orderPrice, triggerPrice, basePrice, viEndTime('HHMMSSuuu'), deadline110Ms(epoch ms number), deadline119Ms, confirmed, confirmLocked, state('Pending'|'Accepted'|'Cancelling'|'Cancelled'|'Filled'|'Rejected'), filledQty, name?
`RelayViListMsg = { t: "vi.list"; snap: boolean; items: RelayViOrderItem[] }`

webapp/src/lib/use-relay-socket.ts
- `relayReducer` 의 `case "vi.list"` (≈L573): 지금은 `viOrders: frame.snap ? frame.items : mergeViOrders(state.viOrders, frame.items)`
- `export function viOrderKey(item)` (≈L677): orderNo 가 있으면 orderNo, 없으면 `@ISIN:계좌:발동가:거래소`
- `function mergeViOrders(prev, incoming)` (≈L693): Map upsert. 새 키는 끝에 붙는다
- 선례: `sortRateCross` / `upsertRateCross` (≈L615-645). 돌파 목록 최신순 정렬이 리듀서 안에서 private 함수로 사는 모양이다. 훅 테스트로 잠근다 (`webapp/src/lib/__tests__/relay-socket.test.ts:1001` describe `rate.cross 순서`, `render()`/`connected()`/`ws.push()` 헬퍼)
- `RelayData.viOrders` 문서 주석 (≈L262), `rateCrossItems` 문서 주석 (≈L272-279, 정렬 계약을 적는 선례)

webapp/src/components/trading/vi-order-list.tsx
- `export function ExchangeTag({ exchange, size = 'sm' })` (≈L116-146, JSDoc 포함). `data-slot="exchange-tag"`, `data-exchange`, sm=h-[18px] · md=h-5, NXT=accent 채움 · KRX=테두리
- `export function acceptedClock(deadline110Ms)` — `deadline110Ms <= 0` 이면 null(시각 모름)
- 외부 import 처: `webapp/src/components/orderbook/account-panel.tsx:145`, `webapp/src/components/trading/workbench/vi-settings-rows.tsx:87` (둘 다 `@/components/trading/vi-order-list` 에서 가져온다)

webapp/src/components/layout/app-sidebar.tsx
- `VI_ROWS: readonly RelayExchange[] = ["KRX","NXT"]` (L100), `ViItem` (L236-256), 3단 `<li><ul className={SUB_LIST}>` 렌더 (≈L370-395), 헤더 트리 주석 (L39-42, ② L51-54)
- `useRelayContext()` → `viTriggers: Partial<Record<RelayExchange, RelayViTrigger | null>>` (키 부재 = 모름, null = 미등록)
- 사이드바는 작은 원자만 import 한다(`strategy-badge.tsx`, `latch-led.tsx`). 앱 셸 전체 페이지 번들에 실리기 때문이다

e2e 픽스처
- `relay.seedViTrigger(cfg)` — 61 자동 응답. 거래소를 보지 않고 같은 cfg 를 준다. exchange 를 생략하면 KRX 로 정규화된다. 그래서 NXT 는 모름으로 남는다
- `relay.gateway.waitForConnection(ms)` + `relay.gateway.sendFrame(sock, buildSetVITriggerRespFrame({...cfg, exchange:'NXT', run:true}))` — 61 에코를 거래소 지정으로 밀어 넣는다(`trading-workbench.spec.ts:167` `pushViEcho` 선례. import 는 `'../../../relay/tests/helpers/frames.js'`)
- `relay.seedViOrders(items)` (72) / `relay.pushViOrderList(items, snap)` (72·73). 픽스처 기본 deadline110Ms 는 **프레임 조립 시각 + 110초로 한 프레임 안의 모든 행이 같다** → 명시하지 않은 시드는 전부 동률이다
- 시드 fixture 순서: `VI_ORDERS`(trading-workbench.spec:80) · `A11Y_VI_ORDERS`(a11y.spec:187) 는 모두 주문번호 내림차순이고 접수 전 행이 마지막이다
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): VI 발동 목록 최신순 — 리듀서 한 곳에서 정렬하고 실브라우저 칩·표로 증명 (D2 · DMB-02)</name>
  <files>webapp/src/lib/use-relay-socket.ts, webapp/src/lib/__tests__/relay-socket.test.ts, webapp/src/lib/__tests__/relay-provider.test.tsx, webapp/src/components/trading/workbench/vi-trigger-strip.tsx, webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx, webapp/src/components/trading/vi-order-list.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <behavior>
    relay-socket.test.ts 에 새 describe 「vi.list 순서 — 최신 발동이 맨 앞 (quick-260923-dmb)」를 추가한다. 훅을 `render()` → `connected()` → `ws.push({t:'vi.list', ...})` 로 구동하고 `hook.result.current.viOrders` 를 본다. `RelayViOrderItem` 팩토리는 `vi-trigger-strip.test.tsx:35` 의 `item()` 필드 구성을 그대로 옮긴다.
    - ① 72 가 오래된 순 [A(t+10s), B(t+50s), C(t+90s)] 으로 와도 viOrders 는 [C, B, A] 다. 이때 frame.items 배열 자체의 순서는 바뀌지 않는다(제자리 정렬 금지)
    - ② 73 이 더 늦은 D(t+100s) 를 싣고 오면 D 가 0번이 된다. 73 이 가장 오래된 A 의 갱신(confirmed:true, 같은 deadline)을 싣고 오면 A 는 끝자리를 지킨다. 도착 순서가 아니라 시각이 자리를 정한다
    - ③ 접수 전 행(orderNo '', deadline t+70s)이 있을 때 같은 발동이 주문번호를 달고 73 으로 오면(isin·계좌·발동가·거래소·deadline 모두 같다. 자리표시 키가 걷히는 조건이다) 행은 1개이고, 끝으로 밀리지 않고 시각 순 자리에 있다
    - ④ 동률(같은 deadline): 주문번호 있는 행이 먼저이고 그 안에서는 주문번호 내림차순이다. 주문번호 없는(접수 전) 행은 그 뒤다. deadline110Ms 가 0 이하(시각 모름)인 행은 시각을 아는 모든 행 뒤다
  </behavior>
  <action>
    **use-relay-socket.ts (per D2):**
    - `mergeViOrders` 옆에 private 순수 함수 `sortViOrdersNewestFirst(list: readonly RelayViOrderItem[]): RelayViOrderItem[]` 를 추가한다. 입력을 복사한 뒤 정렬하고, 입력 배열은 절대 바꾸지 않는다. 비교 규칙은 차례대로 다음과 같다.
      (1) `deadline110Ms` 내림차순. 0 이하는 「시각 모름」으로 보고 시각을 아는 모든 행 뒤에 둔다. 모르는 행을 맨 위에 두면 최신이라고 거짓말하게 된다.
      (2) 동률이면 주문번호가 있는 행이 먼저다. 둘 다 있으면 주문번호 내림차순, 즉 늦게 접수된 것이 앞이다. 주문번호가 빈 접수 전 행은 뒤다. 이것도 「모르는 값은 최신이라고 주장하지 않는다」는 (1)과 같은 원칙이다.
      (3) 그래도 같으면 `viOrderKey` 내림차순이다. 병합 뒤 키는 유일하므로 여기서 전순서가 완성된다.
      문자열 비교는 모두 **코드 단위 비교**(`<`/`>`)로 한다. `localeCompare` 는 쓰지 않는다. 로케일 비의존이 목적이고, `acceptedClock` 이 로케일 포맷터를 쓰지 않는 것과 같은 규율이다.
    - 이 함수의 JSDoc 에 objective 의 근본 원인 (a)~(c)를 요약한다(게이트웨이 72 = 생성 순, relay = 받은 그대로, 병합 = 새 키 끝). 정렬이 relay 가 아니라 이곳에 있는 이유도 적는다: 73 은 바뀐 행만 오므로 전체 순서는 병합하는 쪽만 안다. 키 선택 근거도 적는다: 와이어에 수신 시각이 없고, gh-trade 가 발동 시 한 번 계산해 미루지 않으며, 화면 시각 `acceptedClock` 과 같은 필드다. 돌파 목록의 `sortRateCross` 와 짝이라는 점도 한 줄 남긴다.
    - `case "vi.list"`: 72 교체 갈래와 73 병합 갈래 **둘 다** 결과를 `sortViOrdersNewestFirst` 에 통과시킨다. 정렬은 이 리듀서 한 곳뿐이다.
    - `RelayData.viOrders` 문서 주석(≈L262)에 정렬 계약을 적는다. `rateCrossItems` 주석과 같은 모양으로 쓴다: 최신 발동이 맨 앞, 키는 deadline110Ms, 표시 컴포넌트는 이 순서를 그대로 쓰고 다시 정렬하지 않는다. `mergeViOrders` 주석에는 「자리는 신경 쓰지 않는다 — 순서는 호출부 정렬이 정한다」를 더한다.

    **표시층 주석 정정 (코드 동작 변경 없음 — D3):**
    - `vi-trigger-strip.tsx` 헤더 ④ 를 다시 쓴다. 이 파일은 여전히 정렬도 역순도 하지 않는다. 받은 배열이 이미 최신순이다(칩 맨 왼쪽 · 표 맨 위). 그 정렬은 `use-relay-socket` 리듀서의 `sortViOrdersNewestFirst` 한 곳(72·73 두 갈래)이 정한다. 여기서 다시 정렬하면 칩과 표가 두 규칙으로 갈릴 수 있다고 적는다. 서버가 최신순을 맡는다던 옛 주장은 지운다(사실이 아니었다). `ViTriggerStripProps.items` 주석은 참조 번호를 ④로 바로잡고 「리듀서가 최신순으로 정렬한 배열 — 받은 순서 그대로 그린다」로 쓴다.
    - `vi-order-list.tsx` 의 `WorkbenchViTable` ★ 행 순서 주석(≈L607)도 같은 식으로 고친다: `rows` 순서 그대로이고, 최신순 정렬은 리듀서 몫이며 여기서 재정렬하지 않는다.
    - `vi-trigger-strip.test.tsx`: 헤더 ⑥ 과 describe/it 문구에서 「relay 배열 순서」를 「받은 배열 순서 그대로(정렬은 리듀서 한 곳 — 컴포넌트 재정렬 0회)」로 바꾼다. **단언 본문은 그대로 둔다.** 이중 정렬을 막는 가드로 여전히 유효하다.

    **relay-provider.test.tsx ⑥-c (≈L656):** 이 케이스는 도착 순서를 암묵적으로 잠그고 있었다. 테스트 목적(델타는 교체가 아니라 upsert)은 유지한다. A2 에 A1 보다 늦은 `deadline110Ms` 를 명시하고, 기대 문자열을 최신순인 'Pending,Accepted' 로 바꾼다. 이유 주석을 한 줄 단다(quick-260923-dmb 최신순). ⑥-d 는 건드리지 않는다.

    **e2e (trading-workbench.spec.ts):** GC1 바로 뒤에 새 케이스 「GC2 VI 발동 목록은 가장 최신 발동이 맨 앞(칩)·맨 위(표) — 73 신규는 맨 앞, 73 갱신은 자리 유지 (quick-260923-dmb)」를 넣는다.
    - 준비: `relay.seedViTrigger(VI_CFG)`. 테스트 안에서 `t0 = Date.now()` 로 시각을 명시한 72 두 건을 **오래된 순**으로 시드한다. A = E2E_ISIN, orderNo '0032001', Accepted, triggerPrice 41_250, basePrice 33_510, deadline110Ms t0+50s, deadline119Ms t0+59s. B = E2E_LONG_NAME_ISIN, orderNo '0032002', Accepted, triggerPrice 98_400, basePrice 80_000, deadline110Ms t0+80s. 둘 다 accountNo E2E_ACCOUNT_NO. deadline 은 BigInt 다.
    - goto → `waitForReady`. 칩 2개가 뜨면 첫 칩에 '한국제7호기업인수목적우선주식회사', 둘째 칩에 '삼성전자' 를 단언한다. 이어 `openViTable` 로 표를 열고 `[data-slot="vi-order-row"]` 첫 행·둘째 행도 같은 순서인지 본다.
    - `relay.pushViOrderList([C], false)`: C = E2E_ISIN, orderNo '0032003', Accepted, triggerPrice 55_500, basePrice 45_000, deadline110Ms t0+105s. 칩 3개, 첫 칩과 표 첫 행에 '55,500' 이 있어야 한다.
    - `relay.pushViOrderList([{...A, confirmed: true}], false)`: 마지막 칩과 표 마지막 행에 여전히 '41,250' 이 있어야 한다.
    - 종목명 역매핑이 없는 ISIN 은 쓰지 않는다(라벨이 보조 마스터 결선에 따라 달라질 수 있다). 기존 케이스 24·25·a11y 의 VI 시드는 한 프레임 동률이다. 그래서 (2) 규칙상 fixture 순서(주문번호 내림차순, 접수 전 마지막)가 그대로 유지된다. **수정하지 않는다.** 실패하면 이 전제부터 다시 확인한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts src/lib/__tests__/relay-provider.test.tsx src/components/trading/__tests__/vi-trigger-strip.test.tsx src/components/trading/__tests__/vi-order-list.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && ! grep -rn '「최신 위」는 서버' webapp/src && pnpm --filter @gh-radar/webapp exec playwright test trading-workbench a11y</automated>
  </verify>
  <done>새 describe 4케이스가 GREEN이다. 정렬을 되돌리면 ①②③ 이 실패하는지 실행자가 한 번 확인한다(RED 관측). relay-provider ⑥-c 가 최신순 기대로 통과한다. typecheck 가 exit 0 이다. 서버가 최신순을 맡는다는 옛 주석은 src 에 0건이다. Playwright trading-workbench + a11y 는 0 failed 이고 GC2 가 포함된다. 한글 커밋 1건을 만든다(명시 경로만 stage, Co-Authored-By 없음, push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 사이드바 VI 한 줄 — 가동 거래소 ExchangeTag 만, 둘 다 꺼지면 미렌더 (D1 · DMB-01)</name>
  <files>webapp/src/components/trading/exchange-tag.tsx, webapp/src/components/trading/vi-order-list.tsx, webapp/src/components/layout/app-sidebar.tsx, webapp/src/components/layout/__tests__/app-sidebar.test.tsx, webapp/e2e/specs/sidebar-tree.spec.ts, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <behavior>
    app-sidebar.test.tsx 를 다음 계약으로 다시 쓴다(`viCfg()` 픽스처 재사용, 기본 viTriggers 는 비어 있다 = 모름).
    - KRX 만 run → 3단 `data-sidebar-item` 순서가 ["vi","strategy","strategy"]이다. VI 링크 이름은 'VI — KRX 가동', `[data-slot="exchange-tag"]` 의 data-exchange 는 ["KRX"], href 는 /trading, aria-current 는 없다(pathname /trading 에서도)
    - NXT 만 run → ["NXT"], 이름 'VI — NXT 가동'
    - 둘 다 run → ["KRX","NXT"](viTriggers 객체 키를 NXT 먼저 넣어도 KRX 먼저), 이름 'VI — KRX·NXT 가동'
    - 둘 다 run:false / null / 키 부재 → `[data-sidebar-item="vi"]` 0개이고 /^VI/ 이름 링크도 0개다. 전략은 그대로 있다
    - 전략 0 + VI 꺼짐 → 트레이딩 제목 다음 형제에 3단 `ul` 이 없다(빈 목록 미렌더). 전략 0 + KRX run → ["vi"]만 있고 빈 문구·스피너는 없다
    - VI 줄 안에 「가동」 글자 노드와 strategy-badge 슬롯이 없다(텍스트는 'VI' + 태그 글자뿐)
  </behavior>
  <action>
    **ExchangeTag 원자 분리 (Claude 재량):** `ExchangeTag` 를 JSDoc 째로 새 파일 `webapp/src/components/trading/exchange-tag.tsx` 로 옮긴다. 이 파일은 `cn` 과 `RelayExchange` 타입만 import 하고 'use client' 지시어를 두지 않는다(`strategy-badge.tsx` 와 같은 순수 표시 원자). 사이드바는 앱 셸에 실려 모든 페이지 번들에 들어간다. 그래서 체크박스·표·relay 훅을 끌고 오는 957줄짜리 `vi-order-list.tsx` 를 사이드바에서 import 하지 않으려는 것이 분리 이유다. JSDoc 의 「같은 조각을 쓴다」 목록에 사이드바 VI 줄을 더한다. `vi-order-list.tsx` 는 내부 사용을 위해 새 파일에서 import 하고, **같은 이름으로 re-export** 한다. 그래야 기존 import 처 2곳(account-panel · vi-settings-rows)이 무수정으로 산다. 미사용이 된 import(예: `RelayExchange` 타입)가 생기면 정리한다.

    **app-sidebar.tsx (per D1):**
    - `VI_ROWS` 를 `VI_TAG_ORDER` 로 바꾸고 주석을 「VI 줄 태그의 거래소 순서 — KRX 먼저(목업 `.asb` 순서 승계)」로 쓴다.
    - `AppSidebar` 에서 `viRunning = VI_TAG_ORDER.filter((ex) => viTriggers[ex]?.run === true)` 를 계산한다. 판정은 옛 배지와 같은 거래소별 진실이다. 합집합 판정 `viAnyRunning` 은 쓰지 않는다.
    - `ViItem` 은 `{ running: readonly RelayExchange[] }` 를 받는 한 줄로 다시 쓴다. `Link` href 는 `NAV_TRADING.href` 이고, `data-nav-item`, `data-sidebar-item="vi"`, className 은 `cn(SUB_ITEM, LINK_IDLE)` 다. `aria-label` 값은 「VI — 」 + running 을 가운뎃점(·, U+00B7)으로 이은 문자열 + 「 가동」이다(예: 「VI — KRX·NXT 가동」). aria-current 는 달지 않는다(헤더 ②). 본문은 두 요소다. 첫째는 「VI」 텍스트 span 으로, 기존 `min-w-0 flex-1 truncate text-[var(--fg)]` 를 유지한다. 둘째는 오른쪽 `ml-auto inline-flex shrink-0 items-center gap-1` 묶음이다. 이 묶음은 `aria-hidden="true"` 이고(이름은 aria-label 이 말한다) 안에 `running.map` 으로 `<ExchangeTag exchange={ex} />`(size sm)을 둔다. 보이는 글자 「VI」가 이름 맨 앞에 있어 WCAG 2.5.3 Label-in-Name 을 충족한다.
    - 옛 줄별 「가동」 배지 경로와 strategy-badge 모듈 import 를 지운다. 사이드바에서 더는 쓰지 않는다. `ExchangeTag` 는 `@/components/trading/exchange-tag` 에서 import 한다.
    - 3단 렌더: VI 줄은 `viRunning.length > 0` 일 때만 `<li>` 로 그린다. 3단 `<li><ul className={SUB_LIST}>` 자체는 `viRunning.length > 0 || limitChasers.length > 0` 일 때만 그린다. 빈 `ul` 은 스크린리더에 「목록 0개」로 읽히고 mt-1 빈 틈과 빈 hairline 을 남기기 때문이다(손보는 표면 안의 시각 결함이므로 바로 고친다). My page 링크는 그대로다.
    - 주석 갱신: 헤더 트리 줄(≈L41)을 「[트레이딩 = `/trading` 링크] VI(가동 거래소 태그만 · 둘 다 꺼지면 없음) / 등록된 상따 전략 N개」로 바꾼다. ②의 「3단 항목(VI 2 · 전략 N)」은 「(VI 0~1 · 전략 N)」으로 바꾼다. `ViItem` JSDoc 은 새 계약으로 다시 쓴다: 거래소별 판정, KRX→NXT 순, 모름·미등록·중지는 태그 없음, 둘 다 없으면 줄 없음, 접근 이름 형식. 3단 JSX 주석(「VI 2항목 + 등록 전략 N개 … VI 2항목만 남고」)은 「VI 0~1줄 + 전략 N개, 둘 다 없으면 3단 목록 자체가 없다」로 바꾼다. 주석에 옛 거래소별 항목 id 문자열을 적지 않는다(아래 음성 grep 게이트 대상이다).

    **app-sidebar.test.tsx:** 헤더 ④⑤⑦ 설명을 새 계약으로 바꾼다. `<behavior>` 의 케이스로 기존 ②·④·⑤·⑦ VI 단언을 교체한다. ②(로그인+ready 렌더)는 VI 를 켠 상태로 VI 링크 존재를 보거나, VI 단언을 빼고 트레이딩·My page 만 본다. ③-a 비로그인에서 /VI/ 링크 0 단언은 유지한다. ④ 의 「개별 VI 메뉴 없음」 단언은 /^VI$/ 정확 이름 링크 0개로 유지해도 된다. 새 링크 이름은 'VI — …' 이라 걸리지 않는다. 다만 주석을 「옛 `/trading/vi` 메뉴」 의미로 분명히 한다.

    **sidebar-tree.spec.ts:** beforeEach 는 VI 를 시드하지 않는다. 따라서 케이스 1·4 의 트리에는 VI 줄이 없다.
    - `TREE_LINKS` 에서 두 VI 항목을 빼고 주석을 「링크 7개 · 전략 3건은 「트레이딩」과 「My page」 사이」로 바꾼다. 케이스 1 의 slice 경계를 5 로 옮기고, 케이스 1 에 `[data-sidebar-item="vi"]` 0개 단언을 더한다. 옛 「VI 두 항목은 작업대로 간다」 루프는 지운다. 케이스 4 의 「링크 9개」 주석을 7개로 바꾼다(계산식은 그대로 맞는다).
    - `linkOrder` 는 `data-sidebar-item="vi"` 를 'VI' 로 접는다. 옛 「가동」 꼬리 제거 정규식은 지운다. 헤더 ⑤ 설명도 새 트리로 바꾼다.
    - 새 케이스 「1b. VI 한 줄 — 가동 거래소 태그만, 둘 다 꺼지면 줄 없음 (quick-260923-dmb)」를 넣는다. 먼저 `relay.seedViTrigger({ accountNo: E2E_ACCOUNT_NO, orderAmountKrw: 10_000_000n, checkRate: 22, priceType: 'U', run: true })` 로 KRX 만 가동한다(`E2E_ACCOUNT_NO` 는 `../fixtures/relay` 에서 import). goto('/trading') → `waitForTradingGroup`. VI 줄이 보이고 href 는 /trading, aria-current 는 없다. 태그 data-exchange 는 ['KRX'], `toHaveAccessibleName('VI — KRX 가동')` 이고, `linkOrder` 에서 'VI' 가 '트레이딩' 바로 뒤다.
    - 이어 `buildSetVITriggerRespFrame`(`'../../../relay/tests/helpers/frames.js'`)로 61 에코를 보낸다(`relay.gateway.waitForConnection` + `sendFrame`). NXT run:true → ['KRX','NXT'] 이고 이름은 'VI — KRX·NXT 가동'. KRX run:false → ['NXT']. NXT run:false → VI 줄 0개. 각 단계는 `expect.poll` 또는 `toHaveCount`/`toHaveAttribute` 자동 재시도(timeout 15s)로 기다린다.

    **trading-workbench.spec.ts (사이드바 단언 2곳만):** 케이스 20(≈L1445-1446)은 VI 미가동이므로 사이드바 VI 줄이 0개인지 본다. 주석은 「사이드바 VI 줄은 가동 거래소가 없어 없다」다. 케이스 22(≈L1527-1529)는 에코 후 사이드바 VI 줄 안에 data-exchange="KRX" 태그가 1개, "NXT" 태그가 0개인지 본다. 이 두 곳 말고는 건드리지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/components/layout/__tests__/app-sidebar.test.tsx src/components/trading/__tests__/vi-order-list.test.tsx src/components/trading/__tests__/vi-settings-rows.test.tsx src/components/trading/__tests__/vi-trigger-strip.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/components/layout/app-sidebar.tsx src/components/trading/exchange-tag.tsx src/components/trading/vi-order-list.tsx && ! grep -nE 'StrategyBadge|viBadgeOf' webapp/src/components/layout/app-sidebar.tsx && ! grep -rnE 'vi-(KRX|NXT)' webapp/src/components/layout webapp/e2e/specs && pnpm --filter @gh-radar/webapp exec playwright test sidebar-tree trading-workbench a11y</automated>
  </verify>
  <done>사이드바 단위 테스트가 새 계약으로 GREEN이다. 옛 거래소별 VI 항목 id 는 layout·e2e 에 0건이고, 사이드바에 badge import 도 0건이다. ExchangeTag 는 새 파일에서 export 되고 기존 import 처 2곳은 무수정으로 통과한다. typecheck·eslint 는 exit 0 이다. Playwright sidebar-tree(1b 포함) + trading-workbench + a11y 는 0 failed 다. 한글 커밋 1건을 만든다(명시 경로만 stage, Co-Authored-By 없음, push 없음).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay → browser (wss) | vi.list · vi 프레임. 이번 변경은 이미 받은 값의 **표시 순서**와 **표시 형태**만 바꾼다. 새 입력·새 송신·새 권한 경로는 없다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dmb-01 | Tampering (무결성 — 오표시) | use-relay-socket `sortViOrdersNewestFirst` | low | mitigate | 입력 배열을 제자리에서 바꾸지 않는다(복사 후 정렬 · 테스트 ①이 frame.items 순서 불변을 단언). 병합 키 규칙(viOrderKey)은 그대로라 행 합치기·중복 제거가 바뀌지 않는다. 정렬은 표시 순서만 바꾸고 낙관 반영 Map(orderNo 키)에는 영향이 없다 |
| T-dmb-02 | Spoofing/UX 안전 (행 이동 중 오클릭) | 작업대 VI 표 확인 체크 | medium | accept | 사용자 결정(최신 위)의 필연적 결과다. 새 발동이 들어오면 기존 행이 한 칸 내려간다. 체크는 클릭 시점 그 행의 orderNo 로 나가고(D3 불변), confirm_locked 전에는 다시 눌러 되돌릴 수 있다(e2e 25 가 잠근 경로). 갱신(73)은 자리를 바꾸지 않으므로 이동은 신규 발동 때만 일어난다 |
| T-dmb-03 | Information Disclosure | 사이드바 VI 줄 | low | accept | 노출 정보는 옛 「가동」 배지와 같다(거래소별 run). 노출 조건 `useTradingVisible`(로그인 ∧ ready 래치)은 그대로다. UI 숨김은 권한이 아니다(헤더 ④) — 실제 차단은 relay unauthorized · DmaGate 다 |
| T-dmb-04 | Denial of Service | 정렬 비용 | low | accept | 하루 VI 주문은 수십 건 규모다. 프레임마다 O(n log n) 정렬은 기존 Map 병합과 같은 차수다 |
</threat_model>

<verification>
- `pnpm --filter @gh-radar/webapp exec vitest --run` 로 두 Task 의 대상 파일을 돌린다. 마지막에는 webapp 전체 vitest 를 1회 돌려 회귀가 0인지 본다(기준선은 직전 quick 기준 1467 passed / 1 skip + 이번 신규).
- `pnpm --filter @gh-radar/webapp run typecheck`(src + e2e tsconfig) exit 0.
- Playwright `sidebar-tree trading-workbench a11y` 0 failed. dev 포트는 3100 이다(`playwright.config.ts` webServer 가 `PORT=3100 pnpm dev` 를 쓰고 reuseExistingServer 다). relay 픽스처 포트는 8090 고정이다. 다른 세션이 e2e 를 동시에 돌리고 있으면 포트가 충돌하므로 끝날 때까지 기다렸다가 다시 돌린다.
- 동작 불변 확인(D3): 확인 체크·110초 타이머·vi.confirm 관련 기존 케이스(e2e 24·25·26, vi-order-list.test)가 수정 없이 통과한다.
</verification>

<success_criteria>
- 작업대: 칩 줄 맨 왼쪽과 펼친 표 맨 위가 가장 최근 VI 발동이다. 새 발동은 맨 앞으로 들어오고 갱신은 자리를 지킨다.
- 사이드바: 「VI」 한 줄에 가동 거래소 태그만 보인다(KRX / NXT / KRX·NXT). 둘 다 꺼지면 줄이 없다.
- relay 코드 변경 0줄(D2). 확인·타이머 동작 변경 0(D3).
- 커밋 2건(Task별)은 한글 메시지로 쓴다. `git add` 는 명시 경로만 하고, 직전에 `git status` 를 다시 확인한다(동시 세션: 260923-cqj 미추적 디렉터리 · `.planning/debug/trading-cpu-260923.md` 를 휩쓸지 않는다). Co-Authored-By 는 없고 push 도 없다.
</success_criteria>

<output>
Create `.planning/quick/260923-dmb-vi-vi/260923-dmb-SUMMARY.md` when done — 근본 원인(a~d) · 정렬 규칙 · 커밋 해시 · 테스트 수치(vitest/Playwright) · RED 관측 결과를 기록한다.
</output>
