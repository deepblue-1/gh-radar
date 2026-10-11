---
phase: quick-260923-elb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/__tests__/relay-provider.test.tsx
  - webapp/src/components/orderbook/trade-tape.tsx
  - webapp/src/components/orderbook/orderbook-ladder.tsx
  - webapp/src/components/orderbook/__tests__/trade-tape.test.tsx
  - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
  - webapp/src/lib/use-breakout-quotes.ts
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
  - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
autonomous: true
requirements: [ELB-1A, ELB-2A, ELB-3A]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "시세(q)·체결(tape) 프레임은 도착 즉시 상태에 넣지 않고 최대 100ms(RELAY_MARKET_BATCH_MS) 모았다가 한 번의 상태 갱신으로 적용한다. 돌파 40종목이 붙어도 시장 데이터가 일으키는 커밋은 초당 약 10회를 넘지 않는다 (1a · ELB-1A)"
    - "주문 통보(order)·계좌(acct)·상따(lc/lc.snap)·VI(vi/vi.list/vi.notice)·메시지(msg)·상태(state)·돌파(rate.cross*)·발주창(queued.window)·일괄중지(strategies.disabled) 프레임은 지연 없이 즉시 반영된다. 그 직전에 도착해 대기 중이던 시세·체결이 같은 상태 갱신 안에서 먼저 적용된다(도착 순서 보존). order.result 경로는 바뀌지 않는다 (1a)"
    - "같은 창 안의 여러 시세 프레임은 종목별로 순차 병합한 것과 같은 결과다(snap 뒤 delta 는 필드 병합 · 마지막 값이 이긴다). 체결은 도착 순서대로 앞에 붙고 키당 200건 상한이다 (1a)"
    - "소켓이 닫히거나 연결 effect 가 정리될 때 대기 중인 시세·체결은 버려지지 않고 먼저 반영된다. 정리 뒤 배치 타이머가 남지 않는다. 알림 수신 시각(toLocaleTimeString)은 msg 프레임에서만 계산한다 (1a)"
    - "상따 사다리의 compact 체결 테이프는 DOM 에 1벌뿐이다. 트리 밖에 있고 본문 830 미만에서만 보인다(컨테이너 쿼리 클래스 — JS 폭 판정 없음). 1단(~699)·2단(700~829) 밴드 모두 사다리 바로 아래 같은 자리에 보이고, 830 이상에서는 3단 표의 최근 체결 10건이 대신한다 (3a · ELB-3A)"
    - "체결 테이프 행은 체결 식별 키로 재사용된다. 새 체결이 앞에 붙어도 기존 행의 DOM 노드는 그대로다. 맨 위 고정(pinned) 중에는 50행(TAPE_RENDER_WINDOW)만 그리고, 사용자가 스크롤을 내리면 링버퍼 200건 전부를 볼 수 있다. 행 클래스 문자열·배치 플래시·핀 버튼·sr-only 매수/매도는 바뀌지 않는다 (3a)"
    - "돌파 칩·표의 현재가·등락률과 이탈 판정은 초당 최대 2회(BREAKOUT_PRICE_THROTTLE_MS=500) 갱신되고, 마지막 값은 반드시 도착한다. 돌파 스트립은 렌더 중에 상태를 갱신하지 않는다. 새 76 행이 첫 렌더부터 강조·알림 기록되는 규칙과 78·첫 채움 무음 규칙은 그대로다 (2a · ELB-2A)"
    - "SUMMARY 에 perf 하니스 전후 수치(main%·renderer%·commits/s·DOM 노드·주요 렌더/s)가 cards3 버스트 · cards3+돌파40 버스트 · cards3+돌파40 분산 시나리오로 기록된다. 돌리지 못했다면 못 돌린 사유가 명시돼 있다"
  artifacts:
    - path: "webapp/src/lib/use-relay-socket.ts"
      provides: "RELAY_MARKET_BATCH_MS · RELAY_MARKET_BUFFER_MAX · 연결 effect 안의 시장 프레임 버퍼 · 리듀서 frames 액션(market 배열 → 비시장 프레임 1건 순서) · applyMarketFrames(copy-on-write)"
      contains: "RELAY_MARKET_BATCH_MS"
    - path: "webapp/src/components/orderbook/trade-tape.tsx"
      provides: "TAPE_RENDER_WINDOW · tapeRowKeys(체결 식별 키 + 중복 서수) · memo 행 컴포넌트 · 모듈 상수 className · memo TradeTape"
      exports: ["TradeTape", "tapeRowKeys", "TAPE_RENDER_WINDOW", "formatTapeTime", "formatTapeTimeShort", "deriveTapeSides", "tapeSidesOf"]
    - path: "webapp/src/components/orderbook/orderbook-ladder.tsx"
      provides: "ChaserLadder 트리 3벌 밖의 compact 테이프 1벌(data-slot ladder-tape · @min-[830px]/lc:hidden)"
      contains: "ladder-tape"
    - path: "webapp/src/lib/use-breakout-quotes.ts"
      provides: "BREAKOUT_PRICE_THROTTLE_MS · 후보 ISIN 전체의 스로틀된 prices 맵(구독 diff 규칙 불변)"
      contains: "BREAKOUT_PRICE_THROTTLE_MS"
    - path: "webapp/src/components/trading/workbench/breakout-strip.tsx"
      provides: "advanceTracked 순수 함수 + 마지막 커밋 기록 ref(레이아웃 effect 로 갱신) · memo 칩/표"
      contains: "advanceTracked"
  key_links:
    - from: "webapp/src/lib/use-relay-socket.ts (ws.onmessage)"
      to: "webapp/src/lib/relay-provider.tsx (RelayContext 값)"
      via: "q/tape → 효과 범위 버퍼 → 100ms 타이머 또는 비시장 프레임 도착 → dispatch({type:frames}) 1회 → data → useMemo 연결 객체"
      pattern: "type: \"frames\""
    - from: "webapp/src/lib/use-breakout-quotes.ts"
      to: "webapp/src/components/trading/workbench/breakout-strip.tsx"
      via: "prices(500ms 스로틀) → priceOf → advanceTracked(이탈·무장) · views(칩·표 현재가)"
      pattern: "prices"
    - from: "webapp/src/components/orderbook/orderbook-ladder.tsx (ChaserLadder)"
      to: "webapp/src/components/orderbook/trade-tape.tsx"
      via: "트리 밖 ladder-tape 래퍼 안의 compact TradeTape 1개 — recentTrades · quote.ap[0]/bp[0]"
      pattern: "ladder-tape"
---

<objective>
`/trading` 작업대 CPU 1단계. 진단 보고서 `.planning/debug/trading-cpu-260923.md`(사용자 전역 `Debug` 패턴으로 gitignore 됨 — 직접 읽는다)의 수정안 1a · 3a · 2a 를 그 권장 순서대로 적용한다. **1b(컨텍스트 분리) · 2b(relay 가격 전용 구독) · 3b(JS 로 활성 트리만 렌더)는 범위 밖이다.**

진단 요지(실행자가 다시 조사할 필요 없음): CPU = 커밋 수/초 × 커밋 1회 비용.
- (A) `use-relay-socket.ts:1015` 가 `order.result` 외 모든 ws 프레임을 1건씩 dispatch → RelayContext 값이 프레임마다 바뀌어 `/trading` 트리 전체가 어느 종목의 틱이든 다시 그려진다.
- (B) 돌파 스트립이 최대 40종목의 풀 스트림을 구독 → 프레임 43 → 615/s. 도착이 분산되면 커밋 140/s · main 98.8%.
- (C) `ChaserLadder` 가 반응형 트리 3벌을 전부 렌더하고, 숨은 1단·2단 트리가 각각 200행 index-key 테이프를 가진다 → 커밋 1회 ≈ 7~8ms, 3카드 DOM 17k.

이번 plan 이 하는 일:
- **1a (Task 1):** q/tape 프레임만 100ms 모아 한 번에 적용한다. 비시장 프레임은 대기분을 먼저 flush 한 뒤 **같은 dispatch** 로 즉시 적용한다. clockStamp 는 msg 에만 계산한다. 어블레이션 실측: 최악(돌파40 분산) main 98.8 → 20.2%, 버스트 44.1 → 21.3%.
- **3a (Task 2):** compact 테이프를 트리 밖 **1벌**로 합치고 CSS 컨테이너 쿼리로 노출한다. 행 키를 체결 식별로 바꾸고, 행은 memo, 렌더 행 수는 창으로 제한, 행 className 은 상수화한다. 어블레이션: 트리 1벌 3카드 33.4 → 19.5%, 테이프 30행 상한(3열) 44.1 → 28.2%.
- **2a (Task 3):** 돌파 칩 가격 갱신을 2Hz 로 제한하고 렌더 중 setState 를 제거한다. 끝으로 전량 게이트를 돌리고 perf 하니스로 전후를 잰다.

Purpose: 팬리스 MacBook Air 에서 `/trading` 을 열면 Chrome renderer 가 1코어 이상을 지속 점유하고 스로틀링이 걸려 「컴퓨터가 느려진다」. 커밋 수(1a·2a)와 커밋 비용(3a)을 각각 줄여 곱을 줄인다. 거래 신호(주문·통보·VI·상따) 지연은 0 이어야 한다.
Output: 코드 커밋 3건(Task 별 · 한글 · push 없음) + SUMMARY(전후 수치표).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/debug/trading-cpu-260923.md

@webapp/src/lib/use-relay-socket.ts
@webapp/src/lib/relay-provider.tsx
@webapp/src/lib/use-breakout-quotes.ts
@webapp/src/components/trading/workbench/breakout-strip.tsx
@webapp/src/components/orderbook/orderbook-ladder.tsx
@webapp/src/components/orderbook/trade-tape.tsx

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 필요한 계약·위치를 옮겨 둔다. 줄 번호는 a46131f 기준 근사값이다. -->

packages/shared/src/relay.ts
- `RelayQuote = { t:"q"; i; x; snap:boolean; p; o; h; l; c; cs; cr; v; va; ap[10]; aq[10]; bp[10]; bq[10]; ta; tb; ul; ll; base; viu; vid; kc; ls; et }` (L628)
- `RelayTapeEntry = { t:string(HHMMSSuuuuuu); p; cs; c; q; cv(누적거래량); bs:""|"1"|"2" }` (L682). 와이어에 체결 고유 id 는 없다. cv 는 체결마다 증가하는 누적거래량이다.
- `RelayTape = { t:"tape"; i; x; snap:boolean; e: RelayTapeEntry[] }` (L708). 와이어 배치는 시간 오름차순이다.
- `RelayOutbound` 유니온 (L1082)

webapp/src/lib/use-relay-socket.ts
- 헤더 규율 1~7 (L14-34) · `MAX_TAPE = 200` (L76) · `clockStamp(now)` (L154, `toLocaleTimeString("ko-KR",{hour12:false})`)
- `RelayAction` (L443-451): `local-status` | `frame{frame, at}` | `stale` | `reset`
- `relayReducer` (L453) → `applyFrame(state, frame, at)` (L479). `q` 병합 규칙(L497-506): `frame.snap || prev == null ? frame : {...prev, ...frame}`, snap 이면 `isStale:false`. `tape`(L508-516): `[...frame.e].reverse()` 후 snap 이면 교체, 아니면 앞에 붙이고 `.slice(0, MAX_TAPE)`. `msg`(L534) 는 `receivedAt: at`.
- 연결 effect (L911-1100, deps `[enabled, reconnectNonce, abandonPendingOrders]`): `let attempt` (L921) · `ws.onmessage` (L988-1016, state 인증 ACK 처리 → order.result 는 Promise 로 흘리고 return → L1015 `dispatch({type:"frame", frame, at: clockStamp(new Date())})`) · `ws.onclose` (L1022-1060: abandonPendingOrders → disposed 면 return → 4401/4400 → `stale` → 백오프) · cleanup (L1065-1099)
- 반환 `useMemo` (L1195-1225) 는 `data` 에 의존한다(1b 범위 — 건드리지 않는다)

webapp/src/lib/__tests__/relay-socket.test.ts
- `render()` L244 · `connected(hook)` L251 · `quoteOf`/`tapeOf` L266-282 · `beforeEach` 에 `vi.useFakeTimers()` L286
- 영향 케이스: ⑤ L358 · ⑤-a L374(q 만 push 후 즉시 단언 → 배치 뒤로 늦어진다) · ⑧ L451(q 후 serverClose — close flush 로 무수정 통과해야 한다) · ⑫ L590(q+acct 같은 act — acct 가 flush) · ⑬ L736 · ⑬-a L758(tape 만) · ⑭ L771(뒤따르는 알 수 없는 `t` 가 flush)
webapp/src/lib/__tests__/relay-provider.test.tsx
- `quoteFrame` L133 · fake timers L348 · `acceptAndAuth()` · ⑤ L503 · ⑤-a L528(q 만 → 배치 뒤로) · ⑦ L742(q + lc.snap 같은 act → flush 로 무수정 통과)

webapp/src/components/orderbook/trade-tape.tsx
- `MAX_TAPE=200` L50 · `FLASH_MS=140` · `FLASH_BG`/`FLASH_FADE` L55-59 · `priceTone` L95 · `entryKey(e)` = `${t}|${p}|${q}|${cv}` L199
- `TradeTape` L203: `rows = entries.slice(0,200)` L224 · `sides` = `tapeSidesOf(rows, bestAsk, bestBid)` L225 · 배치 플래시 effect L234-266(헤드 키로 신규 수 계산 → `setFlashCount` + 140ms 뒤 0) · `handleScroll`(scrollTop<=4 → pinned) · 행 map L400-446(지금 인덱스 기반 행 키, 행마다 `cn()` 2~3회)
- compact 경로: `data-compact="true"` · 스크롤 박스 `data-slot="tape-scroll"` `tabIndex=0` `max-h-[200px]`

webapp/src/components/orderbook/orderbook-ladder.tsx
- `ChaserLadder` L654 · JSDoc 「트리가 셋」 L637-652 · 3단 트리 L902(`hidden @min-[830px]/lc:block`, 최근 체결 10건 내장) · 2단 트리 L1047-1108(`hidden @min-[700px]/lc:block @min-[830px]/lc:hidden` · 240px 박스 `ladder-scroll-two` · 그 뒤 hr L1099 + compact TradeTape L1100-1107) · 1단 트리 L1111-1248(`@min-[700px]/lc:hidden` · 340px 박스 `ladder-scroll` · 주석 L1228-1238 · hr L1239 + compact TradeTape L1240-1247)
- 두 테이프의 props: `compact entries={recentTrades} isStale={isStale} basePrice={basePrice} bestAsk={quote.ap[0]} bestBid={quote.bp[0]}`
- 가장 가까운 `@container/lc` 조상은 카드 래퍼 · 호가 탭 본문 래퍼다(card-body.tsx:15). 경계 수치의 정본은 globals.css §2.2b 다.

webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
- `renderChaser()` L80(`makeTrades()` = 10건) · ⑦ L312(tabbables 4개 `['ladder-scroll-two','tape-scroll','ladder-scroll','tape-scroll']` L346-352) · ⑧ L371(compact 테이프 2 · hr 2) · ⑪ L435(10px 총계 90 = 등락률 60 + 3단 체결시각 10 + 테이프 2벌×10) · ⑰f L702(테이프가 2단 트리 안 · 박스 밖) · ⑰g L713
webapp/src/components/orderbook/__tests__/trade-tape.test.tsx
- `entry()`/`tape()` L22-31 · ⑤ L216(260건 → 행 201 = 헤더 + 200) · ⑦ L235(스크롤 → 핀 버튼)

webapp/src/lib/use-breakout-quotes.ts (145줄 전체)
- `breakoutQuotePrice(quotes, isin)` L52(KRX 키 · 유한 양수만 · 모르면 undefined) · `BreakoutQuotesResult {quotes, subscribed, overflow}` L66 · `pickWithinBudget` L76(매 렌더 정렬) · `useBreakoutQuotes` L94(`useRelayContext()` 의 subscribe/unsubscribe/quotes · sig 기반 diff effect · 언마운트 전량 해제)
webapp/src/components/trading/workbench/breakout-strip.tsx
- `Tracked {items, seq, priceSig, now, meta, firstTime, removed}` L100 · 추적 상태 useState L128-136 · `candidates` L139(addedAt = tracked.meta) · `useBreakoutQuotes` L144 · `priceOf`/`priceSig` L145-146 · **렌더 중 상태 갱신 블록 L148-179**(silent 규칙 · `trackBreakoutMeta` · firstTime 유지 · removed/되살림 · `shouldRemoveBreakout`) · `rows` L181 · 알림 effect L193 · 1초 tick L203 · `views` L223 · `BreakoutChip` L362 · `BreakoutTable` L411
- 작업대 전달값: `onAddCard`/`onFocusCard` 는 `useCallback`, `cards` 는 `useMemo` Set(trading-workbench.tsx L496/507/744)
webapp/src/lib/breakout-list.ts
- `trackBreakoutMeta(prev, items, {now, silent, priceOf})` L240: 처음 보는 키는 `addedAt: opts.now`(현재 벽시계), 무장(armed)은 등재 뒤 관측 가격으로만.
webapp/src/lib/__tests__/use-breakout-quotes.test.tsx: `mockRelay`(L19-40 · `EMPTY_RELAY_VALUE` 기반) · 「quotes 는 컨텍스트 맵을 그대로 돌려준다」 L92
webapp/src/components/trading/__tests__/breakout-strip.test.tsx: `quotesMap` 모킹 L21-29 · `setPrice` L93 · fake timers(setTimeout·Date 포함) L132 · 이탈 대조군 L394-406 · 현재가 표시 L408

perf 하니스 (throwaway · 레포 밖): `/private/tmp/claude-501/-Users-alex-repos-gh-radar/859e0909-ebce-44d2-9d01-d695f16e2013/scratchpad/perf/`
- `harness/run.mts`: `ROOT = <run.mts 의 상위 디렉터리>/..` 라서 `<worktree>/perf/run.mts` 에 두고 `<worktree>/relay` 에서 `./node_modules/.bin/tsx ../perf/run.mts` 로 실행한다. 스텁 supabase+api `:54399` · 실 relay `:8190` · prod webapp `:3190`(별도 `next start`) · 쿠키 `sb-localhost-auth-token`. env: `CARDS` `BREAKOUT` `SPREAD_MS` `COLS` `DURATION_S` `Q_HZ`(10) `TAPE_HZ`(5) `OPEN_CARDS`(1). 한 줄 JSON 출력: `mainThreadBusyPct` · `chromeCpuPct.renderer` · `commitsPerS` · `domNodes` · `rendersPerS{...}`
- `harness/instrument.py <webapp dir>`: 렌더 카운터 삽입(`@/lib/perf-probe` import). 대상 시그니처 목록이 파일 안에 있다. `harness/perf-probe.ts` → `webapp/src/lib/perf-probe.ts`.
- `ablation-instrumentation.patch` 는 **적용하지 않는다**(어블레이션 스위치용). 단 거기 있는 `next.config.ts` 의 `eslint: { ignoreDuringBuilds: true }` 한 줄은 worktree 안에서만 흉내 낸다.
- 기준 수치(보고서, b99a195 + probe, 같은 기계): 3카드 버스트 main 33~35% · renderer 43~44% · 커밋 44/s · DOM 17k / 3카드+돌파40 버스트 41~44% / 3카드+돌파40 분산100 main 98.8% · renderer 113~121% · 커밋 123~140/s. 원자료 `scratchpad/perf/*.jsonl`, `results-spread.txt`.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): 1a 시세·체결 프레임 100ms 배치 적용 — 비시장 프레임은 대기분 flush 후 같은 dispatch 로 즉시 · clockStamp 는 msg 에만 (ELB-1A)</name>
  <files>webapp/src/lib/use-relay-socket.ts, webapp/src/lib/__tests__/relay-socket.test.ts, webapp/src/lib/__tests__/relay-provider.test.tsx</files>
  <behavior>
    작업을 시작하기 **전에** `git rev-parse HEAD` 를 BASE_SHA 로 적어 둔다(Task 3 의 「전」 측정 기준점). relay-socket.test.ts 에 새 describe 「시세·체결 프레임 배치 (quick-260923-elb 1a)」를 추가한다. 렌더 수는 `renderHook((p) => { renders += 1; return useRelayConnection(p); })` 로 센다. 이 파일은 이미 fake timers 다.
    - ⓐ 인증 뒤 2종목에 q 를 섞어 push 한다(A: snap p=70,000 ul=89,700 → delta p=70,500 → delta p=70,700 / B: snap). `RELAY_MARKET_BATCH_MS - 1` 을 진행해도 `quoteOf` 는 둘 다 null 이다. 1ms 를 더 진행하면 둘 다 반영된다. A.p 는 70,700 이고 A.ul 은 89,700 으로 남는다(순차 병합과 같다). 렌더 수는 정확히 +1 이다.
    - ⓑ (it.each) q 가 대기 중일 때 비시장 프레임 하나(`acct` · `order` · `lc` · `vi.notice` · `msg` · `state`(ready 반복))가 오면, 타이머를 진행하지 않아도 그 프레임과 대기 q 가 **같은 렌더**에서 함께 보인다(렌더 +1). 뒤이어 `RELAY_MARKET_BATCH_MS` 를 진행해도 렌더가 더 늘지 않는다(버퍼가 비었다).
    - ⓒ q 를 push 한 직후(타이머 진행 없음) 서버가 1006 으로 닫으면 그 q 가 보이고 `isStale` 은 true 다.
    - ⓓ q 를 push 한 뒤 unmount 하면 `vi.getTimerCount()` 는 0 이다. `enabled:false` 전환에서는 상태가 초기값(quotes 비어 있음)이다.
    - ⓔ `vi.spyOn(Date.prototype, 'toLocaleTimeString')`: q/tape 40건을 push 하고 flush 해도 호출 0회다. `msg` 1건이면 1회이고, `messages[0].receivedAt` 은 빈 문자열이 아니다.
    - ⓕ `RELAY_MARKET_BUFFER_MAX` 건을 push 하면 타이머 진행 없이 바로 반영된다(백그라운드 탭 타이머 지연 안전판).
    - 기존 ⑤ · ⑤-a · ⑬ · ⑬-a(relay-socket)와 ⑤ · ⑤-a(relay-provider)에는 파일 상단 helper `flushMarket()` = `act(() => vi.advanceTimersByTime(RELAY_MARKET_BATCH_MS))` 호출을 단언 **앞에** 넣는다. 이것은 「시세 반영은 ≤100ms 뒤」라는 관측 계약이 바뀐 것을 반영하는 수정이다. 단언 본문은 그대로 둔다. ⑧ · ⑫ · ⑭ · ⑦(provider)은 **무수정**으로 통과해야 한다. 이 넷이 close flush · 비시장 flush 의 회귀 증거다.
  </behavior>
  <action>
    **use-relay-socket.ts (per 1a — 설계 결정을 문서 주석에 남긴다):**
    - 상수 구역에 `export const RELAY_MARKET_BATCH_MS = 100` 을 둔다. JSDoc 에는 세 가지를 적는다. 첫째, 100 인 이유: 보고서 어블레이션에서 돌파40 분산 최악이 16ms 는 49.9%, 100ms 는 20.2% 였다. 게이트웨이 TickOnce 가 100ms, relay TAPE_BATCH_MS 가 200ms 라서 표시 지연은 게이트웨이 1틱 이하다. 둘째, rAF 가 아니라 타이머인 이유: 백그라운드 탭에서는 rAF 가 멈춘다. 셋째, 합치는 것은 q/tape 뿐이다. `export const RELAY_MARKET_BUFFER_MAX = 1000` 도 둔다. 버퍼가 이 수에 닿으면 즉시 flush 한다. 숨은 탭의 타이머는 ≥1s 로 늦춰지는데, 최악 600프레임/s 라도 메모리를 묶어 두기 위해서다.
    - `@gh-radar/shared` 에서 `RelayTape` 타입을 import 한다. `type RelayMarketFrame = RelayQuote | RelayTape` 와 타입 가드 `isMarketFrame(f)`(`t === "q" || t === "tape"`)를 둔다.
    - `RelayAction` 의 `frame` 갈래를 `{ type: "frames"; market: readonly RelayMarketFrame[]; frame: RelayOutbound | null; at: string }` 로 **교체**한다. 경로는 하나뿐이다. 리듀서는 `market` 을 먼저 도착 순서대로 적용하고, 그 결과에 `frame` 을 `applyFrame` 으로 적용한다. `at` 은 `frame.t === "msg"` 일 때만 뜻이 있고, 나머지는 빈 문자열이다.
    - `applyMarketFrames(state, market)` 를 새로 만든다. 지금 `applyFrame` 의 `q`/`tape` case 본문과 주석(D-33 snap/병합 · 와이어 오름차순 → 뒤집어 prepend · MAX_TAPE)을 **그대로** 옮긴다. 다만 Map 복사는 액션당 최대 1번만 한다(copy-on-write). 첫 q 에서 `new Map(state.quotes)`, 첫 tape 에서 `new Map(state.tapes)` 을 만들고, 이후 같은 배치의 프레임은 그 작업용 Map 위에서 순차 병합한다. snap q 는 `isStale=false`. `applyFrame` 에서는 q/tape case 를 지운다. default 주석에는 「q/tape 는 여기 오지 않는다 — applyMarketFrames 한 곳」을 더한다. 설계 주석에는 이렇게 적는다. 1a 의 「같은 종목 여러 q 합치기」는 버퍼에서 미리 뭉개지 않는다. 대신 **한 액션 안의 순차 병합**으로 한다. 그래서 결과가 1건씩 적용한 것과 정확히 같다(snap 뒤 delta 필드 보존 · 마지막 값 우선 · 체결은 도착 순 prepend + 200 상한).
    - 연결 effect 안(`let attempt = 0` 옆)에 **effect 범위** 변수 두 개(대기 배열 · 타이머)와 `flushMarket()` 를 둔다. `flushMarket()` 는 타이머를 지우고, 배열을 떼어 낸 뒤, 비어 있지 않을 때만 `frames` 를 `frame: null` 로 dispatch 한다. ref 를 쓰지 않는 이유는 연결 수명과 버퍼 수명을 같게 두기 위해서다(재연결 effect 재실행마다 새 버퍼).
      · `onmessage`: 인증 ACK 처리와 `order.result` 분기는 **지금 그대로 먼저** 한다. 그 뒤 `isMarketFrame` 이면 대기 배열에 넣고 return 한다. 이때 상한에 닿았으면 즉시 flush 하고, 타이머가 없으면 `setTimeout(flushMarket, RELAY_MARKET_BATCH_MS)` 을 건다. 비시장 프레임이면 대기 배열을 떼어 타이머를 지우고, `dispatch({ type: "frames", market: 떼어 낸 배열, frame, at: frame.t === "msg" ? clockStamp(new Date()) : "" })` **한 번**으로 보낸다. 알 수 없는 `t` 도 비시장으로 취급한다(리듀서가 무시한다).
      · `onclose`: 맨 앞에서 `flushMarket()` 를 부른다. `stale` 전이보다 먼저 와야 「마지막 값 유지」 규율(헤더 5)이 닫힌 소켓의 마지막 틱까지 포함한다.
      · cleanup: `disposed = true` 직후 `flushMarket()` 를 부른다. 타이머 해제가 여기서 보장된다. `enabled:false` 는 그 뒤 새 effect 실행의 `reset` 이 비운다.
    - `clockStamp` JSDoc 에 「msg 프레임에서만 호출한다 — 매 프레임 호출이 포화 프로파일 단독 2.7% 였다(quick-260923-elb)」를 더한다.
    - 파일 헤더 규율 목록에 **8.** 을 추가한다. 내용: 시세·체결은 100ms 모아 한 번에 적용한다(커밋 수 상한 — 1개 컨텍스트가 프레임마다 바뀌면 `/trading` 전체가 다시 그려진다). 주문·통보·계좌·전략·VI·메시지·상태는 지연하지 않고, 대기분을 먼저 flush 한 뒤 같은 dispatch 로 순서를 보존한다. `order.result` 는 원래 dispatch 밖이다.
    - 반환 `useMemo` · 컨텍스트 모양 · `relay-provider.tsx` 는 **건드리지 않는다**(1b 범위 밖).
    **테스트:** behavior 의 새 describe 와 helper 삽입. 구현 전에 새 케이스가 RED 인 것을 한 번 관측한다(ⓐ ⓑ ⓔ).
    **tracer 인 이유:** 이 변경이 와이어 → 리듀서 → 컨텍스트 → `/trading` 모든 소비자 경로를 관통한다. 실 relay 픽스처를 쓰는 Playwright(trading-workbench · orderbook)로 끝단까지 증명한다. e2e 가 push 직후 대기 없는 동기 읽기(`textContent()` 즉시 비교 등)로 실패하면, web-first 단언(`await expect(...).toHaveText`)으로 바꾸는 것만 허용한다. 그 경우 파일을 이 Task 커밋에 포함하고 SUMMARY 에 적는다.
    **커밋:** `perf(quick-260923-elb): 시세·체결 프레임을 100ms 모아 한 번에 적용하고 알림 시각은 msg 에만 찍는다` — 명시 경로만 stage 한다. 직전에 `git status --short` 로 relay/ · 다른 quick 디렉터리가 섞이지 않았는지 확인한다. Co-Authored-By 는 넣지 않고 push 도 하지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts src/lib/__tests__/relay-provider.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && grep -q 'RELAY_MARKET_BATCH_MS = 100' webapp/src/lib/use-relay-socket.ts && pnpm --filter @gh-radar/webapp exec eslint src/lib/use-relay-socket.ts && pnpm --filter @gh-radar/webapp exec playwright test trading-workbench orderbook</automated>
  </verify>
  <done>새 describe ⓐ~ⓕ 가 GREEN 이다. 구현 전 RED 도 관측했다. ⑧·⑫·⑭·⑦(provider)은 무수정 통과이고, ⑤·⑤-a·⑬·⑬-a·provider ⑤·⑤-a 는 flush helper 삽입만으로 통과한다. typecheck·eslint exit 0. Playwright trading-workbench + orderbook 0 failed. BASE_SHA 가 기록돼 있다. 한글 커밋 1건(명시 경로 · push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 3a compact 체결 테이프 1벌 통합(트리 밖 · 컨테이너 쿼리) + 체결 식별 행 키 · memo 행 · 렌더 창 50 · 상수 className (ELB-3A)</name>
  <files>webapp/src/components/orderbook/trade-tape.tsx, webapp/src/components/orderbook/orderbook-ladder.tsx, webapp/src/components/orderbook/__tests__/trade-tape.test.tsx, webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx</files>
  <behavior>
    trade-tape.test.tsx:
    - `tapeRowKeys`: 결과 길이는 입력과 같고 키는 전부 유일하다. [a,b] 의 키와, 앞에 c 를 붙인 [c,a,b] 에서 a·b 의 키가 같다. 내용이 완전히 같은 체결 2건(같은 t·p·q·cv)은 서로 다른 키를 받는다. 중복 서수는 **오래된 쪽(배열 끝)부터** 센다. 그래서 그 앞에 새 체결이 붙어도 두 키가 유지된다.
    - DOM 재사용: [a,b] 를 렌더하고 b 행의 `<tr>` 를 잡는다. [c,a,b] 로 rerender 하면 같은 요소 인스턴스이고 텍스트도 같다. 내용이 같은 **새 객체**로 스냅샷 교체(69)해도 같은 요소 인스턴스다(재마운트 없음).
    - ⑤ 갱신: 260건이면 고정(pinned) 상태에서 본문 행은 `TAPE_RENDER_WINDOW` 개다(+헤더 1). `fireEvent.scroll(scroller, {target:{scrollTop:120}})` 뒤에는 200행이다(+헤더 1). 링버퍼 200 계약은 그대로이고, 렌더 창만 새 계약이다.
    - 나머지 기존 케이스(플래시 · 핀 · 색 · sr-only · compact 10px · colgroup · 빈 상태)는 **무수정** 통과해야 한다. 행·셀 className 문자열이 한 글자도 바뀌지 않았다는 증거다.
    orderbook-ladder-chaser.test.tsx:
    - ⑧: compact 테이프는 **1개**이고 `hr` 도 1개다. 그 테이프는 어느 `[data-slot="ladder-tree"]` 안에도 없다. 가장 가까운 `[data-slot="ladder-tape"]` 의 className 에 `@min-[830px]/lc:hidden` 이 있다. 그 래퍼는 DOM 상 1단 트리(`[data-tree="one"]`) **뒤**에 온다(`compareDocumentPosition`). 3단 표에는 테이프가 없다(기존 단언 유지).
    - ⑦: tabbables 는 3개이고 DOM 순서는 `['ladder-scroll-two','ladder-scroll','tape-scroll']` 이다. 행 tabindex 는 여전히 0개다. 주석은 「스크롤 영역마다 tab stop 1개, 행에는 0개」 계약으로 다시 쓴다.
    - ⑪: 10px 총계 90 → **80**(등락률 60 + 3단 체결시각 10 + 테이프 1벌×10). 계산 주석도 고친다.
    - ⑰f: `tape-scroll` 은 `ladder-scroll-two` · `ladder-scroll` 두 박스 밖이고 모든 트리 밖이다. 체결이 사다리 스크롤에 묻히지 않는다는 원래 목적은 그대로다.
  </behavior>
  <action>
    **trade-tape.tsx (per 3a):**
    - `export const TAPE_RENDER_WINDOW = 50` 을 둔다. JSDoc 에 이렇게 적는다. 맨 위 고정 중에는 이만큼만 그린다. 비 compact 데스크톱 박스 664px 은 약 20행, compact 200px 은 약 8행이 보이므로 2.5배 여유다. 고정이 풀리면(사용자가 스크롤을 내리면) 행 전부(≤200)를 그린다. 그래서 오래된 체결도 스크롤로 닿는다(「스크롤 시 확장」). 링버퍼 200(relay 캐시 · 훅 · `MAX_TAPE`)은 바꾸지 않는다.
    - `export function tapeRowKeys(rows: readonly RelayTapeEntry[]): string[]` 를 만든다. 기본 키는 기존 `entryKey`(t|p|q|cv)다. cv 는 누적거래량이라 체결마다 증가해 사실상 체결 순번이다. 같은 기본 키가 또 나오면 서수 접미사(`#1`, `#2`…)를 붙이는데, 서수는 **배열 끝(가장 오래된 것)부터** 센다. 그래야 앞에 새 체결이 붙어도 기존 키가 변하지 않는다. JSDoc 에는 수신 시 id 를 부여하지 않은 이유를 적는다. 와이어에 체결 id 가 없다. 내용 키는 69 스냅샷 재전송(새 객체 · 같은 내용)에서도 전 행 재마운트 없이 유지된다. shared 타입과 리듀서를 바꿀 필요도 없다.
    - 행 className 은 **모듈 상수**로 미리 만든다. 지금과 같은 인자로 `cn()` 을 모듈 로드 시 1회만 호출한다. 그래야 twMerge 결과인 DOM class 문자열이 오늘과 바이트 단위로 같다. 상수는 네 가지다: 행(compact/full × 플래시 on/off 4개), 시각 셀(compact/full), 체결가 셀(기준가 대비 up/down/flat 3개 — `priceTone` 판정을 톤 키로 바꿔 쓴다), 수량 셀(매수/매도). 이제 행 렌더 경로에서는 `cn()` 을 부르지 않는다.
    - 행 컴포넌트 `TapeRow` 를 `memo` 로 만든다. props 는 `entry` · `isBuy` · `flashed` · `compact` · `basePrice` 다. 마크업은 지금의 `<tr>`(data-side · 셀 3개 · sr-only 매수/매도)과 한 글자도 다르지 않아야 한다. 리듀서가 기존 체결 객체를 그대로 유지하므로 prepend 때 기존 행은 memo 로 건너뛴다.
    - `TradeTape` 본문: `rowKeys = useMemo(() => tapeRowKeys(rows), [rows])` 를 만든다. `sides` 는 **전체 rows** 로 계산한다. zero-tick 상속이 더 오래된 이웃을 보므로, 창으로 먼저 자르면 마지막 보이는 행들의 판정이 바뀐다. 보일 행 수 = 고정(pinned) 중이면 `min(rows.length, TAPE_RENDER_WINDOW)`, 아니면 `rows.length`. 행 키는 `rowKeys[i]` 를 쓴다. 인덱스 기반 행 키를 정당화하던 기존 주석은 새 근거로 **교체**한다. 새 근거: 체결 식별 키라서 React 가 기존 행 노드를 재사용하고, memo 가 바뀌지 않은 행을 건너뛴다. 옛 방식은 prepend 마다 200행 텍스트를 전부 다시 썼고, 프로파일 자기시간이 trade-tape 10.2% 였다.
    - 배치 플래시는 **지금 메커니즘을 유지한다**(상태 + 140ms 타이머 · 배치당 1회 · 진행 중 플래시 끊기 · `motion-safe`). 행마다 CSS 애니메이션으로 바꾸지 않는다. UI-SPEC 「행마다 개별 애니메이션 금지」 때문이다. 끄는 커밋은 이제 TradeTape 와 플래시된 N행만 다시 그리므로 싸다. 그 사실을 주석 한 줄로 남긴다. 핀/스크롤 로직은 바꾸지 않는다.
    - 공개 export 는 `export const TradeTape = memo(TradeTapeImpl)` 로 감싼다(`function TradeTapeImpl(props: TradeTapeProps)`). 카드가 다른 종목 틱으로 다시 그려질 때 이 테이프의 props(entries 신원 · isStale · basePrice · 최우선호가)가 그대로면 건너뛴다. `TradeTapeProps` 와 기존 export 이름들은 유지한다.
    **orderbook-ladder.tsx (per 3a — CLAUDE.md 규약: 상따 반응형은 본문 폭 컨테이너 쿼리 4밴드, 정본 globals.css §2.2b, JS 폭 판정·ResizeObserver 금지):**
    - 2단 트리 끝의 hr + compact TradeTape(≈L1094-1107)와 1단 트리 끝의 hr + compact TradeTape(≈L1228-1247)를 **둘 다 지운다**. 대신 1단 트리 **다음**, ChaserLadder 루트의 마지막 자식으로 블록 하나를 둔다: `data-slot="ladder-tape"` 에 className `@min-[830px]/lc:hidden` 을 단 div. 안에는 같은 클래스의 hr 과, 같은 props 의 compact TradeTape JSX 요소 1개를 넣는다. 830 은 2단·3단 트리가 이미 쓰는 경계 클래스 그대로다.
    - 시각적으로 같은 이유를 그 블록 주석에 적는다. 트리는 자기 밴드 밖에서 `display:none` 이라 공간을 차지하지 않는다. 그래서 1단(~699)에서는 「1단 사다리 → hr → 테이프」, 2단(700~829)에서는 「2단 박스 → hr → 테이프」로 이전과 같은 순서다. 830 이상에서는 숨겨지고 3단 표의 최근 체결 10건이 대신한다. 덤으로 1단↔2단 밴드를 오가도 테이프 인스턴스 하나가 핀·스크롤 상태를 유지한다. 옮겨 온 기존 주석(「제목행·컬럼헤더 없음(사용자 확정)」 · hr 의 `border-0` 이유 · 「props 는 이미 들고 있는 값 — 새 조회 경로 0개」)도 이 블록으로 옮긴다.
    - `ChaserLadder` JSDoc(≈L637-652)을 「트리 셋 + 트리 밖 compact 테이프 1벌(<830)」로 고친다. 2단 박스 주석의 「hr 과 체결 테이프는 이 박스 밖이다」(≈L1072)는 「트리 밖 공용 블록이다」로 고친다. 파일 어디에도 「compact 테이프 두 벌」이라는 서술이 남지 않게 한다. 주석에는 꺾쇠를 붙인 JSX 태그 표기를 쓰지 않는다(개수 게이트가 센다).
    **테스트:** behavior 대로 한다. 구현 전에 DOM 재사용 · `tapeRowKeys` · ⑧(1개)이 RED 인 것을 한 번 관측한다.
    **커밋:** `perf(quick-260923-elb): 상따 사다리의 체결 테이프를 트리 밖 1벌로 합치고 행 키·memo·렌더 창으로 커밋 비용을 줄인다` — 명시 경로만 stage 한다. 직전에 `git status --short` 를 재확인한다. Co-Authored-By 는 넣지 않고 push 도 하지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/components/orderbook src/components/trading && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/components/orderbook/trade-tape.tsx src/components/orderbook/orderbook-ladder.tsx && ! grep -n 'key={index}' webapp/src/components/orderbook/trade-tape.tsx && test "$(grep -c '<TradeTape' webapp/src/components/orderbook/orderbook-ladder.tsx)" -eq 1 && grep -q 'ladder-tape' webapp/src/components/orderbook/orderbook-ladder.tsx && pnpm --filter @gh-radar/webapp exec playwright test orderbook trading-workbench a11y</automated>
  </verify>
  <done>trade-tape · ladder-chaser 의 새 케이스와 갱신 케이스(⑤ · ⑦ · ⑧ · ⑪ · ⑰f)가 GREEN 이다. 구현 전 RED 도 관측했다. 나머지 기존 테이프 케이스는 무수정 통과이고(className 불변 증거), orderbook · trading 컴포넌트 테스트 전체도 GREEN 이다. 인덱스 행 키는 0건, 사다리의 TradeTape 요소는 정확히 1개다. typecheck·eslint exit 0. Playwright orderbook + trading-workbench + a11y 0 failed(a11y ⑤-b 의 `['div[ladder-scroll]','div[tape-scroll]']` 무수정 통과 포함). 한글 커밋 1건.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 2a 돌파 칩 가격 2Hz 스로틀 + 렌더 중 상태 갱신 제거 → 전량 게이트 → perf 하니스 전후 측정 (ELB-2A)</name>
  <files>webapp/src/lib/use-breakout-quotes.ts, webapp/src/components/trading/workbench/breakout-strip.tsx, webapp/src/lib/__tests__/use-breakout-quotes.test.tsx, webapp/src/components/trading/__tests__/breakout-strip.test.tsx</files>
  <behavior>
    use-breakout-quotes.test.tsx (새 describe 「가격 스로틀 (quick-260923-elb 2a)」 · 이 describe 만 `vi.useFakeTimers()`):
    - 마운트 첫 렌더부터 `prices` 에 후보 ISIN 의 알려진 KRX 가격이 들어 있다(빈 첫 화면 없음). 가격이 없거나 0·NaN 인 ISIN 은 키가 없다(「모름」이지 0원이 아니다).
    - `excludeIsins`(카드 종목)는 구독 예산에서만 빠진다. 그 ISIN 의 가격도 `prices` 에 있다. 거래중 행의 표시·이탈 판정이 지금처럼 전역 시세 맵을 읽기 때문이다.
    - 컨텍스트 가격이 바뀌면 `BREAKOUT_PRICE_THROTTLE_MS - 1` 동안은 이전 값이고, 그 시점에 최신 값이 된다. 창 안에서 5번 바뀌면 상태 갱신 1번이고 마지막 값이 이긴다. 틱이 끊임없이 와도 갱신은 굶지 않는다(마감 시각은 첫 변경 기준 절대값). 값이 같은 rerender 에서는 `prices` 신원이 유지된다. unmount 뒤 `vi.getTimerCount()` 는 0 이다.
    - 옛 「quotes 는 컨텍스트 맵을 그대로 돌려준다」 케이스는 새 반환 계약(`prices`)으로 **교체**한다. 구독 diff · 상한 40 · 언마운트 해제 케이스는 무수정 통과해야 한다.
    breakout-strip.test.tsx:
    - 새 케이스: 12,600 으로 마운트하고 표를 연다. `setPrice(12,800)` + `update({})` 뒤 +499ms 까지 표는 12,600 이고, +500ms 에 12,800 · +28.00% 가 된다.
    - 이탈 대조군(L394): 가격 하락 `update({})` 뒤에 `act(() => vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS))` 만 추가하고 단언은 그대로 둔다.
    - 첫 채움 무음 · 78 무음 · 76 첫 렌더부터 강조 · 알림 「기록 먼저 · 재생 나중」 · 돌파시각 첫 값 유지 · 되살림 케이스는 **무수정** 통과해야 한다. 렌더 중 상태 갱신을 없애면서 「한 프레임 무음으로 그렸다가 바뀌는」 지연을 만들지 않았다는 증거다.
  </behavior>
  <action>
    **use-breakout-quotes.ts (per 2a):**
    - `export const BREAKOUT_PRICE_THROTTLE_MS = 500` 을 둔다. 결정 범위 1~2Hz 의 상단이다. 칩은 등락률을 소수 2자리로 보이는데, 이탈 판정에는 이미 3초 유예가 있어 ≤500ms 추가 지연은 의미가 없다.
    - 결과 타입의 `quotes` 를 `prices: ReadonlyMap<string, number>` 로 **교체**한다(ISIN → KRX 현재가 · 알려진 값만). 원시 맵을 계속 내보내면 소비처가 스로틀을 우회할 수 있다. `prices` 는 구독한 키만이 아니라 **후보 ISIN 전체**(중복 제거)를 `breakoutQuotePrice` 로 읽는다. 카드 종목은 구독 예산에서만 빠지고 가격은 카드 자신의 구독으로 전역 맵에 있기 때문이다. 이것이 오늘 `breakoutQuotePrice(quotes, isin)` 의 의미와 같다.
    - `pickWithinBudget` 은 `useMemo([candidates, excludeIsins])` 로 감싼다(지금은 매 렌더 최대 200개 정렬). 구독 diff effect · 언마운트 해제 · sig 규칙은 한 글자도 바꾸지 않는다.
    - 스로틀 구현: 매 렌더 후보 ISIN 들의 현재 가격 서명(`isin:가격` 결합 문자열)을 계산한다. 상태 `{ sig, prices }` 는 첫 렌더 값으로 동기 초기화한다. 마지막 적용 시각 ref 는 마운트 시각으로 시작한다. effect deps 는 [현재 서명, 표시 서명]이다. effect 에서 최신 입력(시세 맵 · ISIN 목록)을 ref 에 담고, 서명이 같으면 끝낸다. 다르면 `max(0, 마지막 적용 + THROTTLE - now)` 뒤에 ref 의 최신 입력으로 맵을 다시 만들어 set 하고 적용 시각을 갱신하는 타이머를 건다. cleanup 은 타이머를 지운다. 재예약해도 마감은 절대 시각이라 연속 틱이 갱신을 굶기지 않고, 마지막 값은 반드시 도착한다.
    - 파일 헤더에 ⑤ 「가격 갱신 스로틀」을 추가한다. 스트립은 relay 컨텍스트 소비자라서 1b 전까지는 커밋마다 다시 그려진다. 칩에 필요한 것은 가격 하나이고 ≤2Hz 면 충분하다. 보고서 #2 가 근거다. `breakoutQuotePrice` export 는 유지한다.
    **breakout-strip.tsx (per 2a):**
    - `Tracked` 에서 가격 서명 필드를 지운다. 추적 상태 `useState` 와 렌더 중 상태 갱신 블록(≈L148-179)을 **없앤다**. 그 블록의 본문(silent 규칙 · `trackBreakoutMeta` · firstTime 유지 · removed/되살림 · `shouldRemoveBreakout`)은 모듈 수준 순수 함수 `advanceTracked(prev: Tracked, input: { items, snapSeq, now, priceOf, wallNow }): Tracked` 로 **그대로** 옮긴다.
    - 컴포넌트 흐름은 다음과 같다. (1) 마지막으로 **커밋된** 기록을 담는 ref(초기값 = 지금의 useState 초기값)를 둔다. (2) `candidates` 는 `items` 와 그 ref 의 `meta` 로 만든다. 아직 기록 없는 키의 addedAt 은 `Number.MAX_SAFE_INTEGER`(「가장 최근」)로 둔다. 추적 단계가 처음 보는 키에 현재 벽시계를 찍으므로, 이것은 옛 수렴 상태와 같은 구독 순위다. 동률은 `pickWithinBudget` 의 ISIN 순서가 가른다. (3) `const { prices } = useBreakoutQuotes(...)`, `priceOf = useCallback((isin) => prices.get(isin), [prices])`. (4) `tracked = useMemo(() => advanceTracked(ref.current, { ..., wallNow: Date.now() }), [items, snapSeq, now, priceOf])`. (5) `useLayoutEffect(() => { ref.current = tracked; }, [tracked])`.
    - 그 자리 주석에 이유 둘을 적는다. 렌더 중 상태 갱신을 쓰지 않는 이유: 가격 서명이 바뀔 때마다 본문을 두 번 돌렸다(실측 BreakoutStrip 279/s = 커밋 × 2). 일반 effect 로 미루지 않는 이유: 새 76 행이 한 프레임 무음·무강조로 그려진다(원래 작성자가 렌더 단계 패턴을 쓴 이유). 렌더 중 ref 읽기가 안전한 근거도 적는다. 단계가 「마지막 커밋 기록 + 현재 입력」의 순수 함수이고, 버려진 렌더는 ref 를 쓰지 않는다.
    - `rows` memo 는 그대로 둔다. `views` 는 `useMemo([rows, priceOf, tracked.firstTime, now])` 로 감싼다. `activate` 는 `useCallback([cards, onFocusCard, onAddCard])`, `dismiss` 는 `useCallback([onDismiss])` 로 감싼다. `BreakoutChip` · `BreakoutTable` 은 `memo` 로 감싼다. 그러면 가격이 멈춘 커밋에서는 칩 40개 재조정을 건너뛴다. 알림 effect · 1초 tick · 마크업 · 클래스는 바꾸지 않는다. 헤더에 ⑧ 「가격 2Hz · 렌더 중 상태 갱신 없음」을 한 단락 더한다.
    **전량 게이트:** 아래 verify 가 전부다. webapp 전체 vitest 기준선은 1487 passed / 1 skipped 이고, 이번에는 신규 케이스만큼 늘고 0 failed 여야 한다. Playwright 전에는 `lsof -ti :3100` 을 확인한다. 이미 떠 있는 dev 서버를 재사용하게 되므로, 그 프로세스의 cwd 가 `/Users/alex/repos/gh-radar/webapp` 인지 `lsof -a -p <pid> -d cwd` 로 확인한다. 다른 트리의 서버면 결과가 무효다. relay 픽스처 8090 이 다른 세션과 겹치면 끝날 때까지 기다렸다 다시 돌린다.
    **커밋(게이트 통과 후):** `perf(quick-260923-elb): 돌파 칩 가격 갱신을 초당 2회로 묶고 렌더 중 상태 갱신을 없앤다` — 명시 경로만 stage 한다. Co-Authored-By 는 넣지 않고 push 도 하지 않는다.
    **perf 하니스 전후 측정(레포 밖 throwaway — main tree 는 건드리지 않는다):** SP 를 perf 스크래치 경로(interfaces 참조)로 두고, 「전」 = BASE_SHA, 「후」 = Task 3 커밋 SHA 각각에 대해 다음을 한다.
      ① `git -C /Users/alex/repos/gh-radar worktree add --detach $SP/wt-<전|후> <SHA>` 로 worktree 를 만들고, 그 안에서 `pnpm install --frozen-lockfile --prefer-offline` 을 돌린다(새 패키지 없음 · 락파일 그대로).
      ② `$SP/harness/{run.mts,analyze.mjs}` 를 `<wt>/perf/` 에, `perf-probe.ts` 를 `<wt>/webapp/src/lib/` 에 복사한다. `python3 $SP/harness/instrument.py <wt>/webapp` 을 돌린다. 「후」에서 TradeTape 시그니처가 `function TradeTapeImpl(` 로 바뀌었으므로 instrument.py 사본의 대상 목록만 고친다. 실패하는 대상이 있으면 그 줄만 빼고 SUMMARY 에 적는다.
      ③ worktree 의 `next.config.ts` 에 `eslint: { ignoreDuringBuilds: true }` 를 넣는다(worktree 안에서만).
      ④ `pnpm --filter @gh-radar/shared build` 를 한다. 그다음 webapp 에서 env `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=perf-anon NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:8190 NEXT_PUBLIC_API_BASE_URL=http://localhost:54399` 로 `pnpm exec next build` 를 하고, `next start -p 3190` 을 백그라운드로 띄운다.
      ⑤ 시작 전 `lsof -i :3190 -i :8190 -i :54399` 가 비어 있는지 확인한다. `<wt>/relay` 에서 `env CARDS=3 BREAKOUT=<0|40> SPREAD_MS=<0|100> DURATION_S=10 LABEL=<이름> ./node_modules/.bin/tsx ../perf/run.mts | grep '^{"label"'` 로 시나리오를 돈다: S1 cards3 버스트(BREAKOUT=0 SPREAD_MS=0), S2 cards3+돌파40 버스트(BREAKOUT=40 SPREAD_MS=0), S3 cards3+돌파40 분산(BREAKOUT=40 SPREAD_MS=100). 여유가 있으면 S4 cards3 `COLS=3` 버스트도 돈다. 시나리오마다 2회 돌려 둘 다 적는다.
      ⑥ `next start` 를 종료하고 `git worktree remove --force <wt>` 로 정리한다. 그리고 `git worktree list` 에 남은 게 없는지 확인한다.
    SUMMARY 에는 시나리오 × (전/후) 표로 적는다: `mainThreadBusyPct` · `chromeCpuPct.renderer` · `commitsPerS` · `domNodes` · `rendersPerS` 의 StrategyCard / TradeTape(또는 TradeTapeImpl) / BreakoutStrip. 참고 기대치(게이트 아님 · 보고서 어블레이션)는 S3 98.8 → ~20% 대, S2 44 → ~20% 대, S1 33 → ~20% 대다. **「후」 S3 main% 가 50 이상이면 그대로 닫지 말고** 원인(배치가 실제로 걸렸는지 `commitsPerS`)을 확인해 SUMMARY 에 적는다. 하니스를 띄우지 못하면(빌드 실패 · 포트 충돌 · 스텁 경로 불일치 등) 약 20분 이상 붙잡지 않는다. **「하니스 미실행 — 사유」를 SUMMARY 에 명시**하고, 보고서 기준 수치를 「전(보고서)」으로 표기해 둔다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/use-breakout-quotes.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx && ! grep -n 'setTracked' webapp/src/components/trading/workbench/breakout-strip.tsx && grep -q 'BREAKOUT_PRICE_THROTTLE_MS' webapp/src/lib/use-breakout-quotes.ts && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec eslint src/lib/use-relay-socket.ts src/lib/use-breakout-quotes.ts src/components/trading/workbench/breakout-strip.tsx src/components/orderbook/trade-tape.tsx src/components/orderbook/orderbook-ladder.tsx && pnpm --filter @gh-radar/webapp exec playwright test trading-workbench a11y orderbook sidebar-tree</automated>
  </verify>
  <done>use-breakout-quotes · breakout-strip 의 새 케이스와 갱신 케이스가 GREEN 이다. 구현 전 RED 도 관측했다. 렌더 중 상태 setter 는 0건이다. webapp 전체 vitest 는 0 failed · 1 skipped 이고 passed 는 1487 + 이번 신규 이상이다. typecheck·eslint exit 0. Playwright trading-workbench + a11y + orderbook + sidebar-tree 0 failed. 한글 커밋 1건. SUMMARY 에 시나리오 S1~S3(전/후) 수치표가 있거나 「하니스 미실행 — 사유」가 명시돼 있다. throwaway worktree 는 전부 제거됐다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay → browser (wss) | q/tape/주문·계좌·전략·VI 프레임. 이번 변경은 이미 받은 프레임의 **적용 시점(≤100ms)** 과 **표시 빈도·DOM 구조**만 바꾼다. 새 입력·새 송신·새 권한 경로는 없다. relay·서버 코드는 0줄 바뀐다 |
| browser 메모리 | 시장 프레임 대기 버퍼(effect 범위). 로그아웃(`enabled:false`) 시 flush 뒤 `reset` 으로 비워진다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-elb-01 | Tampering (무결성 — 오표시·순서 뒤바뀜) | use-relay-socket 배치 | medium | mitigate | 버퍼는 도착 순서 그대로인 배열이다(버퍼 단계에서 미리 뭉개지 않는다). 리듀서는 한 액션 안에서 market 을 순차 병합한 뒤 비시장 프레임을 적용한다. 비시장 프레임은 항상 대기분을 **같은 dispatch** 에서 먼저 flush 한다. 테스트 ⓐ(순차 병합 동치) · ⓑ(같은 렌더) · 무수정 ⑧⑫⑭⑦ |
| T-elb-02 | Denial of Service (거래 신호 지연) | 주문 통보·VI·상따 프레임 | high | mitigate | 배치 대상은 `q`/`tape` 두 종류뿐이다. order/acct/lc/lc.snap/vi*/msg/state/rate.cross*/queued.window/strategies.disabled 는 즉시 적용한다. `order.result` 는 원래 dispatch 밖 Promise 경로 그대로다. 테스트 ⓑ(it.each)가 타이머 진행 없이 반영됨을 단언한다 |
| T-elb-03 | Denial of Service (자기 유발 — 메모리) | 시장 프레임 버퍼 | low | mitigate | `RELAY_MARKET_BUFFER_MAX`(1000) 도달 시 즉시 flush 한다(숨은 탭 타이머 지연 대비). close·cleanup 에서 flush 하고 타이머를 해제한다. 테스트 ⓓ(getTimerCount 0) · ⓕ |
| T-elb-04 | Integrity (주문 시점 호가 신선도) | 카드 호가·폼 | low | accept | 호가 표시가 최대 100ms 늦다. 게이트웨이 틱이 100ms 라 1틱 이하다. 주문 가격은 사용자 입력이고 거래소·게이트웨이가 검증한다. 체결·통보 신호는 지연되지 않는다(T-elb-02) |
| T-elb-05 | Information Disclosure (종목 격리) | 전역 시세 맵 | medium | mitigate | 키(`isin\|exchange`)별 맵과 `useRelaySubscription` 의 키 선택은 바뀌지 않는다(T-16-02). relay-provider ⑤·⑤-a(종목·거래소 격리)가 flush helper 만 넣고 그대로 통과해야 한다 |
| T-elb-06 | Integrity (돌파 이탈 판정 지연) | breakout-strip | low | accept | 가격 반영이 ≤500ms 늦다. 이탈 삭제에는 원래 3초 유예가 있다. 현재가 모름(undefined)은 여전히 지우지 않는다(T-18-37 규칙 불변) |
| T-elb-07 | Repudiation/UX (오래된 체결 확인 불가) | trade-tape 렌더 창 | low | mitigate | 고정 중에는 50행만 그리지만, 스크롤을 내리면 200행 전부를 그린다. 링버퍼 200 은 바뀌지 않는다(⑤ 갱신 케이스) |
| T-elb-08 | Tampering (throwaway worktree 가 main tree 오염) | perf 하니스 | low | mitigate | 스크래치 경로에 `--detach` worktree 를 만들고, 수정(instrument · next.config)은 그 안에서만 한다. 측정 후 `worktree remove --force` 를 하고 `worktree list` 로 확인한다. 동시 세션의 relay/ 미커밋 변경은 worktree 에 섞이지 않는다(커밋된 SHA 체크아웃) |
</threat_model>

<verification>
- Task 별 vitest 대상 → 마지막에 webapp 전체 vitest 1회(기준선 1487 passed / 1 skipped + 신규 · 0 failed).
- `pnpm --filter @gh-radar/webapp run typecheck`(src + e2e tsconfig) exit 0. 이번 변경은 `packages/shared` 를 건드리지 않으므로 shared dist 재빌드는 필요 없다.
- eslint(touched src 5파일) exit 0.
- Playwright: Task 1 `trading-workbench orderbook` · Task 2 `orderbook trading-workbench a11y` · Task 3 `trading-workbench a11y orderbook sidebar-tree` 0 failed. dev 포트 3100(`playwright.config.ts` webServer 가 `PORT=3100 pnpm dev` · reuseExistingServer) · relay 픽스처 8090 고정.
- 동작 불변 증거(무수정 통과): relay-socket ⑧·⑫·⑭ · relay-provider ⑦ · trade-tape 플래시/핀/색/compact 케이스 · breakout-strip 무음/강조/알림 순서 케이스 · a11y ⑤-b 탭 순서.
- CLAUDE.md 규약: `/trading` 반응형에 JS 폭 판정을 새로 넣지 않았다. 테이프 노출은 `@min-[830px]/lc:hidden` 컨테이너 쿼리 클래스뿐이다.
</verification>

<success_criteria>
- 1a: 시장 프레임이 일으키는 커밋은 ≤10/s 수준이고, 거래 신호 프레임은 즉시·순서 보존된다. clockStamp 는 msg 에만 계산한다.
- 3a: 사다리당 compact 테이프 DOM 은 1벌(3카드 DOM 노드 수 감소)이다. 테이프 행은 체결 식별 키 · memo · 고정 중 50행 창 · 상수 className 을 쓴다.
- 2a: 돌파 칩 가격은 ≤2Hz 이고, 스트립은 렌더 중 상태 갱신이 0건이며, 칩·표는 memo 다.
- 범위 밖(1b · 2b · 3b) 변경은 0이다. relay/ · packages/shared 변경도 0줄이다.
- 커밋 3건(Task 별)은 한글 `perf(quick-260923-elb): …` 로 쓴다. `git add` 는 명시 경로만 한다(동시 세션: relay/src/store/orders.ts · relay/src/ws/order-handler.ts · relay/tests/* · 미추적 `.planning/quick/260923-{cqj,dmb,e1m}-*` · `.planning/debug/trading-cpu-260923.md` 를 휩쓸지 않는다). Co-Authored-By 는 넣지 않고 push 도 하지 않는다(push = webapp 프로덕션 배포).
- SUMMARY 에 perf 전후 수치표(S1~S3, 가능하면 S4)가 있거나 미실행 사유가 명시돼 있다.
</success_criteria>

<output>
Create `.planning/quick/260923-elb-cpu-1/260923-elb-SUMMARY.md` when done. 다음을 기록한다: BASE_SHA · 커밋 해시 3개 · 1a/3a/2a 설계 선택(100ms · 버퍼 상한 1000 · 순차 병합 동치 · 렌더 창 50 · 체결 식별 키 · 500ms 스로틀 · 커밋 기록 ref) · RED 관측 · 테스트 수치(vitest 전체 / Playwright 스펙별) · 갱신한 기존 테스트 목록과 이유 · perf 하니스 전후 표(또는 미실행 사유) · 남은 과제(1b · 2b · 3b).
</output>
