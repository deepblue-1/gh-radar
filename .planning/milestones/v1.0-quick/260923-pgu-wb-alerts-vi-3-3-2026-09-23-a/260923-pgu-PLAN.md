---
phase: quick-260923-pgu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/trading-alerts.ts
  - webapp/src/lib/use-trading-alerts.ts
  - webapp/src/lib/__tests__/trading-alerts.test.ts
  - webapp/src/lib/__tests__/use-trading-alerts.test.tsx
  - webapp/src/components/trading/workbench/alert-toasts.tsx
  - webapp/src/components/trading/__tests__/alert-toasts.test.tsx
  - webapp/src/components/trading/card/card-tabs.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/__tests__/card-tabs.test.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
  - webapp/src/styles/globals.css
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [PGU-A, PGU-B, PGU-C, PGU-D]

must_haves:
  truths:
    - "새 `order` 프레임(nt A/E/M/C/R)·`vi.notice`·76 `rate.cross` 단건이 오면 작업대 우하단(폰은 상단 전폭)에 토스트가 서고, 마운트 시점에 이미 있던 항목·78 스냅샷·재접속 첫 스냅샷은 알리지 않는다 (PGU-A)"
    - "주문 통보의 종목·계좌·방향·이름은 본 적 있는 모든 `accountStates.*.unf` 행으로 만든 `orderNo` 색인으로 조인한다 — 행이 전량 체결로 사라져도 색인은 남고, `org`(원주문)로도 푼다. 색인에 없으면 최대 1.5초 보류 뒤 이름 자리에 「주문 {No}」 (PGU-A)"
    - "같은 `orderNo` 의 체결이 `MERGE_WINDOW_MS`(3000) 안에 오면 한 토스트에 `N건` 배지·`filledQty` 누적·TTL 재시작. accept/cancel 등 다른 종류는 묶지 않는다 (PGU-A)"
    - "토스트는 `role=\"status\" aria-live=\"polite\"` 컨테이너, TTL 6초(폰 4초)·호버 정지·이탈 2.5초·최대 4개(오래된 것부터 제거)·등장 180ms(`motion-reduce` 존중)·✕ 닫기. 라이브러리 없음, 앱 셸 아님, `/trading` 작업대 루트 안에만 (PGU-B)"
    - "토스트 클릭 → 해당 카드 펼침(없으면 추가)·스크롤·탭 요청(accept/modify/cancel/reject→미체결, fill→잔고 있으면 잔고 없으면 미체결, vi/breakout→로그, 새로 만든 카드면 정보)·토스트 닫힘·헤더 표시 해제 (PGU-B)"
    - "이벤트가 난 카드는 `data-alert=\"true\"` — 헤더 3회 펄스 뒤 종목명 옆 빨간 점 + 카드 외곽 `--primary` 45% 링. 헤더 토글 또는 토스트 클릭으로 지워진다. `alertedCardIds` 는 작업대가 소유한다 (PGU-C)"
    - "게이트: `pnpm --filter @gh-radar/webapp run typecheck` 0 · `run test` 전량 초록 · Playwright `trading-workbench` spec 0 fail · 새 의존성 0(`pnpm-lock.yaml` 변경 0) (PGU-D)"
  artifacts:
    - path: "webapp/src/lib/trading-alerts.ts"
      provides: "`TradingAlert` 타입 · `orderAlertKind` · `indexUnfilled` · `resolveOrderEntry` · `alertFromOrder/Vi/Breakout` · `mergeAlert` · `newRateCrossAlerts` · `alertTitle/alertSubtitle/alertIcon` · `alertTabFor` 순수 함수"
      contains: "export function mergeAlert"
    - path: "webapp/src/lib/use-trading-alerts.ts"
      provides: "`useTradingAlerts` 훅 — WeakSet 중복 방지 · 색인 유지 · 1.5초 보류 · 소리(기록 먼저)"
      contains: "export function useTradingAlerts"
    - path: "webapp/src/components/trading/workbench/alert-toasts.tsx"
      provides: "`AlertToasts` 컴포넌트(`data-slot=\"alert-toasts\"` · `role=\"status\"`) + `ToastItem` 타이머"
      contains: "aria-live=\"polite\""
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "훅 배선 · `alertedCardIds` · `tabRequest` · `openAlert` · `cardForAlert` 순수 함수 · `<AlertToasts>` 마운트"
      contains: "export function cardForAlert"
    - path: "webapp/src/components/trading/card/card-tabs.tsx"
      provides: "`CardTabRequest` 타입 + `requestedTab` prop 으로 탭 전환 통로"
      contains: "requestedTab"
    - path: "webapp/src/styles/globals.css"
      provides: "keyframes `wb-toast-in` · `wb-toast-drain` · `wb-hdr-pulse` + `[data-slot=\"strategy-card\"][data-alert=\"true\"]` 규칙 + reduced-motion"
      contains: "wb-hdr-pulse"
  key_links:
    - from: "`useRelayContext()` 의 `orders` · `viNotices` · `rateCrossItems` · `rateCrossSnapSeq` · `accountStates`"
      to: "`useTradingAlerts` → `alerts` 상태"
      via: "WeakSet(객체 정체성) 으로 새 프레임만 · `rateCrossSnapSeq` 변화 렌더는 무알림 · `indexUnfilled` 는 add-only"
    - from: "토스트 클릭 `onOpen(alert)`"
      to: "`withCardOpen` · `setScrollTarget({ key })` · `setTabRequest` · `alertedCardIds` 해제 · `dismiss(id)`"
      via: "workbench `openAlert` — 카드 `open` 변경은 p3k `withCardOpen` 단일 경로"
    - from: "workbench `tabRequest` 상태"
      to: "`StrategyCard.requestedTab` → `CardTabs.requestedTab` → `setTab`"
      via: "`{ tab, seq }` 객체 — `seq` 가 바뀔 때만 효과가 탭을 바꾼다(사용자 클릭은 그대로 로컬 state)"
---

<objective>
작업대 이벤트 알림(2026-09-23 목업 ③ 변형 A): 접수·체결·정정확인·취소확인·거부·VI 발동·돌파(76 단건)를 우하단(폰 상단) 토스트 스택으로 띄우고, 같은 주문 체결은 3초 창으로 묶고, 이벤트가 난 카드 헤더는 3회 펄스 뒤 빨간 점·링으로 남기며, 토스트 클릭이 카드를 펼쳐 해당 탭으로 데려간다.

**결정 갱신.** Phase 15 D-36 · Phase 18 D-27 「토스트 라이브러리 없음 — 인라인 role=status」 를 사용자가 2026-09-23 목업 게이트에서 **의도적으로 뒤집었다**(③A 채택). 라이브러리는 여전히 추가하지 않고(자체 구현) 컨테이너 `role="status"`/`aria-live="polite"` 는 지킨다. 카드 안 `CardNotices` 6초 인라인 배너(`card/strategy-card.tsx` `ECHO_BANNER_MS`)는 그대로 둔다 — 그것은 **카드 자기 상태**이고 이번 토스트는 **이벤트**다.

Purpose: 트레이더가 다른 카드를 보고 있어도 체결·거부·VI 를 놓치지 않고, 한 번 클릭으로 그 카드의 맞는 탭에 닿는다.
Output: `trading-alerts.ts`(순수) · `use-trading-alerts.ts`(훅) · `alert-toasts.tsx` · 작업대/카드 탭 배선 · CSS · vitest 4벌 + 작업대 통합 · Playwright 1건.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260923-pgu-wb-alerts-vi-3-3-2026-09-23-a/wb-card-tabs-alerts-mockup.html

정본 코드(줄 번호 대신 **이름**으로 가리킨다 — quick-260923-p3k 가 `trading-workbench.tsx` 를 먼저 편집했다):
- `packages/shared/src/relay.ts` — `RelayOrderMsg`(t:"order" · `no`·`nt`·`rc`·`msg`·`org`·`p`·`q`·`x`·`bd?`·`rk?`·`rq?` — **isin·계좌·종목명 없음**, `p` 는 E 통보에서 체결가) · `RelayUnfilled`(`orderNo`·`orgOrderNo`·`isin`·`side`·`price`·`orderQty`·`filledQty`·`unfilledQty`·`exchange`·`name?`·`code?`) · `RelayAccountState`(`hold`·`unf`) · `RelayViNoticeMsg`(`isin`·`exchange`·`accountNo`·`triggerPrice`·`basePrice`·`changeRate`·`viEndTime` 9자 `HHMMSSuuu`·`name?`) · `RelayRateCrossItem`(`isin`·`exchange`·`lastPrice`·`changeRate` double·`name?`·`code?`) · `RelayRateCrossMsg`/`RelayRateCrossSnapMsg`
- `webapp/src/lib/use-relay-socket.ts` — `applyFrame`: `orders` prepend cap 50 · `viNotices` prepend cap 50 · `rate.cross` upsert / `rate.cross.snap` 전량 교체 + `rateCrossSnapSeq++` · `mergeAccount` 는 `unfilledQty === 0` 행을 **저장 전에 버린다**(전량 체결 행은 상태에 남지 않는다 — 그래서 색인이 필요하다)
- `webapp/src/lib/relay-provider.tsx` — `useRelayContext()` 가 위 5개 상태를 그대로 노출 · `EMPTY_RELAY_VALUE`
- `webapp/src/lib/order-notices.ts` — `orderActionWord` · `orderActionSide` · `orderNoticeLabel(facts)` · `MERGE_WINDOW_MS = 3000` (문구 인자 없음 — `RelayOrderMsg.msg` 는 표시만, D-08)
- `webapp/src/lib/alert-tone.ts` `playBreakoutTone()`(토글 `readTonePref` 를 스스로 본다) · `webapp/src/lib/breakout-list.ts` `breakoutKey(item)` · `newBreakoutsToAnnounce`
- `webapp/src/components/trading/workbench/breakout-strip.tsx` ④ 「기록 먼저, 재생 나중」 · `snapSeq` 로 78 무음
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — `WorkbenchCard` · `withCardOpen(prev, id, open)`(p3k · `open` 변경 단일 경로) · `isinFocusCardOf` · `cardForUnfilled` · `WorkbenchSurface`(`cards`/`setCards`/`cardsRef`/`nextCardId`/`setScrollTarget({key}|{isin})`/`focusCard`/`addCard`/`toggleCard`/`removeCard`/`closeCard`/`selectUnfilled`/`labelsRef`/`accountNo`) · `WorkbenchCardItem`(memo · `StrategyCard` 로 prop 전달) · 루트 `<div ref={rootRef} data-slot="trading-workbench">`
- `webapp/src/components/trading/card/strategy-card.tsx` — `StrategyCardProps` · `StrategyCardImpl` 의 `<article data-slot="strategy-card" data-key data-open>` → `<CardHeader …>` → `<div data-slot="strategy-card-body" hidden={!open}>{everOpened && <CardTabs …/>}` · `export const StrategyCard = memo(StrategyCardImpl)`
- `webapp/src/components/trading/card/card-tabs.tsx` — `CardTab = "info"|"unfilled"|"holdings"|"log"` · `CardTabsProps` · `useState<CardTab>("info")` + Radix `Tabs value/onValueChange`
- `webapp/src/components/trading/card/card-header.tsx` — `<header data-slot="card-header">` · 종목명 `<b data-part="name">` (변경 없음 — CSS 로만 점을 붙인다)
- `webapp/src/styles/globals.css` — 토큰 `--primary`·`--led-armed`·`--led-latent`·`--destructive`·`--new-bd`·`--flat`·`--card`·`--border`·`--muted`·`--accent` · 기존 keyframes 는 `skeleton-shimmer` 뿐 · §3.6 뒤 `@media (prefers-reduced-motion: reduce)` 블록
- `webapp/src/components/trading/__tests__/trading-workbench.test.tsx` — `mockRelay = relay({...})` + `rerender(<TradingWorkbench />)` 패턴 · `StubCard`(실제 StrategyCard 렌더 안 함 · `cardProps` Map 에 prop 기록) · `@/lib/alert-tone` 은 이미 `vi.mock`
- `webapp/e2e/fixtures/relay.ts` — `relay.pushAccountState({...})` · `relay.pushOrderResp({ orderNo, noticeType, isin, side, price, quantity, exchange, requestKind })`(`FakeOrderRespInput`) · `E2E_ISIN`·`E2E_ACCOUNT_NO`
</context>

<tasks>

<!-- planner-discipline-allow: AlertToasts -->
<!-- `AlertToasts` 는 컴포넌트 이름이라 action 에 반드시 나온다. Task 2 의 negative grep 은 app/layout.tsx(앱 셸)에 마운트되지 않았음을 확인하는 게이트다. -->

<task type="auto" tdd="true">
  <name>Task 1: 이벤트 모델 순수 lib + `useTradingAlerts` 훅 (색인 조인 · 3초 묶음 · 중복/이력 방지 · 1.5초 보류 · 소리)</name>
  <files>webapp/src/lib/trading-alerts.ts, webapp/src/lib/use-trading-alerts.ts, webapp/src/lib/__tests__/trading-alerts.test.ts, webapp/src/lib/__tests__/use-trading-alerts.test.tsx</files>
  <behavior>
    trading-alerts.test.ts (순수):
    - `orderAlertKind`: "A"→accept · "E"→fill · "M"→modify · "C"→cancel · "R"→reject · ""/기타→null
    - `indexUnfilled`: 두 계좌의 `unf` 행이 전부 `orderNo` 키로 들어가고(`accountNo` 포함), 다음 호출에서 행이 사라져도 기존 항목이 남는다(add-only) · 새 행이 없으면 **같은 Map 참조**를 돌려준다
    - `resolveOrderEntry`: `no` 로 못 찾으면 `org` 로 찾는다 · 둘 다 없으면 null
    - `alertFromOrder`: 색인 히트 → isin/exchange/side/name/orderQty 채움, `label` 은 `orderNoticeLabel` 결과(취소·정정은 방향 없음 · 시간외종가 접두) · 색인 미스 → `name === "주문 {no}"`, isin undefined · reject 는 `msg` 원문을 그대로(파싱 없음)
    - `mergeAlert`: 같은 orderNo fill 이 첫 통보 기준 3000ms 이내 → count 2·filledQty 합·`at` 갱신·merged true / 3001ms → 새 항목 / accept 둘은 절대 안 묶임 / 5번째 항목이 오면 가장 오래된 것이 빠져 길이 4
    - `newRateCrossAlerts`: snapChanged=true → [] · false → prevKeys 에 없는 키만(`breakoutKey` 축)
    - `alertTitle/alertSubtitle/alertIcon`: 7 kind 각각 목업 `textOf` 문구(체결 `매수 300/500주 · 128,500원 · KRX` · 접수 `… · No 123` · VI `발동가 … · 기준 … (+10%) · NXT · 해제 09:44:12` · 돌파 `+20.13% · KRX · 돌파 목록에 추가됐어요`)
    - `alertTabFor`: accept/modify/cancel/reject→"unfilled" · fill+hasHolding→"holdings" · fill 무보유→"unfilled" · vi/breakout→"log" · vi/breakout+cardIsNew→"info"
    use-trading-alerts.test.tsx (`renderHook` · `vi.useFakeTimers` · `@/lib/alert-tone` mock):
    - 마운트 시 이미 있는 `orders`/`viNotices`/`rateCrossItems` 는 알림 0
    - 새 order 프레임 prepend → alert 1 (색인은 이전 렌더의 `accountStates` 로 이미 채워짐) · 같은 배열을 다시 넘겨도 중복 0
    - 색인 미스 → 즉시 알림 없음 · 1.4초 뒤 `accountStates` 에 그 행이 오면 이름 조인된 알림 · 아무것도 안 오면 1.5초에 「주문 {no}」 알림
    - `rateCrossSnapSeq` 가 바뀐 렌더의 새 종목은 알림 0 · 같은 seq 에서 새 키는 breakout 알림 1
    - fill·vi 는 `playBreakoutTone` 1회(묶음 병합 시 추가 호출 없음) · accept 는 호출 0
    - `dismiss(id)` 로 빠진다 · `onNew` 는 새 알림에만 불리고 병합엔 안 불린다
  </behavior>
  <action>
    **A. `webapp/src/lib/trading-alerts.ts` (순수 · React 없음).** 헤더 주석에 「결정 갱신(D-36/D-27 → ③A)」과 「하지 말 것(msg 파싱 금지 D-08 · 이력 저장 없음 · Notification API 없음)」을 적는다.
    - 타입: `TradingAlertKind = "accept"|"fill"|"modify"|"cancel"|"reject"|"vi"|"breakout"`. `TradingAlert { id: string; kind; at: number; firstAt: number(묶음 창 기준 — 첫 통보, 슬라이딩 아님 · `mergeOrderNotices` 와 같은 규율); isin?: string; exchange: RelayExchange; accountNo?: string; name?: string; code?: string; side: NoticeSide; price?: number; qty?: number; filledQty?: number; orderQty?: number; orderNo?: string; count: number; msg?: string; label: string(행위 단어 — `orderNoticeLabel().text`, vi/breakout 은 "") }`. `OrderIndexEntry { isin; exchange; side; name?; code?; orderQty; accountNo }`.
    - 상수: `ALERT_HOLD_MS = 1_500` · `MAX_TOASTS = 4` · `TOAST_TTL_MS = 6_000` · `TOAST_TTL_PHONE_MS = 4_000` · `TOAST_LEAVE_MS = 2_500` · `TOAST_PHONE_BELOW = 700`. 묶음 창은 **`MERGE_WINDOW_MS` 를 `order-notices.ts` 에서 import**(새 상수 금지).
    - `orderAlertKind(nt: string): TradingAlertKind | null`.
    - `indexUnfilled(prev: ReadonlyMap<string, OrderIndexEntry>, accountStates: ReadonlyMap<string, RelayAccountState>): ReadonlyMap<…>` — 모든 계좌의 `unf` 행을 `orderNo` 키로 **추가만** 한다(삭제·덮어쓰기 없음 — 먼저 본 값이 정본). 추가할 게 없으면 `prev` 를 그대로 반환.
    - `resolveOrderEntry(index, msg: RelayOrderMsg): OrderIndexEntry | null` — `msg.no` → 없으면 `msg.org`(빈 문자열이면 건너뜀).
    - `alertFromOrder(msg, entry: OrderIndexEntry | null, at: number, id: string): TradingAlert` — kind 는 `orderAlertKind`(호출자가 null 을 미리 거른다). `label` 은 `orderNoticeLabel({ noticeType: msg.nt, requestKind: msg.rk ?? "", side: entry?.side ?? null, requester: msg.rq ?? "", board: msg.bd ?? "" }).text`, `side` 는 `orderActionSide(같은 facts)`. `exchange: msg.x`, `price: msg.p`, `qty: msg.q`, fill 이면 `filledQty: msg.q`, `orderQty: entry?.orderQty`, `orderNo: msg.no`, `msg: msg.msg`(reject 표시용 · 그 밖은 undefined), `name: entry?.name`(entry 없으면 `주문 ${msg.no}`), `count: 1`, `firstAt: at`.
    - `alertFromVi(msg: RelayViNoticeMsg, at, id)` — kind "vi", isin/exchange/accountNo/name, `price: triggerPrice`, `qty: orderQty`, 기준가·상승률·해제시각은 부제 조립에 필요하므로 `basePrice`·`changeRate`·`viEndTime` 을 담을 optional 필드 `vi?: { basePrice; changeRate; viEndTime }` 를 둔다(타입 확장은 이 한 곳).
    - `alertFromBreakout(item: RelayRateCrossItem, at, id)` — kind "breakout", isin/exchange/name/code, `price: lastPrice`, `breakout?: { changeRate }`.
    - `mergeAlert(alerts: readonly TradingAlert[], incoming: TradingAlert, windowMs = MERGE_WINDOW_MS, max = MAX_TOASTS): { alerts: TradingAlert[]; merged: boolean }` — `incoming.kind === "fill"` 이고 같은 `orderNo` 의 fill 항목 `cur` 가 있고 `incoming.at - cur.firstAt <= windowMs` 면 그 자리에서 `{ ...cur, count: cur.count + 1, filledQty: (cur.filledQty ?? 0) + (incoming.filledQty ?? 0), price: incoming.price, at: incoming.at }`(merged true). 아니면 뒤에 붙이고, 길이가 `max` 를 넘으면 **앞(오래된 것)** 부터 자른다. 다른 kind 는 절대 묶지 않는다.
    - `newRateCrossAlerts(prevKeys: ReadonlySet<string>, items: readonly RelayRateCrossItem[], snapChanged: boolean): RelayRateCrossItem[]` — `snapChanged` 면 `[]`; 아니면 `breakoutKey(item)` 이 `prevKeys` 에 없는 항목. (breakout-strip 의 78 무음 판정과 같은 축 — `rateCrossSnapSeq` 변화 렌더 = 스냅샷.)
    - 표시 순수 함수: `alertIcon(kind)`(접·체·정·취·!·VI·돌), `alertTitle(a)`(`{name} 접수` · `체결` · `정정확인` · `취소확인` · `주문 거부` · `VI 발동` · `등락률 돌파` — name 이 없으면 isin, 그것도 없으면 「주문 {No}」), `alertSubtitle(a)` — 목업 `textOf` 그대로: fill `${label} ${filledQty}/${orderQty ?? "?"}주 · ${price}원 · ${exchange}`(orderQty 모르면 `${filledQty}주`) · accept `${label} ${qty}주 · ${price}원 · ${exchange} · No ${orderNo}` · modify/cancel `${label} ${qty}주 · No ${orderNo}`(**방향 단어 없음** — `order-notices.ts` ② 규율. 목업의 `side` 자리는 `label` 이 대신한다) · reject `msg` 원문 · vi `발동가 ${triggerPrice} · 기준 ${basePrice} (+${changeRate}%) · ${exchange} · 해제 ${viEndTime 앞 6자를 HH:MM:SS 로}`(기존 포맷터가 `vi-order-list.tsx`/`vi-alert.ts` 에 있으면 그것을 import, 없으면 이 파일의 `viEndClock(hhmmss)` 로 — 벽시계 해석이 아니라 표시 포맷일 뿐) · breakout `${changeRate.toFixed(2)}% · ${exchange} · 돌파 목록에 추가됐어요`(+ 부호는 양수에만). 숫자는 `toLocaleString("ko-KR")`.
    - `alertTabFor(a, opts: { hasHolding: boolean; cardIsNew: boolean }): CardTab` — `CardTab` 은 `@/components/trading/card/card-tabs` 에서 **type import**(순환 없음 — card-tabs 는 이 lib 를 import 하지 않는다).

    **B. `webapp/src/lib/use-trading-alerts.ts`.** `useTradingAlerts(input: { orders: readonly RelayOrderMsg[]; viNotices: readonly RelayViNoticeMsg[]; rateCrossItems: readonly RelayRateCrossItem[]; rateCrossSnapSeq: number; accountStates: ReadonlyMap<string, RelayAccountState>; onNew?: (a: TradingAlert) => void }): { alerts: TradingAlert[]; dismiss: (id: string) => void }`.
    - ref: `seenOrders = useRef(new WeakSet<RelayOrderMsg>())` · `seenVi = useRef(new WeakSet<RelayViNoticeMsg>())` · `rateKeys = useRef<ReadonlySet<string> | null>(null)` · `snapSeq = useRef<number | null>(null)` · `index = useRef<ReadonlyMap<string, OrderIndexEntry>>(new Map())` · `pending = useRef<Array<{ msg: RelayOrderMsg; at: number; id: string; timer: number }>>([])` · `alertsRef`(상태 미러 — 병합 여부를 동기적으로 알기 위해) · `seq = useRef(0)`.
    - `emit(alert)`: `const r = mergeAlert(alertsRef.current, alert); alertsRef.current = r.alerts; setAlerts(r.alerts);` → **그 다음** `if (!r.merged) { onNewRef.current?.(alert); if (alert.kind === "fill" || alert.kind === "vi") playBreakoutTone(); }` — 「기록 먼저, 재생 나중」(breakout-strip ④). 병합된 조각 체결에는 소리를 다시 내지 않는다(1.2초에 3번 울리지 않게 — 재량).
    - `useEffect([accountStates])`: `index.current = indexUnfilled(index.current, accountStates)`; 보류 목록을 순회해 이제 풀리는 것은 타이머 해제 후 `emit(alertFromOrder(msg, entry, at, id))`.
    - `useEffect([orders])`: 첫 실행(`primed` ref false)이면 전부 `seenOrders.add` 만 하고 return(이력 재생 금지). 이후에는 `orders` 를 앞에서부터 훑되 이미 본 객체를 만나면 멈추고, 새 것들을 **도착 순(뒤→앞)** 으로 처리: `seenOrders.add(msg)` → `orderAlertKind(msg.nt)` null 이면 skip → `resolveOrderEntry` → 히트면 emit, 미스면 `pending` 에 넣고 `window.setTimeout(ALERT_HOLD_MS)` 로 `emit(alertFromOrder(msg, null, …))`.
    - `useEffect([viNotices])`: 같은 WeakSet 규율 → `emit(alertFromVi)`.
    - `useEffect([rateCrossItems, rateCrossSnapSeq])`: 첫 실행이면 키 집합·seq 만 기록. `snapChanged = snapSeq.current !== rateCrossSnapSeq`; `newRateCrossAlerts(rateKeys.current, items, snapChanged)` 각각 `emit(alertFromBreakout)`; 끝에 키 집합·seq 갱신.
    - 언마운트 시 보류 타이머 전부 clear. `dismiss(id)` 는 미러와 상태 둘 다에서 뺀다.
    - id 는 `wb-alert-${++seq.current}` (React key).

    **C. 테스트** — `<behavior>` 대로. 훅 테스트는 `vi.mock("@/lib/alert-tone", () => ({ playBreakoutTone: vi.fn(() => true) }))` 로 잠그고 `renderHook` + `rerender` 로 새 배열을 넘긴다. `accountStates` 는 `new Map([[ACCOUNT, { hold: [], unf: [row] } as RelayAccountState]])` 꼴(필요 필드만 채운 캐스팅은 `trading-workbench.test.tsx` 의 `lc()` 와 같은 관례).
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp test src/lib/__tests__/trading-alerts.test.ts src/lib/__tests__/use-trading-alerts.test.tsx src/lib/__tests__/order-notices.test.ts && test "$(grep -c 'export function mergeAlert' webapp/src/lib/trading-alerts.ts)" -eq 1 && test "$(grep -c 'MERGE_WINDOW_MS' webapp/src/lib/trading-alerts.ts)" -ge 1 && test "$(grep -c 'export function useTradingAlerts' webapp/src/lib/use-trading-alerts.ts)" -eq 1 && test "$(grep -c 'WeakSet' webapp/src/lib/use-trading-alerts.ts)" -ge 2 && test "$(grep -v '^\s*[/*]' webapp/src/lib/trading-alerts.ts webapp/src/lib/use-trading-alerts.ts | grep -c 'localStorage\|Notification(')" -eq 0 && git diff --quiet HEAD -- pnpm-lock.yaml webapp/package.json</automated>
  </verify>
  <done>순수 함수 8종 + 훅이 `<behavior>` 의 케이스를 전부 초록으로 통과한다. 마운트 시 기존 항목·78 스냅샷은 무알림, 새 order/vi/76 만 알림, 색인 조인은 사라진 unf 행에도 성립, 3초 묶음은 count·filledQty 누적, 최대 4개, fill·vi 만 톤 1회. 새 의존성·localStorage·Notification API 없음.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 토스트 컴포넌트 + 카드 헤더 표시(CSS) + 작업대 배선(클릭 이동 · 탭 요청 통로)</name>
  <files>webapp/src/components/trading/workbench/alert-toasts.tsx, webapp/src/components/trading/__tests__/alert-toasts.test.tsx, webapp/src/styles/globals.css, webapp/src/components/trading/card/card-tabs.tsx, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/card-tabs.test.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx</files>
  <behavior>
    alert-toasts.test.tsx (`vi.useFakeTimers`):
    - 컨테이너 `[data-slot="alert-toasts"]` 가 `role="status"` · `aria-live="polite"` · 항목마다 `data-kind` 와 제목/부제 텍스트, count ≥ 2 면 `N건` 배지
    - ✕(`aria-label="알림 닫기"`) 클릭 → `onDismiss(id)` 만, `onOpen` 호출 0
    - 본문 클릭 → `onOpen(alert)` 호출
    - 6000ms 경과 → `onDismiss(id)` · 5999ms 에는 미호출 · `at` 이 바뀐 rerender 뒤에는 타이머가 다시 6000ms
    - `mouseenter` 후 10초 지나도 미호출 · `mouseleave` 2500ms 뒤 호출
    - `window.matchMedia` 를 `(max-width: 699px)` matches:true 로 바꾸면 TTL 4000ms
    card-tabs.test.tsx (기존 파일에 케이스 추가):
    - `requestedTab={{ tab: "log", seq: 1 }}` 로 렌더하면 「로그」 탭이 active · 같은 seq 로 rerender 해도 사용자가 고른 탭이 유지 · seq 2 + tab "unfilled" 면 「미체결」 로 이동
  </behavior>
  <action>
    **A. `alert-toasts.tsx`.** `export function AlertToasts({ alerts, onOpen, onDismiss }: { alerts: readonly TradingAlert[]; onOpen: (a: TradingAlert) => void; onDismiss: (id: string) => void })`. 루트 `<div data-slot="alert-toasts" role="status" aria-live="polite" className="pointer-events-none fixed right-3 bottom-3 z-50 flex w-[min(340px,calc(100%-24px))] flex-col gap-2 max-[699px]:top-3 max-[699px]:right-3 max-[699px]:bottom-auto max-[699px]:left-3 max-[699px]:w-auto">`. 파일 상단 주석에 **명기**: 「토스트는 뷰포트 오버레이라 여기만 뷰포트 미디어 쿼리(`max-[699px]`, `TOAST_PHONE_BELOW`)를 쓴다 — D-28 카드 컨테이너 쿼리 규칙(§2.2b)과 별개다. 앱 셸이 아니라 `/trading` 작업대 루트 안에만 마운트된다. z-50 은 폰 더티 바 z-40 · 공용 패널 z-20 위.」 `alerts` 가 비면 `null` 을 그리지 말고 빈 컨테이너를 유지한다(aria-live 영역은 미리 존재해야 낭독된다).
    - 항목 `ToastItem`(각자 타이머 소유): `<div data-slot="alert-toast" data-kind={a.kind} onClick={() => onOpen(a)} className="pointer-events-auto grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--border)] border-l-4 bg-[var(--card)] px-3 py-2.5 text-[12px] shadow-[0_12px_32px_oklch(0_0_0/0.14)] motion-safe:animate-[wb-toast-in_.18s_ease-out] …">` + 띠 색은 Tailwind data 변형으로: `data-[kind=fill]:border-l-[var(--led-armed)] data-[kind=accept]:border-l-[var(--primary)] data-[kind=modify]:border-l-[var(--flat)] data-[kind=cancel]:border-l-[var(--flat)] data-[kind=reject]:border-l-[var(--destructive)] data-[kind=vi]:border-l-[var(--led-latent)] data-[kind=breakout]:border-l-[var(--new-bd)]`. 원형 아이콘 `<span aria-hidden data-part="icon">{alertIcon(kind)}</span>`(22px 원 · `bg-[var(--muted)]` · 800 굵기 10px), 본문 `<span data-part="text"><b>{name}</b> {제목 뒷말}{count>1 && <span data-part="count" className="mono …">{count}건</span>}<span data-part="sub" className="block text-[11px] text-[var(--muted-fg)]">{alertSubtitle(a)}</span></span>` — 제목은 `alertTitle` 을 name 부분과 뒷말로 나누지 말고, 컴포넌트가 `<b>{name}</b>` + kind 별 뒷말을 그리고 `alertTitle` 은 테스트/접근성 텍스트 원천으로만 쓴다(문구 표는 lib 한 곳). ✕ `<button type="button" aria-label="알림 닫기" onClick={(e) => { e.stopPropagation(); onDismiss(a.id); }}>`. 하단 진행 바 `<div data-part="bar" className="col-span-full h-0.5 overflow-hidden rounded-sm bg-[var(--border)]"><i style={{ "--ttl": `${ttl}ms`, animationPlayState: hovered ? "paused" : undefined }} className="block h-full bg-[var(--primary)] motion-safe:animate-[wb-toast-drain_var(--ttl)_linear_forwards]" /></div>`.
    - 타이머: `ttl = window.matchMedia(`(max-width: ${TOAST_PHONE_BELOW - 1}px)`).matches ? TOAST_TTL_PHONE_MS : TOAST_TTL_MS` 를 효과 안에서 읽는다(SSR 가드). `useEffect([a.at, hovered])`: hovered 면 타이머 없음, 아니면 `setTimeout(() => onDismiss(a.id), leaveMode ? TOAST_LEAVE_MS : ttl)` — `mouseleave` 는 `leaveMode` ref 를 true 로 두고 hovered false 로. `a.at` 이 바뀌면(묶음 병합) 효과가 다시 돌아 TTL 재시작 + 진행 바는 `key={a.at}` 로 `<i>` 를 다시 마운트해 애니메이션 재시작. `onDismiss` 는 ref 로 최신을 읽어 의존성에 넣지 않는다.
    - 최대 4개 정리는 훅(`mergeAlert`)이 했으므로 컴포넌트는 받은 대로 그린다.

    **B. `globals.css`** — §3.6 뒤에 `§3.8 작업대 이벤트 알림 (quick-260923-pgu · 목업 ③A)` 섹션: `@keyframes wb-toast-in { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }` · `@keyframes wb-toast-drain { from { width:100% } to { width:0 } }` · `@keyframes wb-hdr-pulse { 0%,100% { background:transparent } 50% { background:color-mix(in oklch, var(--primary) 16%, transparent) } }` · `[data-slot="strategy-card"][data-alert="true"] { outline:1px solid color-mix(in oklch, var(--primary) 45%, transparent); outline-offset:-1px; }` · `[data-slot="strategy-card"][data-alert="true"] > [data-slot="card-header"] { animation: wb-hdr-pulse .9s ease-in-out 3; }` · `[data-slot="strategy-card"][data-alert="true"] [data-part="name"]::after { content:''; display:inline-block; width:7px; height:7px; border-radius:999px; background:var(--destructive); margin-left:6px; vertical-align:middle; }` · `@media (prefers-reduced-motion: reduce) { [data-slot="strategy-card"][data-alert="true"] > [data-slot="card-header"] { animation:none; } }`(점·링은 남는다). 접힌 카드·펼친 카드 모두 같은 article 이라 둘 다 적용된다. 주석: 「재량 — 이미 표시 중인 카드에 또 이벤트가 오면 펄스는 다시 돌지 않고 점·링만 유지된다(CSS 애니메이션은 속성 유지 시 재시작하지 않는다)」.

    **C. 탭 요청 통로 (가장 작은 배선).** `card-tabs.tsx`: `export interface CardTabRequest { tab: CardTab; seq: number }` · `CardTabsProps.requestedTab?: CardTabRequest` · `useEffect(() => { if (requestedTab !== undefined) setTab(requestedTab.tab); }, [requestedTab?.seq, requestedTab?.tab])` — 사용자 클릭은 그대로 로컬 state, 요청은 seq 가 바뀔 때만 이긴다. `CardTabs` 는 `everOpened` 뒤에만 마운트되므로 새로 펼쳐지는 카드는 마운트 효과로 요청을 소비한다. `strategy-card.tsx`: `StrategyCardProps` 에 `alerted?: boolean` · `requestedTab?: CardTabRequest` 추가 → `<article … data-alert={alerted ? "true" : "false"}>` · `<CardTabs … requestedTab={requestedTab} />`. `memo` 는 그대로(새 prop 두 개는 대상 카드에서만 바뀐다).

    **D. `trading-workbench.tsx` (`WorkbenchSurface`) — p3k 의 `withCardOpen` 이 커밋돼 있는지 먼저 `git log -1 -- webapp/src/components/trading/workbench/trading-workbench.tsx` 로 확인.**
    - 순수 함수 `export function cardForAlert(cards: readonly WorkbenchCard[], a: Pick<TradingAlert, "isin"|"accountNo"|"exchange">): WorkbenchCard | undefined` — isin 없으면 undefined; (isin, accountNo, exchange) 정확 일치 → (isin, exchange) 중 펼친 것 우선 → isin 의 펼친 것 우선(`isinFocusCardOf` 재사용). `cardForUnfilled` 옆에 두고 같은 문서화 규율.
    - 상태: `const [alertedCardIds, setAlertedCardIds] = useState<ReadonlySet<string>>(() => new Set())` · `const [tabRequest, setTabRequest] = useState<{ id: string } & CardTabRequest | null>(null)` · `tabSeq = useRef(0)`.
    - 훅: `const { alerts, dismiss: dismissAlert } = useTradingAlerts({ orders: relay.orders, viNotices: relay.viNotices, rateCrossItems, rateCrossSnapSeq, accountStates, onNew: markAlerted })` — `markAlerted = useCallback((a) => { const hit = cardForAlert(cardsRef.current, a); if (hit) setAlertedCardIds(prev => prev.has(hit.id) ? prev : new Set(prev).add(hit.id)); }, [])`. 이벤트만으로 카드를 **만들지 않는다**(클릭 때만).
    - `openAlert = useCallback((a: TradingAlert) => { … }, [accountNo, nextCardId, dismissAlert])`: ① `hit = cardForAlert(cardsRef.current, a)`; ② hit 없고 `a.isin` 있으면 새 카드 `{ id: nextCardId(), isin, accountNo: a.accountNo ?? accountNo, exchange: a.exchange, open: true, name: a.name, code: a.code }` 를 `setCards(prev => [...prev, card])`(breakout 은 `addCard(isin, name, code)` 규칙과 같은 모양 — KRX 대신 알림의 거래소를 쓴다, isin 없으면(조인 실패 주문) 카드 없이 ③만); hit 있으면 `setCards(prev => withCardOpen(prev, hit.id, true))`; `setScrollTarget({ key: strategyKey(isin, accountNo, exchange) })`; ③ `hasHolding = (accountStates.get(cardAccountNo)?.hold ?? []).some(h => h.isin === a.isin)` · `setTabRequest({ id, tab: alertTabFor(a, { hasHolding, cardIsNew: hit === undefined }), seq: ++tabSeq.current })`; ④ `setAlertedCardIds(prev => without id)`; ⑤ `dismissAlert(a.id)`.
    - `toggleCard` 안에서 `setAlertedCardIds(prev => prev.has(id) ? without : prev)`(헤더 토글로 해제). `removeCard` 경로에서도 집합·`tabRequest` 에서 그 id 를 뺀다.
    - `WorkbenchCardItemProps` 에 `alerted: boolean` · `requestedTab?: CardTabRequest` 추가 → `StrategyCard` 로 전달. 렌더: `alerted={alertedCardIds.has(c.id)}` · `requestedTab={tabRequest !== null && tabRequest.id === c.id ? tabRequest : undefined}`(다른 카드는 undefined 로 안정 — memo 유지).
    - 루트 `<div data-slot="trading-workbench">` 안, `<SharedPanels>` 뒤에 `<AlertToasts alerts={alerts} onOpen={openAlert} onDismiss={dismissAlert} />`. 게이트(미인증) 화면에는 없다 — `WorkbenchSurface` 안이므로 자동.
    - 파일 상단 설계 주석에 ⑩ 항목으로 「이벤트 알림 — 작업대가 `alertedCardIds`·`tabRequest` 를 소유, 카드 상태에 섞지 않는다(목업 ③A · 결정 갱신 D-27)」를 추가.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp test src/components/trading/__tests__/alert-toasts.test.tsx src/components/trading/__tests__/card-tabs.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/components/trading/__tests__/card-header.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx && test "$(grep -c 'aria-live="polite"' webapp/src/components/trading/workbench/alert-toasts.tsx)" -eq 1 && test "$(grep -c 'wb-hdr-pulse' webapp/src/styles/globals.css)" -ge 2 && test "$(grep -c 'prefers-reduced-motion' webapp/src/styles/globals.css)" -ge 2 && test "$(grep -c 'requestedTab' webapp/src/components/trading/card/card-tabs.tsx)" -ge 3 && test "$(grep -c 'export function cardForAlert' webapp/src/components/trading/workbench/trading-workbench.tsx)" -eq 1 && test "$(grep -c '<AlertToasts' webapp/src/components/trading/workbench/trading-workbench.tsx)" -eq 1 && test "$(grep -c 'AlertToasts' webapp/src/app/layout.tsx)" -eq 0 && git diff --quiet HEAD -- pnpm-lock.yaml webapp/package.json webapp/src/components/trading/card/card-header.tsx</automated>
  </verify>
  <done>토스트 컴포넌트가 `<behavior>` 를 전부 통과(role/aria-live · ✕ · 클릭 · TTL 6s/4s · 호버 정지 · 이탈 2.5s). `requestedTab` 으로 탭이 바뀌고 사용자 선택은 유지. 작업대가 `alertedCardIds`·`tabRequest` 를 소유하고 `openAlert` 가 `withCardOpen` → 스크롤 → 탭 요청 → 해제 → 토스트 닫기 순으로 동작. 헤더 표시는 CSS `data-alert` 만으로(card-header.tsx 무변경). 기존 작업대·카드 테스트 회귀 0.</done>
</task>

<task type="auto">
  <name>Task 3: 작업대 통합 테스트 + Playwright 1건 + 전체 게이트</name>
  <files>webapp/src/components/trading/__tests__/trading-workbench.test.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <action>
    **A. `trading-workbench.test.tsx`** — `StubCard` 에 `data-alert={props.alerted ? "true" : "false"}` 를 붙이고(prop 은 이미 `cardProps` 에 기록된다) 새 `describe("TradingWorkbench — 이벤트 알림 (quick-260923-pgu · 목업 ③A)")`:
    1. `mockRelay = relay({ rateCrossItems: [rc()], accountStates: new Map([[ACCOUNT, { hold: [], unf: [unfRow("123", "KR7096530001")] }]]) })` → 돌파 칩 클릭으로 카드 1장(기존 「카드 추가」 케이스 방식) → 헤더 토글로 **접는다** → `mockRelay = relay({ ...같은 값, orders: [orderMsg({ no: "123", nt: "E", q: 100, p: 12_100 })] })` + `rerender` → `[data-slot="alert-toast"]` 1개 · 텍스트에 `씨젠`·`체결`·`매수 100/500주` → 그 카드 `data-alert="true"` · `data-open="false"`.
    2. 토스트 본문 클릭 → 카드 `data-open="true"` · `cardProps.get(id).requestedTab` 이 `{ tab: "unfilled", seq: 1 }`(보유 없음) · `data-alert="false"` · 토스트 0개.
    3. 마운트 시점에 이미 있던 `orders` 는 토스트 0 · 같은 orderNo E 두 번째 prepend(같은 `at` 창) → 토스트 1개에 `2건` 배지.
    4. 카드 없는 종목의 vi.notice → 토스트 뜸(카드 `data-alert` 없음) → 클릭 → 그 isin·계좌·거래소 카드가 새로 붙어 `data-open="true"` · `requestedTab.tab === "info"`.
    5. 헤더 토글 클릭으로도 `data-alert` 가 풀린다.
    헬퍼 `orderMsg(over)`/`unfRow(orderNo, isin, over)`/`viNotice(over)` 는 파일의 `rc()`/`lc()` 관례로 추가. `Date.now` 는 `vi.useFakeTimers({ toFake: ["setTimeout","clearTimeout","Date"] })` 로 고정.

    **B. `trading-workbench.spec.ts`** — 로컬 relay + 스텁 게이트웨이(`withLocalRelay`)로 1건 추가 `test('GC8 주문 체결 통보 → 우하단 토스트 → 클릭 → 카드 펼침 + 「미체결」 탭 + 헤더 표시 해제 (quick-260923-pgu · 목업 ③A)')`: `/trading` 진입 후 `relay.pushAccountState({ unf: [{ orderNo: "777", isin: E2E_ISIN, side: "B", orderQty: 500, unfilledQty: 500, exchange: "KRX", … }] })` → 종목 추가란으로 `E2E_ISIN` 카드를 세우고 접는다(기존 케이스 9 의 방식) → `relay.pushOrderResp({ orderNo: "777", noticeType: "E", isin: E2E_ISIN, side: "B", price: E2E_BASE_PRICE, quantity: 100, exchange: "KRX", requestKind: "New" })` → `page.locator('[data-slot="alert-toast"][data-kind="fill"]')` visible · 텍스트 `체결` · 카드 `[data-alert="true"]` → 토스트 클릭 → 카드 `data-open="true"` · `[data-slot="card-tabs"] [role="tab"][data-state="active"]` 텍스트 `미체결` · `data-alert="false"` · 토스트 0. `FakeAccountStateInput`/`FakeOrderRespInput` 의 실제 필드명은 `relay/tests/helpers/frames.ts` 를 열어 맞춘다. 스텁 게이트웨이가 E 통보를 relay 가 `order` 프레임으로 팬아웃하지 않는 등 **주입이 불가능하면** 이 케이스를 넣지 않고 SUMMARY 에 「e2e 생략 사유」를 명기한다(회귀 게이트는 그대로 돈다).

    **C. 게이트.** `pnpm --filter @gh-radar/webapp run typecheck` · `pnpm --filter @gh-radar/webapp run test`(전량) · `cd webapp && pnpm exec playwright test trading-workbench`. `pnpm-lock.yaml` 변경 0.

    **D. 커밋(사용자 확인 후).** 한글 메시지 `feat(quick-260923-pgu): 작업대 이벤트 알림 토스트 — 접수·체결·정정/취소·거부·VI·돌파 + 3초 묶음 + 카드 헤더 펄스·빨간 점 + 클릭 시 카드 펼침·탭 이동 (목업 ③A · D-27 결정 갱신)`. `git add` 는 **파일 경로 명시**(`git add -A` 금지 · `.planning/` 제외) · Co-Authored-By 금지 · push 금지.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test && test "$(grep -c 'quick-260923-pgu' webapp/src/components/trading/__tests__/trading-workbench.test.tsx)" -ge 1 && test "$(grep -c 'alert-toast' webapp/src/components/trading/__tests__/trading-workbench.test.tsx)" -ge 3 && git diff --quiet HEAD -- pnpm-lock.yaml && cd webapp && pnpm exec playwright test trading-workbench</automated>
  </verify>
  <done>작업대 통합 5케이스(새 order → 토스트 → 접힌 카드 `data-alert` → 클릭 → 펼침·탭 요청·해제 · 이력 무알림 · 묶음 배지 · 카드 없는 VI 클릭 시 카드 추가+정보 탭 · 헤더 토글 해제) 초록. Playwright `trading-workbench` 0 fail(GC8 추가 또는 SUMMARY 에 생략 사유). 전체 webapp vitest 초록 · typecheck 0 · lock 변경 0. SUMMARY 에 「결정 갱신(D-36/D-27 → 토스트 ③A, 라이브러리 없음)」과 색인 한계(한 델타 안에 접수+전량 체결된 주문은 「주문 No」 폴백) 명기.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay WS → 브라우저 상태 | `RelayOrderMsg.msg`(서버 문구) · 종목명이 그대로 토스트에 표시된다 |
| 브라우저 로컬 | 알림 이력을 저장하지 않는다(A안) — localStorage 없음 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pgu-01 | Tampering | `alertSubtitle` reject `msg` 표시 | low | mitigate | React 텍스트 노드로만 그린다(`dangerouslySetInnerHTML` 금지) · 문구 파싱·분기 금지(D-08) |
| T-pgu-02 | Information Disclosure | 토스트 본문 · console | low | mitigate | 계좌번호를 토스트에 싣지 않는다(카드 매칭에만 사용) · 훅은 로그를 남기지 않는다 |
| T-pgu-03 | Denial of Service | 통보 폭주 → 토스트/타이머 누적 | low | mitigate | `MAX_TOASTS=4` 상한 · 보류 타이머는 통보당 1개·1.5초 · 언마운트 시 전부 clear |
| T-pgu-SC | Tampering | npm installs | low | accept | 새 패키지 0 — `pnpm-lock.yaml` 변경 0 을 게이트로 확인 |
</threat_model>

<verification>
- Task 1~3 `<automated>` 전부 exit 0.
- 수동(선택): `webapp/dev.sh`(PORT 3100) 로 `/trading` 열고 브라우저 콘솔에서 relay mock 없이도 `AlertToasts` 컨테이너(`[data-slot="alert-toasts"]`)가 우하단에 있고 뷰포트 699px 이하에서 상단 전폭으로 바뀌는지 확인.
</verification>

<success_criteria>
- 새 order/vi/76 프레임만 토스트 · 마운트 시 이력·78 스냅샷 무알림 · 3초 묶음 · 최대 4개 · TTL 6/4초 · 호버 정지 · role=status.
- 클릭 → 카드 펼침(없으면 추가) · 스크롤 · kind 별 탭 · 표시 해제 · 토스트 닫힘.
- 카드 `data-alert` 헤더 펄스 3회 → 빨간 점 + 링, 토글/클릭으로 해제, reduced-motion 시 펄스 없음.
- 새 의존성 0 · 앱 셸 무변경 · 서버/relay 무변경 · 카드 탭 문법 무변경(prop 1개 추가만).
- typecheck 0 · vitest 전량 초록 · Playwright trading-workbench 0 fail.
</success_criteria>

<output>
Create `.planning/quick/260923-pgu-wb-alerts-vi-3-3-2026-09-23-a/260923-pgu-SUMMARY.md` when done — 결정 갱신(D-36/D-27 → ③A) · 색인 한계 · e2e 추가/생략 사유 · 게이트 결과 수치를 적는다.
</output>
