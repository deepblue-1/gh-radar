---
phase: quick-261001-dyi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - relay/src/ws/fanout.ts
  - relay/tests/fanout.test.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [DYI-01, DYI-02, DYI-03, DYI-04, DYI-05, DYI-06]

estimate:
  tokens: 100000
  raw_tokens: 100000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "작업대 카드가 펼쳐져 있으면(open=true) 자기 키(isin|exchange)를 full 로, 접혀 있으면(open=false · 한 번도 펼친 적 없는 카드 포함) price 로 구독한다 (DYI-01)"
    - "접기·펼치기 전환은 같은 키에서 새 level subscribe → 옛 level unsubscribe 순서다. 탭 참조계수 합계가 0 을 지나지 않아 와이어에는 unsub 없이 sub 1건(접기 = lv:\"price\", 펼치기 = lv 없음)만 나가고, 같은 탭에 그 키의 full 소비자가 따로 있으면 0건이다 (DYI-02)"
    - "언마운트 · 키(거래소) 변경 때는 마지막으로 잡은 level 로 정확히 해제한다. 전환을 몇 번 해도 참조계수가 새지 않고, 거래소 토글의 「옛 키 unsub → 새 키 sub」 순서(relay-provider ③-a)는 그대로다 (DYI-03)"
    - "접힌 헤더가 시세에서 읽는 값은 p(현재가) · cr(등락률) 두 칸뿐이고 둘 다 relay PRICE 게이트의 가격 섹션(samePriceSection) 필드라 접힌 동안에도 갱신된다. 요약 칩(미체결 · 보유)은 계좌 상태(66/67), LED 는 서버 에코, 83 잔량진행률은 사용자 세션 경로라 구독 level 과 무관하다 (DYI-04)"
    - "relay 는 같은 소켓의 price→full 승격(level 갱신 재 sub)에서 hub 캐시 q 스냅샷을 그 소켓에 tape 스냅샷보다 먼저 보낸다. 다른 소비자 때문에 업스트림이 이미 FULL 이어도 펼친 직후 호가(매수1잔량 등)가 접힌 동안 걸러진 호가 틱 이전 값으로 남지 않는다 (DYI-05)"
    - "실 relay + 스텁 게이트웨이 e2e 에서 카드를 접으면 브라우저가 {t:'sub', lv:'price'} 1건을 보내고 게이트웨이는 29 만(28 · 32 없음) 받는다. 펼치면 브라우저가 {t:'sub'}(lv 없음) 1건을 보내고 게이트웨이는 28 · 32 를 1건씩 받는다. 그 키의 unsub 은 0건이다. webapp · relay 의 vitest · typecheck 와 작업대 e2e(알려진 제외 3건 빼고)가 green 이다 (DYI-06)"
  artifacts:
    - path: "webapp/src/lib/relay-provider.tsx"
      provides: "UseRelaySubscriptionOptions.level(기본 full) · 키 수명 effect 와 level 전환 effect 분리 — 전환은 subscribe(새) 뒤 unsubscribe(옛)"
      contains: "level"
    - path: "webapp/src/components/trading/card/strategy-card.tsx"
      provides: "UseStrategyCardStateOptions.level · StrategyCardImpl 이 open 으로 level 을 정해 useStrategyCardState 에 넘김 · 헤더 ③/⑤ 주석에 접힘=price 근거"
      contains: "\"price\""
    - path: "relay/src/ws/fanout.ts"
      provides: "같은 소켓 level 갱신 분기에서 lv === full 이면 getSnapshot q 를 먼저 보내고 tape 스냅샷"
      contains: "getSnapshot"
    - path: "webapp/src/lib/__tests__/relay-provider.test.tsx"
      provides: "실 Provider + FakeWebSocket 으로 접힘/펼침 level 전환 와이어 프레임 고정(L1~L3)"
    - path: "relay/tests/fanout.test.ts"
      provides: "F9 — 업스트림 FULL(다른 소켓 full) 상태에서 price 소켓 승격 시 캐시 q(호가 틱 반영) 즉시 수신 · 업스트림 재요청 0"
    - path: "webapp/e2e/specs/trading-workbench.spec.ts"
      provides: "GC2b — 접기/펼치기의 브라우저 sub 프레임 · 게이트웨이 29/28/32 · unsub 0"
  key_links:
    - from: "webapp/src/components/trading/card/strategy-card.tsx (StrategyCardImpl)"
      to: "useStrategyCardState → useRelaySubscription"
      via: "level: open 이면 \"full\", 아니면 \"price\""
      pattern: "useStrategyCardState\\(\\{[^}]*level"
    - from: "webapp/src/lib/relay-provider.tsx (useRelaySubscription level 전환 effect)"
      to: "use-relay-socket subscribe/unsubscribe(isin, exchange, level)"
      via: "subscribe(isin, exchange, 새 level) 다음 unsubscribe(isin, exchange, 잡고 있던 level)"
      pattern: "subscribe\\(isin, exchange, "
    - from: "relay/src/ws/fanout.ts (sub 처리 · held !== undefined · lv === full)"
      to: "SubscriptionHub.getSnapshot"
      via: "#send(conn, snapshot) 뒤 #sendTapeSnapshot"
      pattern: "getSnapshot"
---

<objective>
트레이딩 작업대(/trading) 종목카드가 접혀 있으면 그 카드의 시세 구독을 FULL → PRICE 로 강등하고, 펼치면 FULL 로 승격한다. 사용자 요청(2026-10-01): 「카드를 펼쳤을 때만 full 로 구독하고 접으면 price 로 바꾸는 로직」.

조사 결과(플래너 실측 — executor 가 다시 조사할 필요 없음):
- 접힌 카드가 화면에 그리는 시세 값은 `CardHeader` 의 `price={quote.p}` · `changeRate={quote.cr}`(strategy-card.tsx:956-957) 두 개뿐이다. 둘 다 relay PRICE 게이트의 가격 섹션(`samePriceSection` — p · o · h · l · c · cs · cr · v · va · viu · vid · kc, relay/src/hub/subscription-hub.ts:261)에 들어 있어 PRICE 소켓에도 갱신이 온다(키당 100ms 간격 · 지연분은 버리지 않음 — 26-07). 그래서 접힌 카드를 FULL 로 붙들 이유가 없다.
- 접힌 헤더의 나머지 표시는 시세와 무관하다. 요약 칩 `unfilledCount` · `holdingQty` 는 계좌 슬라이스(`cardAccountSliceOf` ← accountStates 66/67), LED 는 서버 에코(`ledServer`)에서 온다. 83 잔량진행률은 사용자 세션 경로(②)만 relay 가 캐시한다. quote 연결의 83(①)은 무시하고 넛지는 승격 · 강등 29 로 대신한다(hub 헤더 Pattern 10). 그래서 level 과 무관하다. 상따 전략은 gh-trade 서버에서 돌고 브라우저 구독은 표시 팬아웃 전용이다(26-CONTEXT D-08 · D-12).
- 한 번 펼친 본문은 `hidden` 으로 남아 마운트돼 있다(WR-02). 접힌 동안 그 본문의 호가 사다리 · 10칸 · 테이프 · D-36 판정 입력(`bestBid`/`bestBidQty` — card-body.tsx:281-283)은 가격 섹션이 바뀐 59 가 실어 오는 그 순간의 호가로만 갱신된다. PRICE 소켓 59 본문은 FULL 과 같은 전체 RelayQuote 다(26-07 D-07). 체결 없이 호가만 바뀐 틱은 오지 않고 71 테이프도 없다. 본문은 보이지 않으므로 문제는 「펼친 직후」 뿐이다.
- 펼친 직후 호가가 낡을 수 있다(DYI-05 의 이유). relay 는 같은 소켓 price→full 재 sub 에 tape 스냅샷만 주고 q 는 다시 보내지 않는다(fanout.ts:1024-1028 「q 는 이미 받고 있으므로」). 그 키를 다른 사용자/탭이 FULL 로 보고 있어 업스트림이 이미 FULL 이면 업스트림 승격(28→29(0)→32 → 58)도 없다. 이때 펼친 카드의 호가 사다리와 매수1잔량은 다음 FULL 59 가 올 때까지 「접힌 동안 마지막 체결 시점」 값으로 남는다. 조용한 상한가 종목이면 몇 초~수십 초가 될 수 있다. 같은 결함은 이미 「돌파 칩(price) + 같은 종목 카드 마운트」 승격에 잠복해 있었다. 이번 기능으로 흔한 경로가 되므로 relay 한 곳에서 원인을 고친다(Task 2). 업스트림이 PRICE 였던 키는 hub 승격이 58 을 받아 오므로 원래 덮여 있다.
- webapp 쪽 표시 신선도: `isStale` 은 연결 단위(재접속 흐림)이고 키 단위가 아니다. 시세 캐시(`quotes`)는 unsub · level 변경으로 지워지지 않고 `{...prev, ...frame}` 로 병합된다(use-relay-socket.ts:1142). 그래서 접힌 헤더 가격은 전환 중에도 「—」 로 꺼지지 않는다. 키 단위 신선도 표시 장치는 만들지 않는다. Task 2 가 승격 시 캐시 스냅샷을 즉시 주므로 낡은 창은 relay 왕복 1회다.
- 소켓 계층은 이미 준비돼 있다(수정 불필요 · 재조사 불필요). `use-relay-socket.ts` 는 키당 `{full, price}` 참조계수와 실효 level(full 우선 · :254)을 갖고, `flushSubscriptions`(:1452)가 와이어 level 과 실효 level 이 다를 때만 `sub` 을 다시 보낸다. 승격은 `sub`(lv 없음), 강등은 `sub` lv:"price" 다. relay-socket.test W2 · W3 이 이미 고정한다. 바꿀 곳은 소비자 훅 `useRelaySubscription` 이 level 을 받지 못한다는 점, 그리고 그 effect 가 cleanup→재실행이라 level 을 deps 에 넣으면 「옛 level unsubscribe → 새 level subscribe」 가 되어 합계 1→0 에서 `unsub` 이 실제로 나간다는 점(:1937-1958) 둘이다.

Purpose: 접어 둔 카드 N장이 호가 틱 · 체결 테이프를 계속 받지 않게 해서 브라우저 수신량과 숨은 본문 재렌더를 줄인다. 펼친 카드의 호가 정확성(상따 판단 입력)은 그대로 지킨다.
Output: webapp 훅 · 카드 결선 + 단위 테스트, relay 승격 스냅샷 1곳 + fanout 테스트, 작업대 e2e 1케이스. **커밋까지만** 한다. push · 배포는 메인 세션 몫이다(아래 output 의 배포 순서 참조).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/26-shared-quote-feed/26-07-SUMMARY.md
@.planning/phases/26-shared-quote-feed/26-08-SUMMARY.md

# 현재 코드 (executor 가 읽을 것 — 범위만)
@webapp/src/lib/relay-provider.tsx
@webapp/src/components/trading/card/strategy-card.tsx

<interfaces>
<!-- 이미 존재하는 계약. 탐색 없이 그대로 쓴다. -->

@gh-radar/shared:
  - type RelaySubLevel = "full" | "price"   (use-breakout-quotes.ts:49 가 같은 경로로 import)

webapp/src/lib/use-relay-socket.ts (수정 금지 — 계약만 사용):
  - subscribe(isin: string, exchange: RelayExchange, level: RelaySubLevel = "full"): void   // :1914 — entry[level] += 1 후 flushSubscriptions
  - unsubscribe(isin: string, exchange: RelayExchange, level: RelaySubLevel = "full"): void // :1937 — 잡지 않은 level 해제는 무시. 합계>0 이면 flush(강등 재송신), 합계 0 이면 pendingUnsubs 에 넣고 flush → 와이어 unsub
  - 와이어: full = {t:"sub", isin, ex} (lv 키 없음) · price = {t:"sub", isin, ex, lv:"price"} · 해제 = {t:"unsub", isin, ex}
  - flush 우선순위: full sub → unsub → price sub, 초당 6건 버킷(SUB_FRAME_RATE_PER_SEC)

webapp/src/lib/relay-provider.tsx:
  - UseRelaySubscriptionOptions { isin; exchange; enabled? }  (:504-512)
  - useRelaySubscription — :515-530 단일 useEffect([active, isin, exchange, subscribe, unsubscribe]) 가 subscribe(isin, exchange) / cleanup unsubscribe(isin, exchange)

webapp/src/components/trading/card/strategy-card.tsx:
  - UseStrategyCardStateOptions { isin; accountNo; exchange }  (:180 부근) · useStrategyCardState (:243) → useRelaySubscription({ isin, exchange, enabled: isin.length > 0 }) (:257)
  - StrategyCardImpl (:846) — props.open · `const card = useStrategyCardState({ isin, accountNo, exchange })` (:867) · 본문 `<div hidden={!open}>` (:977) · everOpened(WR-02)

relay/src/ws/fanout.ts:
  - sub 처리 (:990-1051). 같은 소켓 · 같은 키 level 갱신 분기(:1003-1030): hub.subscribe(새) → hub.unsubscribe(옛) → lv === "full" 이면 #sendTapeSnapshot(conn, isin, ex) 만
  - 새 키 분기(:1031-1050): this.#hub.getSnapshot(isin, ex) 가 있으면 this.#send(conn, snapshot), lv === "full" 이면 #sendTapeSnapshot
  - 헤더 규칙 7(:22-26)

relay/src/hub/subscription-hub.ts:
  - getSnapshot(isin, ex): RelayQuote | undefined (:1435) — #onQuote 가 모든 59/58 로 갱신(가격 플래그 무관)하는 전역 캐시

테스트 하네스:
  - webapp/src/lib/__tests__/relay-provider.test.tsx — FakeWebSocket(`sentOfType('sub')` · `parsedSent()`), `acceptAndAuth()`, 소비자 `QuoteConsumer({id, isin, exchange})`(:249-256), describe 「useRelaySubscription — 구독 참조계수」(:415-513)
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx — RelayContext 에 subscribe/unsubscribe vi.fn 을 꽂고 진짜 useRelaySubscription 을 태운다. 기존 단언 :160 · :163 · :207 · :208 이 2-인자 toHaveBeenCalledWith 다(3번째 인자가 생기면 깨진다 — 갱신 대상)
  - relay/tests/fanout.test.ts — describe 의 `authed(token)` · `ws.sendSub(isin, ex, lv?)` · `quoteGateway.pushQuote(quoteSock, {...})` · `framesOf(inbox, "q"|"tape")` · `countOf(MSG.X)` · `waitFor` · `flushIo`. F3(:1032 단일 소켓 price→full) · F8(:1108 A full + B price, 호가 틱 A 1 · B 0 — 호가만 바뀐 59 를 만드는 법이 여기 있다)
  - webapp/e2e/specs/trading-workbench.spec.ts — `captureOrderFrames`(:410-421 framesent 패턴) · `toggleOf(page, isin)`(:131) · `cardOf` · `openFocusedCard(page)`(:303) · `relay.requestLog()` · `DMA_MSG.{GetQuoteReq 28, SubscribeQuoteReq 29, GetTradeTapeReq 32}` · GC2(:1626-1671 접기/펼치기 케이스)
</interfaces>

# 설계 결정 (Claude 재량 — SUMMARY 에 옮길 것)
#  ① level 판정은 카드 컴포넌트가 open 하나로 한다(펼침 = full, 접힘 = price). 더티 값 · 결과 모름 잠금이 있는 접힌 카드도 price 다.
#     본문이 숨어 있어 호가를 볼 수 없고, D-36 판정은 펼친 본문의 스위치에서만 일어나며, 펼치는 순간 승격 + Task 2 스냅샷이 호가를 즉시 채운다.
#  ② 전환 순서는 훅에서 보장한다(소켓 계층 무변경). 키 수명 effect 와 level 전환 effect 를 나눈다.
#     relay fanout 도 같은 소켓 level 갱신을 「새 level 먼저 올리고 옛 level 내린다」(fanout.ts:1005)로 처리한다 — 같은 규율을 브라우저 탭 참조계수에도 건다.
#  ③ flush 우선순위: 접힌 카드는 이제 price 버킷(돌파 칩과 같은 순위 · Map 삽입 순)이다. 배치 복원(readTradingLayout)이 relay 인증 전에 끝나므로 보통 카드가 칩보다 먼저 삽입된다.
#     추가 우선순위 장치는 만들지 않는다. 대신 SUMMARY 「남은 위험」 에 한 줄로 남긴다.
#  ④ 키 단위 「호가 낡음」 표시는 만들지 않는다(과설계). 원인(승격 시 q 미전송)을 relay 에서 고친다.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — 카드 open → useStrategyCardState → useRelaySubscription(level) → 탭 참조계수 → 와이어 sub(lv) 한 경로</name>
  <files>webapp/src/lib/relay-provider.tsx, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/lib/__tests__/relay-provider.test.tsx, webapp/src/components/trading/__tests__/strategy-card.test.tsx</files>
  <behavior>
    relay-provider.test.tsx(실 Provider + FakeWebSocket · 인증 뒤 소비자 붙임 — ③ 주석의 「연결이 살아 있는 상태에서」 규율). QuoteConsumer 에 선택 prop level 을 더해 useRelaySubscription 에 넘긴다. 새 describe 「useRelaySubscription — level 전환 (quick-261001-dyi)」:
    - L1 한 소비자 full → price 재렌더: 그 키의 sub/unsub 프레임이 [{t:'sub',isin:A,ex:'KRX'}, {t:'sub',isin:A,ex:'KRX',lv:'price'}] 이고 unsub 0건. 이어서 price → full: 마지막에 {t:'sub',isin:A,ex:'KRX'} 1건이 더해지고 unsub 은 여전히 0건.
    - L1-b level='price' 로 처음 마운트한 소비자는 {t:'sub',isin:A,ex:'KRX',lv:'price'} 1건으로 시작한다.
    - L2 같은 키를 다른 full 소비자(a2)가 쥐고 있으면 a1 의 full → price 전환은 새 프레임 0건이다(와이어 full 유지). 그 뒤 a2 가 빠지면 lv:'price' sub 1건으로 강등되고 unsub 0건이다.
    - L3 full → price → full → price 로 세 번 전환한 뒤 언마운트하면 그 키 unsub 이 정확히 1건이다. 이어 새 full 소비자를 마운트하면 sub 이 새로 1건 나간다(참조계수 누수 0 — 남은 계수가 있으면 sub 이 나가지 않는다).
    - 기존 ③ · ③-a(거래소 토글 = 옛 키 unsub → 새 키 sub) · ④ 는 수정 없이 green.
    strategy-card.test.tsx(mock subscribe/unsubscribe):
    - open=true 마운트는 subscribe(ISIN_A, 'NXT', 'full') 1회, 언마운트는 unsubscribe(ISIN_A, 'NXT', 'full') 1회다(기존 :153 테스트를 3-인자로 갱신).
    - 한 번도 펼친 적 없는 open=false 마운트는 subscribe(ISIN_A, 'KRX', 'price') 1회다.
    - open true → false 재렌더는 subscribe(ISIN_A,'KRX','price') 다음 unsubscribe(ISIN_A,'KRX','full') 이다. mock.invocationCallOrder 로 「새 level 이 먼저」 를 단언한다. false → true 도 대칭으로 subscribe 'full' 다음 unsubscribe 'price' 다. 전환 후 언마운트는 마지막 level 로 해제된다.
    - 거래소 변경 테스트(:187)의 단언을 3-인자(unsubscribe(ISIN_A,'KRX','full') · subscribe(ISIN_A,'NXT','full'))로 갱신한다.
  </behavior>
  <action>
DYI-01 · DYI-02 · DYI-03 · DYI-04 구현. 테스트를 먼저 쓰고 실패를 확인한(RED) 뒤 코드를 쓴다(GREEN).

(1) relay-provider.tsx — UseRelaySubscriptionOptions 에 선택 필드 `level?: RelaySubLevel` 를 더한다(JSDoc: 기본 "full", 카드 접힘이 "price" 를 쓴다는 것, 전환은 새 level 먼저 잡고 옛 level 을 놓는다는 것). RelaySubLevel 은 @gh-radar/shared 에서 type import 한다. 훅 시그니처에 `level = "full"` 기본값.
  - 기존 단일 effect 를 두 개로 나눈다. 둘 다 같은 「잡고 있는 level」 ref(heldLevelRef, 초기 null)를 공유하고, 최신 level 은 렌더 중 갱신 ref(levelRef — use-relay-socket 의 statusRef · limit-chaser-form 의 bestBidRef 와 같은 관례)로 읽는다.
  - 키 수명 effect: deps 는 기존 그대로 [active, isin, exchange, subscribe, unsubscribe] 이고 level 은 넣지 않는다. 본문에서는 active 가 아니면 반환하고, 아니면 levelRef.current 로 subscribe(isin, exchange, lv) 한 뒤 heldLevelRef 에 lv 를 기록한다. cleanup 에서는 heldLevelRef 의 level 로 unsubscribe(isin, exchange, held) 한 뒤 null 로 비운다. 클로저의 isin/exchange 가 곧 옛 키이므로 거래소 토글 순서(옛 키 unsub → 새 키 sub)는 기존 그대로다.
  - level 전환 effect: deps 는 [active, isin, exchange, level, subscribe, unsubscribe] 이고 cleanup 은 없다. active 가 아니거나 heldLevelRef 가 null 이거나 이미 level 과 같으면 아무것도 하지 않는다. 아니면 subscribe(isin, exchange, level) **먼저**, 그다음 unsubscribe(isin, exchange, held), 그리고 heldLevelRef = level 순서로 처리한다. 같은 키에 대해 탭 참조계수 합계가 0 을 지나지 않으므로 use-relay-socket 이 와이어 unsub 을 보내지 않고 flushSubscriptions 가 실효 level 변화분 sub 1건만 보낸다.
  - 두 effect 의 선언 순서는 키 수명 effect → level 전환 effect 다. 같은 커밋에서 키와 level 이 함께 바뀌면 키 수명 effect 가 이미 새 level 로 잡으므로 전환 effect 는 「같음」 으로 빠진다. StrictMode 이중 실행에서도 cleanup 이 held 를 비우고 다시 잡으므로 균형이 맞는다.
  - 훅 docblock 에 한 단락을 추가한다: 왜 effect 를 둘로 나눴는지(cleanup→재실행이면 옛 level 해제가 먼저라 1→0 unsub · relay linger · 업스트림 29(false)/재구독이 생긴다), 그리고 relay fanout 의 같은 규율(fanout.ts 「새 level 을 먼저 올리고 옛 level 을 내린다」).
  - use-relay-socket.ts 는 수정하지 않는다(승격 · 강등 재송신은 W2 · W3 으로 이미 고정됨).

(2) strategy-card.tsx — UseStrategyCardStateOptions 에 선택 필드 `level?: RelaySubLevel`(기본 "full")을 더하고, useStrategyCardState 가 그것을 useRelaySubscription({ isin, exchange, enabled, level }) 로 그대로 넘긴다. StrategyCardImpl 은 useStrategyCardState({ isin, accountNo, exchange, level: open ? "full" : "price" }) 로 부른다(per DYI-01 · 설계 결정 ①). 파일 상단 docblock 을 갱신한다.
  - ③ 에 한 단락: 펼친 카드는 full · 접힌 카드는 price 로 구독한다(quick-261001-dyi). 접힌 헤더가 시세에서 읽는 것은 p · cr 뿐이고 둘 다 relay PRICE 게이트 가격 섹션이라 접힌 동안에도 갱신된다. 요약 칩은 계좌 슬라이스, LED 는 서버 에코, 83 은 사용자 세션 경로라 level 과 무관하다. 전환은 새 level 먼저(useRelaySubscription).
  - ⑤ 의 「접힌 카드는 헤더만 보인다」 단락에 한 줄: 숨은 본문의 호가 · 테이프는 접힌 동안 가격 갱신 59 에 실린 값으로만 움직이고, 펼치면 승격 + relay 승격 스냅샷(같은 quick)으로 즉시 채워진다.
  - CardHeader · CardTabs · 본문 렌더 경로는 바꾸지 않는다(DYI-04 — 표시 계약 불변).

(3) 테스트는 behavior 대로 쓴다. relay-provider.test.tsx 는 sub/unsub 만 걸러 그 키(isin+ex)로 좁힌 배열을 toEqual 로 단언한다(parsedSent 필터 — ③-a 관례). strategy-card.test.tsx 는 rerender 로 open 을 토글하고 subscribe/unsubscribe mock.calls 와 invocationCallOrder 를 단언한다.

(4) 커밋 2개를 한글 메시지로 남긴다. 예: `test(quick-261001-dyi): 카드 접힘 price · 펼침 full 구독 전환 실패 테스트` → `feat(quick-261001-dyi): 접힌 작업대 카드는 price 로 구독하고 펼치면 full 로 승격`. 스테이징은 경로를 지정한다(git add -A 금지 — 동시 세션 경합). Co-Authored-By 트레일러는 넣지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/relay-provider.test.tsx src/components/trading/__tests__/strategy-card.test.tsx src/lib/__tests__/relay-socket.test.ts src/lib/__tests__/use-breakout-quotes.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>접힌 카드는 price, 펼친 카드는 full 로 구독한다. 전환은 와이어 unsub 없이 sub 1건(다른 full 소비자가 있으면 0건)이다. 전환 뒤 언마운트는 unsub 정확히 1건이고 누수가 0 이다. 거래소 토글 순서도 그대로다. 위 vitest 6파일과 webapp typecheck 가 green 이다. 커밋 2개(RED → GREEN).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: relay — 같은 소켓 price→full 승격에 캐시 q 스냅샷을 준다(펼친 직후 호가 낡음 제거)</name>
  <files>relay/src/ws/fanout.ts, relay/tests/fanout.test.ts</files>
  <behavior>
    - F9(신규 · F8 옆 describe 안): A(token-a) full · B(token-b) price 로 같은 KRX 키를 구독한다. 업스트림 FULL 을 확인하고 58 을 A · B 둘 다 받게 한 뒤, 호가만 바뀐 59 를 민다(F8 과 같이 bidQtys 999.. · askPrices 변경 · exchangeTime 만 · 가격 섹션 불변). 그러면 A 는 q 1건을 더 받고 B 는 0건이다(F8 재확인). 이어서 B 가 sendSub(SAMPLE_ISIN, "KRX", "full") 하면 B 가 q 1건을 받고, 그 bq 에 999 가 들어 있다(hub 캐시 = 호가 틱 반영). 승격 전 대비 countOf(GetQuoteReq) · countOf(SubscribeQuoteReq) · countOf(GetTradeTapeReq) 가 변하지 않는다(업스트림 재요청 없이 캐시에서 왔다). B 의 q 수신은 tape 스냅샷 수신보다 먼저다(inbox 순서 — 해당 tape 캐시가 있으면). h.hub.refCount 는 2, subscriptionLevel 은 "full" 이다.
    - F3(기존 · 단일 소켓 price→full)는 수정 없이 green 이다. 승격 직후 q 1건이 더 와도 F3 단언(tape 1 · 28/29/32 카운트)과 충돌하지 않는다.
    - relay 전체 스위트가 green 이다(기준선 26-08 시점 33 files · 816 tests 이후 증가분 포함 · 숫자는 SUMMARY 에 기록).
  </behavior>
  <action>
DYI-05 구현. F9 를 먼저 써서 실패를 확인한(RED — B 가 승격 뒤 q 를 받지 못해 waitFor 타임아웃) 뒤 고친다(GREEN).

(1) fanout.ts 의 sub 처리 · 같은 소켓 level 갱신 분기에서 `lv === "full"` 블록을 바꾼다. 새 키 분기와 같은 방식으로 this.#hub.getSnapshot(msg.isin, msg.ex) 이 있으면 this.#send(conn, snapshot) 을 **먼저** 하고, 그다음 기존 this.#sendTapeSnapshot(conn, msg.isin, msg.ex) 를 둔다. 블록 주석은 이유로 다시 쓴다. price 소켓은 가격 섹션이 바뀐 59 만 받았으므로 그 사이 호가 틱(매수1잔량 등)이 빠져 있다. 업스트림이 이미 FULL 이면(다른 소비자) hub 승격도 없어 58 이 오지 않으므로, 캐시(#onQuote 가 모든 59 로 갱신)를 즉시 준다. 업스트림이 PRICE 였으면 hub 승격 28 의 58 이 곧 덮는다. 옛 「q 는 이미 받고 있으므로 다시 보내지 않는다」 문장은 지운다. full→price 강등 분기는 바꾸지 않는다.
(2) 파일 헤더 규칙 7(:22-26)의 「같은 소켓 재 sub 은 level 갱신(같으면 무시)」 뒤에 한 구절을 붙인다: price→full 승격은 q 캐시 → tape 캐시 스냅샷을 그 소켓에 준다(quick-261001-dyi).
(3) hub(subscription-hub.ts)는 수정하지 않는다. getSnapshot 은 이미 있다.
(4) 커밋 2개를 한글 메시지로 남긴다. 예: `test(quick-261001-dyi): price→full 승격 소켓 캐시 q 스냅샷 실패 테스트` → `fix(quick-261001-dyi): 같은 소켓 price→full 승격에 캐시 q 스냅샷을 먼저 보낸다`. 스테이징은 경로를 지정하고 Co-Authored-By 는 넣지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test</automated>
  </verify>
  <done>업스트림 FULL 상태에서 price 소켓이 full 로 승격하면 업스트림 재요청 없이 캐시 q(호가 틱 반영)를 즉시 받고, 순서는 q 다음 tape 다(F9). F3 를 포함한 relay 전체 스위트와 typecheck 두 개가 green 이다. 커밋 2개(RED → GREEN).</done>
</task>

<task type="auto">
  <name>Task 3: 작업대 e2e — 접기 = lv:price sub · 게이트웨이 29 만, 펼치기 = full sub · 게이트웨이 28 · 32, unsub 0</name>
  <files>webapp/e2e/specs/trading-workbench.spec.ts</files>
  <action>
DYI-06 구현(실 relay(소스, Task 2 포함) + 스텁 게이트웨이 · QUOTE_LINGER_MS=0).

(1) `captureOrderFrames`(:410) 바로 아래에 헬퍼 `captureSubFrames(page)` 를 추가한다. 같은 framesent 패턴을 쓴다. :8090 소켓만 보고, 페이로드를 JSON 파싱해 t 가 'sub' 또는 'unsub' 인 프레임만 배열에 모은다(파싱 실패나 다른 t 는 무시).
(2) GC2 테스트(:1626-1671) 바로 뒤에 새 테스트 'GC2b 카드를 접으면 그 키를 price 로, 펼치면 full 로 구독한다 — 브라우저 sub 1건씩 · unsub 0 · 게이트웨이 29 강등 / 28 · 32 승격 (quick-261001-dyi)' 을 추가한다. 순서:
  - page.goto 전에 subs = captureSubFrames(page) 를 등록하고 relay.seedLimitChasers([{ buyEnabled: true }]) 한 뒤 openFocusedCard(page) 로 펼친 카드와 상한가 시딩을 기다린다.
  - 기준선을 잡는다. base = subs.length, 그리고 relay.requestLog() 의 28 · 29 · 32 개수.
  - 토글을 눌러 접는다(toggleOf(page, E2E_ISIN).click()) → data-open "false". expect.poll 로 subs.slice(base) 중 isin === E2E_ISIN 인 것이 정확히 [{t:'sub', isin:E2E_ISIN, ex:'KRX', lv:'price'}] 가 되기를 기다린다. 게이트웨이 29 개수 ≥ 기준+1(poll) 이고 28 · 32 개수는 기준 그대로다(강등 = 29 만). 접힌 헤더 가격(card 안 [data-slot="card-header-price"])은 「—」 가 아닌 숫자를 계속 보인다.
  - 다시 눌러 펼친다 → data-open "true". expect.poll 로 그 키 프레임이 [{…lv:'price'}, {t:'sub', isin:E2E_ISIN, ex:'KRX'}] 가 되기를 기다린다(두 번째에 lv 키 없음 — toEqual 이 lv 부재까지 본다). 게이트웨이 28 · 32 가 각각 기준+1(poll · 승격 28→29(0)→32)이다. 호가 사다리(card.locator('[data-slot="orderbook-ladder"]').first())는 '97,900' 을 담는다.
  - 전체 구간에서 그 키의 t:'unsub' 은 0건이다.
  - 넛지(사용자 세션 Ready 때 29 1건)가 기준선 뒤에 늦게 끼어들 수 있으므로 29 는 「≥」 로, 28 · 32 는 정확히 단언한다(넛지는 28 · 32 를 보내지 않는다 — hub 헤더 Pattern 10).
(3) 실행은 단독(-g "GC2b")으로 먼저 하고, 접힌 카드가 처음부터 price 로 구독하게 된 영향 확인을 위해 작업대 스펙 전체를 알려진 deferred 3건만 빼고 돌린다(26-08 과 같은 제외식). 실패가 나면 이 변경 탓인지 26-05 deferred(카드 헤더 이름 말줄임 `over 26`/`over 24`)인지 수치로 가른다. Next webServer 기동 타임아웃이 NextFontGoogleFontFileReplacer 반복이면 webapp/.next 를 지우고 다시 돌린다(코드 문제 아님). 포트 8090 · 3100 이 비어 있어야 한다.
(4) 커밋 1개를 한글 메시지로 남긴다. 예: `test(quick-261001-dyi): 작업대 카드 접기/펼치기 구독 level e2e`. 경로를 지정해 스테이징하고 Co-Authored-By 는 넣지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "GC2b" && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts --grep-invert "5\. 격자 1/2/3단|P20-3 최악값|16px 다"</automated>
  </verify>
  <done>GC2b 가 green 이다. 작업대 스펙 전체(제외 3건)가 0 failed 다. 통과 수와 소요 시간을 SUMMARY 에 적는다. 커밋 1개.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → relay wss | 구독 제어 프레임(sub/unsub · lv). 사용자 조작(접기/펼치기 연타)이 프레임 수를 늘릴 수 있다 |
| relay → browser | 공개 시세(q · tape) 팬아웃. 승격 스냅샷은 그 소켓이 이미 구독 중인 키의 전역 캐시다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dyi-01 | D (DoS) | 접기/펼치기 연타 → sub 프레임 폭주 | low | mitigate | 전환 1회 = 와이어 sub 최대 1건(다른 full 소비자가 있으면 0)이다. use-relay-socket 초당 6건 버킷(SUB_FRAME_RATE_PER_SEC)이 relay 인바운드 상한 아래로 흘리고, relay 는 같은 level 재 sub 을 무시한다(fanout.ts:996). 승격 · 강등은 업스트림 29 · 28/32 를 만들지만 hub 키 단위 1회다 |
| T-dyi-02 | T (Integrity · 표시 무결성) | 펼친 직후 낡은 호가가 신선한 값으로 보임 → D-36 판정 입력(매수1잔량) 오판 | medium | mitigate | Task 2 — 승격 시 hub 캐시 q 를 tape 보다 먼저 즉시 보낸다(F9). 업스트림이 PRICE 였던 키는 hub 승격 58 이 덮는다 |
| T-dyi-03 | D (자원 누수) | 탭 참조계수 누수 → 업스트림 구독 영구 잔류 · 사용자 200 한도 소진 | medium | mitigate | 훅이 「잡고 있는 level」 ref 로 정확히 그 level 을 해제한다. L3(전환 3회 뒤 언마운트 unsub 정확히 1건 · 재마운트 sub 1건)와 strategy-card 전환 뒤 언마운트 단언으로 고정한다 |
| T-dyi-04 | I (정보 노출) | 승격 스냅샷 | low | accept | 그 소켓이 이미 구독 중인 키의 공개 시세라 새 노출이 없다. 계좌 · 83 경로는 건드리지 않는다 |
</threat_model>

<verification>
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` (config build_command)
- `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` (config test_command — 전량 green, 수치는 SUMMARY 에)
- `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts --grep-invert "5\. 격자 1/2/3단|P20-3 최악값|16px 다"` — 0 failed
- `git log --format=%B -n 5 | grep -ci "co-authored-by"` 결과가 0 이다(이 quick 커밋에 트레일러가 없다)
</verification>

<success_criteria>
- 펼친 카드 = full, 접힌 카드 = price 구독(DYI-01)이다. 전환은 새 level 먼저 잡아 와이어 unsub 이 0 이고(DYI-02), 해제 균형으로 누수가 0 이다(DYI-03).
- 접힌 헤더 표시 계약이 불변이다(p · cr 갱신 유지 · 칩 · LED · 83 무관 — DYI-04).
- relay 승격 스냅샷으로 펼친 직후 호가가 relay 왕복 1회 안에 최신이 된다(DYI-05).
- 단위 · 통합 · e2e 가 green 이고(DYI-06), 커밋 5개(Task1 2 · Task2 2 · Task3 1)를 한글 메시지 · 트레일러 없음 · 경로 지정 스테이징 · master 로 남긴다. push · 배포는 하지 않는다.
</success_criteria>

<output>
Create `.planning/quick/261001-dyi-full-price-full/261001-dyi-SUMMARY.md` when done. 반드시 포함할 것:
- 「접힌 헤더가 읽는 값」 표(p · cr = 가격 섹션 / 칩 = 계좌 66·67 / LED = 서버 에코 / 83 = 사용자 세션)와 설계 결정 ①~④
- 테스트 수치(webapp · relay 전량, e2e 통과 수 · 소요 시간)와 RED 실패 메시지 원문 한 줄씩
- 남은 위험: 접힌 카드 price sub 이 돌파 칩과 같은 flush 순위다(설계 결정 ③). 새로고침 직후 칩이 먼저 삽입되는 드문 순서에서는 접힌 헤더 가격이 초당 6건 버킷만큼 늦을 수 있다
- 배포 순서(메인 세션 몫): **relay 먼저**(fanout 변경 — 배포 스크립트 · smoke 는 26-15 와 같다) → 검증 → **webapp push**(= Vercel 프로덕션). 어느 쪽을 단독으로 배포해도 와이어 호환이다. webapp 만 나가면 펼친 직후 호가가 다음 FULL 59 까지 낡을 수 있고(업스트림 FULL 키 한정), relay 만 나가면 돌파 칩 + 카드 승격의 잠복 결함이 먼저 고쳐진다
</output>
