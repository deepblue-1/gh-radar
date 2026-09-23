---
phase: quick-260923-cqj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - relay/src/dma/msg-type.ts
  - relay/src/dma/envelope.ts
  - relay/src/store/gateway-symbols.ts
  - relay/src/store/symbols.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/dma/session-manager.ts
  - relay/src/ws/order-handler.ts
  - relay/src/index.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/gateway-symbols.test.ts
  - relay/tests/name-refresh.test.ts
  - relay/tests/session-manager.test.ts
  - relay/tests/ws-order.test.ts
  - relay/src/dma/__tests__/codec.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
autonomous: true
requirements:
  - QUICK-260923-cqj

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Supabase `stocks` 에 없는 당일 신규상장 ISIN(예: KR70010S0000)이 relay 종목맵에서 `{code:'0010S0', name, market}` 으로 풀린다. 이후 잔고·미체결·상따·VI 프레임에 이름과 코드가 실린다 (D-01)"
    - "같은 ISIN 이 Supabase `stocks` 와 게이트웨이 마스터 양쪽에 있으면 Supabase 행이 통째로 이긴다. 게이트웨이 맵은 Supabase 미스일 때만 조회된다 (D-01)"
    - "relay 는 GetSymbolMasterReq(27)를 relay 전체에서 한 번에 하나만 보낸다. master-day(07:30 KST 경계)마다 성공 1회가 목표다. 트리거는 세션 Ready 이벤트, 07:30 경계 타이머, 실패 뒤 5분 재시도 셋뿐이다. 사용자 N명이 Ready 가 돼도 27은 1건이고, 하루 시도 상한은 5회다 (D-02, D-03, D-04)"
    - "SymbolMasterResp(57) 분할 프레임은 네 조건을 모두 만족해야 보조 맵을 통째로 교체한다: seq 가 0부터 빈틈없이 이어짐, total_items 가 모든 프레임에서 같음, is_last 도착, 누적 원소 수 == total_items. 하나라도 어긋나거나, 파싱에 실패하거나, 30초 타임아웃이 나거나, 빈 마스터가 오면 옛 맵을 그대로 두고 [SYM-GW] 로그에 사유를 남긴다 (D-04)"
    - "게이트웨이 market_type '0' 은 'K'(코스피), '1' 은 'Q'(코스닥)으로 바꾼다. 그 밖의 값은 null 이다. null 인 종목은 주문과 전략 조립이 기존 게이트대로 거부한다 (D-05, T-16-05)"
    - "게이트웨이에서 온 단축코드는 `dma_orders.stock_code`(FK → stocks.code)에 쓰지 않는다. 당일 신규상장 종목의 수동 주문과 자동주문 감사 행은 stock_code NULL 로 남는다. 주문 자체는 게이트웨이로 나간다 (D-06)"
    - "57 은 INBOUND 화이트리스트(23종)에 들어가고 hub 에 명시 case 가 있다. OUT_OF_SCOPE 는 68·70·74·75 네 종이다. 57 은 브라우저로 팬아웃되지 않고, hub default 도달 카운트는 0 이다 (D-07)"
    - "보조 맵을 교체한 결과 이름 없던 캐시 행이 새로 풀리면, 해당 사용자에게만 기존 프레임 모양으로 한 번 다시 내려간다: acct 는 snap:true, vi.list 는 snap:false, lc.snap 은 64 를 받은 사용자에게만. 합성 `lc` 단건 에코는 보내지 않는다. 새로 풀린 행이 없으면 아무것도 보내지 않는다 (D-08)"
  artifacts:
    - path: "relay/src/store/gateway-symbols.ts"
      provides: "게이트웨이 종목마스터 보조 원천 — 단일 in-flight 27 요청, 57 분할 조립·검증·원자 교체, master-day 게이팅, 경계 타이머, 타임아웃, 재시도"
      exports: ["GatewaySymbolMaster", "masterDayKey"]
    - path: "relay/src/dma/envelope.ts"
      provides: "27 조립기 + 57 프레임 파서(원소 형식 가드) + market_type 매핑"
      contains: "parseSymbolMasterFrame"
    - path: "relay/src/store/symbols.ts"
      provides: "Supabase 우선 · 게이트웨이 폴백 lookup, SymbolInfo.source, FK 안전 코드 헬퍼"
      contains: "stocksCodeOf"
    - path: "relay/src/hub/subscription-hub.ts"
      provides: "57 명시 case, Ready 시 마스터 요청 훅, refreshNames 재방송"
      contains: "case MSG.SymbolMasterResp"
    - path: "relay/src/dma/session-manager.ts"
      provides: "firstReady(avoidUserId?) — 경계/재시도 트리거가 쓸 Ready 세션 선택"
      contains: "firstReady"
    - path: "relay/tests/gateway-symbols.test.ts"
      provides: "추적탄 E2E(Ready→27→57 조립→lookup→66 이름) + 조립·우선순위·매핑·게이팅·스케줄 테스트"
    - path: "relay/tests/name-refresh.test.ts"
      provides: "교체 후 재방송(acct/lc.snap/vi.list) 과 비재방송 경계 테스트"
  key_links:
    - from: "relay/src/hub/subscription-hub.ts #onReady"
      to: "relay/src/store/gateway-symbols.ts onSessionReady"
      via: "재구독·계좌·전략 요청 뒤 4번째 줄로 게이팅된 마스터 요청 (relay 전체 단일 in-flight)"
      pattern: "onSessionReady\\(session\\)"
    - from: "relay/src/hub/subscription-hub.ts #onFrame case MSG.SymbolMasterResp"
      to: "relay/src/dma/envelope.ts parseSymbolMasterFrame → GatewaySymbolMaster.onFrame"
      via: "파싱 결과(실패는 null)를 요청 세션 userId 와 함께 넘긴다"
      pattern: "parseSymbolMasterFrame\\(e\\.env\\)"
    - from: "relay/src/index.ts"
      to: "relay/src/store/symbols.ts SymbolMap"
      via: "new SymbolMap(supabase, { fallback: gatewaySymbols }) — hub·fanout 이 같은 lookup 을 쓴다"
      pattern: "fallback: gatewaySymbols"
    - from: "relay/src/index.ts"
      to: "relay/src/dma/session-manager.ts firstReady"
      via: "pickSession 주입 — 07:30 경계 타이머와 재시도 타이머가 Ready 세션을 고른다"
      pattern: "firstReady"
    - from: "relay/src/index.ts"
      to: "relay/src/hub/subscription-hub.ts refreshNames"
      via: "gatewaySymbols 'updated' 이벤트 → hub.refreshNames()"
      pattern: "refreshNames"
    - from: "relay/src/ws/order-handler.ts"
      to: "relay/src/store/symbols.ts stocksCodeOf"
      via: "dma_orders insert 의 code 두 자리 (수동 주문 · 자동주문 통보)"
      pattern: "stocksCodeOf\\(info\\)"
---

<objective>
relay 가 게이트웨이 종목마스터(GetSymbolMasterReq 27 → SymbolMasterResp 57)를 **보조 원천**으로 쓰게 한다. Supabase `stocks` 에 없는 ISIN(당일 신규상장)의 종목명·단축코드·시장을 그 원천으로 채운다. 정본은 여전히 Supabase `stocks` 다.

문제: 2026-09-23 상장 첫날 종목 KR70010S0000(0010S0)이 gh-radar `/trading` 카드 머리와 사이드바에서 ISIN 원문으로 보였다. 같은 시각 gh-trade WinForms 는 마스터 57 로 이름을 보여줬다. 원인은 relay 가 이름을 Supabase `stocks` 에서만 푼다는 데 있다. `stocks` 는 master-sync 가 KRX OpenAPI 로 채우는데, KRX 는 전 영업일 데이터를 다음 영업일 08:00 에 공개한다. 그래서 상장 당일에는 `stocks` 에 그 종목이 없다.

Purpose: 트레이더가 상장 첫날 종목(상따의 가장 전형적인 대상)을 이름으로 알아보고, 그 종목에 상따·주문을 걸 수 있게 한다. 시장 매핑이 gh-trade 소스로 증명됐으므로 주문 경로도 연다.

Output: 새 모듈 `relay/src/store/gateway-symbols.ts`, 27 조립기와 57 파서(`envelope.ts`), 57 화이트리스트 이동과 hub 명시 case, SymbolMap 폴백, SessionManager.firstReady, 주문 감사 FK 가드, 교체 후 이름 재방송, vitest 3파일(신규 2 · 보강 3). 배포는 하지 않는다 — 아래 <output> 의 배포 노트 참조.

## 열린 질문 (전부 비차단 — 결정 근거와 함께 기록)

- **OQ-1 (잔여 위험, 수용).** gh-trade 가 당일 신규상장 행을 사본에 넣을 때 시장 문자를 `(market == 'Q') ? "1" : "0"` 로 접는다 (`gh-trade/server/src/market/publish/MarketPublisher.cpp:636`). 'Q' 가 아닌 문자는 전부 코스피 "0" 이 된다. 현재 피드는 정보구분 "01S"/"01Q" 두 채널뿐이다 (`MarketFeed.cpp:641-644`, KONEX 경로 없음). 그래서 relay 는 "0"/"1" 매핑을 증명된 것으로 본다. 게이트웨이가 세 번째 시장 채널을 추가하면 이 매핑은 게이트웨이 쪽에서 먼저 바뀌어야 한다. relay 는 모르는 값을 null 로 받으므로 그 경우에도 오주문 방향으로 가지 않는다.
- **OQ-2 (타이밍, 여유로 흡수).** 당일 신규상장이 A0 3회 배치(05:40/06:20/07:00) 중 몇 번째에 처음 실리는지는 문서화돼 있지 않다. 경계를 마지막 배치 뒤 30분인 07:30 KST 로 잡아 세 배치를 모두 덮는다 (D-03).
- **OQ-3 (수용).** 게이트웨이의 마스터 직렬화가 실패하면 gh-trade 는 요청 연결에 ServerMessage(54) ERROR 「종목마스터 생성 실패 — 서버 로그 확인」(src "MarketPublisher")을 보낸다 (`MarketPublisher.cpp:1322-1360`). relay 는 54 를 해석하지 않고 흘린다 (D-36). 그래서 요청에 쓰인 세션의 사용자 화면에 이 메시지가 뜬다. 게이트웨이는 iconv 를 못 열면 아예 기동하지 않으므로 드문 일이고, 메시지 내용도 사실이다. 거르지 않는다.

## gh-trade 소스에서 확정한 사실 (읽기 전용 저장소 `/Users/alex/repos/gh-trade/server`)

- 27 은 **로그인된 세션**이 필요하다: `Gateway::ProcessGetSymbolMaster` 가 `if (!conn.session) return;` 로 시작한다 (`src/net/Gateway.cpp:4315-4330`). 요청 테이블은 없다 — Envelope 에 msg_type 만 싣는다.
- 요청 제한이 있다: 같은 연결의 GetMaster 가 큐에 이미 있거나 60초 안에 다시 오면 **응답 없이 흡수된다** (`MarketPublisher.h:121` `kMasterReqMinIntervalMs = 60'000`, `MarketPublisher.cpp:1034-1085`).
- 분할: 프레임당 500종목(`QuoteWire.h:64` `kSymbolMasterChunk`), 프레임당 약 50~70KB. seq 는 0부터 시작하고, total_items 는 모든 프레임에서 같으며, is_last 는 마지막 프레임만 true 다. 0종목이어도 is_last=true 프레임 1건이 온다 (`QuoteWire.cpp:463-537`). 종목명은 서버가 EUC-KR 을 UTF-8 로 바꿔 싣는다.
- 응답은 **요청한 연결 하나에만** Notice 로 간다 (`MarketPublisher.cpp:1322-1366` `SendFrame(connId, …, MsgClass::Notice)`). 요청 없이 먼저 보내는 57 푸시는 없다.
- market_type 어휘: "0"=코스피, "1"=코스닥 (`QuoteWire.h:234`; 시드 `MarketPublisher.cpp:948-949` `{KOSPI,"0"},{KOSDAQ,"1"}`; 신규 행 `:636`).
- 당일 신규상장은 KRX A0 배치(05:40/06:20/07:00, `trade/strategy/LimitChaser.h:79`)가 올 때 publisher 사본에 새 행으로 추가된다 (`MarketPublisher.cpp:589-650` HandleSymbolInfo WR-02 경로). 57 은 이 사본을 직렬화한다.

## 설계 결정 (이 quick 의 D-NN)

- **D-01 원천 우선순위.** Supabase `stocks` 가 정본이다. `SymbolMap.lookup` 은 자기 맵을 먼저 보고, 미스일 때만 게이트웨이 보조 맵을 본다. 우선순위는 **행 단위**다: Supabase 행이 있으면 그 행의 market 이 null 이어도 게이트웨이로 넘어가지 않는다. 필드별 합성은 하지 않는다 — 두 원천을 섞으면 어느 값이 어디서 왔는지 아무도 모른다.
- **D-02 어느 세션이 27 을 보내는가.** 요청은 relay 전체에서 **동시에 하나**만 있고, 사용자와 무관하다. 트리거는 세 가지다: (a) 어떤 세션이든 Ready 가 되면 그 세션으로 보낸다 (hub `#onReady` 의 4번째 줄). (b) 07:30 KST 경계 타이머. (c) 실패 뒤 재시도 타이머. (b)와 (c)는 `SessionManager.firstReady(avoidUserId)` 로 Ready 세션을 고른다. 이 함수는 직전에 실패한 사용자가 아닌 첫 Ready 세션을 돌려주고, 그 사용자밖에 없으면 그 세션을 돌려준다. 게이트웨이로 가는 트래픽은 사용자 수와 무관하다.
- **D-03 타이밍.** master-day 경계는 07:30 KST 다. `masterDayKey(now)` = (now − 07:30) 의 KST 날짜. 이 키가 마지막 성공 키와 다르면 요청할 때가 된 것이다(due). 성공 키는 **완료 시각**으로 매긴다. 07:00~07:30 사이에 시작한 요청도 마지막 A0 배치를 이미 포함하기 때문이다. 부팅 직후에는 세션이 없으므로 첫 Ready 가 요청한다(키가 비어 있어 due). 탭을 밤새 열어 둔 경우에는 07:30 경계 타이머가 이미 Ready 인 세션으로 요청한다. Supabase 재적재(08:30)는 그대로 둔다 — 우선순위가 조회 시점에 정해지므로 두 원천을 다시 병합할 필요가 없다.
- **D-04 조립과 방어.** seq 는 0부터 빈틈없이 이어져야 하고 seq ≤ 100 이다. total_items 는 모든 프레임에서 같아야 하고 0..20,000 범위다. 프레임당 원소는 1,000 이하다. 누적 원소 수(스킵된 원소 포함)는 total_items 를 넘을 수 없고, is_last 에서 total_items 와 같아야 한다. 이 조건을 모두 통과하면 새 Map 을 만든 뒤 한 번에 바꾼다(원자 교체). 빈 결과(유효 원소 0)로는 기존 맵을 지우지 않는다. 요청 세션이 아닌 userId 에서 온 57 과 요청이 없을 때 온 57 은 무시하고 로그를 남긴다. 30초 안에 is_last 가 안 오면 실패다. 실패하면 5분 backoff 를 둔다 — 게이트웨이의 60초 흡수 창 밖이다. 하루 시도 상한은 5회다. 모든 실패 갈래는 사유를 담은 [SYM-GW] 로그를 남긴다 (무로그 fail-safe 금지).
- **D-05 시장 매핑.** "0"→"K", "1"→"Q", 그 밖은 null. 근거는 위 gh-trade 인용이다. null 은 기존 주문·전략 조립 게이트(`order-handler.ts` ③-1, `fanout.ts #strategyMarket`)가 거부한다. 기본값으로 메우지 않는다 (T-16-05).
- **D-06 감사 기록 FK.** `dma_orders.stock_code` 는 `REFERENCES public.stocks(code)` 다 (`supabase/migrations/20260905120200_dma_orders.sql:53`). 게이트웨이 코드를 그대로 쓰면 insert 가 FK 위반으로 실패한다. 수동 주문은 거부되고, 자동주문 감사 행은 사라진다 — 지금까지는 모르는 ISIN 이면 code 가 null 이어서 기록이 남았다. 그래서 게이트웨이 원천 SymbolInfo 에는 `source: "gateway"` 를 붙인다(Supabase 행은 필드 없음 — 기존 테스트 리터럴과 호환). DB 에 쓰는 두 자리는 `stocksCodeOf(info)` 를 거친다. 게이트웨이 원천이면 null, Supabase 원천이면 code 다. 표시용 보강(hub)에는 게이트웨이 코드를 그대로 싣는다.
- **D-07 화이트리스트.** 57 을 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 에서 `INBOUND_MSG_TYPES` 로 옮긴다. 같은 커밋에서 hub `#onFrame` 에 명시 case 를 추가한다 (PC-12 — 화이트리스트와 명시 case 는 한 커밋에서 함께 자란다). `msg-type.ts` 「하지 않는 것」 목록과 `symbols.ts` 머리 주석도 같은 커밋에서 새 사실로 고친다. 57 은 브라우저로 흘리지 않는다 — 공개 마스터이고, relay 가 이름을 푸는 데만 쓴다.
- **D-08 이미 나간 프레임.** 다음 푸시가 자연히 올 때까지 기다리는 것으로는 **부족하다**. 상장 첫날 아침 첫 Ready 에서 relay 는 66(계좌)·64(상따 목록)·72(VI 목록)과 27 을 한꺼번에 요청한다. 27 은 publisher 명령 큐를 거쳐 약 10프레임으로 오므로, 66/64 가 마스터 조립보다 먼저 도착한다. 그러면 공모주 배정으로 이미 보유 중인 행과 WinForms 에서 미리 건 상따 전략이 이름 없이 캐시되고 팬아웃된다. 잔고 행은 거래가 없으면 델타가 오지 않아 계속 ISIN 으로 남는다 — 사용자가 본 증상이 바로 이것이다. 이 결함을 고치는 가장 단순한 방법은 이렇다: 교체가 끝나면 hub 가 **이름 없던 캐시 행 중 이번에 풀린 것이 있는 사용자에게만** 재방송한다. 새 프레임 계약은 만들지 않고, 브라우저가 이미 부작용 없이 처리하는 기존 모양만 쓴다 — acct snap:true(66 재수신과 같다), vi.list snap:false(73 과 같다), lc.snap(64 를 이미 받은 사용자만, 18-26 규율). 합성 `{t:"lc"}` 단건은 보내지 않는다. webapp 리듀서가 그 프레임을 받을 때마다 `lastLimitChaserEcho`(「서버가 답했다」의 유일한 증거)를 갱신하기 때문이다. 등락률 돌파(76/78)는 팬아웃 시점과 getter 에서 이미 보강하므로 대상이 아니다. 평소에는 Supabase 가 이미 다 풀었으므로 재방송이 0건이다.

## 하지 않는 것 (이 quick 범위 밖)

- server `/api/stocks/search` 의 당일 신규상장 검색(Supabase 원천) — webapp/server 를 건드리지 않는다.
- Supabase 재적재 뒤 재방송 — 기존 동작 그대로 둔다.
- `/healthz` 에 보조 맵 통계 노출 — 로그와 `stats()` 로 충분하다.
- webapp·packages/shared 변경 없음. 와이어 계약(`@gh-radar/shared`)은 한 글자도 바꾸지 않는다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@relay/src/store/symbols.ts
@relay/src/dma/msg-type.ts
@relay/src/index.ts
@relay/src/dma/session-manager.ts
@relay/tests/account-state.test.ts

<interfaces>
<!-- 실행자가 코드베이스를 다시 탐색하지 않도록 뽑아 둔 계약. 큰 파일은 여기 적은 줄 근처만 읽는다. -->

relay/src/store/symbols.ts (현재):
- export type SymbolInfo = { code: string; name: string; market: OrderMarket | null }
- export interface SymbolLookup { lookup(isin: string): SymbolInfo | undefined }
- export function toOrderMarket(market: string | null): OrderMarket | null   // "KOSPI"→"K", "KOSDAQ"→"Q"
- export function msUntilNextRefresh(now = Date.now()): number   // 08:30 KST, 상수 REFRESH_HOUR_KST/REFRESH_MINUTE_KST, KST_OFFSET_MS, DAY_MS
- export class SymbolMap implements SymbolLookup { constructor(supabase); start(); refresh(); lookup(isin); stats(); close() }  // #byIsin Map 통째 교체

relay/src/dma/envelope.ts (2,291줄 — 아래 자리만 읽는다):
- 줄 ~124 `ISIN_PATTERN`, ~191 `drop(...)`, ~209 `dropField(reason, msgType, detail): null`, ~228 `takeCount`, ~260 `isValidIsin(s)`
- 줄 ~144 `resetDroppedEnvelopeCount()` — 테스트 격리용. 스킵 카운터를 전부 0으로 되돌린다. 새 카운터도 여기서 되돌린다.
- 줄 ~447 `tryParseEnvelope(payload)` — INBOUND 밖의 번호는 drop. OUT_OF_SCOPE 는 debug, 나머지는 warn
- 줄 ~1442 `buildBareRequest(msgType, capacity = 64)` (비공개) — 본문 없는 요청. 24/34 가 쓴다
- 줄 ~1888~1925 스킵 카운터 선례: `skippedStrategyItemCount()` / `skipStrategyItem(...)`
- 생성 코드: `../generated/stock-dma/symbol-master.js` (SymbolMaster: items(i, obj?), itemsLength(), seq(), totalItems(), isLast()), `../generated/stock-dma/symbol-master-item.js` (SymbolMasterItem: code(), name(), isin(), marketType(), secGroupId(), nxtTradable()), Envelope.symbolMaster(obj?) · Envelope.addSymbolMaster(b, off)

relay/src/dma/msg-type.ts: MSG 상수 객체(요청 1~38, 응답 50~78). INBOUND_MSG_TYPES 는 현재 22종. OUT_OF_SCOPE_INBOUND_MSG_TYPES = [57, 68, 70, 74, 75]. 생성 enum 이름: `GetSymbolMasterReq = 27`, `SymbolMasterResp = 57` (codec.test 가 MSG 키 이름과 값을 생성 enum 과 대조한다 — 이 이름을 그대로 쓴다).

relay/src/hub/subscription-hub.ts (1,456줄):
- export interface HubSession { readonly userId: string; readonly isReady: boolean; send(payload: Uint8Array): boolean; on("frame"|"ready", …) }
- constructor(opts?: { symbols?: SymbolLookup }) — 줄 ~398
- #onFrame(userId, session, e: TransportFrameEvent) — 줄 ~691. 첫 줄 `if (this.#sessions.get(userId) !== session) return;` 다음에 switch. `case MSG.LoginResp: case MSG.UpdateAccountNoResp: return;` 가 줄 ~856, 그 아래가 `default:`(#unhandledFrames += 1)
- #onReady(userId, session) — 줄 ~1368: resubscribeAll → requestAccountState → requestStrategySnapshot
- 캐시: #accountStates key `${userId}|${accountNo}` → 언제나 snap:true 전량 뷰(hold: isin 키, unf: orderNo 키) · #limitChasers key `${userId}|${item.key}` · #limitChaserKnown: Set<userId>(64 수신 여부) · #viOrders key viOrderKey(userId, item)
- 보강 헬퍼: #enrichNames(state) 줄 ~1214 (hold/unf 에 name+code) · #enrichLimitChaser 줄 ~1080 (name+code) · #enrichViOrder 줄 ~1192 (name 만)
- 헬퍼: userPrefix(userId) = `${userId}|` (줄 193), getLimitChasers(userId), hasLimitChaserList(userId), #fanout(userId, msg)

relay/src/dma/dma-client.ts: export type TransportFrameEvent = ParsedEnvelope & { generation: number }; ParsedEnvelope = { msgType: number; env: Envelope }

relay/src/dma/session-manager.ts: #sessions: Map<string, Entry{ session: DmaSession; refCount; graceTimer; createdAt }> (삽입 순서), DmaSession 에 userId · isReady · send(payload) 가 있다

relay/src/ws/order-handler.ts: 줄 ~692 자동주문 통보 insert `code: info?.code ?? null`, 줄 ~891 수동 주문 insert `code: info.code`. OrderInsertRow.code 타입은 `string | null` (store/orders.ts:210)

relay/src/index.ts: 줄 82 `const symbols = new SymbolMap(supabase);` · 83 `void symbols.start();` · 85 `const hub = new SubscriptionHub({ symbols });` · 종료 절차 197 `symbols.close();`. sessionManager 는 symbols 보다 먼저 만들어진다.

webapp 소비측(수정 금지, 참고만): use-relay-socket.ts applyFrame — "acct" 는 mergeAccount(snap:true 면 전량 교체), "lc" 는 upsert + lastLimitChaserEcho 갱신, "lc.snap" 은 전량 교체 + limitChaserSnapSeq+1, "vi.list" 는 snap 이면 교체 아니면 mergeViOrders. isin-labels.ts useIsinLabels 는 accountStates·viOrders·limitChasers 에서 이름을 모은다.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 추적탄 — 첫 Ready → 27 → 57 분할 조립 → 보조 맵 → SymbolMap 폴백 → 이후 66 프레임에 신규상장 이름이 실린다</name>
  <files>relay/src/dma/msg-type.ts, relay/src/dma/envelope.ts, relay/src/store/gateway-symbols.ts, relay/src/store/symbols.ts, relay/src/hub/subscription-hub.ts, relay/src/ws/order-handler.ts, relay/src/index.ts, relay/tests/helpers/frames.ts, relay/tests/gateway-symbols.test.ts, relay/src/dma/__tests__/codec.test.ts, relay/src/dma/__tests__/envelope.test.ts</files>
  <behavior>
    - ① 추적탄: SymbolMap(Supabase 스텁에 SAMPLE_ISIN=삼성전자만 있음, fallback=GatewaySymbolMaster)과 hub(symbols·symbolMaster 주입)를 준비한다. FakeSession("user-1").emitReady() 뒤 나간 요청 중 msgType 27 이 정확히 1건이다. 57 을 3프레임(원소 5개, 청크 2)으로 pushFrame 한다(tryParseEnvelope 통과가 화이트리스트 증명이다). 그러면 symbols.lookup("KR70010S0000") 이 {code:"0010S0", name:"테스트신규", market:"Q", source:"gateway"} 가 된다. symbols.lookup(SAMPLE_ISIN).name 은 "삼성전자"다(Supabase 가 이김, source 없음). 이어서 IPO 보유 행을 담은 66 을 push 하면 팬아웃된 acct 의 hold 행 name "테스트신규" · code "0010S0" 이다. hub.unhandledFrameCount() 는 0 이고, 57 에 대한 팬아웃 프레임은 0건이다. 두 번째 emitReady 와 다른 사용자("user-2")의 Ready 는 27 을 더 보내지 않는다(같은 master-day)
    - ② 원자 교체: is_last 전(1·2프레임만 수신)에는 gw.lookup(신규 ISIN) 이 undefined 다. 마지막 프레임 뒤에 전량이 보인다
    - ③ 조립 실패 네 갈래 — 옛 맵 유지: seq 가 건너뜀(0 → 2), 두 번째 프레임의 total_items 가 다름, is_last 인데 누적 원소 수 ≠ total_items, 57 인데 symbol_master 슬롯이 빔(파서 null). 각 경우 in-flight 가 해제되고 lookup 결과는 직전 성공 맵 그대로다. 두 번째 적재는 주입한 now 를 다음 날 07:30 뒤로 옮긴 다음 emitReady 로 연다
    - ④ 원소 가드: market_type "0"→K, "1"→Q, "2"·""·"K"→null(이 원소는 lookup 되되 market null). 스킵되는 원소는 코드 "00593"(5자), 코드 "0059 3", 이름에 "\n" 포함, 이름 101자, 이름이 공백뿐, ISIN "KR700593000"(11자)이다. 스킵된 원소도 누적 원소 수에 들어가므로 total_items 검증은 통과한다. 이름 앞뒤 공백은 trim 된다
    - ⑤ 우선순위와 FK 헬퍼: stocksCodeOf(undefined) → null, stocksCodeOf(Supabase 행) → 그 code, stocksCodeOf(source:"gateway" 행) → null
    - ⑥ 라우팅: 요청하지 않은 userId 에서 온 57 은 무시한다(맵 무변경). in-flight 가 없을 때 온 57 도 무시한다(logger.warn 1건)
    - ⑦ 빈 마스터(total 0, is_last true, 원소 0)는 비어 있지 않은 기존 맵을 지우지 않는다(실패로 취급)
    - codec.test/envelope.test 갱신: INBOUND 23종이고 57 을 포함한다(27 은 불포함). OUT_OF_SCOPE 는 [68, 70, 74, 75]. 맨 envelope 57 은 tryParseEnvelope 를 통과하고, parseSymbolMasterFrame 은 slot-null 로 null 을 반환한다
  </behavior>
  <action>
먼저 `git status` 와 `git log -1` 로 트리가 깨끗한지 확인한다. 다른 세션의 커밋이나 편집이 섞여 있을 수 있으므로 시작 HEAD 를 기록해 둔다(SUMMARY 의 diff 기준). 테스트를 먼저 쓰고 실패를 본 다음 구현한다.

(1) msg-type.ts (D-07). MSG 요청 구역에 `GetSymbolMasterReq: 27` 을, 응답 구역에 `SymbolMasterResp: 57` 을 넣는다. 둘 다 한 줄 JSDoc 을 단다: 27 은 「종목마스터 전량 요청 — 요청 테이블 없음, 로그인 세션 필수, 같은 연결 60초 내 재요청은 게이트웨이가 응답 없이 흡수」, 57 은 「종목마스터 분할 응답 — 요청 연결에만 Notice, 500종목/프레임, is_last 로 완료」. INBOUND_MSG_TYPES 에 MSG.SymbolMasterResp 를 넣는다(23종). OUT_OF_SCOPE_INBOUND_MSG_TYPES 에서 57 을 뺀다(68·70·74·75). 파일 상단 주석을 새 사실로 고친다: 「유입 집합」 단락에 quick-260923-cqj 문단을 추가해 57 의 하류 책임을 적는다(파서 parseSymbolMasterFrame, hub 명시 case, 요청 세션 userId 의 프레임만 조립, 브라우저로 흘리지 않음). 「하지 않는 것」에서 27/57 항목을 지우고, 대신 「27/57 은 quick-260923-cqj 부터 보조 이름 원천으로 받는다 — 정본은 여전히 Supabase stocks」라고 적는다. ★ 문단의 요청 번호 목록은 (20 · 26 · 30 · 31)로 고치고, 27 은 relay 가 보내는 C→S 요청이라 수신 대역에 넣지 않는다는 한 줄을 덧붙인다. INBOUND 주석의 종수(22→23)와 OUT_OF_SCOPE 주석의 원소 목록·개수(5→4)도 고친다.

(2) envelope.ts. buildGetSymbolMasterReq() 를 export 한다. buildBareRequest(MSG.GetSymbolMasterReq) 를 쓰고, 24 선례처럼 「응답 57 은 요청 연결에만」이라고 주석한다. export 상수 MAX_SYMBOL_MASTER_FRAME_ITEMS = 1000(서버 청크 500의 2배), MAX_SYMBOL_MASTER_TOTAL_ITEMS = 20000(서버 전수 약 4,500의 4배 여유), MAX_SYMBOL_NAME_LEN = 100 을 두고 근거 주석을 단다. export function fromWireMasterMarketType(raw: string): OrderMarket | null 을 둔다: "0"→"K", "1"→"Q", 그 밖은 null. 주석에 gh-trade 근거 3곳(QuoteWire.h:234, MarketPublisher.cpp:948-949, :636)과 OQ-1 을 인용한다. export type GatewaySymbolRow = { isin; code; name; market: OrderMarket | null } 과 export type ParsedSymbolMasterFrame = { seq; totalItems; isLast; rawCount; rows: GatewaySymbolRow[]; skipped } 를 둔다. export function parseSymbolMasterFrame(env: Envelope): ParsedSymbolMasterFrame | null 을 만든다. total 함수이고 어떤 입력에도 throw 하지 않는다. 슬롯이 없으면 dropField("slot-null", MSG.SymbolMasterResp, {slot:"symbol_master"}). seq 나 totalItems 가 음수이면, 또는 totalItems 가 MAX_SYMBOL_MASTER_TOTAL_ITEMS 를 넘거나 itemsLength 가 MAX_SYMBOL_MASTER_FRAME_ITEMS 를 넘으면 사유별 dropField 로 null 을 반환한다(절단하지 않는다 — 부분 마스터는 total 검증을 깨뜨린다). 원소는 scratch SymbolMasterItem 으로 순회한다. 스킵 조건: 원소 null, isValidIsin 실패, code 가 대문자 영숫자 정확히 6자(정규식 ^[0-9A-Z]{6}$)가 아님, name 을 trim 한 결과가 비었거나 MAX_SYMBOL_NAME_LEN 을 넘음, name 에 제어문자(U+0000~U+001F, U+007F) 포함. 스킵한 원소는 rawCount 에는 세고 rows 에는 넣지 않는다. 스킵 로그는 원소마다 남기지 않는다(한 프레임에 500건이 쏟아질 수 있다). 프레임당 한 줄로 사유별 건수와 첫 샘플 ISIN 하나만 warn 한다. 누적 카운터 skippedSymbolMasterItemCount() 를 export 하고 resetDroppedEnvelopeCount 에서 함께 0으로 되돌린다. market 은 fromWireMasterMarketType(marketType() ?? "") 로 채운다. secGroupId·nxtTradable 은 읽지 않는다(표시·주문에 필요 없는 필드를 담지 않는다).

(3) 새 파일 relay/src/store/gateway-symbols.ts. 머리 주석에 이 quick 의 이유, gh-trade 확정 사실(27 로그인 필수·60초 흡수·500 청크·요청 연결만·A0 05:40/06:20/07:00)과 D-01~D-04 를 적는다. 내용:
- export type MasterRequestSession = { readonly userId: string; readonly isReady: boolean; send(payload: Uint8Array): boolean } — HubSession 과 DmaSession 이 둘 다 구조적으로 만족한다.
- export function masterDayKey(now: number): string — (now + 9h − 7h30m) 의 UTC 날짜 "YYYY-MM-DD". 상수 MASTER_DAY_START_HOUR_KST = 7, MASTER_DAY_START_MINUTE_KST = 30 과 근거 주석(A0 마지막 배치 07:00 + 30분)을 둔다.
- export class GatewaySymbolMaster extends EventEmitter implements SymbolLookup. 생성자 옵션은 { now?: () => number }(Task 2 에서 넓힌다). 상태: #byIsin: Map<string, SymbolInfo>(원소마다 source:"gateway"), #loadedDayKey: string | null, #loadedAt: Date | null, #inflight: { userId, startedAt, nextSeq, totalItems: number | null, rawCount, skipped, frames, rows: Map<string, SymbolInfo> } | null.
- lookup(isin) 은 #byIsin 만 본다. stats() 는 { symbolCount, loadedAt, dayKey, inflight: boolean } 이고 식별자를 담지 않는다.
- onSessionReady(session): session.isReady 이고 due(#loadedDayKey !== masterDayKey(now) ∧ #inflight === null)일 때만 buildGetSymbolMasterReq() 를 session.send 한다. send 가 false 면 실패로 처리한다. true 면 #inflight 를 세우고 info 로그 "[SYM-GW] 게이트웨이 종목마스터 요청"을 { userId, dayKey, reason:"ready" } 와 함께 남긴다.
- onFrame(userId, frame: ParsedSymbolMasterFrame | null):
  · in-flight 가 없으면 warn "[SYM-GW] 요청 없는 57 — 무시" 후 반환한다.
  · userId 가 in-flight 의 userId 와 다르면 debug 로그 후 반환한다(다른 세션의 프레임은 조립하지 않는다).
  · frame 이 null 이면 실패("parse").
  · seq 가 nextSeq 와 다르거나 seq 가 100 을 넘으면 실패("seq-gap"). 상수 MAX_MASTER_FRAMES = 100.
  · 첫 프레임이면 totalItems 를 기록하고, 이후 프레임의 값이 다르면 실패("total-changed").
  · rawCount 에 frame.rawCount 를 더한 값이 totalItems 를 넘으면 실패("overflow").
  · rows 를 in-flight Map 에 넣는다. SymbolInfo 는 { code, name, market, source:"gateway" } 이고 같은 ISIN 은 뒤 값으로 덮는다.
  · frame.isLast 이면: rawCount !== totalItems 는 실패("count-mismatch"), rows.size === 0 은 실패("empty — 기존 맵 유지").
  · 통과하면 #byIsin 을 in-flight Map 으로 한 번에 교체하고 #loadedDayKey = masterDayKey(완료 시각)(D-03), #loadedAt 을 기록한다. info 로그 { count, skipped, frames, elapsedMs } 를 남기고 emit("updated", { count }) 한 뒤 in-flight 를 해제한다.
- 비공개 #fail(reason): 사유와 { userId, dayKey, frames, rawCount } 를 warn 하고 in-flight 를 해제한다. 옛 맵은 건드리지 않는다.

(4) store/symbols.ts (D-01, D-06). SymbolInfo 에 선택 필드 `source?: "gateway"` 를 추가하고 JSDoc 을 단다: 「없으면 Supabase stocks 정본. dma_orders.stock_code FK 때문에 이 구분이 필요하다」. export function stocksCodeOf(info: SymbolInfo | undefined): string | null 을 추가한다. SymbolMap 생성자에 두 번째 인자 opts?: { fallback?: SymbolLookup } 를 받는다. lookup 은 자기 맵에서 먼저 찾고, 미스이면 fallback 에서 찾는다. 머리 주석의 「relay 는 그 마스터를 게이트웨이(27/57)가 아니라 Supabase stocks 에서 얻는다」 단락을 새 사실로 다시 쓴다: 정본은 stocks 이고 미스만 게이트웨이 보조 원천이 채운다(quick-260923-cqj). 예전에 게이트웨이를 쓰지 않은 세 이유가 어떻게 해소됐는지 적는다 — 세션 편승은 relay 전체 단일 in-flight 로, 분할은 약 10프레임에 seq/total 검증으로, 화이트리스트는 명시 case 로 풀었다. 「개별 ISIN 지연 조회 안 함」은 그대로 둔다.

(5) hub/subscription-hub.ts. export interface HubSymbolMasterFeed { onSessionReady(session: HubSession): void; onFrame(userId: string, frame: ParsedSymbolMasterFrame | null): void } 를 선언한다. 생성자 옵션에 symbolMaster?: HubSymbolMasterFeed 를 추가하고 #symbolMaster 에 담는다. #onFrame switch 의 LoginResp case 바로 위에 `case MSG.SymbolMasterResp:` 명시 case 를 둔다. 이 case 는 this.#symbolMaster?.onFrame(userId, parseSymbolMasterFrame(e.env)) 를 부르고 return 한다. 주입이 없어도 명시 case 이므로 default 카운트는 오르지 않는다. 주석: 「브라우저로 흘리지 않는다 — 공개 마스터이고 relay 이름 해석의 보조 원천이다(D-07)」. #onReady 의 세 줄 뒤에 this.#symbolMaster?.onSessionReady(session) 를 추가한다. 위 주석 「이 세 줄 말고 재조회를 거는 곳은 없다」를 고친다: 4번째 줄은 사용자별 재조회가 아니라 relay 전체 1일 1회 게이팅이다.

(6) ws/order-handler.ts (D-06). 줄 ~692 `code: info?.code ?? null` 과 줄 ~891 `code: info.code` 를 둘 다 `code: stocksCodeOf(info)` 로 바꾸고, FK 근거(20260905120200_dma_orders.sql:53)를 주석으로 단다. market 경로는 바꾸지 않는다.

(7) index.ts. sessionManager 다음에 `const gatewaySymbols = new GatewaySymbolMaster();` 를 만든다. `new SymbolMap(supabase, { fallback: gatewaySymbols })`, `new SubscriptionHub({ symbols, symbolMaster: gatewaySymbols })` 로 결선하고, 결선 주석에 보조 원천을 한 줄 적는다.

(8) tests/helpers/frames.ts. SymbolMaster·SymbolMasterItem 생성 코드를 import 한다. export type FakeSymbolMasterItem = { isin?; code?; name?; marketType?; secGroupId?; nxtTradable? } 를 둔다. buildSymbolMasterFrame({ items?, seq?, totalItems?, isLast? }) 는 57 을 만든다: 원소 테이블을 각각 끝낸 뒤 createItemsVector 로 묶는다(Pitfall 2), 문자열은 테이블을 열기 전에 만든다. buildSymbolMasterFrames(items, chunkSize) 는 서버 규약대로 seq·total·isLast 를 채운 배열을 만든다(0건이면 1프레임). buildBareEnvelope(57) 은 기존 헬퍼를 재사용한다.

(9) tests/gateway-symbols.test.ts. FakeSession 은 account-state.test.ts 패턴을 복제한다: send 가 msgType 을 되읽어 쌓고, pushFrame 이 tryParseEnvelope 를 거치고, emitReady 가 ready 를 쏜다. Supabase 스텁은 symbols.test.ts 의 mkSupabase 모양(from→select→not→order→range)을 최소로 복제한다. vi.useFakeTimers({ toFake: setTimeout/clearTimeout/setInterval/clearInterval }) 를 쓰고, now 는 주입 시계로 제어한다. 위 behavior ①~⑦ 을 구현한다. codec.test.ts 와 envelope.test.ts 는 behavior 마지막 항목대로 고치고, 개수·목록 주석도 새 사실로 고친다.

커밋(한글, Co-Authored-By 없음, push 금지)은 명시 경로만 stage 한다: `feat(quick-260923-cqj): relay 가 게이트웨이 종목마스터(27/57)를 Supabase stocks 미스 보조 원천으로 조립·조회한다`. git add 직전에 `git status` 로 남의 파일이 섞이지 않았는지 다시 확인한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C relay exec vitest run tests/gateway-symbols.test.ts src/dma/__tests__/codec.test.ts src/dma/__tests__/envelope.test.ts tests/symbols.test.ts tests/ws-order.test.ts tests/account-state.test.ts && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests</automated>
  </verify>
  <done>behavior ①~⑦ 과 갱신한 whitelist 테스트가 green 이고 두 typecheck 가 exit 0 이다. `grep -n "case MSG.SymbolMasterResp" relay/src/hub/subscription-hub.ts` 와 `grep -n "fallback: gatewaySymbols" relay/src/index.ts` 가 각각 1줄이다. `grep -c "stocksCodeOf(info)" relay/src/ws/order-handler.ts` 는 2 다. 커밋 1건이 생겼다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 스케줄 강화 — 07:30 경계 타이머 · 30초 타임아웃 · 5분 재시도(다른 Ready 세션 우선) · 하루 5회 상한 · firstReady</name>
  <files>relay/src/store/gateway-symbols.ts, relay/src/dma/session-manager.ts, relay/src/index.ts, relay/tests/gateway-symbols.test.ts, relay/tests/session-manager.test.ts</files>
  <behavior>
    - ⑧ 경계 타이머: start() 뒤 주입 now 를 07:29 KST(전날 적재 완료 상태)에 둔다. 1분 진행해 07:30 을 지나면 pickSession 이 돌려준 Ready 세션으로 27 이 1건 나가고 reason 은 "day-boundary" 다. 다음 날 07:30 에 타이머가 다시 걸려 있다(재무장)
    - ⑨ 경계에 Ready 세션이 없으면(pickSession → undefined) 27 은 0건이다. 그 뒤 첫 emitReady 가 1건을 보낸다
    - ⑩ 타임아웃: 요청 뒤 30초 동안 is_last 가 없으면 실패다. 5분 안의 Ready 이벤트는 27 을 보내지 않는다(backoff). 5분이 지나면 재시도 타이머가 pickSession(직전 실패 userId) 로 27 을 보내고, 이때 pickSession 인자로 실패한 userId 가 넘어온다
    - ⑪ 하루 상한: 같은 master-day 에 5회 실패하면 6번째는 보내지 않고 logger.error 1건을 남긴다. 다음 master-day 경계에서 시도 횟수가 0으로 초기화된다
    - ⑫ 성공한 완료는 타임아웃 타이머를 지운다(30초 뒤에도 실패 로그 없음). close() 는 경계·타임아웃·재시도 타이머를 모두 지운다(vi.getTimerCount() 0)
    - ⑬ SessionManager.firstReady(): Ready 세션이 없으면 undefined, 있으면 삽입 순서상 첫 Ready 세션이다. firstReady("user-1") 은 user-2 가 Ready 면 user-2, user-1 만 Ready 면 user-1 을 돌려준다
  </behavior>
  <action>
(1) session-manager.ts. firstReady(avoidUserId?: string): DmaSession | undefined 를 추가한다. #sessions 를 삽입 순서로 훑어, isReady 이고 userId 가 avoidUserId 와 다른 첫 세션을 돌려준다. 그런 세션이 없으면 avoidUserId 세션이 Ready 인지 보고 그것을 돌려준다. 참조계수와 유예 타이머는 건드리지 않는다. JSDoc 에 용도(D-02: 게이트웨이 종목마스터 요청의 운반 세션 선택, 사용자 수와 무관한 relay 전체 1건)와 「유예 중 세션도 Ready 면 후보」를 적는다. 로그에 식별자 외 비밀을 싣지 않는 기존 규율을 따른다.

(2) gateway-symbols.ts (D-02, D-04). 생성자 옵션을 { pickSession?: (avoidUserId?: string) => MasterRequestSession | undefined; now?; requestTimeoutMs?; retryBackoffMs? } 로 넓힌다. export 상수 MASTER_REQUEST_TIMEOUT_MS = 30_000, MASTER_RETRY_BACKOFF_MS = 300_000(게이트웨이 60초 흡수 창 밖이라는 근거 주석 포함), MAX_MASTER_ATTEMPTS_PER_DAY = 5 를 둔다. 요청 경로를 비공개 #tryRequest(session | undefined, reason: "ready" | "day-boundary" | "retry") 하나로 모은다. onSessionReady 도 이것을 부른다. due 판정에 조건 세 가지를 더한다: now ≥ #retryNotBefore, 그날 시도 수 < 상한, session 이 있고 isReady. 시도 수는 { dayKey, count } 로 관리하고 dayKey 가 바뀌면 0으로 되돌린다. 상한에 닿으면 그날 한 번만 logger.error "[SYM-GW] 오늘 재시도 상한 도달 — 다음 07:30 경계까지 중단" 을 남긴다. 송신에 성공하면 타임아웃 타이머를 건다. 만료되면 #fail("timeout") 이다. #fail 은 #retryNotBefore = now + backoff 로 두고 #lastFailedUserId 를 기록한 뒤 재시도 타이머를 다시 건다(기존 타이머는 먼저 지운다). 재시도 타이머가 만료되면 #tryRequest(pickSession(#lastFailedUserId), "retry") 다. 완료나 실패 시 타임아웃 타이머를 지운다. start() 는 msUntilKst(7, 30) 뒤에 경계 타이머를 건다. 만료되면 #tryRequest(pickSession(), "day-boundary") 를 부르고 다음 날로 재무장한다. Ready 세션이 없으면 info "[SYM-GW] 경계 도달 — Ready 세션 없음, 첫 Ready 에서 요청" 로그를 남긴다. close() 는 타이머 셋을 지우고 in-flight 를 버린다. 모든 타이머에 unref 를 건다. KST 시각까지 남은 ms 계산은 symbols.ts 의 msUntilNextRefresh 논리를 재사용한다: symbols.ts 에 export function msUntilKst(hour, minute, now = Date.now()) 를 두고 msUntilNextRefresh 가 이 함수를 부르게 바꾼다. 기존 symbols.test 의 msUntilNextRefresh 단언은 그대로 통과해야 한다.

(3) index.ts. `new GatewaySymbolMaster({ pickSession: (avoid) => sessionManager.firstReady(avoid) })` 로 바꾸고 `gatewaySymbols.start()` 를 부른다. 종료 절차 4)의 symbols.close() 옆에 gatewaySymbols.close() 를 넣는다. 머리 주석의 종료 절차 목록은 기존 번호를 유지하고 4)에 한 단어만 더한다.

(4) tests. gateway-symbols.test.ts 에 behavior ⑧~⑫ 를 더한다: pickSession 은 테스트 FakeSession 을 돌려주는 vi.fn, now 는 주입 시계, 타이머는 vi.advanceTimersByTime. Task 1 의 ①~⑦ 중 한 테스트 안에서 실패 뒤 곧바로 다시 요청하는 흐름이 있으면, 이번에 들어간 backoff 에 막힌다. 그 경우 주입 시계와 타이머를 backoff 뒤로 옮겨 맞추고, 단언 자체는 약화하지 않는다. session-manager.test.ts 에 ⑬ 을 기존 ⑨ 패턴(startFakeGateway autoLogin + waitFor ready)으로 더한다 — 두 사용자를 acquire 해 Ready 를 기다린다.

커밋: `feat(quick-260923-cqj): 게이트웨이 종목마스터 요청에 07:30 경계 타이머·타임아웃·재시도 상한을 둔다`. 명시 경로만 stage 하고, 직전에 `git status` 를 다시 확인한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm -C relay exec vitest run tests/gateway-symbols.test.ts tests/session-manager.test.ts tests/symbols.test.ts && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests</automated>
  </verify>
  <done>⑧~⑬ 이 green 이고 기존 symbols·session-manager 테스트도 그대로 green 이다. `grep -n "firstReady" relay/src/index.ts` 는 1줄, `grep -n "gatewaySymbols.close()" relay/src/index.ts` 는 1줄이다. 커밋 1건이 생겼다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 이미 나간 프레임 보정(refreshNames 재방송) + 주문 FK 가드 증명 + 최종 게이트 · 배포 노트</name>
  <files>relay/src/hub/subscription-hub.ts, relay/src/index.ts, relay/tests/name-refresh.test.ts, relay/tests/ws-order.test.ts</files>
  <behavior>
    - ⑭ 첫 Ready 경합 재현: hub(SymbolMap 은 IPO 없음, 보조 맵 비어 있음)에 Ready → 66 스냅샷(IPO 보유 1행 + 삼성 1행) · 64 목록(IPO 상따 1건) · 72 VI 목록(IPO 1건)을 먼저 push 한다. 이때 팬아웃된 IPO 행들은 name 이 없다. 그다음 57 을 조립하면 'updated' → refreshNames 다. 결과 팬아웃은 acct(snap:true, IPO 행 name·code 채움, 삼성 행 불변) 1건, lc.snap(IPO 항목 name·code) 1건, vi.list(snap:false, IPO 항목 1건만, name) 1건이다. 이 과정에서 {t:"lc"} 프레임은 0건이다. hub.getAccountStates / getLimitChasers / getViOrders 캐시에도 이름이 있다
    - ⑮ 멱등·무소음: refreshNames 를 곧바로 한 번 더 부르면 팬아웃 0건이다. 캐시에 이름 없는 행이 없는 다른 사용자는 첫 호출에서도 0건이다
    - ⑯ 64 미수신 사용자: 60 에코로만 IPO 상따가 캐시돼 있고 hasLimitChaserList 가 false 면, 캐시는 이름으로 갱신되지만 lc.snap 은 내려가지 않는다(18-26 규율)
    - ⑰ ws-order: SYMBOLS 스텁에 GATEWAY_ISIN="KR70010S0000" → {code:"0010S0", name:"신규상장", market:"Q", source:"gateway"} 를 추가한다. order.new(GATEWAY_ISIN) 은 DirectOrderReq market "Q" 로 게이트웨이에 나가고 orders.inserts[0].code 는 null 이다. GATEWAY_ISIN 의 자동주문 접수 통보(상따 origin)가 만든 insert 행도 code null 이다(기존 자동주문 insert 테스트 패턴을 따른다)
  </behavior>
  <action>
(1) hub/subscription-hub.ts (D-08). public refreshNames(): void 를 추가한다. #symbols 가 없으면 바로 반환한다. 세 캐시를 훑는다.
  (a) #accountStates: 각 [key, state] 의 hold 와 unf 행 중 name 이 undefined 이거나 ""인 행에만 lookup 을 적용한다. 적중하면 { ...row, name, code } 로 채운다. 하나라도 채웠으면 캐시를 교체하고, 키의 첫 '|' 앞 userId 로 교체된 snap:true 전량 뷰를 #fanout 한다.
  (b) #limitChasers: 이름 없는 항목만 lookup 해서 name·code 를 채우고 캐시를 교체한다. 바뀐 사용자마다 hasLimitChaserList(userId) 가 true 일 때만 { t:"lc.snap", items: this.getLimitChasers(userId) } 를 팬아웃한다. 주석으로 「합성 lc 단건 금지 — webapp lastLimitChaserEcho 가 서버 응답 증거라서」를 남긴다.
  (c) #viOrders: 이름 없는 항목만 name 을 채우고 캐시를 교체한다. 사용자별로 바뀐 항목만 모아 { t:"vi.list", snap:false, items } 로 팬아웃한다.
  마지막에 재방송이 1건 이상이면 info 로그 "[HUB] 보조 종목마스터 반영 — 이름 없던 캐시 행 재방송" 을 { accounts, limitChaserUsers, viOrders } 건수로 남긴다. 0건이면 로그도 없다. 등락률 돌파·VI 통보·시세는 대상이 아니라는 이유(팬아웃과 getter 에서 보강, 일회성 통보)를 메서드 JSDoc 에 적는다. 기존 #enrichNames 를 그대로 재사용하지 않는다 — 그 함수는 이미 이름이 있는 행도 덮어쓰고 미해석 로그를 남긴다. 그래서 「이름 없는 행만 채운다」는 작은 비공개 헬퍼를 두되, 보강 필드 구성(잔고·미체결 name+code, 상따 name+code, VI name)은 기존 보강과 같게 한다.

(2) index.ts. hub 를 만든 뒤 `gatewaySymbols.on("updated", () => hub.refreshNames())` 를 결선하고, D-08 근거(첫 Ready 에서 66/64 가 57 조립보다 먼저 온다)를 한 줄로 단다.

(3) tests/name-refresh.test.ts 에 ⑭~⑯ 을 쓴다. FakeSession 과 스텁은 gateway-symbols.test.ts 와 같은 모양이다. 파일끼리 export 로 공유하지 말고, 이 파일 안에 복제해도 된다(테스트 격리). 72 프레임은 buildViOrderListFrame, 64 는 buildLimitChaserListRespFrame, 60 은 buildSetLimitChaserRespFrame, 66 은 buildAccountStateFrame 을 쓴다. tests/ws-order.test.ts 에 ⑰ 을 더한다.

(4) 최종 게이트: relay 전량 테스트, typecheck, typecheck:tests. 테스트 수는 534 + 새 테스트 수 이상이어야 하고 실패는 0이다. `git diff --stat <Task 1 시작 HEAD> -- webapp packages/shared pnpm-lock.yaml` 은 비어 있어야 한다(이 변경은 webapp 프로덕션 배포를 유발하지 않는다).

커밋: `feat(quick-260923-cqj): 보조 마스터 적재 후 이름 없던 캐시 행을 재방송하고 신규상장 주문 감사 행의 stock_code 를 비운다`. 명시 경로만 stage 하고, 직전에 `git status` 를 다시 확인한다. push 는 하지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test</automated>
  </verify>
  <done>⑭~⑰ 이 green 이다. relay 전량 테스트는 534 + 신규분이 모두 통과하고 0 fail 이다. 두 typecheck 가 exit 0 이다. `grep -n "refreshNames" relay/src/index.ts` 는 1줄이다. webapp·packages/shared·pnpm-lock diff 는 0줄이다. 커밋 1건이 생겼고 push 는 하지 않았다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| KB DMA 게이트웨이 TCP → relay (57) | 게이트웨이가 준 종목명·단축코드·시장이 새로 표시와 주문 조립에 들어온다. JS 런타임에는 FlatBuffers Verifier 가 없어, 잘린 버퍼가 예외 없이 깨진 값으로 읽힌다 |
| relay → 브라우저 wss | 보강한 이름이 사용자 화면에 텍스트로 렌더된다 |
| relay → Supabase dma_orders | 감사 행의 stock_code 는 FK → stocks(code) 다 |
| relay → 게이트웨이 (27) | 요청 빈도가 사용자 세션 연결과 게이트웨이 publisher 에 부하를 준다 |

## STRIDE Threat Register (ASVS L1, high 는 차단)

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-cqj-01 | Tampering | envelope.ts parseSymbolMasterFrame 원소 | medium | mitigate | ISIN_PATTERN, code 가 ^[0-9A-Z]{6}$, name 은 trim 뒤 1..100자이고 제어문자(U+0000~001F, U+007F) 거부, market 은 엄격 매핑. 위반 원소는 스킵하고 카운터와 프레임당 1줄 로그를 남긴다. 브라우저는 React 텍스트 노드로만 렌더하고, relay 는 이름을 로그 포맷 문자열이나 HTML 에 쓰지 않는다 |
| T-cqj-02 | Tampering (오주문) | fromWireMasterMarketType → order-handler / fanout #strategyMarket | high | mitigate | 소스로 증명된 "0"→K · "1"→Q 만 허용하고 나머지는 null 이다. null 은 기존 조립 게이트가 거부한다(T-16-05). Supabase 에 있는 ISIN 은 Supabase 가 이긴다(D-01). 잔여 위험 OQ-1(게이트웨이가 'Q' 외 시장 문자를 "0" 으로 접음)은 피드가 01S/01Q 뿐이라 수용한다 |
| T-cqj-03 | Denial of Service | GatewaySymbolMaster 조립 버퍼 | medium | mitigate | total ≤ 20,000, 프레임당 ≤ 1,000, seq ≤ 100, 누적 ≤ total, 단일 in-flight, 30초 타임아웃. 기존 codec 1MB 프레임 상한도 그대로 적용된다 |
| T-cqj-04 | Denial of Service (게이트웨이·계정) | 27 송신 빈도 | medium | mitigate | master-day 당 성공 1회, relay 전체 단일 in-flight, 실패 시 5분 backoff(게이트웨이 60초 흡수 창 밖), 하루 5회 상한. 요청 수는 사용자 수와 무관하다 |
| T-cqj-05 | Spoofing / Information Disclosure | hub case 57 라우팅 | low | mitigate | 요청 세션 userId 의 프레임만 조립한다. 57 은 브라우저로 팬아웃하지 않는다. 공개 마스터라 사용자 데이터가 없다 |
| T-cqj-06 | Tampering (감사 무결성) | order-handler dma_orders insert stock_code | high | mitigate | source:"gateway" 코드는 stocksCodeOf 로 null 을 기록한다(FK 위반으로 감사 행이 사라지는 것을 막는다). ws-order 테스트 ⑰ 이 수동·자동 두 경로를 증명한다 |
| T-cqj-07 | Repudiation (관측성) | GatewaySymbolMaster 실패 갈래 | low | mitigate | 모든 실패 갈래(parse, seq-gap, total-changed, overflow, count-mismatch, empty, timeout, send-false, cap)가 사유를 담은 [SYM-GW] 로그를 남긴다. 조용히 삼키는 catch 는 없다 |
| T-cqj-08 | Information Disclosure | 게이트웨이 ServerMessage(54) ERROR (OQ-3) | low | accept | 마스터 직렬화 실패는 드물다. 메시지는 사실이고 운반 세션 사용자에게만 간다. D-36(54 무해석 전달)을 유지한다 |

패키지 설치 없음(새 dependency 0개). 공급망(SC) 위협 해당 없음.
</threat_model>

<verification>
- Task 1~3 의 verify 명령이 각각 green 이다. 최종 게이트는 `pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test` 로 534 + 신규 전부 통과, 0 fail 이다.
- 추적탄 증명: gateway-symbols.test ① 이 FakeSession Ready → 27 되읽기 → tryParseEnvelope(화이트리스트) → hub 명시 case → 조립 → SymbolMap 폴백 → 66 보강까지 한 경로로 통과한다.
- Grep: `case MSG.SymbolMasterResp`(hub) 1줄, `fallback: gatewaySymbols`·`firstReady`·`refreshNames`·`gatewaySymbols.close()`(index.ts) 각 1줄, `stocksCodeOf(info)`(order-handler) 2줄.
- 계약 불변: `git diff --stat <Task 1 시작 HEAD> -- webapp packages/shared pnpm-lock.yaml` 는 비어 있다.
</verification>

<success_criteria>
- D-01: Supabase 행 단위 우선, 게이트웨이는 미스만(① ⑤).
- D-02/D-03: relay 전체 단일 in-flight, Ready·07:30 경계·재시도 트리거, 완료 시각 master-day 키(① ⑧ ⑨ ⑩).
- D-04: 분할 조립 네 조건, 원자 교체, 빈 마스터 무시, 타임아웃·backoff·상한, 전 갈래 로그(② ③ ⑦ ⑩ ⑪ ⑫).
- D-05: "0"/"1" 만 매핑, 나머지 null(④).
- D-06: 게이트웨이 코드는 dma_orders 에 쓰이지 않고 주문은 나간다(⑤ ⑰).
- D-07: 57 은 INBOUND 23종, OUT_OF_SCOPE 4종, 명시 case, 팬아웃 0, default 0(① codec/envelope 테스트).
- D-08: 교체 후 영향 행만 기존 프레임 모양으로 재방송, 합성 lc 없음, 멱등(⑭ ⑮ ⑯).
</success_criteria>

<output>
Create `.planning/quick/260923-cqj-relay-27-57-supabase-stocks/260923-cqj-SUMMARY.md` when done.

Commits: 태스크당 1건, main 트리 직접(worktree 없음). 한글 메시지 `feat(quick-260923-cqj): …` / `test(quick-260923-cqj): …`, Co-Authored-By 없음. 명시 경로만 stage 하고 push 하지 않는다.

SUMMARY 에 반드시 **배포 노트**를 담는다(이 plan 은 배포하지 않는다):
- relay 전용 변경이다. 배포는 **20:00 KST 이후에만** 한다 — relay 는 radar-gw VM 에서 돌고, 장 시간(08:00~20:00)에는 재기동이 금지다. `scripts/deploy-relay.sh` 로 배포하고, DMA_HOST 는 주입하지 않고 실행 중인 컨테이너 값을 보존한다.
- webapp·packages/shared·lockfile 변경이 없으므로 이 커밋들의 push 는 Vercel 빌드를 유발하지 않는다. 그래도 순서는 「relay 먼저 → 검증 → push」다.
- 배포 후 확인: 첫 사용자 Ready 에서 `[SYM-GW] 게이트웨이 종목마스터 요청` → 적재 로그(count 약 4,500, skipped 0 근처) → `/healthz` 200. 다음 날 07:30 KST 에 경계 요청 로그가 찍힌다. 상장 첫날 종목이 있으면 /trading 카드 머리와 사이드바에 이름이 뜨는지 UAT 로 본다(`[HUB] 보조 종목마스터 반영` 로그가 찍혔다면 재방송이 동작한 것이다).
- 롤백은 직전 relay 이미지로 재배포하면 된다(DB 변경 0).
</output>
