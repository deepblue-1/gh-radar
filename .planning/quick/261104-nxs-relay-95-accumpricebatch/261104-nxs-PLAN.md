---
phase: quick-261104-nxs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — tracer: 스키마 동기화 + relay 95 디코드 · 전역 캐시 · accum.prices 팬아웃 + shared 계약
  - relay/src/generated/**            # gh-trade 소유 sync 스크립트 산출물만(손편집 금지)
  - relay/src/dma/msg-type.ts
  - relay/src/dma/envelope.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/index.ts
  - relay/tests/helpers/frames.ts
  - relay/src/dma/__tests__/codec.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/hub.test.ts
  - relay/tests/fanout.test.ts
  # Task 2 — 웹: 95 현재가 원천 + 95 없는 종목만 구독 폴백
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-accum-prices.ts
  - webapp/src/components/trading/workbench/accum-strip.tsx
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/components/trading/__tests__/accum-strip.test.tsx
  # Task 3 — 웹: 필터 줄(목업 A)
  - webapp/src/lib/accum-list.ts
  - webapp/src/lib/__tests__/accum-list.test.ts
autonomous: true
requirements: ["261104-nxs"]

estimate:
  tokens: 165000
  raw_tokens: 165000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "relay 는 quote 관찰자 연결로 온 95 AccumPriceBatch 를 디코드해 전역 캐시(isin → {p,r,b})에 병합하고(정기 묶음 · 로그인 스냅샷 여러 프레임 모두 병합), 인증된 웹 소켓 전부에 `{ t: \"accum.prices\", snap: false, items }` 로 흘린다 (「현재가 원천」)"
    - "웹 소켓 인증 직후 relay 는 캐시 전체를 `accum.prices` snap:true 1프레임으로 내린다 — 비어 있어도 보낸다. quote 연결이 새로 ready 되면(재접속 · 시세 주 서버 전환) 캐시를 비우고 snap:true 빈 배열을 내린다 (「현재가 원천」)"
    - "사용자 세션(`#onFrame`)으로 온 95 는 명시 case 로 받아 무시한다 — 캐시 · 방출 0, `unhandledFrameCount` 0 유지(PC-12) (「현재가 원천」 · 「스키마 동기화」)"
    - "작업대 매집 패널의 활성 KRX 행은 95 값이 있으면 현재가 = 95 last_price, 등락률 = 95 change_rate 이고, 없으면 지금처럼 구독 시세 → 행 값이다. 종목별 시세 구독 후보는 95 에 값이 없는 활성 행뿐이다. 청산 행은 행 값 고정이다 (「현재가 원천」)"
    - "더보기로 펼친 표 바로 위에 `등락률 [15] ~ [ ] %  당일 순매수 [1] ~ [ ] 억  ☐ 전부 보기 … 필터 밖 N` 한 줄이 있고(좁은 폭은 묶음 단위 줄바꿈), Enter · 칸 떠남에 적용하고 칸 글자를 정규화한다. 타이핑 중에는 목록이 바뀌지 않는다 (「필터 줄 위치·모양」)"
    - "칩 · 펼친 표 · 회색 청산 행이 같은 판정 하나로 걸러진다 — 표시 등락률을 소수 둘째 자리 반올림해 비교, 당일 순매수 null 은 0, 억은 원으로 반올림 환산, 경계 포함, 빈 칸 = 제한 없음. 표를 접어도 칩에 걸리고 「매집」 라벨 옆에 「필터 밖 N」 알약(N > 0 · 전부 보기 꺼짐)이 보인다 (「필터가 거르는 범위」)"
    - "전부 보기를 켜면 표의 필터 밖 행이 흐리게(opacity .45) 보이고 칩은 그대로다. 필터 4칸은 이 기기 localStorage 에 기억되고(처음 = 등락률 최소 15 · 당일 순매수 최소 1억), 전부 보기는 기억하지 않는다 (「필터 값 기억」)"
  artifacts:
    - path: relay/src/generated/stock-dma/accum-price-batch.ts
      provides: "flatc 25.12.19 생성 AccumPriceBatch 접근자(sync 스크립트 산출)"
    - path: relay/src/dma/envelope.ts
      provides: "parseAccumPriceBatch · MAX_ACCUM_PRICE_ITEM_COUNT · AccumPriceBatchFrame"
      contains: "parseAccumPriceBatch"
    - path: relay/src/hub/subscription-hub.ts
      provides: "95 전역 캐시 · \"accumPrices\" 이벤트 · getAccumPrices · ready 시 비움"
      contains: "case MSG.AccumPriceBatch"
    - path: packages/shared/src/relay.ts
      provides: "RelayAccumPriceItem · RelayAccumPricesMsg · RelayOutbound 유니온 편입"
      contains: "accum.prices"
    - path: webapp/src/lib/use-accum-prices.ts
      provides: "useAccumPrices(≤5Hz 스로틀 · covered 집합) · accumLivePriceOf"
      exports: ["useAccumPrices", "accumLivePriceOf", "AccumLivePrice"]
    - path: webapp/src/lib/accum-list.ts
      provides: "AccumFilter 판정 · 파싱 · 정규화 · 저장 순수 함수"
      contains: "ACCUM_FILTER_KEY"
    - path: webapp/src/components/trading/workbench/accum-strip.tsx
      provides: "95 원천 연결 · 필터 줄 · 필터 밖 N · 흐린 행"
      contains: "data-slot=\"accum-filter\""
  key_links:
    - from: relay/src/hub/subscription-hub.ts
      to: relay/src/ws/fanout.ts
      via: "hub \"accumPrices\" 이벤트 → fanout #broadcastAccumPrices(#users 전부) · 인증 직후 getAccumPrices snap:true"
      pattern: "accumPrices"
    - from: relay/src/hub/subscription-hub.ts
      to: relay/src/dma/envelope.ts
      via: "#onFeedFrame case MSG.AccumPriceBatch → parseAccumPriceBatch"
      pattern: "parseAccumPriceBatch"
    - from: webapp/src/lib/use-relay-socket.ts
      to: webapp/src/lib/use-accum-prices.ts
      via: "accum.prices 시장 배치 → RelayData.accumPrices → useRelayContext().accumPrices"
      pattern: "accumPrices"
    - from: webapp/src/components/trading/workbench/accum-strip.tsx
      to: webapp/src/lib/use-breakout-quotes.ts
      via: "candidates = 활성 행 중 covered(95 에 있음) 아닌 것만"
      pattern: "covered"
    - from: webapp/src/components/trading/workbench/accum-strip.tsx
      to: webapp/src/lib/accum-list.ts
      via: "passesAccumFilter · readAccumFilter/writeAccumFilter"
      pattern: "passesAccumFilter"
---

<objective>
작업대(`/trading`) 「매집」 패널의 현재가·등락률 원천을 gh-trade MsgType 95 `AccumPriceBatch` 로 바꾸고(relay 가 quote 관찰자 연결에서 디코드 · 캐시 · 웹으로 팬아웃, 95 에 없는 종목만 기존 종목별 구독으로 폴백), gh-trade 매집감지창(quick-261104-519)처럼 등락률 · 당일 순매수 「최소 ~ 최대」 필터 줄(기본 15% 이상 · 1억 이상) · 전부 보기 · 필터 밖 N 을 붙인다.

Purpose: 매집 목록이 종목마다 시세를 구독해 구독 예산(40)을 먹고, kind 16 행 값은 수십 분 묵는다. 95 하나로 전 종목 현재가를 받고, 필터로 트레이더가 볼 종목만 남긴다.
Output: relay 95 경로(생성물 동기화 포함) · shared `accum.prices` 계약 · 웹 `useAccumPrices` · 필터 순수 함수 · 필터 줄 UI · 테스트.

결정 정본: `.planning/quick/261104-nxs-relay-95-accumpricebatch/261104-nxs-CONTEXT.md`(잠김 — 다시 묻지 않는다), 채택 목업 `mockup-filter.html` 의 **A**. 범위 밖(만들지 않음): 알림음 · 수익률/누적/시총 필터 · gh-trade 쪽 변경 · 매집 보고서 화면.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261104-nxs-relay-95-accumpricebatch/261104-nxs-CONTEXT.md
@.planning/quick/261104-nxs-relay-95-accumpricebatch/mockup-filter.html

## 실행 규칙 (이 세션 공통)

- 메인 트리(master)에서 순차 실행한다. 옆 세션이 같은 트리에서 일한다 — **커밋마다 경로를 지정해 `git add` 한다.** `git add -A` · `git add .` 금지. 아래 경로는 건드리지 않는다: `webapp/e2e/fixtures/ticks.ts`, `webapp/e2e/specs/ticks-viewer.spec.ts`, `webapp/src/components/ticks/**`, `workers/tick-convert/**`, `.planning/quick/261104-n7i-*`, `.planning/quick/261104-n9h-*`, `.planning/milestone.lock`. 커밋 직전 `git status -sb` 로 남의 변경이 스테이지에 없는지 본다.
- 테스트는 대상 파일만, vitest `--maxWorkers=2`(동시 세션 메모리 고갈 방지). 전체 e2e 금지.
- 커밋 메시지는 한글, Co-Authored-By 넣지 않는다. push · 배포 금지(배포는 메인 세션이 relay 먼저 → push 나중).
- 코드 주석은 한국어이고 파일 머리 주석의 번호 규칙(①②…) 문체를 따른다.
- shared 를 고친 뒤에는 relay · webapp 타입체크 전에 `cd packages/shared && npm run build` 를 돌린다(두 패키지는 shared 의 dist 를 읽는다).

## 미리 뽑은 인터페이스 (다시 넓게 훑지 말 것 — 아래 줄 근처만 읽는다)

gh-trade 95 스키마(정본 `/Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs` L1785-1804 · Envelope 슬롯 114 `accum_price_batch`):
- `table AccumPriceItem { isin: string; last_price: uint; change_rate: double; base_price: uint }` — uint 는 flatbuffers TS 에서 number(bigint 아님, toNum 불필요). base_price 0 = 미상.
- `table AccumPriceBatch { items: [AccumPriceItem]; is_snapshot: bool }` — 정기 묶음 = 300ms 마다 값이 바뀐 감시 종목만(Broadcast, quote 관찰자 포함), 스냅샷 = 관찰자 로그인 79 → 89 뒤 그 연결에만 Notice, 512개씩 여러 프레임. 한 프레임 최대 512. 구 서버는 95 를 내지 않는다(정상).
- 생성 접근자(동기화 뒤): `Envelope.accumPriceBatch()`, `AccumPriceBatch.itemsLength()` · `items(i, obj?)` · `isSnapshot()`, `AccumPriceItem.isin()` · `lastPrice()` · `changeRate()` · `basePrice()`, 빌더 `startAccumPriceItem/addIsin/addLastPrice/addChangeRate/addBasePrice/endAccumPriceItem`, `AccumPriceBatch.createItemsVector/startAccumPriceBatch/addItems/addIsSnapshot/endAccumPriceBatch`, `Envelope.addAccumPriceBatch`. 생성 파일명 `relay/src/generated/stock-dma/accum-price-item.ts` · `accum-price-batch.ts`.

relay (HEAD a95f32d1 기준 줄):
- `relay/src/dma/msg-type.ts` — `MSG` 객체(L120-271, 마지막 `LaunchPlanSnapshot: 94`), 「유입 집합」 머리 주석(L1-115), `INBOUND_MSG_TYPES`(L280-325, JSDoc 에 「31종」), `OUT_OF_SCOPE_INBOUND_MSG_TYPES`(L350 — 바꾸지 않는다).
- `relay/src/dma/envelope.ts` — 생성 import(L71-104), 상한 상수(L130-175, `MAX_RATE_CROSS_ITEM_COUNT` 선례), `dropField(reason, msgType, detail)`(L284), `takeCount(n, max, label)`(L303), `isValidIsin`(L335), `tryParseEnvelope`(L560 — 화이트리스트 관문), `parseRateCrossSnapshot`(L754 — 벡터 순회 선례), `parseLimitFeature`(L938).
- `relay/src/hub/subscription-hub.ts` — 파일 머리 PC-12 case 표(L166-178), shared 타입 import(L193-214), envelope import(L221-245), `HubMarketEvent`(L592 — 손대지 않는다), `interface SubscriptionHub` on/emit 오버로드(L648-655), `#limitFeatures` 필드(L977), `attachFeed`(L1679 — feed "ready" → `resubscribeAll()`), `resubscribeAll()`(L2054 — L2071 `this.#limitFeatures.clear()`), `getLimitFeature`(L2457), `closeAll()`(L2617), `#onFrame` switch(L2674-2905 — 시세 묶음 warn case L2679, 관찰자 전용 case L2875, admin 전용 case L2883, `default:` 계수 L2891), `#onFeedFrame` switch(L3105-3171 — `case MSG.LimitFeature` L3128, `default:` 계수 L3162), `#onLimitFeature`(L3200).
- `relay/src/quote/feed.ts` L264-328 — 79 처리 중 동기적으로 `emit("ready")` 하고 그 뒤 프레임부터 hub 로 흐른다 → hub 의 ready 비움이 95 스냅샷보다 먼저다(순서 보장, 고칠 것 없음).
- `relay/src/ws/fanout.ts` — 생성자 hub 리스너(L797-799), 인증 직후 스냅샷 묶음(L1853-1924, 마지막 `quote.state` L1921-1923), `#broadcastNxtSnap`(L1943 — `#users` 전 연결 순회 선례).
- 테스트 하네스: `relay/tests/hub.test.ts` `FakeFeed.pushFrame/emitReady`(L176-203) · `FakeSession.pushFrame` · 85 describe(L887 — 이벤트 수집 선례). `relay/tests/fanout.test.ts` `describe("WsFanout")` 스코프의 `quoteGateway` · `quoteSock`(L330-440) · `authed(token)`(L414) · `framesOf`(L285) · `quoteGateway.sendFrame(quoteSock, bytes)` · nxt.snap 테스트(L1947 — 미인증 소켓 0프레임 선례). `relay/tests/helpers/frames.ts` `SAMPLE_ISIN`(L60) · `buildRateCrossSnapshotFrame`(L1247 — 원소를 다 끝낸 뒤 벡터, Pitfall 2). `relay/src/dma/__tests__/codec.test.ts` L286-300(「31종」 · ≤94 단언). `relay/src/dma/__tests__/envelope.test.ts` 85 describe(L337 — `tryParseEnvelope` → 파서 선례).

webapp:
- `webapp/src/lib/use-relay-socket.ts` — 머리 규율 8(L39-45), `RelayConnectionState.limitFeatures`(L437), `RelayData`(L788 근처) · `INITIAL_DATA`(L836), `RelayMarketFrame` · `isMarketFrame`(L892-896), `applyMarketFrames`(L1377-1417 — 루프 첫 줄이 `relayQuoteKey(frame.i, frame.x)`), 훅 반환 객체(L2341-2388).
- `webapp/src/lib/relay-provider.tsx` — `RelayContextValue = Omit<RelayConnectionState, "sendOrder"> & …`(L149 — 상태 필드는 자동으로 따라온다), `EMPTY_RELAY_VALUE`(L344-413).
- `webapp/src/lib/use-breakout-quotes.ts` — `BREAKOUT_PRICE_THROTTLE_MS = 200`(L72), ⑤ 스로틀 구현(L245-289 — 절대 마감 · 동기 초기화 · latestRef) — `useAccumPrices` 가 같은 방식을 쓴다. 이 파일은 고치지 않는다.
- `webapp/src/components/trading/workbench/accum-strip.tsx` — 머리 주석 ①~⑩(L3-45), `AccumView`(L111-141), `liveRateOf`(L157), `visible`(L193), candidates · `useBreakoutQuotes`(L208-216), views(L218-256), `chipViews`(L257), 스트립 줄(L294-334), 펼친 표(L336-346), `AccumTable`(L506-712).
- `webapp/src/lib/accum-list.ts` — 머리 주석 ①~⑥, `ACCUM_DISMISSED_KEY = 'gh-radar:accum-dismissed'`(키 문법 선례), `isNum` import(teamflow-report).
- 테스트: `webapp/src/components/trading/__tests__/accum-strip.test.tsx` — `useRelayContext` 목(L37-49 · `...actual.EMPTY_RELAY_VALUE` 펼침 + `quotes: quotesMap`), `sig()` 기본 `rateBp: 512` · `dayNetKrw: null`(→ 기본 필터에 전부 걸린다), `daySig()`, `beforeEach`(L159-166 `window.localStorage.clear()`). `webapp/src/lib/__tests__/relay-socket.test.ts` — limit.feature describe(L3878 — `render()` · `connected(hook)` · `ws.push` · `flushMarket()` 선례), nxt.snap describe(L1948 — 재접속 유지 · reset 선례).

gh-trade 필터 규칙 원본(`/Users/alex/repos/gh-trade/client/Services/DMA/AccumWatchList.cs` `AccumFilter` L276-450): 칸 파싱 = 앞뒤 공백 제거, 빈 칸 · 잘못된 값 · NaN · 무한대 = null(제한 없음), 천 단위 쉼표 허용 · 지수 표기 허용 · 예외 없음. 칸 글자 = 값의 invariant 문자열(null 은 빈 칸). 등락률 = 소수 둘째 자리 **0에서 먼 쪽** 반올림 값으로 비교. 억 경계 = `Math.round(억 × 1e8)` 원과 비교. 경계 포함. min > max 를 바꿔 주지 않는다(아무것도 통과 못 함 — 그대로).
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): 스키마 동기화 + relay 95 디코드 · 전역 캐시 · accum.prices 팬아웃 + shared 계약</name>
  <files>relay/src/generated/**, relay/src/dma/msg-type.ts, relay/src/dma/envelope.ts, relay/src/hub/subscription-hub.ts, relay/src/ws/fanout.ts, packages/shared/src/relay.ts, packages/shared/src/index.ts, relay/tests/helpers/frames.ts, relay/src/dma/__tests__/codec.test.ts, relay/src/dma/__tests__/envelope.test.ts, relay/tests/hub.test.ts, relay/tests/fanout.test.ts</files>
  <precondition>gh-trade master 의 `server/src/protocol/StockDMA.fbs` 에 `AccumPriceBatch = 95` 가 있고(계획 시점 1건) `/opt/homebrew/bin/flatc --version` 이 `flatc version 25.12.19` 다.</precondition>
  <action>
게이트웨이 95 프레임 하나가 relay 를 지나 브라우저 와이어 `accum.prices` 까지 가는 길을 한 번에 세운다(「현재가 원천」 · 「스키마 동기화」 결정).

1) 스키마 동기화 — gh-trade 소유 스크립트만 쓴다: `cd /Users/alex/repos/gh-trade && RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh`. 샌드박스가 gh-trade 읽기 · 임시 디렉터리 쓰기를 막으면 같은 명령을 dangerouslyDisableSandbox 로 다시 돌린다. `relay/src/generated/**` 는 절대 손으로 고치지 않는다. 돌린 뒤 `git status --short relay/src/generated` 로 생성물만 바뀌었는지 본다(예상: 새 `stock-dma/accum-price-item.ts` · `stock-dma/accum-price-batch.ts`, `StockDMA.fbs` SYNC MARKER 가 gh-trade fbs 마지막 커밋(계획 시점 4695bd48)으로, `stock-dma/msg-type.ts` · `stock-dma/envelope.ts` · `stock-dma/accum-chart-resp.ts`(90 buckets append — relay 는 90 을 디코드하지 않아 무해) · 생성 인덱스). 생성물 밖이 바뀌면 멈추고 보고한다.

2) `relay/src/dma/msg-type.ts` — `MSG` 끝에 `AccumPriceBatch: 95` 를 JSDoc 과 함께 넣는다(`accum_price_batch` 슬롯 114 · 정기 묶음 Broadcast 300ms 변경분 · 로그인 스냅샷 `is_snapshot` Notice 512개씩 여러 프레임 · quote 관찰자도 받는다 · relay 원천은 quote 연결 하나). `INBOUND_MSG_TYPES` 에 `MSG.AccumPriceBatch` 를 넣고 그 JSDoc 의 누적 문장에 「quick-261104-nxs 가 매집 현재가 묶음 95 를 더해 **32종**」 을 잇는다. 파일 머리 「유입 집합」 에 95 단락을 더한다: 파서 `parseAccumPriceBatch`(envelope.ts), hub `#onFeedFrame` 이 소비하고 `#onFrame`(사용자 세션 — 88 과 같은 접속 연결 전부로 온다)은 명시 case 로 받아 무시, 브라우저로는 `accum.prices` 로 나간다. `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 는 그대로 둔다.

3) `relay/src/dma/envelope.ts` — 생성 `AccumPriceItem` 을 import 한다(`../generated/stock-dma/accum-price-item.js`). `MAX_ACCUM_PRICE_ITEM_COUNT = 512`(서버 한 프레임 상한 그대로 — 깨진 벡터 길이 폭주 방어, T-17-09 문체) 와 `export type AccumPriceBatchFrame = { snapshot: boolean; items: RelayAccumPriceItem[] }` 를 둔다. `parseAccumPriceBatch(env: Envelope): AccumPriceBatchFrame | null` — 슬롯이 없으면 `dropField("slot-null", MSG.AccumPriceBatch, { slot: "accum_price_batch" })`, 개수는 `takeCount(itemsLength(), MAX_ACCUM_PRICE_ITEM_COUNT, "매집 현재가 묶음")`, scratch 객체 하나로 순회한다. 원소가 null · `isValidIsin` 실패 · `lastPrice` 또는 `changeRate` 가 유한수가 아니면 **그 원소만 버리고** 센 뒤, 버린 것이 있으면 프레임당 warn 1줄(`{ msgType, skipped, total }`, 「[DMA] 95 원소 일부 버림 — 나머지는 적용」). 근거 주석: 95 는 병합 전용 스트림(집합 의미 없음)이라 78 과 달리 원소 단위로 버린다 — 프레임째 버리면 멀쩡한 종목 값이 다음 값 변화까지 묵는다. 원소는 `{ i: isin, p: lastPrice(), r: changeRate(), b: basePrice() }`, `snapshot = isSnapshot()`. 빈 벡터는 `items: []`(null 아님).

4) `packages/shared/src/relay.ts` — `RelayNxtSnapMsg` 근처에 `RelayAccumPriceItem = { i: string; p: number; r: number; b: number }`(i ISIN · p KRX 마지막 체결가 원(59 last_price 와 같은 원천) · r 등락률 %(59 change_rate 와 같은 값) · b 마스터 기준가 원, 0 = 미상)와 `RelayAccumPricesMsg = { t: "accum.prices"; snap: boolean; items: RelayAccumPriceItem[] }` 를 JSDoc 과 함께 정의한다. JSDoc 에 적을 계약: 원천 gh-trade 95(quote 관찰자 연결), `snap: true` = relay 가 만든 **전량 교체**(웹 소켓 인증 직후 캐시 전체 · quote 연결 ready 때 빈 배열), `snap: false` = **병합**(95 정기 묶음 · 로그인 스냅샷 프레임 — 512개씩 여러 프레임이라 병합), 키는 isin, 제거 의미 없음, 수신 = 인증된 소켓 전부(시세와 같은 인증 규칙 · 계좌 · 주문 필드 없는 공개 시세 파생값), 구 relay 는 보내지 않는다(웹은 전부 구독 폴백). `RelayOutbound` 유니온에 `RelayAccumPricesMsg` 를 더하고, `packages/shared/src/index.ts` 의 relay 타입 export 목록(`RelayNxtSnapMsg` 옆)에 두 타입을 더한다. 그다음 `cd packages/shared && npm run build`.

5) `relay/src/hub/subscription-hub.ts`
- `interface SubscriptionHub` 에 `on(event: "accumPrices", listener: (msg: RelayAccumPricesMsg) => void): this` · `emit(event: "accumPrices", msg: RelayAccumPricesMsg): boolean` 오버로드. `HubMarketEvent` 는 넓히지 않는다 — 95 는 키 구독자가 아니라 인증 소켓 전부로 가는 별도 경로다.
- 필드 `#accumPrices = new Map<string, RelayAccumPriceItem>()`(isin 키 · 전역 1벌)와 「ready 뒤 첫 수신 로그」 표식 boolean. JSDoc: 병합만 하고 제거하지 않는다(95 에는 제거 의미가 없다) — 크기는 그날 감시 종목 수 이하, ready 마다 비운다.
- `#onFeedFrame` 에 `case MSG.AccumPriceBatch`: `parseAccumPriceBatch` → null 이면 return(파서가 로그) → `#onAccumPrices(frame)`. `#onAccumPrices` 는 원소를 캐시에 set 하고, 원소가 0 이면 방출하지 않으며, 아니면 `emit("accumPrices", { t: "accum.prices", snap: false, items })`. ready 뒤 첫 비지 않은 프레임에서만 info 1줄(`{ count, snapshot }`, 「[HUB] 매집 현재가 95 수신 — 웹 원천 켜짐」 — 배포 뒤 「구 서버 = 95 없음」 판별용).
- `#onFrame` 에 `case MSG.AccumPriceBatch`: debug 1줄(「[HUB] 사용자 세션 95 — 무시 (매집 현재가 원천은 quote 연결 하나)」) 뒤 return. 캐시 · 방출 · `#unhandledFrames` 모두 건드리지 않는다(돌파 76/78 이 quote 쪽을 무시하는 것과 반대 방향의 같은 원칙 — 원천을 둘로 만들지 않는다).
- `resubscribeAll()` 의 `this.#limitFeatures.clear()` 바로 뒤: `#accumPrices` 를 비우고 첫 수신 표식을 되돌린 뒤 `emit("accumPrices", { t: "accum.prices", snap: true, items: [] })`. 주석: 새 연결(재접속 · 시세 주 서버 전환)은 로그인 89 뒤 95 스냅샷으로 다시 채운다 — 옛 서버 값을 남기면 웹이 그 종목 구독 폴백을 끈 채 묵은 값을 본다, 구 서버는 95 가 없어 웹은 전부 구독 폴백.
- `getAccumPrices(): RelayAccumPriceItem[]`(캐시 값 복사 배열 — 인증 직후 스냅샷용)을 `getLimitFeature` 옆에, `closeAll()` 에서 캐시 비움.
- 파일 머리 PC-12 표에 `95 AccumPriceBatch → 전역 isin 캐시(병합) + "accumPrices"(인증 소켓 전부 · accum.prices · quick-261104-nxs)` 줄과, 사용자 세션으로 온 95 는 debug 무시라는 줄을 더한다.

6) `relay/src/ws/fanout.ts` — 생성자 hub 리스너 옆에 `this.#hub.on("accumPrices", (msg) => this.#broadcastAccumPrices(msg))`. `#broadcastAccumPrices` 는 `#broadcastNxtSnap` 처럼 `#users` 의 모든 conn 에 `#send` 한다(미인증 · 자격증명 미등록 연결에는 가지 않는다 · 공개 시세 파생값이라 T-15-02 사용자 격리와 무관 — 주석). 인증 직후 스냅샷 묶음 **맨 끝**(`quote.state` 뒤)에 `this.#send(conn, { t: "accum.prices", snap: true, items: this.#hub.getAccumPrices() })` — 비어 있어도 1프레임(`rate.cross.snap` 규율: 빈 배열 = 「95 값 아는 종목 없음」 확정이라 웹이 옛 소켓의 값을 지우고 구독 폴백으로 간다 — 주석).

7) 테스트
- `relay/tests/helpers/frames.ts`: `FakeAccumPriceItemInput = { isin?; lastPrice?; changeRate?; basePrice? }`, `buildAccumPriceBatchFrame(input: { items?: FakeAccumPriceItemInput[]; isSnapshot?: boolean } = {})` — 기본 원소 1개(SAMPLE_ISIN · 12_500 · 18.2 · 10_576), 원소를 다 끝낸 뒤 `createItemsVector`(Pitfall 2 주석), `Envelope.addMsgType(MSG.AccumPriceBatch)` + `addAccumPriceBatch`.
- `codec.test.ts`: 「31종」 → 32 · 상한 94 → 95 로 고치고(테스트 이름 · 누적 주석 포함), `MSG.AccumPriceBatch === MsgType.AccumPriceBatch === 95` 이고 화이트리스트에 있다는 it 1개.
- `envelope.test.ts`: describe 「quick-261104-nxs parseAccumPriceBatch (95 · accum_price_batch 슬롯 114)」 — 두 원소 → `{ snapshot: false, items: [{ i, p, r, b }, …] }`; `isSnapshot: true` → `snapshot: true`; 잘못된 isin 원소 하나만 빠지고 나머지는 남음; 빈 벡터 → `items: []`.
- `hub.test.ts`: describe 「quick-261104-nxs 95 매집 현재가 — quote 연결 캐시 · accumPrices 방출 · ready 비움 · 사용자 세션 무시」 — (a) feed 95 → `"accumPrices"` 1건 snap:false · `getAccumPrices()` 가 같은 값, 같은 isin 두 번째 프레임은 덮고 다른 isin 은 남음; (b) `is_snapshot` 프레임 둘(서로 다른 isin) → 둘 다 캐시(병합); (c) `feed.emitReady()` → snap:true `items: []` 1건 · 캐시 0; (d) `session.pushFrame(95)` → 방출 0 · 캐시 무변경 · `hub.unhandledFrameCount()` 0; (e) 원소 0 프레임은 방출 0.
- `fanout.test.ts`(`describe("WsFanout")` 스코프): 「AP1」 95 전에 인증한 소켓은 인증 묶음 끝에 `{ t: "accum.prices", snap: true, items: [] }` 1프레임; `quoteGateway.sendFrame(quoteSock, buildAccumPriceBatchFrame(...))` → 인증 소켓 둘 다 snap:false 1프레임, 미인증 소켓 0; 그 뒤 새로 인증한 소켓은 snap:true 로 병합된 캐시 전체; `h.hub.unhandledFrameCount()` 0.

8) 커밋 — 경로 지정: `git add relay/src/generated relay/src/dma/msg-type.ts relay/src/dma/envelope.ts relay/src/hub/subscription-hub.ts relay/src/ws/fanout.ts packages/shared/src/relay.ts packages/shared/src/index.ts relay/tests/helpers/frames.ts relay/src/dma/__tests__/codec.test.ts relay/src/dma/__tests__/envelope.test.ts relay/tests/hub.test.ts relay/tests/fanout.test.ts`. 메시지 예: 「feat(relay): 95 매집 현재가 묶음 디코드 · 전역 캐시 · accum.prices 팬아웃 + 스키마 동기화(261104-nxs)」.
  </action>
  <verify>
    <automated>test "$(sed -n 3p relay/src/generated/StockDMA.fbs | tr -d '\r' | awk '{print $3}')" = "$(git -C /Users/alex/repos/gh-trade log -1 --format=%h -- server/src/protocol/StockDMA.fbs)" && test -f relay/src/generated/stock-dma/accum-price-batch.ts && echo SYNCED  # 기대 SYNCED (HEAD 기준 NOT_SYNCED — e96aef6e ≠ 4695bd48)</automated>
    <automated>grep -c "case MSG.AccumPriceBatch" relay/src/hub/subscription-hub.ts  # 기대 2 (#onFrame · #onFeedFrame — HEAD 기준 0)</automated>
    <automated>cd packages/shared && npx tsc --noEmit && npm run build</automated>
    <automated>cd relay && npx tsc --noEmit && npx tsc -p tsconfig.tests.json && npx vitest run --maxWorkers=2 src/dma/__tests__/codec.test.ts src/dma/__tests__/envelope.test.ts tests/hub.test.ts tests/fanout.test.ts tests/fanout-multi-session.test.ts tests/fanout-access.test.ts tests/ws-latch.test.ts tests/ws-autosell.test.ts tests/ws-order.test.ts tests/rate-cross.test.ts tests/quote-gateway.test.ts</automated>
  </verify>
  <done>생성물이 gh-trade fbs 마지막 커밋으로 동기화됐고(손편집 0), quote 연결 95 → hub 캐시 → 인증 소켓 `accum.prices` 가 통합 테스트로 증명되며, 인증 직후 snap:true(빈 배열 포함) · ready 비움 · 사용자 세션 95 무시(unhandled 0) · 화이트리스트 32종이 테스트로 잠겼다. 대상 테스트 · 타입체크 통과, 경로 지정 커밋 1개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 웹 — 매집 패널 현재가·등락률 원천 95 + 95 없는 종목만 구독 폴백</name>
  <files>webapp/src/lib/use-relay-socket.ts, webapp/src/lib/relay-provider.tsx, webapp/src/lib/use-accum-prices.ts, webapp/src/components/trading/workbench/accum-strip.tsx, webapp/src/lib/__tests__/relay-socket.test.ts, webapp/src/components/trading/__tests__/accum-strip.test.tsx</files>
  <behavior>
    - relay-socket: `accum.prices` 는 시장 배치(RELAY_MARKET_BATCH_MS) 뒤 `accumPrices`(isin → 원소)에 들어간다 · snap:false 는 병합 · snap:true 는 전량 교체(빈 배열 = 전부 지움) · accum.prices 만 온 배치는 `quotes` · `tapes` · `limitFeatures` 참조를 바꾸지 않는다 · 재접속(1006)에도 유지 · enabled false(reset) 뒤 빈 Map
    - accum-strip: 95 값이 있는 활성 KRX 행 → 현재가 셀 = 95 `p`(천 단위), 등락률 = 95 `r`(부호 · 둘째 자리) · 그 isin 으로 `subscribe` 를 부르지 않는다
    - accum-strip: 두 활성 행 중 95 에 없는 행만 `subscribe(isin, 'KRX', 'price')` · 그 행은 구독 시세 → 행 값 순(지금 규칙 그대로)
    - accum-strip: 95 와 구독 시세가 둘 다 있으면 95 가 이긴다 · 청산 행은 95 값이 있어도 행 값(`lastPx` · `rateBp/100`)
    - accum-strip: 95 값이 바뀌어도 200ms(BREAKOUT_PRICE_THROTTLE_MS) 전에는 옛 값, 지나면 새 값(≤5Hz)
  </behavior>
  <action>
「현재가 원천」 결정의 웹 쪽이다. 렌더 비용 결정(재량): `accum.prices` 를 **기존 시장 배치**(규율 8 — 커밋 ≤10/s 상한 안)에 태우고, 패널에는 ≤5Hz 스로틀 훅으로만 흘린다(debug `trading-cpu-260923` 교훈 — 커밋 상한은 그대로, 패널 views 재계산은 5Hz 이하).

1) `webapp/src/lib/use-relay-socket.ts` — shared 의 `RelayAccumPriceItem` · `RelayAccumPricesMsg` 타입 import. `RelayConnectionState` 에 `accumPrices: ReadonlyMap<string, RelayAccumPriceItem>`(isin → 95 마지막 값 · JSDoc: 시장 배치 · snap true 전량 교체 / false 병합 · 재접속에서 지우지 않는다(규율 5 — relay 가 재인증마다 snap 으로 다시 내린다) · reset 만 비운다 · 구 relay 면 늘 빈 Map → 매집 패널은 전부 구독 폴백), `RelayData` 필드 + `INITIAL_DATA` 빈 Map. `RelayMarketFrame` 유니온과 `isMarketFrame` 에 `accum.prices` 를 넣는다. `applyMarketFrames` 는 루프 맨 앞에서 `accum.prices` 를 먼저 갈라 `relayQuoteKey` 계산 전에 continue 한다: snap 이면 새 빈 Map 으로 시작, 아니면 copy-on-write(액션당 복사 최대 1번)로 `state.accumPrices` 를 복사해 원소를 `i` 키로 set, 반환 객체에 `accumPrices: accumPrices ?? state.accumPrices`. 훅 반환 객체에 `accumPrices: data.accumPrices`. 머리 규율 8 의 배치 대상 목록에 「매집 현재가(accum.prices · 95 · quick-261104-nxs)」 를 더한다.

2) `webapp/src/lib/relay-provider.tsx` — 빈 고정 참조 `EMPTY_ACCUM_PRICES` 를 두고 `EMPTY_RELAY_VALUE` 에 `accumPrices: EMPTY_ACCUM_PRICES`(주석: Provider 밖에는 소켓이 없다 — 95 값 없음 = 전부 구독 폴백).

3) 새 파일 `webapp/src/lib/use-accum-prices.ts` — 머리 주석 ①원천(relay `accum.prices` = gh-trade 95 · 인증 소켓 전부 · 종목별 구독 없음) ②「있다」 판정(`accumLivePriceOf`) ③≤5Hz 스로틀(`useBreakoutQuotes` ⑤ 와 같은 절대 마감 · 동기 초기화 · 마지막 값 반드시 도착) ④`covered` 신원 안정(키 집합 서명이 같으면 같은 Set — 구독 diff 를 흔들지 않는다). 내보내기: `AccumLivePrice = { p: number; r: number }`, `accumLivePriceOf(map, isin): AccumLivePrice | undefined`(원소가 있고 `p` 가 유한수 > 0 이고 `r` 이 유한수일 때만 — 아니면 「모름」), `useAccumPrices(isins: readonly string[]): { prices: ReadonlyMap<string, AccumLivePrice>; covered: ReadonlySet<string> }` — `useRelayContext().accumPrices` 를 읽어 입력 isin 들의 값 서명(`isin:p:r`)이 바뀔 때만 `BREAKOUT_PRICE_THROTTLE_MS`(use-breakout-quotes 에서 import — 간격 정본 하나) 스로틀로 `prices` 를 갱신하고, `covered` 는 표시 중인 `prices` 의 키 집합을 정렬 서명으로 memo 한다.

4) `webapp/src/components/trading/workbench/accum-strip.tsx`
- `activeKrx` = `visible` 중 state ≠ 3 이고 exchange 가 NXT 가 아닌 행의 isin(memo). 95 는 KRX 체결가라 NXT 행(드묾)은 95 를 쓰지 않는다 — 다른 거래소 값으로 폴백하지 않는다(breakoutQuotePrice 원칙 · 재량 결정, 주석에 남긴다).
- `const { prices: accumLive, covered } = useAccumPrices(activeKrx)` 를 candidates 위에 두고, candidates 는 활성 행 중 「KRX 이고 covered 에 든 행」 을 뺀다(deps 에 covered) — 40 예산을 95 가 대체한다.
- views: 청산 행은 지금처럼 `sig.lastPx`. 활성 행은 KRX 면 `accumLive.get(isin)` 을 먼저 보고, 있으면 `price = live.p` · `rate = live.r`(95 change_rate 그대로 = 59 와 같은 값), 없으면 지금 경로(`prices.get(breakoutFeedKey(...)) ?? sig.lastPx` · `liveRateOf`). deps 에 accumLive. `AccumView.price/rate` JSDoc 을 「95 → 구독 시세 → 행 값」 으로 고친다.
- 머리 주석 ① 을 다시 쓴다: 현재가 · 등락률 원천 = relay `accum.prices`(gh-trade 95 AccumPriceBatch · `useAccumPrices` · ≤5Hz) → 95 에 값이 없는 활성 행만 시세 구독(`useBreakoutQuotes` · price level · 카드 피드 제외) → 그것도 없으면 행 값. 등락률은 95 면 change_rate 그대로, 폴백이면 행 기준가로 다시 센다. 커버리지는 quote 주 서버의 매집 감시 집합이라 패널이 다른 서버를 보이면 등록 차이만큼 구독 폴백이다(구 서버 = 95 부재 = 전부 폴백). 청산 행은 행 값 고정.

5) 테스트
- `relay-socket.test.ts`: describe 「quick-261104-nxs accum.prices (95 매집 현재가 — 시장 배치 · 병합 · snap 교체)」 — 위 behavior 첫 항목 전부(limit.feature describe 의 `render` · `connected` · `ws.push` · `flushMarket` 문법).
- `accum-strip.test.tsx`: 목에 `accumPrices: accumPricesMap`(모듈 변수 · beforeEach 에서 빈 Map 으로) 을 더하고 behavior 의 accum-strip 네 항목을 잠근다. 기존 테스트는 95 가 비어 있어 그대로 통과해야 한다 — 기존 단언을 고치지 않는다.

6) 커밋 — `git add webapp/src/lib/use-relay-socket.ts webapp/src/lib/relay-provider.tsx webapp/src/lib/use-accum-prices.ts webapp/src/components/trading/workbench/accum-strip.tsx webapp/src/lib/__tests__/relay-socket.test.ts webapp/src/components/trading/__tests__/accum-strip.test.tsx`. 메시지 예: 「feat(webapp): 작업대 매집 현재가·등락률 원천 95 — 95 없는 종목만 시세 구독 폴백(261104-nxs)」.
  </action>
  <verify>
    <automated>grep -c "useAccumPrices" webapp/src/components/trading/workbench/accum-strip.tsx  # 기대 ≥ 2 (import · 호출 — HEAD 기준 0)</automated>
    <automated>cd webapp && npx tsc --noEmit -p . && npx vitest run --maxWorkers=2 src/lib/__tests__/relay-socket.test.ts src/components/trading/__tests__/accum-strip.test.tsx src/lib/__tests__/use-breakout-quotes.test.tsx</automated>
    <automated>cd webapp && npx eslint src/lib/use-accum-prices.ts src/lib/use-relay-socket.ts src/lib/relay-provider.tsx src/components/trading/workbench/accum-strip.tsx  # 기대 출력 없음 · 종료 0 (HEAD 의 accum-strip.tsx 기준 0건)</automated>
  </verify>
  <done>95 값이 있는 활성 KRX 행은 95 현재가 · 등락률을 보이고 구독하지 않으며, 95 에 없는 행만 기존 구독으로 폴백하고, 청산 행은 행 값 그대로다. accum.prices 는 시장 배치로 들어가 ≤5Hz 로 패널에 반영된다. 대상 테스트 · 타입체크 · eslint 통과, 경로 지정 커밋 1개.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 웹 — 매집 필터 줄(목업 A) · 판정 순수 함수 · 필터 밖 N · 전부 보기</name>
  <files>webapp/src/lib/accum-list.ts, webapp/src/lib/__tests__/accum-list.test.ts, webapp/src/components/trading/workbench/accum-strip.tsx, webapp/src/components/trading/__tests__/accum-strip.test.tsx</files>
  <behavior>
    - parseAccumFilterCell: "15" → 15 · " 1,000 " → 1000 · "1e3" → 1000 · "-5" → -5 · "" · "abc" · "NaN" · "Infinity" · "1.2.3" · "0x10" → null
    - formatAccumFilterCell: null → "" · 15 → "15" · 1.5 → "1.5"
    - passesAccumFilter: 등락률 15.00 은 최소 15 통과(경계 포함) · 14.994 실패 · 14.996 통과(둘째 자리 반올림) · 최대 30 에 30.004 통과 · 30.006 실패 · 당일 순매수 null 은 0 으로 비교(최소 1억 실패) · 99_999_999 원 실패 · 100_000_000 원 통과 · 네 칸 모두 null 이면 무엇이든 통과 · 등락률 제한이 있는데 등락률이 유한수가 아니면 실패
    - readAccumFilter: 저장 없음 · JSON 깨짐 · 객체 아님 → DEFAULT(등락률 최소 15 · 당일 순매수 최소 1 · 최대 둘 null) · 저장된 null 은 null 그대로 · 칸 하나가 수 아님이면 그 칸만 기본값 · write → read 왕복
    - strip(기본 필터): 등락률 18.2% · 당일 3.82억 행은 칩, 등락률 5.12% 행은 칩 없음 · 「매집」 라벨 옆 「필터 밖 1」
    - strip: 더보기 → 필터 줄 칸 값 "15" · "" · "1" · "" · 표에는 통과 행만 · 줄 끝 「필터 밖 1」
    - strip: 전부 보기 켬 → 칩에 걸린 행도 다시 보임 · 표의 그 행 `data-filtered-out="true"` · 라벨 알약 사라짐 · 줄 끝 「필터 밖 1 · 흐리게 표시」
    - strip: 등락률 최소 칸에 "5" 입력만 하면 목록 그대로 → Enter 하면 걸렸던 행이 나타남 · localStorage `gh-radar:accum-filter` 에 rateMin 5 · 칸에 "abc" 넣고 칸 떠남 → 칸 "" · 등락률 제한 없음
    - strip: 활성 행이 있는데 전부 걸리면 칩 줄 「필터를 통과한 종목이 없어요」, 펼친 표 자리에 필터 줄 + 「필터를 통과한 종목이 없어요 — 「전부 보기」로 숨긴 종목을 볼 수 있어요」 · 활성 행 0 이면 원래 빈 문구(ACCUM_EMPTY_TEXT) 그대로
    - strip: 청산 행도 같은 판정으로 걸린다 · ✕ 로 숨긴 행은 「필터 밖 N」 에 세지 않는다 · 다시 마운트하면 칸 값은 남고 전부 보기는 꺼짐
  </behavior>
  <action>
「필터 줄 위치·모양(목업 A)」 · 「필터가 거르는 범위」 · 「필터 값 기억」 결정을 구현한다. 판정은 순수 함수 한 곳(accum-list.ts), 패널은 그것을 부르기만 한다(gh-trade `IsShownRow` 동형).

1) `webapp/src/lib/accum-list.ts` — 머리 주석에 ⑦ 필터 규칙을 더한다(판정 값 = 화면 표시 값 · 등락률 둘째 자리 0에서 먼 쪽 반올림 · 당일 순매수 null → 0(gh-trade C-2) · 억 → 원 반올림 · 경계 포함 · 빈 칸 = 제한 없음 · 잘못된 값 = 빈 칸 · min > max 는 그대로 둔다 · ✕ 숨김이 먼저 · 칩 · 표 · 청산 행 같은 판정 · 「전부 보기」 는 저장하지 않는다 · gh-trade quick-261104-519 `AccumFilter` 동형, 수익률 · 누적 · 시총 칸은 없다). 내보내기:
- `ACCUM_FILTER_KEY = 'gh-radar:accum-filter'`(날짜 키 없음 — 계속 유지).
- `interface AccumFilter { rateMin: number | null; rateMax: number | null; dayMin: number | null; dayMax: number | null }`(등락률 % · 당일 순매수 억).
- `DEFAULT_ACCUM_FILTER`(rateMin 15 · dayMin 1 · 나머지 null).
- `parseAccumFilterCell(text: string): number | null` — 앞뒤 공백 제거, 빈 문자열 null, 쉼표 제거 뒤 부호 · 소수 · 지수만 허용하는 정규식에 맞지 않으면 null(16진수 · 여러 점 거부), `Number` 결과가 유한수가 아니면 null. 예외를 던지지 않는다.
- `formatAccumFilterCell(v: number | null): string` — null 은 빈 문자열, 아니면 `String(v)`.
- `roundRate2(rate: number): number` — 0에서 먼 쪽 둘째 자리 반올림(부호 × round(|x| × 100) / 100).
- `passesAccumFilter(f: AccumFilter, rate: number, dayNetKrw: number | null): boolean` — 등락률 칸 중 하나라도 있으면 rate 가 유한수가 아니면 false, 아니면 `roundRate2(rate)` 를 경계 포함 비교. 당일 순매수는 null · 비유한수 → 0, 경계는 `Math.round(억 × 1e8)` 원과 경계 포함 비교.
- `readAccumFilter(): AccumFilter` — `typeof window` 가드 + try/catch, 저장 없음 · 파싱 실패 · 객체 아님 → DEFAULT, 칸마다 유한수면 그 값 · null 이면 null · 그 밖(문자열 · 누락)은 DEFAULT 의 그 칸. `writeAccumFilter(f: AccumFilter): void` — try/catch, 실패는 무시(화면 동작을 막지 않는다).

2) `webapp/src/components/trading/workbench/accum-strip.tsx`
- 상수 내보내기: `ACCUM_FILTERED_EMPTY_TEXT = '필터를 통과한 종목이 없어요'`, `ACCUM_FILTERED_TABLE_EMPTY_TEXT = '필터를 통과한 종목이 없어요 — 「전부 보기」로 숨긴 종목을 볼 수 있어요'`.
- 상태: `filter`(첫 렌더 DEFAULT_ACCUM_FILTER, 마운트 effect 에서 `readAccumFilter()` — 패널 펼침 기억과 같은 하이드레이션 규율), `showAll`(false · 저장 안 함). 칸 적용 콜백은 `setFilter(next)` + `writeAccumFilter(next)`.
- `AccumView` 에 `filteredOut: boolean`(= `!passesAccumFilter(filter, rate, sig.dayNetKrw)` — rate 는 Task 2 의 표시 등락률 그대로, 청산 행은 행 값) · views deps 에 filter.
- 파생: `outCount` = views(✕ 숨김 뒤) 중 filteredOut 수, `shownViews` = showAll 이면 views 전부 아니면 통과 행만, `chipViews` = shownViews 중 state ≠ 3, `activeCount` = views 중 state ≠ 3 수.
- 스트립 라벨(「매집」 · 게이트웨이 옆): `outCount > 0 && !showAll` 일 때만 `data-slot="accum-label-out"` 회색 알약 「필터 밖 N」(title 「필터 밖 N종목 숨김」 · 목업 `.lab .out` — 10px · 600 · `--muted-fg` 글자 · `--muted` 바탕 · 4px 둥글기 · 1px 5px 여백).
- 칩 빈 문구: `activeCount === 0` 이면 지금 `ACCUM_EMPTY_TEXT`, 아니고 chipViews 가 0 이면 `ACCUM_FILTERED_EMPTY_TEXT`(같은 `data-slot="accum-empty"` 에 `data-filtered="true"`).
- 펼친 영역: 조건은 지금처럼 `open && views.length > 0`(필터 전 행 기준). 그 안 맨 위에 필터 줄, 그 아래 shownViews 가 있으면 `AccumTable`(views=shownViews, 새 prop `dimOut={showAll}`), 없으면 `data-slot="accum-filter-empty"` 문단(12px · `--muted-fg` · 목업 `.empty` 여백)에 `ACCUM_FILTERED_TABLE_EMPTY_TEXT`.
- 필터 줄 컴포넌트(memo · 같은 파일): `data-slot="accum-filter"` · role group · aria-label 「매집 필터」, 목업 `.fbar` 그대로 — flex · flex-wrap · items-center · 세로 6px 가로 14px 간격 · 8px 10px 여백 · 11px · `--muted-fg`(좁은 폭은 묶음 단위로 줄바꿈 · 가로 스크롤 금지). 묶음 넷: ① 「등락률」(600 · `--fg-2`) [최소] ~ [최대] % ② 「당일 순매수」 [최소] ~ [최대] 억 ③ 「전부 보기」 체크(`data-slot="accum-filter-all"` · order-log-filters.tsx 의 네이티브 체크박스 문법 · `accent-[var(--primary)]`) ④ 오른쪽 끝(margin-left auto) `data-slot="accum-filter-out"` 「필터 밖 **N**」 + showAll 이면 「 · 흐리게 표시」. 묶음 안은 inline-flex · 4px · nowrap.
- 칸 컴포넌트: `type="text"` · `inputMode="decimal"` · placeholder 「최소」/「최대」 · aria-label 예 「등락률 최소(%)」 「당일 순매수 최대(억)」 · data-slot `accum-filter-rate-min` / `-rate-max` / `-day-min` / `-day-max` · 목업 `.fg input` 그대로(폭 52px · 높이 24px · 6px 둥글기 · `--border-subtle` 테두리 · `--input` 바탕 · 11px · 오른쪽 정렬 · tabular-nums · 6px 좌우 여백 · placeholder `--faint`). 글자는 칸 자체 상태(draft)라 타이핑 중에는 목록이 흔들리지 않는다. 적용 = Enter(keydown) · blur: `parseAccumFilterCell(draft)` → draft 를 `formatAccumFilterCell` 로 다시 쓰고 → 값이 달라졌으면 부모 콜백. 부모 값이 바뀌면(저장값 복원 등) draft 를 맞춘다 — effect 대신 「이전 prop 기억 → 렌더 중 상태 조정」 패턴.
- `AccumTable`: `dimOut` 이 참이고 `v.filteredOut` 인 행에 `data-filtered-out="true"` 와 셀 흐림 `[&>td]:opacity-45`(목업 `tr.outrow td { opacity: .45 }`). 정렬 · 강조 · 「추가」 · ✕ 동작은 바꾸지 않는다. 칩은 흐리게 하지 않는다.
- 머리 주석에 ⑪ 필터 줄 규칙(목업 A · 위치 · 적용 시점 · 판정 정본 accum-list ⑦ · 필터 밖 N 정의 · 라벨 알약 조건 · 빈 문구 두 갈래 · 전부 보기 흐림 · 기억 범위)을 더한다.

3) 테스트
- `accum-list.test.ts`: behavior 의 parse · format · passes · read/write 항목 전부.
- `accum-strip.test.tsx`: 기존 `beforeEach` 의 `window.localStorage.clear()` 바로 뒤에서 `ACCUM_FILTER_KEY` 에 네 칸 모두 null 을 저장해 **기존 단언이 필터 없이 그대로** 돌게 한다(기본 필터면 `sig()` 기본 5.12% · 당일 null 행이 전부 걸린다 — 기존 단언은 고치지 않는다). 새 describe 「quick-261104-nxs 필터 줄(목업 A)」 은 자기 `beforeEach` 에서 그 키를 지워 기본 필터로 시작하고 behavior 의 strip 항목 전부를 잠근다(Enter 는 `fireEvent.keyDown(input, { key: 'Enter' })`, 칸 떠남은 `fireEvent.blur`).

4) 커밋 — `git add webapp/src/lib/accum-list.ts webapp/src/lib/__tests__/accum-list.test.ts webapp/src/components/trading/workbench/accum-strip.tsx webapp/src/components/trading/__tests__/accum-strip.test.tsx`. 메시지 예: 「feat(webapp): 작업대 매집 필터 줄 — 등락률·당일 순매수 최소~최대 · 전부 보기 · 필터 밖 N(261104-nxs)」.
  </action>
  <verify>
    <automated>grep -c "ACCUM_FILTER_KEY" webapp/src/lib/accum-list.ts && grep -c 'data-slot="accum-filter"' webapp/src/components/trading/workbench/accum-strip.tsx  # 기대 각각 ≥ 1 (HEAD 기준 0 · 0)</automated>
    <automated>cd webapp && npx tsc --noEmit -p . && npx vitest run --maxWorkers=2 src/lib/__tests__/accum-list.test.ts src/components/trading/__tests__/accum-strip.test.tsx src/lib/__tests__/use-accum-signals.test.tsx</automated>
    <automated>cd webapp && npx eslint src/lib/accum-list.ts src/components/trading/workbench/accum-strip.tsx  # 기대 출력 없음 · 종료 0</automated>
  </verify>
  <done>펼친 표 위 필터 줄(목업 A)이 기본 15% · 1억으로 칩 · 표 · 청산 행을 같은 판정으로 거르고, Enter · 칸 떠남에만 적용 · 정규화하며, 라벨 「필터 밖 N」 · 전부 보기 흐림 · 빈 문구 두 갈래 · localStorage 기억(전부 보기 제외)이 테스트로 잠겼다. 기존 매집 패널 테스트는 단언 수정 없이 통과. 대상 테스트 · 타입체크 · eslint 통과, 경로 지정 커밋 1개.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| gh-trade 게이트웨이 → relay quote 연결 | FlatBuffers 95 — JS 런타임에 Verifier 가 없어 깨진 버퍼가 예외 없이 엉뚱한 값을 낸다 |
| relay → 브라우저 wss | 인증된 소켓 전부에 공개 시세 파생값 방송 |
| localStorage → 패널 | 사용자 기기 저장값(깨질 수 있음) |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-nxs-01 | Tampering | `parseAccumPriceBatch` | medium | mitigate | 화이트리스트 32종 관문 · `takeCount` 512 상한 · 원소마다 `isValidIsin` · 유한수 검사, 실패 원소만 버리고 warn |
| T-nxs-02 | Information Disclosure | fanout `#broadcastAccumPrices` | low | accept | 「현재가 원천」 결정대로 시세와 같은 인증 규칙(`#users` 만 · 미인증 0). 싣는 것은 isin · 가격 · 등락률뿐(계좌 · 주문 · 매집 금액 없음) — 사용자 데이터 경로(`"fanout"`)와 섞지 않는다 |
| T-nxs-03 | Denial of Service | 웹 렌더 | low | mitigate | 시장 배치(커밋 ≤10/s) + `useAccumPrices` ≤5Hz 스로틀 · 값 서명 같으면 신원 유지 |
| T-nxs-04 | Tampering | `readAccumFilter` | low | mitigate | try/catch · 칸별 유한수 검사 · 실패 = 기본값 |
</threat_model>

<verification>
- 정본 빌드 게이트(config `workflow.build_command`): `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck`
- 세 태스크의 대상 vitest(`--maxWorkers=2`) 전부 통과. 전체 e2e 는 돌리지 않는다.
- `git log --oneline -3` 에 이 계획의 커밋 3개, 각 커밋 파일 목록이 그 태스크 `<files>` 안(`git show --stat HEAD~2..HEAD`). 옆 세션 경로가 섞이지 않았다.
- `relay/src/generated/**` 변경은 sync 스크립트 산출뿐(손편집 0).
</verification>

<success_criteria>
- relay 가 95 를 quote 연결에서만 받아 전역 캐시 · `accum.prices` 로 내보내고, 사용자 세션 95 는 무시(PC-12 계수 0) — 테스트로 증명.
- 매집 패널: 95 값 있는 종목은 구독 없이 95 현재가 · 등락률, 없는 종목만 구독 폴백, 청산 행은 행 값.
- 필터 줄(목업 A) · 필터 밖 N · 전부 보기 흐림 · 빈 문구 · 기억 규칙이 CONTEXT 그대로.
- 배포 순서 메모(SUMMARY 에 남김): relay 먼저 배포 → 운영 로그 「[HUB] 매집 현재가 95 수신 — 웹 원천 켜짐」 확인 → webapp push. 이 계획은 배포 · push 하지 않는다.
</success_criteria>

<output>
Create `.planning/quick/261104-nxs-relay-95-accumpricebatch/261104-nxs-SUMMARY.md` when done
</output>
