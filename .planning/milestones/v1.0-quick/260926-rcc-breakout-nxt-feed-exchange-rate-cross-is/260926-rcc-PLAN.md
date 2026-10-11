---
phase: quick-260926-rcc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - relay/src/hub/subscription-hub.ts
  - relay/tests/rate-cross.test.ts
  - relay/tests/fanout.test.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - packages/shared/src/relay.ts
  - webapp/src/lib/breakout-list.ts
  - webapp/src/lib/__tests__/breakout-list.test.ts
  - webapp/src/lib/__tests__/trading-alerts.test.ts
  - webapp/src/lib/use-breakout-quotes.ts
  - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
autonomous: true
requirements: [RCC-1, RCC-2, RCC-3]

estimate:
  tokens: 115000
  raw_tokens: 115000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "NXT 로 발화한 돌파 행(08:00~08:50 프리마켓 · 15:40~ 애프터마켓)은 NXT 시세로 현재가·등락률이 보이고 이탈 판정도 NXT 가격으로만 한다 — 같은 종목의 KRX 시세(아침엔 전일 종가)로 3초 뒤 지워지거나 가격이 얼어 보이지 않는다 (RCC-1)"
    - "같은 종목의 발화 거래소가 바뀌어도(KRX 행 뒤 NXT 재돌파, 또는 반대) relay 캐시 · 인증 직후 스냅샷 · 78 팬아웃 · 브라우저 목록 · 스트립 모두 그 종목 원소/행이 1개이고, 뒤에 온 76 의 거래소를 따른다 (RCC-2)"
    - "행의 발화 거래소가 바뀌면 돌파 훅은 옛 거래소 price 구독을 1회 해제하고 새 거래소를 1회 구독한다 — 두 거래소 동시 구독이 없고, 해제는 언제나 실제로 건 거래소로 하며, 다른 행 구독은 건드리지 않는다. 언마운트도 실제로 건 거래소로 해제한다 (RCC-1)"
    - "거래소가 바뀐 행은 이탈 판정 상태(무장 · 3초 유예)만 새 피드 기준으로 다시 시작하고, 자리 · 첫 돌파시각 · 강조 · 무음 · 「오늘 울린 종목」 · 토스트는 전환으로 바뀌거나 다시 울리지 않는다 (gh-trade 자리유지 갱신과 같은 표시 · RCC-1)"
    - "카드 종목의 구독 예산 제외는 (ISIN, 거래소) 단위다 — KRX 카드가 열린 종목의 NXT 발화 행은 돌파 훅이 NXT 를 구독한다. 「거래중」 표식과 카드 포커스는 종전처럼 ISIN 단위다 (RCC-3)"
    - "칩·표에 거래소 문자열은 여전히 없고(D-07) 돌파 구독 level 은 price 그대로다(quick-260923-ge2)"
    - "relay·webapp typecheck 와 vitest 전량이 통과하고, 커밋은 명시 경로만 · 한글 메시지 · push/배포 없음. SUMMARY 에 배포 순서(relay 먼저 → 검증 → push)와 후속 후보가 있다"
  artifacts:
    - path: "relay/src/hub/subscription-hub.ts"
      provides: "rateCrossKey(userId, isin) — 거래소 없는 ISIN 키 · 78 팬아웃은 ISIN 키 캐시 getter 와 같은 원천"
      contains: "function rateCrossKey(userId: string, isin: string)"
    - path: "webapp/src/lib/use-relay-socket.ts"
      provides: "upsertRateCross — ISIN 단위 upsert(뒤에 온 76 이 거래소째 덮는다)"
      contains: "upsertRateCross"
    - path: "webapp/src/lib/breakout-list.ts"
      provides: "breakoutKey = ISIN · BreakoutMeta.feedExchange/feedSince · 전환 시 무장·유예 재시작 · shouldRemoveBreakout 유예 기준 feedSince · priceOf(item)"
      contains: "feedSince"
    - path: "webapp/src/lib/use-breakout-quotes.ts"
      provides: "후보별 거래소 구독 · breakoutFeedKey · 피드 키 prices · excludeFeeds · 전환 시 해제 1 + 구독 1"
      contains: "breakoutFeedKey"
    - path: "webapp/src/components/trading/workbench/breakout-strip.tsx"
      provides: "후보에 행 거래소를 싣고 priceOf(item) 가 행 피드 가격을 읽는다 · cardFeeds prop"
      contains: "cardFeeds"
    - path: "webapp/src/components/trading/workbench/trading-workbench.tsx"
      provides: "카드 (ISIN, 거래소) 피드 키 집합을 BreakoutStrip 에 넘긴다"
      contains: "cardFeeds"
  key_links:
    - from: "relay/src/hub/subscription-hub.ts rateCrossKey"
      to: "webapp/src/lib/use-relay-socket.ts upsertRateCross · webapp/src/lib/breakout-list.ts breakoutKey"
      via: "세 곳 모두 ISIN 한 축 — 한쪽만 거래소를 키에 두면 행이 둘로 갈린다"
      pattern: "rateCrossKey|upsertRateCross|breakoutKey"
    - from: "breakout-strip.tsx candidates"
      to: "use-breakout-quotes.ts subscribe(isin, exchange, price)"
      via: "후보마다 행의 exchange(발화 거래소)를 싣는다"
      pattern: "exchange: it.exchange"
    - from: "breakout-strip.tsx priceOf(item)"
      to: "use-breakout-quotes.ts prices (피드 키)"
      via: "breakoutFeedKey(item) 로 행 피드 가격만 읽는다 — 다른 거래소 값이 섞이지 않는다"
      pattern: "breakoutFeedKey"
    - from: "trading-workbench.tsx cardFeeds"
      to: "use-breakout-quotes.ts excludeFeeds"
      via: "BreakoutStrip cardFeeds prop"
      pattern: "excludeFeeds"
---

<objective>
돌파감지(등락률 돌파 · RateCrossAlert 76 / RateCrossSnapshot 78)를 gh-trade quick-260923-cfo(NXT 확장 — 2026-09-25 부터 프로덕션)에 맞춘다. 서버는 KRX 접속매매 세션이 닫힌 시간(08:00~09:00 · 15:30~16:00)의 NXT 접속매매도 판정하고, 상태는 종목(ISIN)당 1개다. 76 의 exchange = 발화 체결의 거래소, 78 원소 exchange = above 구간을 연 거래소이며 둘 다 NXT 일 수 있다.

gh-radar 는 아직 「돌파는 KRX 에서만」 전제라서 (a) NXT 발화 행을 KRX 시세로 그리고 이탈 판정해 아침에 전일 종가로 행이 3초 뒤 지워지거나 값이 얼고, (b) relay 캐시 · 브라우저 리듀서 · 스트립 행 키가 `isin`+`exchange` 라 같은 종목의 거래소가 바뀌면 다음 78 까지 행이 둘이 된다.

이 plan 은 gh-trade 클라 정본(행마다 **행의 발화 거래소 피드 하나만** 구독 · 이탈 판정은 그 피드 가격만 · 발화 거래소가 바뀌면 옛 구독 해제 후 새로 구독 · 종목당 행 1개)을 webapp 에 옮기고, 원소 동일성 축을 relay→브라우저→스트립 전 구간에서 ISIN 하나로 맞춘다.

Purpose: 장전·장후 NXT 돌파를 사용자가 실제 가격으로 보고, 같은 종목이 두 줄로 보이는 일을 없앤다.
Output: relay hub ISIN 키 · webapp 리듀서 ISIN upsert · breakout-list 피드 전환 판정 상태 · useBreakoutQuotes 행 거래소 구독 · 스트립/작업대 배선 · 테스트.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

정본(읽기 전용 · 다른 저장소): `/Users/alex/repos/gh-trade/docs/features/rate-cross-alert.md` — ① 동작 규칙(15~30행 부근), ② NXT 확장 「상태는 ISIN 당 1개(결정 A)」(42~70행 부근), ③ 클라 DMA 계층 「구독은 저장소 소유 · FeedExchange · 이탈 판정은 피드 거래소 체결만」(100~130행 부근). fbs 주석: `relay/src/generated/StockDMA.fbs` 의 `table RateCrossAlert`(1053행 부근) · `table RateCrossSnapshot`(1086행 부근) — 이미 cfo 기준으로 동기화돼 있다(생성 코드는 건드리지 않는다).

앞선 범위 밖 기록: `.planning/quick/260923-ge2-subscribequotereq-level-price-gh-trade-2/260923-ge2-SUMMARY.md` 「관찰 사항」 3번.

@relay/src/hub/subscription-hub.ts
@webapp/src/lib/use-relay-socket.ts
@webapp/src/lib/breakout-list.ts
@webapp/src/lib/use-breakout-quotes.ts
@webapp/src/components/trading/workbench/breakout-strip.tsx

<interfaces>
플래너가 계획 시점(2026-09-26)에 읽은 현재 모양. 탐색 없이 바로 쓴다.

relay/src/hub/subscription-hub.ts
- 260행 부근: `function rateCrossKey(userId: string, isin: string, exchange: RelayExchange): string` → `${userId}|${isin}:${exchange}`. 주석은 「같은 종목이 KRX·NXT 양쪽에서 돌파하면 원소가 둘」.
- `userPrefix(userId)` = `${userId}|` — `getRateCrossItems`(778행 부근) · 78 전량 교체(1144행 부근) · 사용자 정리(1672행 부근)가 이 접두로 캐시를 훑는다.
- `#onRateCrossAlert`(1122행 부근): 캐시 set 후 Ready 면 `{t:"rate.cross", item: enrich}` 팬아웃.
- `#onRateCrossSnapshot`(1144행 부근): 접두 원소 전부 삭제 → items set → Ready 면 `{t:"rate.cross.snap", items: sortRateCrossNewestFirst(items.map(enrich))}` — **팬아웃이 캐시가 아니라 원 배열에서 나온다.**
- `getRateCrossItems(userId)`: 캐시 접두 원소를 enrich 사본으로 모아 `sortRateCrossNewestFirst`. 인증 직후 스냅샷(`relay/src/ws/fanout.ts` 684행)이 이것을 그대로 내린다.

webapp/src/lib/use-relay-socket.ts
- 883~887행: `case "rate.cross"` → `upsertRateCross(state.rateCrossItems, frame.item)`; 주석 「같은 isin+exchange 는 한 원소 … 양쪽 거래소에서 돌파하면 원소 둘」.
- 1030~1048행: `upsertRateCross` 는 `c.isin === item.isin && c.exchange === item.exchange` 인 원소를 걸러 내고 `sortRateCross` 후 `MAX_RATE_CROSS`(200) 상한.
- `relayQuoteKey(isin, exchange)` = `${isin}|${exchange}` (232행).

webapp/src/lib/breakout-list.ts
- `BreakoutMeta { addedAt; armed; silent }` · `BreakoutRow extends RelayRateCrossItem { key; addedAt; armed; silent; trading; highlightUntil }`.
- `breakoutKey(item: Pick<RelayRateCrossItem,"isin"|"exchange">)` = `${isin}|${exchange}` — 소비처: breakout-strip.tsx(152 · 215행), use-trading-alerts.ts(164행), trading-alerts.ts(282행 `newRateCrossAlerts`).
- `shouldRemoveBreakout(row: Pick<BreakoutRow,"thresholdPct"|"basePrice"|"changeRate"|"armed"|"addedAt">, currentPrice, now)` — 유예는 `now - row.addedAt >= ARM_GRACE_MS(3000)`.
- `trackBreakoutMeta(prev, items, { now, silent, priceOf?: (isin) => number|undefined })` — 새 키면 `{addedAt: now, armed:false, silent}`, 기존 키면 `priceOf(it.isin)` 가 임계 이상일 때 무장(등재 스텝 자체는 관측 아님).
- `breakoutRowsFrom(items, { dismissed(ISIN), cards(ISIN), meta, removed?(키) })` — 기록 없는 행 기본값 `{ addedAt: 0, armed: false, silent: true }`.

webapp/src/lib/use-breakout-quotes.ts
- 68행 `BREAKOUT_EXCHANGE` 는 KRX 고정 상수 · 71행 `BREAKOUT_SUB_LEVEL: RelaySubLevel = "price"`.
- `breakoutQuotePrice(quotes, isin)` · `BreakoutQuoteCandidate { isin; addedAt }` · `BreakoutQuotesResult { prices: ISIN→가격; subscribed: ISIN 집합; overflow: ISIN[] }` · 옵션 `{ excludeIsins?: ReadonlySet<string> }`.
- 구독 effect 는 정렬된 ISIN 을 `|` 로 이은 안정 시그니처 `sig` 로만 재실행되고, `heldRef: Set<string>`(ISIN) 장부로 diff 한다. 언마운트 effect 가 held 전부 해제. 가격 스로틀(⑤ · 200ms · 절대 시각 마감 · 값이 같으면 맵 신원 유지)은 `candidateIsins` · `priceSigOf` · `readPrices` 위에 선다.

webapp/src/components/trading/workbench/breakout-strip.tsx
- props `{ items, snapSeq, cards: ReadonlySet<string>(ISIN), onAddCard, onFocusCard, onDismiss?, className? }`.
- `advanceTracked(prev, { items, snapSeq, now, priceOf: (isin) => …, wallNow })` — `firstTime`/`removed` 맵 키 = `breakoutKey(it)`, 이탈은 `shouldRemoveBreakout({ ...it, ...m }, priceOf(it.isin), wallNow)`, 지운 행은 항목 객체가 바뀔 때(`gone === it` 아님)만 되살린다.
- 211~220행: `candidates = items.map(it => ({ isin, addedAt: committedMeta.get(breakoutKey(it))?.addedAt ?? MAX_SAFE_INTEGER }))` → `useBreakoutQuotes(candidates, { excludeIsins: cards })` → `priceOf = (isin) => prices.get(isin)`. 284행 views `price: priceOf(row.isin)`.

webapp/src/components/trading/workbench/trading-workbench.tsx
- 카드 항목은 `{ id, isin, accountNo, exchange: RelayExchange, open, name?, code? }`, 카드는 `useRelaySubscription({ isin, exchange })`(full)로 자기 거래소만 구독한다.
- 1134행 `cardIsins = new Set(cards.map(c => c.isin))` → 1249행 `<BreakoutStrip items snapSeq cards={cardIsins} onAddCard onFocusCard />`.
- 415행 부근 `holdingQuotePrice` JSDoc 에 「KRX 는 기본 거래소이자 돌파 가격 축(`breakoutQuotePrice`)과 같다」 문장이 있다(이제 거짓).
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): 돌파 원소 동일성을 ISIN 한 축으로 — relay 캐시·78 팬아웃 → 브라우저 리듀서 (RCC-2)</name>
  <files>relay/src/hub/subscription-hub.ts, relay/tests/rate-cross.test.ts, relay/tests/fanout.test.ts, webapp/src/lib/use-relay-socket.ts, webapp/src/lib/__tests__/relay-socket.test.ts</files>
  <read_first>
    - relay/src/hub/subscription-hub.ts 255~290 · 770~790 · 1110~1175행(키 · getter · 76/78 핸들러)
    - relay/tests/rate-cross.test.ts 190~300행(③ · ⑤-2 · ⑤-2b)
    - relay/tests/fanout.test.ts 745~805행(⑭-1 · ⑭-2 새 탭 인증 스냅샷 패턴)
    - webapp/src/lib/use-relay-socket.ts 880~897 · 1030~1060행
    - webapp/src/lib/__tests__/relay-socket.test.ts 1486~1590행(describe 「rate.cross 순서」)
    - gh-trade 정본 ② 「상태는 ISIN 당 RateCrossState 1개(결정 A)」 문단
  </read_first>
  <behavior>
    - relay R1(rate-cross ③ 재작성): 같은 ISIN 에 76 KRX → 76 NXT 가 오면 `getRateCrossItems` 는 1원소이고 그 exchange 는 NXT, 값은 뒤 프레임 값이다. 반대 방향(NXT → KRX)도 1원소 · KRX. 다른 ISIN 은 따로 쌓인다.
    - relay R2(⑤-2 픽스처 교정): 78 원소 3개는 ISIN 이 서로 다른 세 종목이다(서버 계약 「ISIN 당 1원소」). 기대 순서·길이는 종전과 같다.
    - relay R3(신규 ⑤-5): 계약 위반으로 78 에 같은 ISIN 이 두 번 와도 캐시 getter 와 78 팬아웃이 **둘 다** 그 ISIN 1원소(뒤 원소가 이긴다)이고 두 결과가 같다.
    - relay R4(fanout 신규 ⑭-4 · 소켓 왕복): 가짜 게이트웨이가 같은 ISIN 으로 76 KRX 뒤 76 NXT 를 보낸 다음 새 탭이 인증하면, 그 탭의 첫 rate.cross.snap 은 그 ISIN 1원소이고 exchange 는 NXT 다.
    - webapp W1(신규): 78 [A KRX 0901, B KRX 0903] 뒤 76 A NXT 0910 → rateCrossItems 길이 2, 맨 위 A, A 의 exchange NXT.
    - webapp W2(신규): 78 [A NXT 0801] 뒤 76 A KRX 1000 → 길이 1, exchange KRX.
    - webapp W3: 기존 ② 는 제목만 「같은 isin …」 으로 고치고 그대로 통과한다. 정렬 축(exchangeTime ↓ · 동률 isin ↑) 테스트 ①③④ 는 무수정 통과.
  </behavior>
  <action>
    먼저 behavior 의 신규·수정 테스트를 쓰고 RED(R1·R3·R4·W1·W2 실패)를 관측한 뒤 구현한다.

    1. relay/src/hub/subscription-hub.ts — `rateCrossKey` 를 `(userId, isin)` 두 인자로 바꾸고 결과를 `${userId}|${isin}` 로 한다. 접두 `userPrefix(userId)` 규율은 그대로라 getter · 78 교체 · 사용자 정리 경로는 무변경으로 맞는다. JSDoc 을 새 사실로 바꾼다: gh-trade quick-260923-cfo 결정 A 로 서버 상태가 ISIN 당 1개이고 76 exchange = 발화 체결의 거래소, 78 원소 exchange = above 구간을 연 거래소(NXT 가능) — 그래서 뒤에 온 76 이 거래소째 덮는다; 거래소를 키에 두면 KRX 행 뒤 NXT 재돌파가 다음 78 까지 두 원소로 남는다. 두 호출부(`#onRateCrossAlert` · `#onRateCrossSnapshot`)에서 exchange 인자를 뺀다. `RelayExchange` import 가 이 파일의 다른 곳에서 여전히 쓰이는지 typecheck 로 확인하고 안 쓰이면 지운다.
    2. 같은 파일 `#onRateCrossSnapshot` — 전량 교체 뒤 78 팬아웃 페이로드를 원 배열이 아니라 `this.getRateCrossItems(userId)` 로 만든다(보강·정렬이 이미 들어 있는 같은 원천). 이유를 주석에 적는다: 인증 직후 스냅샷(`fanout.ts`)과 78 팬아웃이 한 원천이면 서버가 같은 ISIN 을 두 번 보내는 계약 위반에도 브라우저는 ISIN 당 1원소를 받고 두 경로가 갈리지 않는다. 캐시에는 종전처럼 서버 원본을 넣는다(보강은 사본에만 · D-30 규율 유지). `logger.info` 의 count 는 원 배열 길이 그대로 둔다.
    3. relay/tests/rate-cross.test.ts — ③ 을 R1 로 재작성(제목에서 「isin+exchange」 를 「isin」 으로, 「양쪽 거래소에서 돌파하면 원소 둘」 주석을 결정 A 로 교체). ⑤-2 의 SAMPLE_ISIN 중복 원소를 세 번째 ISIN(파일에 없는 12자 ISIN 하나, 예 KR7035420009)으로 바꿔 R2 를 만든다. ⑤-5(R3)를 ⑤ 블록 끝에 추가한다. ④ 드롭 0 게이트는 그대로 둔다.
    4. relay/tests/fanout.test.ts — ⑭-2 뒤에 ⑭-4(R4)를 추가한다. ⑭-2 의 「게이트웨이 소켓 얻기 → 프레임 전송 → hub 캐시 대기(`waitFor(() => h.hub.getRateCrossItems(USER_A)[0]?.exchange === NXT 조건)`) → 새 탭 open + sendAuth → 스냅샷 대기」 패턴을 그대로 따른다. 송신은 `gateway.sendRateCrossAlert(sock, { isin: SAMPLE_ISIN, exchange: … })` 두 번이다.
    5. webapp/src/lib/use-relay-socket.ts — `upsertRateCross` 의 필터를 ISIN 한 조건으로 바꾼다(거래소 비교 제거). 함수 JSDoc 첫 줄과 `case "rate.cross"` 주석을 「키는 isin 이다 — 서버 상태가 ISIN 당 1개(gh-trade quick-260923-cfo 결정 A), 뒤에 온 76 이 거래소째 덮는다 · relay `rateCrossKey` 와 같은 축」 으로 고친다. 78 경로(`sortRateCross(frame.items)`)는 relay 가 ISIN 당 1원소를 보장하므로 바꾸지 않는다(재해석 금지 D-14). `rateCrossItems` 필드 JSDoc 에 「종목당 1원소」 한 줄을 더한다.
    6. webapp/src/lib/__tests__/relay-socket.test.ts — describe 「rate.cross 순서」 의 `crossItem` 헬퍼에 선택 인자로 거래소를 받게 하고(기본 KRX) W1·W2 를 추가, ② 제목을 고친다.
    7. 게이트 후 커밋. 커밋 직전 `git status --short` 를 다시 본다(다른 세션이 같은 트리에서 `mobile/**` · `.planning/state.json` · `tasks/lessons.md` · `webapp/e2e/specs/theme-default.spec.ts` 를 고치는 중이다 — 그 파일들은 절대 stage 하지 않는다). `git add` 는 이 태스크 files 5개 경로를 명시해서만 한다(전체 추가 옵션 금지). 메시지(한글, Co-Authored-By 없음, push 없음): `fix(quick-260926-rcc): 돌파 원소 키를 ISIN 한 축으로 — relay 캐시·78 팬아웃·브라우저 upsert (gh-trade cfo 결정 A)`.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run tests/rate-cross.test.ts tests/fanout.test.ts && pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts && grep -q 'function rateCrossKey(userId: string, isin: string)' relay/src/hub/subscription-hub.ts</automated>
  </verify>
  <done>R1~R4 · W1~W3 GREEN(구현 전 RED 관측 기록). relay 두 typecheck exit 0. relay rate-cross/fanout 기존 케이스 무수정 통과(③·⑤-2 는 behavior 대로 갱신). 한글 커밋 1건(명시 5경로 · push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 스트립 행 키 = ISIN · 피드 전환 시 이탈 판정 상태 재시작 · 계약 주석 (RCC-1 · RCC-2)</name>
  <files>webapp/src/lib/breakout-list.ts, webapp/src/lib/__tests__/breakout-list.test.ts, webapp/src/lib/__tests__/trading-alerts.test.ts, webapp/src/components/trading/workbench/breakout-strip.tsx, packages/shared/src/relay.ts</files>
  <read_first>
    - webapp/src/lib/breakout-list.ts 170~295행(행 상태 · 키 · 이탈 판정 · 기록 갱신 · 행 접기)
    - webapp/src/lib/__tests__/breakout-list.test.ts 43~75 · 176~273행
    - webapp/src/lib/__tests__/trading-alerts.test.ts 263~273행(newRateCrossAlerts)
    - webapp/src/components/trading/workbench/breakout-strip.tsx 127~226 · 279~292행
    - packages/shared/src/relay.ts 1023~1075행(RelayRateCrossItem · RelayRateCrossMsg · RelayRateCrossSnapMsg)
    - gh-trade 정본 ③ 「목록 행」 · 「이탈 판정」 불릿 (자리유지 갱신은 무장·강조를 건드리지 않고 발화 거래소만 갱신 · 판정은 피드 거래소 체결만)
  </read_first>
  <behavior>
    - B1: `breakoutKey` 는 거래소와 무관하게 ISIN 이다 — 같은 ISIN 의 KRX 항목과 NXT 항목의 키가 같다.
    - B2: `trackBreakoutMeta` 새 키 → `{ addedAt: now, feedSince: now, feedExchange: it.exchange, armed: false, silent }`.
    - B3: 기존 키 · 같은 거래소 → 종전 무장 규칙 그대로(등재 뒤 관측가가 임계 이상이면 무장, 한 번 무장하면 유지). `priceOf` 는 항목(isin·exchange)을 받는다.
    - B4: 기존 키 · 거래소가 바뀜(전환) → `addedAt`·`silent` 유지, `feedExchange` = 새 거래소, `feedSince` = now, `armed` = false. 그 스텝에서 `priceOf` 가 임계 이상을 줘도 무장하지 않는다(전환 스텝은 등재 스텝처럼 관측이 아니다). 다음 스텝부터 새 거래소 관측으로 무장한다.
    - B5: `shouldRemoveBreakout` 유예는 `feedSince` 기준이다 — 미무장 · 임계−2%p 아래 · `addedAt: 0` · `feedSince: 10_000` 이면 now 11_000 에서 지우지 않고 13_000 에서 지운다. 무장 행은 종전처럼 유예와 무관하게 지운다. 현재가 모름은 언제나 false(종전).
    - B6: `breakoutRowsFrom` 행의 `key` 는 ISIN, `removed` 는 ISIN 집합으로 거른다, 행에 `feedSince` 가 실린다. 기록 없는 행 기본값에도 `feedSince: 0` · `feedExchange: 항목 거래소`.
    - B7: `newRateCrossAlerts(prevKeys=ISIN 집합, …)` — 같은 ISIN 의 거래소만 바뀐 항목은 새 알림이 아니다(자리유지 갱신 = 무음 · gh-trade 「재알림·무음·자리유지」). 다른 ISIN 은 종전대로 새 알림이다.
    - B8: 스트립 기존 테스트 전량 무수정 통과(이 태스크는 스트립의 호출 모양만 바꾼다).
  </behavior>
  <action>
    먼저 B1~B7 테스트를 쓰고(기존 `toEqual({addedAt, armed, silent})` 단언은 새 필드 포함으로 갱신 — 계약 변경에 따른 갱신이라 SUMMARY 「갱신한 기존 테스트와 이유」 에 적는다) RED 를 관측한 뒤 구현한다.

    1. webapp/src/lib/breakout-list.ts
       - `BreakoutMeta` 에 `feedExchange: RelayExchange`(무장·유예를 잰 피드 거래소)와 `feedSince: number`(그 피드로 판정을 시작한 시각 ms)를 더한다. JSDoc 에 역할 분리를 적는다: `addedAt` = 첫 등재(강조 · 구독 우선순위 · 첫 돌파시각과 같은 축, 전환에도 유지) / `feedSince` = 이탈 유예의 기준(등재 때 addedAt 과 같고 피드 전환 때 다시 찍힌다).
       - `BreakoutRow` 에 `feedSince` 를 더하고 `key` JSDoc 을 「ISIN — relay 리듀서 upsert 축과 같다」 로 고친다.
       - `breakoutKey` 인자를 `Pick<RelayRateCrossItem, "isin">` 로 좁히고 `item.isin` 을 돌려준다. JSDoc: gh-trade quick-260923-cfo 결정 A — 서버 상태가 ISIN 당 1개라 거래소가 바뀌어도 같은 행이다(gh-trade 자리유지 갱신). 함수 자체는 남긴다(키 정의 단일 지점 — 소비처 use-trading-alerts · trading-alerts · 스트립이 그대로 부른다).
       - `shouldRemoveBreakout` 의 Pick 에서 `addedAt` 을 `feedSince` 로 바꾸고 유예 식을 `now - row.feedSince >= ARM_GRACE_MS` 로 한다. JSDoc ② 에 「유예 기준은 피드 판정 시작 시각」 한 줄.
       - `trackBreakoutMeta` 의 `priceOf` 타입을 `(item: Pick<RelayRateCrossItem, "isin" | "exchange">) => number | undefined` 로 바꾸고 호출을 `priceOf(it)` 로 한다. B2·B4 분기를 넣는다(전환 판정 = 기존 기록이 있고 `old.feedExchange !== it.exchange`). 값이 안 바뀌면 기존 객체 신원을 유지하는 종전 규칙은 지킨다.
       - 전환 규칙의 근거를 `trackBreakoutMeta` JSDoc 에 적는다: gh-trade 는 자리유지 갱신에서 Armed 를 건드리지 않지만 그 판정은 새 피드의 **실시간 이벤트**만 본다. gh-radar 는 전역 시세 맵(구독을 풀어도 값을 지우지 않는다)의 캐시값을 읽으므로, 전환 직후 새 피드 키에 이전 구독의 낡은 값이 남아 있으면 무장 유지 상태에서 그 값으로 즉시 지워지고, 지운 행은 서버 새 프레임 전까지 되살아나지 않는다. 그래서 전환 때 판정 상태만 새 피드 기준으로 다시 시작하고 표시(자리 · 강조 · 무음 · 첫 돌파시각)는 유지한다.
       - `breakoutRowsFrom` 의 기록 없는 행 기본값에 `feedSince: 0` · `feedExchange: it.exchange` 를 더하고 행에 `feedSince` 를 싣는다.
       - 파일 머리 ① 목록은 바꾸지 않는다.
    2. webapp/src/lib/__tests__/breakout-list.test.ts — `row()` 픽스처의 `key` 를 ISIN 으로, `feedSince: 0` 을 더한다. 유예 케이스 두 개는 `feedSince` 로 표현을 바꾼다. 메타 단언의 키 문자열을 ISIN 으로 바꾼다. B1·B4·B5·B6 신규 케이스를 더한다.
    3. webapp/src/lib/__tests__/trading-alerts.test.ts — describe 「newRateCrossAlerts」 의 prevKeys 를 ISIN 집합으로 바꾸고 기대값을 B7 로 고친다(같은 ISIN · 다른 거래소 항목은 결과에 없다).
    4. webapp/src/components/trading/workbench/breakout-strip.tsx — 새 시그니처에 맞춘 호출 모양만 바꾼다: `advanceTracked` 입력 `priceOf` 타입을 항목 인자로, 이탈 판정 호출을 `priceOf(it)`, views 의 `price: priceOf(row)`. 스트립의 `priceOf` 구현은 이 태스크에서 `(it) => prices.get(it.isin)` 이다 — 훅의 `prices` 가 아직 ISIN 키라서이고, Task 3 이 같은 커밋 계열 안에서 피드 키로 바꾼다. 이 태스크는 스트립 머리 주석을 고치지 않는다(Task 3 이 ②·⑧ 을 함께 고친다).
    5. packages/shared/src/relay.ts — 주석만 고친다(타입 모양 불변). `RelayRateCrossItem.exchange` JSDoc: 「76 = 발화한 판정 대상 체결의 거래소 · 78 원소 = above 구간을 연 거래소 — KRX/NXT 모두 가능(gh-trade quick-260923-cfo · KRX 접속매매 세션이 닫힌 시간의 NXT 접속매매도 판정). 종목당 1원소라 원소 동일성은 ISIN 이고 이 값은 행의 피드 거래소다」. `RelayRateCrossMsg` JSDoc 에 「upsert 키 = isin(거래소 무관)」, `RelayRateCrossSnapMsg` 에 「ISIN 당 1원소」 를 더한다. 이어서 `pnpm --filter @gh-radar/shared build`.
    6. 게이트 후 커밋. `git status --short` 재확인 · 이 태스크 files 5개 경로만 명시 stage. 메시지: `fix(quick-260926-rcc): 돌파 행 키를 ISIN 으로 — 발화 거래소 전환 시 이탈 판정(무장·유예)만 새 피드 기준으로 재시작 · 공유 계약 주석 NXT 반영`. Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/breakout-list.test.ts src/lib/__tests__/trading-alerts.test.ts src/lib/__tests__/use-trading-alerts.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx && pnpm --filter @gh-radar/webapp run typecheck && grep -q 'feedSince' webapp/src/lib/breakout-list.ts</automated>
  </verify>
  <done>B1~B8 GREEN(구현 전 RED 관측). webapp typecheck exit 0 — 실패가 이 plan 밖 파일(예: 다른 세션이 고치는 중인 `webapp/e2e/specs/theme-default.spec.ts`)에서만 나면 고치지 말고 오류 원문을 SUMMARY 에 적는다. 스트립·use-trading-alerts 기존 테스트 무수정 통과. 한글 커밋 1건(명시 5경로 · push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 행의 발화 거래소 피드로 price 구독·가격 — 전환 시 해제 1 + 구독 1 · 카드 제외는 (ISIN, 거래소) (RCC-1 · RCC-3)</name>
  <files>webapp/src/lib/use-breakout-quotes.ts, webapp/src/lib/__tests__/use-breakout-quotes.test.tsx, webapp/src/components/trading/workbench/breakout-strip.tsx, webapp/src/components/trading/__tests__/breakout-strip.test.tsx, webapp/src/components/trading/workbench/trading-workbench.tsx</files>
  <read_first>
    - webapp/src/lib/use-breakout-quotes.ts 전체(241행)
    - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx 전체(284행 — 소스 규율 테스트 137~144행 포함)
    - webapp/src/components/trading/workbench/breakout-strip.tsx 1~52(머리 주석) · 99~113(props) · 207~226행
    - webapp/src/components/trading/__tests__/breakout-strip.test.tsx 1~146 · 382~443행(mock · setup · setPrice · 이탈 삭제)
    - webapp/src/components/trading/workbench/trading-workbench.tsx 405~425 · 1130~1136 · 1245~1256행
    - gh-trade 정본 ③ 「구독은 창이 아니라 저장소 소유다」 불릿(FeedExchange · 해제 대칭 `_subscribedFeed` · ReconcileFeed)
  </read_first>
  <behavior>
    훅(use-breakout-quotes.test.tsx — 후보 헬퍼에 거래소 인자, 기본 KRX):
    - Q1: 후보 [A·KRX, B·NXT] 마운트 → subscribe(A, KRX, price) · subscribe(B, NXT, price) 각 1회.
    - Q2(전환): [A·KRX, B·KRX] → [A·NXT, B·KRX] 재렌더 → unsubscribe(A, KRX, price) 정확히 1회 · subscribe(A, NXT, price) 정확히 1회 · B 는 호출 0. 이어서 언마운트 → unsubscribe(A, NXT, price) · unsubscribe(B, KRX, price) 이고 A·KRX 해제가 두 번 나가지 않는다.
    - Q3(카드 제외): excludeFeeds = {A·KRX 피드 키} 일 때 후보 A·KRX 는 구독하지 않고, 후보 A·NXT 는 구독한다.
    - Q4(가격): 전역 맵에 A·KRX 70,000 · A·NXT 71,000 이 있고 후보가 A·NXT 면 `prices.get(breakoutFeedKey(A·NXT))` = 71,000 이고 A·KRX 피드 키는 prices 에 없다. 기존 「NXT 시세는 KRX 후보의 현재가가 아니다」 케이스는 피드 키 조회로 표현만 바꿔 유지한다.
    - Q5: 기존 구독 diff · 상한 · 스로틀 · 언마운트 타이머 · 소스 규율 케이스는 호출 인자의 거래소가 후보 값이 되고 `excludeIsins`→`excludeFeeds` · ISIN→피드 키 표현만 바뀌어 통과한다(갱신 사유를 SUMMARY 에 적는다). 소스 규율 테스트(`.send(` · sub 프레임 직접 생성 금지)는 무수정 통과.
    스트립(breakout-strip.test.tsx — `setPrice(isin, p, exchange?)` 로 확장, 기본 KRX · setup 기본 props 에 `cardFeeds: new Set()`):
    - S1(NXT 행 가격): 항목 A 의 exchange 가 NXT, 전역 맵에 A·KRX 9,000(−10%) · A·NXT 12,600 → 유예·스로틀이 지나도 행이 남고 표 현재가 12,600 · +26.00% 로 보인다.
    - S2(전환): 항목 A(KRX)로 시작 → 새 항목 객체 A(NXT, 더 늦은 exchangeTime)로 update → 칩은 여전히 1개(그 ISIN), subscribeMock 에 (A, NXT, price), unsubscribeMock 에 (A, KRX, price). 전환 직후 3초 유예 안에서 A·NXT 가 임계−2%p 아래(낡은 값 가정)여도 지우지 않는다. 돌파시각은 첫 등재값 그대로다.
    - S3(카드 제외 단위): `cards` = {A}, `cardFeeds` = {A·KRX 피드 키}, 항목 A 가 NXT → subscribeMock 에 (A, NXT, price) 가 있고 칩은 「거래중」 표식이다.
    - S4: 기존 「거래소 미표시(D-07)」 케이스와 나머지 스트립 케이스 무수정 통과.
  </behavior>
  <action>
    먼저 Q1~Q4 · S1~S3 를 쓰고 RED 를 관측한 뒤 구현한다.

    1. webapp/src/lib/use-breakout-quotes.ts
       - 거래소 고정 상수 `BREAKOUT_EXCHANGE` 를 지운다. 구독 level 상수 `BREAKOUT_SUB_LEVEL`(price)은 그대로다(quick-260923-ge2).
       - `export function breakoutFeedKey(feed: { isin: string; exchange: RelayExchange }): string` 을 추가해 `relayQuoteKey(feed.isin, feed.exchange)` 를 돌려준다 — 이 훅의 `prices` · `excludeFeeds` · `subscribed` · `overflow` 가 쓰는 피드 키의 단일 정의다(소비자가 키 형식을 알지 않게).
       - `breakoutQuotePrice(quotes, isin, exchange)` 로 거래소 인자를 받는다(행의 피드 거래소). 「모르면 undefined」 규칙 그대로.
       - `BreakoutQuoteCandidate` 에 `exchange: RelayExchange` 를 더한다(행의 발화 거래소 = 피드 거래소).
       - 예산 선정은 피드 키 단위로 중복을 없애고(같은 피드는 최근 addedAt), 빈 ISIN · `excludeFeeds` 에 든 피드를 뺀다. 순서는 최근 돌파 먼저 · 동률이면 피드 키 오름차순. `picked`/`overflow` 는 피드 키 목록이다.
       - 옵션 `excludeIsins` 를 `excludeFeeds?: ReadonlySet<string>`(카드가 스스로 구독한 피드 키 집합)로 바꾼다.
       - 구독 effect: 재실행 트리거는 여전히 정렬된 피드 키들을 이은 **안정 문자열 시그니처 하나**다(③ 규율). 피드 키 안에 `|` 가 들어 있으므로 시그니처 구분자는 다른 문자(예: 쉼표)로 한다. held 장부를 `Map<피드키, { isin, exchange }>` 로 바꿔 **해제는 언제나 실제로 건 (isin, exchange) 로** 한다(gh-trade `_subscribedFeed` 해제 대칭). want 쪽 (isin, exchange) 는 시그니처를 분해하거나 같은 렌더의 선정 결과에서 얻되, 어느 쪽이든 행의 거래소가 바뀌면 옛 피드 해제 1회 + 새 피드 구독 1회만 나가고 남는 피드는 건드리지 않는다. 언마운트 effect 는 held 에 기록된 쌍으로 전부 해제한다.
       - 가격 스로틀(⑤): 후보 목록을 피드 단위(순서 유지 · 중복 제거)로 모으고, 가격 서명과 표시 맵을 피드 키 → 그 피드 현재가로 만든다. 알려진 값만 담고 값이 같으면 맵 신원을 유지하는 종전 규칙, 절대 시각 마감, 첫 렌더 동기 초기화는 그대로다.
       - `BreakoutQuotesResult` JSDoc: `prices` = 피드 키 → 현재가(후보 피드 전체 · 구독 여부 무관 · ≤5Hz), `subscribed`/`overflow` = 피드 키.
       - 파일 머리 ② 를 새 사실로 다시 쓴다: 거래소는 행의 발화 거래소(피드 거래소)다 — 76 = 발화 체결의 거래소, 78 = above 구간을 연 거래소(gh-trade quick-260923-cfo · KRX 접속매매 세션이 닫힌 08:00~09:00 · 15:30~16:00 의 NXT 접속매매도 판정). 행마다 그 피드 하나만 구독하고, 발화 거래소가 바뀌면 옛 피드를 풀고 새 피드를 건다(두 거래소 동시 구독 없음 — gh-trade FeedExchange/ReconcileFeed). 칩에 거래소를 표시하지 않는 것(D-07)은 그대로다. ④ 는 카드 제외가 (ISIN, 거래소) 피드 단위임을, ⑤ 는 「후보 ISIN 전체의 KRX 현재가」 를 「후보 피드 전체의 현재가」 로 고친다. 소스 규율 테스트가 이 파일 전체(주석 포함)에서 `.send(` 와 sub 프레임 리터럴을 금지하므로 새 주석도 산문으로만 쓴다. 이 파일의 코드 줄에는 따옴표로 감싼 거래소 리터럴이 남지 않아야 한다.
    2. webapp/src/lib/__tests__/use-breakout-quotes.test.tsx — 헤더 ③ 명제를 「행의 발화 거래소로 구독」 으로 바꾸고, behavior Q1~Q5 대로 갱신·추가한다.
    3. webapp/src/components/trading/workbench/breakout-strip.tsx
       - props 에 `cardFeeds: ReadonlySet<string>` 을 더한다(JSDoc: 카드가 스스로 구독한 피드 키 `breakoutFeedKey` — 돌파 훅 구독 예산에서만 뺀다. 「거래중」 표식·카드 포커스는 `cards`(ISIN) 그대로).
       - 후보에 `exchange: it.exchange` 를 싣고 `useBreakoutQuotes(candidates, { excludeFeeds: cardFeeds })` 로 부른다.
       - `priceOf` 를 `(it) => prices.get(breakoutFeedKey(it))` 로 바꾼다 — 행 피드 가격만 읽어 다른 거래소 값이 표시·무장·이탈에 섞이지 않는다.
       - 머리 주석 ② 를 고친다: 거래소를 표시하지 않는 이유를 「gh-trade 돌파감지 창도 거래소 열을 두지 않는다(quick-260923-cfo 최소 변경)」 로 바꾸고, 시세 구독 거래소는 행의 `exchange`(발화 거래소)를 그대로 넘긴다는 것, 이 파일 코드에는 거래소 리터럴이 없다는 것을 적는다. ⑧ 에 「가격은 행 피드(ISIN, 발화 거래소) 기준」 한 구절을 더한다.
    4. webapp/src/components/trading/__tests__/breakout-strip.test.tsx — `setPrice` 에 거래소 선택 인자(기본 KRX)와 그 거래소를 x 로 싣는 quote 헬퍼 확장, setup 기본 props 에 `cardFeeds: new Set()` 을 더하고 S1~S3 를 추가한다. 스로틀·유예 경과는 기존 케이스처럼 `vi.advanceTimersByTime` 로 넘긴다.
    5. webapp/src/components/trading/workbench/trading-workbench.tsx — `cardIsins` 옆에 `cardFeeds = useMemo(() => new Set(cards.map((c) => breakoutFeedKey(c))), [cards])` 를 두고 `<BreakoutStrip … cardFeeds={cardFeeds} />` 로 넘긴다(`breakoutFeedKey` 는 use-breakout-quotes 에서 import). `holdingQuotePrice` JSDoc 의 「KRX 는 기본 거래소이자 돌파 가격 축(`breakoutQuotePrice`)과 같다」 를 「KRX 는 기본 거래소다」 로 줄인다(돌파 가격 축은 이제 행마다 다르다). 카드 추가 동작(`ensureIsinCard` 의 기본 거래소)은 바꾸지 않는다 — 발화 거래소로 카드 열기는 이번 범위 밖 후속 후보로 SUMMARY 에만 적는다.
    6. 전량 게이트: `pnpm --filter @gh-radar/shared build` → relay `typecheck` · `typecheck:tests` → webapp `typecheck` → relay `run test` → webapp `run test`. 그 다음 `lsof -iTCP:3100 -sTCP:LISTEN` 과 `lsof -iTCP:8090 -sTCP:LISTEN` 이 둘 다 비어 있을 때만 `pnpm --filter @gh-radar/webapp exec playwright test trading-workbench` 를 돌린다(실 relay + 스텁 게이트웨이 · dev 3100). 포트가 다른 세션에 점유돼 있으면 그 프로세스를 죽이지 말고 「Playwright 미실행 — 포트 점유」 를 SUMMARY 에 적는다. 돌렸으면 끝난 뒤 두 포트가 비었는지 확인한다.
    7. 커밋. `git status --short` 재확인 · 이 태스크 files 5개 경로만 명시 stage. 메시지: `fix(quick-260926-rcc): 돌파 행은 발화 거래소 피드로 price 구독·가격·이탈 판정 — 전환 시 옛 피드 해제·새 피드 구독 · 카드 제외는 (ISIN, 거래소)`. Co-Authored-By 없음 · push 없음 · relay 배포 없음.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/use-breakout-quotes.test.tsx src/components/trading/__tests__/breakout-strip.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && grep -q 'breakoutFeedKey' webapp/src/components/trading/workbench/breakout-strip.tsx && grep -q 'cardFeeds' webapp/src/components/trading/workbench/trading-workbench.tsx && test "$(grep -v -E '^\s*(\*|//|/\*)' webapp/src/lib/use-breakout-quotes.ts | grep -c '"KRX"')" = 0 && test "$(grep -v -E '^\s*(\*|//|/\*)' webapp/src/components/trading/workbench/breakout-strip.tsx | grep -c -E "['\"](KRX|NXT)['\"]")" = 0</automated>
  </verify>
  <done>Q1~Q5 · S1~S4 GREEN(구현 전 RED 관측). relay·webapp vitest 전량 · shared build 후 typecheck 3종 exit 0(이 plan 밖 파일 오류만 있으면 원문을 SUMMARY 에 기록). 훅 코드 줄의 따옴표 KRX 리터럴 0(계획 시점 1) · 스트립 코드 줄의 거래소 리터럴 0 유지. Playwright trading-workbench 0 failed 이거나 「미실행 — 포트 점유」 기록. 한글 커밋 1건(명시 5경로 · push 없음). SUMMARY 작성.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gateway → relay | 76/78 프레임(거래소 필드 이제 KRX/NXT) — relay 는 파싱·보관만 하고 집합을 재해석하지 않는다 |
| relay → browser | rate.cross / rate.cross.snap 프레임 · 인증 직후 스냅샷 |
| browser 시세 맵 → 돌파 판정 | 구독을 풀어도 지워지지 않는 캐시값이 이탈 판정 입력이 된다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-rcc-01 | Tampering | relay `#onRateCrossSnapshot` 78 팬아웃 | medium | mitigate | 78 팬아웃을 ISIN 키 캐시 getter(`getRateCrossItems`)에서 만든다 — 계약 위반 중복 ISIN 이 와도 브라우저는 ISIN 당 1원소(중복 React key · 두 줄 행 방지). Task 1 R3·R4 로 고정 |
| T-rcc-02 | Tampering | breakout-list 이탈 판정(낡은 캐시값) | medium | mitigate | 피드 전환 시 무장 해제 + `feedSince` 로 3초 유예 재시작(B4·B5), 가격은 피드 키로만 조회해 다른 거래소 값이 섞이지 않는다(Q4·S1·S2) |
| T-rcc-03 | Denial of Service | useBreakoutQuotes 구독 참조계수 | medium | mitigate | held 장부에 실제로 건 (isin, exchange) 를 기록해 해제 대칭 — 전환·언마운트 뒤 옛 피드 참조계수가 새지 않는다(Q2). 구독 상한 `MAX_BREAKOUT_SUBS` 40 유지 |
| T-rcc-04 | Denial of Service | 배포 반쪽 상태(구 relay + 새 webapp) | medium | mitigate | 구 relay 캐시는 거래소 키라 인증 스냅샷에 같은 ISIN 이 둘일 수 있다 → 배포 순서 relay 먼저 → 검증 → webapp push. 실행자는 push·배포하지 않고 SUMMARY 에 순서만 적는다 |
| T-rcc-05 | Information Disclosure | localStorage 「오늘 울린/지운 종목」 | low | accept | 저장 형식 불변(날짜 + ISIN 만) — 이번 변경이 새 필드를 싣지 않는다 |
| T-rcc-06 | Tampering | 공유 작업 트리(다른 세션) | medium | mitigate | 커밋 직전 `git status --short` 재확인 · 태스크 files 명시 경로만 stage · 전체 추가 금지 · `mobile/**` · `.planning/state.json` · `tasks/lessons.md` · `webapp/e2e/specs/theme-default.spec.ts` 무접촉 |

패키지 설치 없음 — 공급망 항목 해당 없음.
</threat_model>

<verification>
- Task 별 `<verify>` 전부 exit 0. 마지막 전량 게이트: shared build → relay typecheck · typecheck:tests → webapp typecheck → relay vitest 전량 → webapp vitest 전량 → (포트 비었을 때) Playwright trading-workbench.
- `git log --oneline -3` 에 이 plan 의 한글 커밋 3건, 각 커밋의 `git show --stat` 이 해당 태스크 files 만 담는다.
- `git status --short` 에 이 plan 의 files 가 M 으로 남지 않는다(다른 세션 파일은 그대로).
- 수동 확인(배포 뒤 · 사용자 몫, SUMMARY 에 절차만): 평일 08:00~08:50 또는 15:40~ 에 NXT 발화 돌파 행이 NXT 가격으로 움직이고 3초 뒤 사라지지 않는지, 09:00 이후 같은 종목이 두 줄로 보이지 않는지.
</verification>

<success_criteria>
- NXT 발화 행은 NXT 피드로 가격·이탈 판정, KRX 발화 행은 KRX 피드 — 행마다 피드 하나.
- relay 캐시 · 78 팬아웃 · 인증 스냅샷 · 브라우저 리듀서 · 스트립 행 키가 모두 ISIN 한 축.
- 발화 거래소 전환: 구독 해제 1 + 구독 1, 판정 상태만 재시작, 표시·알림 불변.
- 카드 구독 예산 제외는 (ISIN, 거래소) 단위, 「거래중」 은 ISIN 단위.
- D-07(거래소 미표시) · price level(ge2) · 정렬 축(exchangeTime ↓ · isin ↑) 유지.
- 테스트·typecheck 전량 통과, 명시 경로 커밋 3건, push·배포 없음.
</success_criteria>

<output>
`.planning/quick/260926-rcc-breakout-nxt-feed-exchange-rate-cross-is/260926-rcc-SUMMARY.md` 를 만든다. 반드시 포함:
- 「갱신한 기존 테스트와 이유」 — 계약 변경(ISIN 키 · feedSince · 피드 키 prices · excludeFeeds)에 따른 단언 갱신 목록.
- 「전환 규칙 결정」 — 발화 거래소 전환 시 무장·유예만 재시작하고 표시는 유지한 근거(gh-trade 는 이벤트 구동이라 Armed 유지로 충분 · gh-radar 는 캐시 시세 맵이라 재시작 필요).
- 「배포 순서」 — relay 먼저 배포 → `/healthz` 등 검증 → 그 다음 `git push`(= webapp 프로덕션 배포). 구 relay + 새 webapp 조합은 인증 스냅샷에 같은 ISIN 두 원소가 올 수 있어 반대 순서 금지. 새 relay + 구 webapp 은 무해. 이 실행에서는 push·배포하지 않았음을 명시.
- 「후속 후보」 — (1) 돌파 행 → 카드 추가 시 발화 거래소로 카드 열기(gh-trade 는 발화 거래소 상따창을 연다 · 이번엔 기본 KRX 유지), (2) 이탈로 지운 행이 새 구간 76 으로 되살아날 때 강조·무장을 새 행처럼 다시 시작할지(현재는 ISIN 기록 유지 — gh-trade 는 빠졌다 다시 오면 새 행).
- Playwright 실행 여부(또는 「미실행 — 포트 점유」)와 typecheck 가 plan 밖 파일에서 실패했다면 그 원문.
</output>
