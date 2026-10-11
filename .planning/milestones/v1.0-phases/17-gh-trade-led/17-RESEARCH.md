# Phase 17: gh-trade 프로토콜 재동기화 · 기존 화면 보정 · 상따 래치 LED - Research

**Researched:** 2026-09-18
**Method:** gh-trade(`/Users/alex/repos/gh-trade`, HEAD `d7b80618`) 와 gh-radar 를 병렬 실측. 추측은 〔추측〕 표기. 이 문서는 planner 가 **재조사 없이** 쓰는 정본이다 — 줄 번호는 2026-09-18 실측.

## Summary

- relay 의 `relay/src/generated/**` 는 gh-trade `291a953`(2026-09-07) 시점. 그 뒤 `.fbs` 변경 15 커밋, **전부 append-only** — `server/scripts/expected-vtable.txt` diff 에 삭제/변경 행 0. 기존 파싱은 바이트 단위로 안전.
- 신규 요소가 gh-radar 에 존재하는 것은 **0건**(전 저장소 grep).
- 실제로 지금 잘못 동작하는 것: 76/77/78 이 `unknown-msg-type` **warn 드롭**(envelope.ts:457). 76 은 로그인 전 연결에도 KRX 20% 돌파마다 온다.
- 생성 스크립트 `sync-relay-schema.sh` 는 **gh-trade 소유**(`server/scripts/`), flatc `25.12.19` 고정, 로컬 `/opt/homebrew/bin/flatc` 가 그 버전.
- 실서버 10.41.1.120 배포: **`59f7513e` 2026-09-17 21:34** (gh-trade `.planning/STATE.md:276-283`).

## 1. gh-trade 와이어 변경 전표 (291a953 → HEAD)

### 1-1. 신규 MsgType

| # | 이름 | 방향 | 본문 슬롯 | 전송 | 근거(gh-trade) |
|---|---|---|---|---|---|
| 36 | `ArmSellLatchReq` | C→S | `get_strategy_req{key}` 재사용 | 응답 = `SetLimitChaserResp(60)` 에코(그 연결 즉답 + 점등 시 300ms 틱으로 전 연결), 실패 = `ServerMessage(54)` WARN | `StockDMA.fbs:50-52`, `server/docs/protocol.md:47` |
| 37 | `ArmCancelLatchReq` | C→S | 같음 | 같음 | `.fbs:55-57`, `protocol.md:48` |
| 38 | `ArmBuyLatchReq` | C→S | 같음 | 같음 | `.fbs:60-62`, `protocol.md:49` |
| 76 | `RateCrossAlert` | S→C | `Envelope.rate_cross_alert`(vtable 70) | **Broadcast 접속 연결 전부**(로그인 전 포함), 요청 짝·snapshot 플래그 없음 | `.fbs:109,1113`, `protocol.md:80,105-111` |
| 77 | `QueuedWindowState` | S→C | `Envelope.queued_window_state`(vtable 72) | 로그인 직후 그 연결 1프레임 + 창 마스크 전이마다 전 세션 Notice(1초 틱) | `.fbs:112-113,1116`, `protocol.md:81` |
| 78 | `RateCrossSnapshot` | S→C | `Envelope.rate_cross_snapshot`(vtable 74) | **로그인 성공 직후 그 연결에만** Notice 1프레임(빈 벡터도), 재로그인마다 | `.fbs:115-116,1119`, `protocol.md:82,113-118` |

- `key` 값(36/37/38) = 상따 전략 키 `ISIN:accountNo:exchange`(`GetLimitChaserReq 20` 과 동일). C# `Client.cs:785-811/832-858/883-909` 가 `GetStrategyReq.CreateGetStrategyReq(builder, keyOffset)` + `Envelope.CreateEnvelope(msg_type, get_strategy_reqOffset)`. 빈 키는 송신 취소(`Client.cs:788-793`). pending FIFO 에 넣지 않음(`Client.cs:779-784`).
- 세 요청은 **토글**(2026-09-10 결정). 서버 결과 enum `Armed/Disarmed/AlreadyLatched/NotArmed/NoPendingBuy/WrongSide`; 클릭 경로에서 `AlreadyLatched` 는 더 이상 안 나옴(`limit-chaser.md:1408-1414`). 무응답 갈래 없음.
- 서버 전제: 36 `IsSellArmed`; 37 `IsCancelArmed ∧ HasPendingBuy`; 38 `IsBuyArmed ∧ buyWatchSide=='1'`. **끄는 클릭은 전제 없음**(`limit-chaser.md:1025-1030`).

### 1-2. 테이블 말미 append (vtable 슬롯은 `expected-vtable.txt` 정본)

| 테이블.필드 | 슬롯 | 방향 | 타입 | 기본값·규약 | 근거 |
|---|---|---|---|---|---|
| `SetLimitChaser.cancel_entry_latched` | 94 | S→C 전용 | bool | 부재=false(잠복). 무장과 접지 않은 원값 | `.fbs:526-541` |
| `SetLimitChaser.buy_entry_latched` | 96 | S→C 전용 | bool | 부재=false. **매수잔량 기준(`buy_watch_side "1"`) 전용** — side "0" 은 언제나 false(BL-01) | `.fbs:543-564` |
| `SetVITrigger.exchange` | 14 | C↔S | string | ""/미지정 = KRX. VI 전략은 세션당 **거래소별 1건** | `.fbs:576-582` |
| `VIOrderNotice.exchange` | 24 | S→C | string | 빈 값=KRX | `.fbs:604-608` |
| `VIOrderItem.exchange` | 34 | S→C | string | 빈 값=KRX. R8 매칭은 ISIN+거래소 | `.fbs:958-963` |
| `GetStrategyReq.key` (의미 확장) | — | C→S | string | **`GetVITriggerReq(21)` 에서는 거래소 문자열** "KRX"/"NXT", 빈 값=KRX, 미상도 KRX 로 접음 | `.fbs:642-648`, `Gateway.cpp:2966-2989` |
| `UnfilledState.queued_status` | 24 | S→C | string | ""=일반 행. 값 있으면 **예약 요약 행**(order_no = `Q`+HHMMSS+3자리 = 10자). 문구 `예약대기/발사중/발사완료[ 미발주 N주]/발사 여부 불명/실패: 사유` — **클라는 표시만** | `.fbs:700-715` |
| `UnfilledState.pending_status` | 26 | S→C | string | ""=일반 행. `증권사 보관 · 09:00 처리`(NXT 08:00) 등 — 표시만 | `.fbs:717-723` |
| `UnfilledState.board` | 28 | S→C | string | "G2"/"G3" 만, 그 밖 "" | `.fbs:724-725` |
| `UnfilledState.pending_cancel_sent` | 30 | S→C | bool | 서버 원장 'X' 행만 true. **회색·취소 제외 판정의 유일한 원천** | `.fbs:727-731` |
| `OrderResp.board` | 28 | S→C | string | "G2"/"G3" 만 | `.fbs:269-272` |
| `OrderResp.request_kind` | 30 | S→C | string | "New"/"Modify"/"Cancel"/"". 행위 단어 원천. 804 정정·취소 거부는 서버가 `message` 를 `이미 체결·취소돼 취소(정정)할 잔량 없음` 으로 교체 | `.fbs:275-278`, `protocol.md:56` |
| `OrderResp.requester` | 32 | S→C | string | "Manual"/"". 표시 전용, origin 은 원주문 주체 | `.fbs:279-283` |
| `ServerMessage.source` (값 추가) | — | S→C | string | 기존 `SetLimitChaser/SetVITrigger/Account/System` + **`LimitChaser`·`VITrigger`**. 발주 세션에 INFO Broadcast, 100ms 틱 드레인·16칸 링 | `.fbs:338-342`, `Server.cpp:1755,1793-1815` |
| `QuoteState.krx_close_price` | 60 | S→C | long | 그날 KRX 정규장 G1 A6 종가. 오늘 아니면 0. **NXT 프레임에도 KRX 값**. 10행 `>0 → '종가'`, `0 → '하락VI'`, 벽시계 판정 금지 | `.fbs:875-878`, `protocol.md:92-94` |
| `TradeTapeEntry.bs_code` | 16 | S→C | string | '1' 매도 / '2' 매수 / 없음·낯선 값 = 색 없음 | `.fbs:889-891` |
| `DirectOrderReq.piece_count` | 24 | C→S | uint | 0/부재=1 (Phase 18) | `.fbs:166-174` |
| `DirectOrderReq.krx_session` | 26 | C→S | string | ""=자동 (Phase 18) | `.fbs:176-183` |
| `QueuedWindowState` 본문 | 4~14 | S→C | — | `open, max_pieces, preopen_open, g2_open, g3_open, nxt_preopen_open` 전부 표시 힌트 | `.fbs:773-793` |
| `RateCrossAlert` 본문 | 4~18 | S→C | — | `isin, exchange, last_price, change_rate(double %), threshold_pct, base_price, exchange_time(12자), server_time("HH:MM:SS")` | `.fbs:1000-1019` |
| `RateCrossSnapshot.items` | 4 | S→C | [RateCrossAlert] | above 집합 전부, exchange_time↑·isin↑ 정렬, 임계−2%p 이상 원소 포함 가능 | `.fbs:1021-1045` |

- 스냅샷 원소 의미 차이: `last_price/change_rate/base_price` = 마지막 판정 A3, `exchange_time` = above 구간을 연 A3(또는 장중 기동 시드 A3).
- `sell_entry_latched`(슬롯 82)·`cancel_qty_track_baseline`(92)은 291a953 이전부터 존재.
- 문서 불일치 주의: `.fbs:781` 은 예약창 [15:20,16:00), `docs/features/queued-order.md:19` 는 15:30 시작 — relay 는 `open` 플래그만 믿는다.

### 1-3. 구 클라(=현재 relay)에 대한 서버 동작

- 그냥 무시되는 것: 말미 append 전부(안 읽으면 그만), `piece_count/krx_session` 미송신(바이트 무변경), 21 빈 키(=KRX).
- 손대야 할 것: ① 76/77/78 수신(현재 warn 드롭 — 연결은 유지되므로 "깨짐" 은 로그 소음·기능 부재), ② `OrderResp.message` 파싱 금지(현재 relay `order/notice-status.ts:43-69` 는 `noticeType`/`resultCode` 만 본다 — 안전), ③ 상따 사유 줄·부분체결 조각 매도로 54·51 볼륨 증가, ④ 미체결에 Q-ID 행·접수대기 행 혼입, ⑤ 21 KRX 만 조회, ⑥ NXT 프레임의 `krx_close_price` 는 KRX 종가.

## 2. 상따 래치 LED — C# 정본 규칙 (그대로 이식)

색: `Gray`(무장 아님) / `DarkOrange`(잠복) / `LimeGreen`(래치 ON). 클릭 = 토글, 확인 다이얼로그 없음, 판정 근거 = `_lastApplied` 서버 스냅샷.

```
// client/Forms/Trading/LimitChaserForm.cs
// 매수 ShowBuyServerQty :1027-1062
armed = s?.BuyEnabled; bidSide = armed && s.BuyWatchSide == Bid   // == buy_watch_side "1"
!armed → Gray | !bidSide → LimeGreen(2단계 유지, 클릭 불가) | !BuyEntryLatched → DarkOrange | else LimeGreen
clickable = bidSide
// 매도 UpdateSellLatchLabel :4246-4283
s==null → Gray·불가·툴팁 없음 | !SellEnabled → Gray | !SellEntryLatched → DarkOrange | else LimeGreen ; clickable = SellEnabled
// 취소 UpdateCancelLatchLed :4342-4378
armed = CancelQtyEnabled || CancelTradeEnabled   // cancel_qty_track_enabled 제외
!armed → Gray | !CancelEntryLatched → DarkOrange | else LimeGreen ; clickable = armed
// 클릭 ledSell_Click :4300 / ledCancel_Click :4396 / ledBuy_Click :4443 — 가드 후 SendArm*Latch(MyKey())
```

툴팁(C# 원문, 그대로 사용):
- 매수 켜기: `클릭하면 매수 진입 확인 래치를 지금 켠다 (다음 호가부터 잔량 항 판정 — 벽이 이미 감시수량 이상이면 바로 매수 주문이 나갈 수 있다)`
- 매수 끄기: `클릭하면 매수 진입 확인 래치를 끈다 (다시 잠복 — 감시가 매수잔량이 감시수량 아래로 내려간 것을 다시 관측해야 잔량 항 판정이 시작된다)`
- 매수 매도잔량 기준: `매수 진입 확인 래치는 매수잔량 기준(매수1호가)일 때만 있다 — 매도잔량 기준 갈래는 원전 그대로라 등록 즉시 판정한다`
- 매도/취소는 동형 문구(`limit-chaser.md:2432-2470`).

의미(참고): 매도 잔량 래치 = `sellWatchPrice == bid1Price ∧ sellWatchQty < bid1Qty` 관측 시 점등, 재제출·Deactivate 가 푼다. 취소 래치 = 매수1호가 지지벽 관측, 브로커 'A'·재제출·비활성화·새 매수 발주·취소완료·전량체결이 푼다. 매수 래치 = `감시가 매수잔량 < 감시수량` 관측(2갈래), 재제출·Deactivate 가 푼다. 매도 **가격 래치**는 와이어에 없다(잔량 OFF ∧ 가격 ON 정상).

서버 거부 문구 8종은 `17-CONTEXT.md` <specifics> 참조.

## 3. gh-radar 편집 지점 (경로:줄, 실측)

### 3-1. 생성물·수기 사본 (relay)

| 파일 | 현재 | 할 일 |
|---|---|---|
| `relay/src/generated/**` (42파일) | 291a953 | `RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh` (gh-trade `server/` 에서). `startObject` 예상: set-limit-chaser 45→47, unfilled-state 10→14, order-resp 12→15, quote-state 28→29, trade-tape-entry 6→7, direct-order-req 10→12, set-vitrigger 5→6, viorder-notice 10→11, viorder-item 15→16, envelope 33→36 슬롯, 신규 `rate-cross-alert.ts`·`rate-cross-snapshot.ts`·`queued-window-state.ts` |
| `relay/src/dma/msg-type.ts` | `MSG` 34종(:74~), `INBOUND_MSG_TYPES` 19종(:157), `OUT_OF_SCOPE_INBOUND_MSG_TYPES` {57,68,70,74,75} | `MSG` +36/37/38/76/77/78, `INBOUND` +76/77/78. 상단 주석 PC-12 규율 |
| `relay/src/dma/envelope.ts` (1941줄) | `tryParseEnvelope`:433-462(화이트리스트 드롭), `parseQuoteState`:471-515, `parseTradeTape`:523-547, `buildDirectOrderReq`:793, `buildSetLimitChaserReq`:930-1028(S→C 전용 주석 :1017), `buildBareRequest`:1176, `buildGetVITriggerReq`:1193(빈 Envelope), `parseOrderResp`:1283-1327, `parseAccountState`:1429 / 미체결 :1499-1510, `readLimitChaser`:1613-1687(`sellEntryLatched` :1668), `parseViTrigger`:1757-1793(`VI_PRICE_TYPE="U"` :1034), `parseViOrderList`:1819-1886, `parseViOrderNotice`:1893-1920 | 신규 조립기 `buildArmLatchReq(msgType, key)`(get_strategy_req.key 채움), `buildGetVITriggerReq(exchange)`; 신규 파서 `parseRateCrossAlert`(76)·`parseRateCrossSnapshot`(78)·`parseQueuedWindowState`(77); 기존 파서 필드 추가 7곳 |
| `relay/src/hub/subscription-hub.ts` | switch `:545-640`(default 무동작), `requestStrategySnapshot`:428-440(24/21/34 각 1회), `#viTriggers: Map<userId, cfg|null>`:261, `#onViOrderList`:806-826, `viOrderKey`:204(주문번호 또는 `@isin:acct:trigger`), `getLimitChasers`/`getViTrigger`/`getViOrders`:464-491 | case 76/77/78 + 세션 캐시(above 집합·최신 77) + getter; 21 을 KRX/NXT 2회 + 요청 거래소 FIFO; `#viTriggers` 를 거래소별로; `viOrderKey`/`viPendingKey` 에 exchange 포함 |
| `relay/src/ws/fanout.ts` | 인바운드 분기 `:606-651`(`lc.set` 4단 가드), 인증 스냅샷 `:562-570`(`lc.snap`·`vi`·`vi.list`) | `lc.arm` 분기(가드 동형 → `buildArmLatchReq`), 스냅샷에 `vi`×2·`rate.cross.snap`·`queued.window` 추가 |
| `relay/src/ws/protocol.ts` | zod: `orderNo` `min(1).max(10)`:178, `orgOrderNo` `min(1)`:224 (Q-ID 10자 통과 가능 — 형식 제한 없음, 확인됨), `RelayInboundSchema` 9종 | `RelayLcArmSchema` 추가, `vi.set` 에 `exchange` optional |
| `relay/src/order/notice-status.ts` | `noticeType`/`resultCode` 만 해석(:43-69) — message 미파싱 | 변경 불필요(확인만) |
| `relay/src/store/orders.ts` | origin manual/limit_chaser/vi | `requester` 는 저장하지 않음(표시 전용) |

### 3-2. 계약 (`packages/shared/src/relay.ts`, 936줄 — 3자 공유 정본)

| 타입 | 줄 | 추가 |
|---|---|---|
| `RelayLimitChaser` | :129 | `cancelEntryLatched: boolean`, `buyEntryLatched: boolean` |
| `RelayViTrigger` | :288 | `exchange: "KRX"\|"NXT"` |
| `RelayViOrderItem` | :317 | `exchange` |
| `RelayInbound` | :454 | `RelayLcArmMsg {t:"lc.arm", key, latch:"sell"\|"cancel"\|"buy"}`; `RelayViSetMsg` 에 `exchange?` |
| `RelayQuote` | :510 | `kc: number` |
| `RelayTapeEntry` | :553 | `bs: ""\|"1"\|"2"` |
| `RelayUnfilled` | :600-625 | `orderTime, queuedStatus, pendingStatus, board, pendingCancelSent` |
| `RelayOrderMsg` | :656 | `bd?, rk?, rq?` (side/isin 미탑재 규율 유지) |
| `RelayServerMsg.src` | :687 (`string`) | 어휘 주석에 `LimitChaser`/`VITrigger` |
| `RelayViMsg` | :716 | `x: "KRX"\|"NXT"` |
| `RelayViNoticeMsg` | :730 | `exchange` |
| `RelayOutbound` | :790 | `rate.cross`·`rate.cross.snap`·`queued.window` 3종 |
| 신규 | — | `sideDisplayText()` 순수함수, `mergeOrderNotices()`(위치 재량) |

### 3-3. webapp

| 표면 | 파일:줄 | 현재 | 할 일 |
|---|---|---|---|
| ws 리듀서 | `webapp/src/lib/use-relay-socket.ts:348 applyFrame` (`msg` :398 `MAX_MESSAGES`, `order` :396 `MAX_ORDERS`, `lc` :404) | unknown `t` 는 default 무시 | case `rate.cross`/`rate.cross.snap`/`queued.window`(상태 보관만), `vi` 거래소별 |
| 상따 상태줄 | `components/trading/limit-chaser-client.tsx:989-1051` (「무장」/「발주 완료 · 무장 해제」), 폼 `:779` (`sellEntryLatched` 로 기준선 표시), 로그 푸시 `:400-413` | 래치 sell 만 | LED 3종 컴포넌트 + `lc.arm` 전송 |
| 전략 로그 | `components/trading/strategy-log.tsx:56-165` (전이 12종, `sellLatched` :79/:158, `valuesChanged` skip :110-124) | — | 전이 +4, skip +2, `[상따]/[VI]` 배지 |
| 배지 | `components/trading/strategy-badge.tsx:126-146 strategyBadgesOf` | `매도감시` 등 | 무변경(D-23) |
| 서버 메시지 표시 | `components/orderbook/relay-status-bar.tsx:157-176`(`VISIBLE_MESSAGES`), `limit-chaser-client.tsx:400-413`, `vi-client.tsx` | `src` 미표시〔추측〕 | 배지 동등 비교 |
| 체결 테이프 | `components/orderbook/trade-tape.tsx` — `deriveTapeSides` :125-155, 수량 색 :398, sr-only :401, 고지 :416 | 추정 | `bs` 우선, 폴백 시만 「추정」 |
| 호가 종목정보 | `components/stock/stock-orderbook-section.tsx:362` (`{fmt(quote?.viu)} / {fmt(quote?.vid)}`), `lib/quote-format.ts`, 상따 헤더 10칸 `limit-chaser-client.tsx` | `vid` | `kc>0 → '종가'` |
| 미체결 | `components/orderbook/account-panel.tsx` (`orderNo`:501, SideTag :505, 취소 판정 :239, `order.cancel` :282), `trading/vi-client.tsx:136-170` | 9필드 | 표식 헬퍼·회색·취소 숨김·상태 문구 |
| 주문 통보 | `components/trading/today-orders-card.tsx`(`RelayOrderMsg` 병합 :110-141), `lib/orders-api.ts mergeTodayOrders` | 8필드 | 행위 단어·수동·시간외종가·묶기 |
| VI | `components/trading/vi-settings-card.tsx:10,81,833`(「KRX」 고정 캡션), `vi-order-list.tsx`(거래소 열 없음), `vi-client.tsx:74-78,132-147`(미체결 거래소 필터만) | KRX 고정 | 캡션 정정·`exchange:"KRX"` 송신·거래소 열·행 키 |
| 스타일 | `webapp/src/styles/globals.css` §2.2b(L128-207) 4밴드 | — | LED 토큰(없으면 `--led-latent/--led-armed` 라이트·다크) |
| UI 프리미티브 | `components/ui/tooltip.tsx` 존재(shadcn) | — | LED 툴팁에 사용 |

### 3-4. 테스트

- relay: `relay/src/dma/__tests__/envelope.test.ts`(MSG↔enum 대조 — 재동기화 직후 먼저 깨짐, 의도), `relay/tests/helpers/frames.ts`(빌더 12종, `STRATEGY_MSG` 는 생성 enum 파생 :446), `relay/tests/helpers/fake-gateway.ts`(`readQuoteRequestKey`:221 · `readViSetRequest`:261 · `readViConfirmRequest`:283 · `sendGarbage`·`UNKNOWN_MSG_TYPE`:470), `relay/tests/strategy-hub.test.ts`(Ready 프리페치 24/21/34 각 1회 단언 → 21 은 2회로 갱신), `ws-order.test.ts`, `protocol.test.ts`.
- webapp: `components/trading/__tests__/{limit-chaser-client,limit-chaser-form(sellEntryLatched :349/:394),strategy-log,strategy-badge,vi-order-list,vi-settings-card,today-orders-card}.test.tsx`, `components/orderbook/__tests__/{trade-tape,account-panel,orderbook-ladder}.test.tsx`, `components/layout/__tests__/app-sidebar.test.tsx:97`(픽스처에 `sellEntryLatched:false` — 새 필드 추가 시 픽스처 갱신), e2e `webapp/e2e/specs/trading-limit-chaser.spec.ts`·`trading-vi.spec.ts`·`orderbook.spec.ts`.
- 명령: `pnpm --filter @gh-radar/relay test` / `run typecheck` / `run typecheck:tests`; webapp 은 `dev.sh` 기준(PORT 3100).

### 3-5. 배포

- relay: `scripts/deploy-relay.sh`(AR push → IAP SSH → docker run, `DMA_HOST` 3단 우선순위 보존, `/healthz` 폴링). VM `radar-gw`(asia-northeast3-a, `dma.jx1.io`). `scripts/smoke-relay.sh`(INV-9 는 `SMOKE_AUTH_TOKEN` 부재로 프로덕션 미실행 이력).
- webapp: Vercel(메모리 `reference_vercel_frontend_deploy` — ignoreCommand 함정, 수동 배포 절차).
- server: shared 타입만 바뀌면 생략 가능(16-46 선례) — diff 로 판단.
- 시점: 장 시간 08:00~20:00 밖(메모리 `project_market_hours_0800_2000`).

## 4. Common Pitfalls (이 phase 전용)

1. **`INBOUND_MSG_TYPES` 누락** → 76/77/78 이 조용히 드롭되고 25~55초 주기 74/75 debug 로그에 묻힌다. Hub `default:` 는 「조용히 떨어지는 프레임 0」을 전제.
2. **`get_strategy_req` 슬롯을 채운 조립기가 없다** — `buildBareRequest` 로 36/37/38 을 보내면 서버가 `등록된 상따 전략이 없습니다` 로 거부.
3. **빈 61 에는 거래소가 없다** — 21 을 2회 보내면 응답 귀속에 요청 순서 FIFO 가 필요. 60 에코는 본문에 키가 있어 FIFO 불필요(넣으면 head 를 아무도 안 꺼내 다음 빈 응답이 옛 키로 귀속되는 회귀).
4. **매수 LED 3단계를 side "0" 에 그리면 거짓** — 서버가 그 갈래 래치를 켜지 않아 언제나 false.
5. **취소 무장 판정에 `cancelQtyTrackEnabled` 를 넣지 말 것.**
6. **`pending_status` 문구로 회색/취소 제외를 판정하지 말 것** — `pending_cancel_sent` bool 하나(gh-trade 교훈 24).
7. **`OrderResp.message` 파싱 금지** — 804 거부 문구가 서버에서 교체됨.
8. **매수 접수는 묶지 않는다** — 취소 직후 재매수가 앞 줄에 합쳐지면 취소된 수량이 더해져 보임(2026-09-17 결정).
9. **worktree 에서 sync 스크립트 실행 시 `RELAY=` 미지정** → 메인 체크아웃에 써 버림(16-01-SUMMARY:37,91,102).
10. **`app-sidebar.test.tsx` 픽스처** 등 `RelayLimitChaser` 리터럴 픽스처는 필드 추가로 타입 에러 — 픽스처 팩토리가 있으면 그것을, 없으면 각 픽스처 갱신.
11. **컨테이너 쿼리 안에서 `position:fixed`** — 상따 본문은 layout containment 라 포털 필요(§2.2b L171-175). LED 툴팁이 Radix Portal 이면 문제 없음.
12. **`msg` 볼륨** — 상따 사유 줄이 100ms 드레인으로 늘어난다. `MAX_MESSAGES` 상한과 `pushLog` 경로가 O(n) 이상이면 확인.

## 5. Suggested Plan Decomposition (planner 참고)

1. **17-01 스키마 재동기화 + MSG 화이트리스트 + 파서 필드 추가**(래치 2·미체결 5·주문통보 3·호가 1·테이프 1·VI exchange 3) + shared 타입 — 테스트 대조 갱신. (relay·shared)
2. **17-02 신규 푸시 3종**(76/77/78 파서·hub 캐시·인증 스냅샷·프레임) + fake-gateway 빌더. (relay·shared·webapp 리듀서 보관)
3. **17-03 래치 수동 점등 경로** `lc.arm` (zod·fanout 가드·`buildArmLatchReq`·fake-gateway 리더·ws 왕복 테스트). (relay·shared)
4. **17-04 VI 거래소 축** (21 2회+FIFO·캐시 거래소별·`vi` 프레임·`vi.set` exchange·webapp 캡션/열/키). (relay·shared·webapp)
5. **17-05 상따 LED 3종 UI** + 전략 로그 전이 + 토큰 + 테스트 + dev 스크린샷. (webapp)
6. **17-06 기존 화면 보정 A** — 체결테이프 `bs`·호가 10칸 `kc`. (webapp)
7. **17-07 기존 화면 보정 B** — 미체결 표식 헬퍼·회색·취소 숨김·상태 문구, 주문통보 행위 단어·수동·시간외종가, 통보 묶기, `[상따]/[VI]` 배지. (shared·webapp)
8. **17-08 실기 검증·배포** — mock 게이트웨이 드롭 카운터 0·LED 왕복, 전량 게이트, REQUIREMENTS/ROADMAP/STATE 갱신, relay→webapp 배포(사용자 확인·20:00 후), smoke.

## Sources

- gh-trade: `server/src/protocol/StockDMA.fbs`, `server/docs/protocol.md`, `server/scripts/expected-vtable.txt`, `server/scripts/sync-relay-schema.sh`, `docs/strategy/limit-chaser.md`, `docs/strategy/vi-trigger.md`, `docs/trading-rules.md`, `docs/features/{rate-cross-alert,queued-order,preopen-offhours-order}.md`, `client/CLAUDE.md:243-253`, `client/Forms/Trading/LimitChaserForm.cs`, `client/Services/DMA/{Client,NotificationHub,DMABroker}.cs`, `.planning/STATE.md:276-283`.
- gh-radar: 위 §3 표의 파일들, `.planning/phases/16-*/16-{CONTEXT,RESEARCH}.md`, `relay/README.md`, `tasks/lessons.md`.

---
*Phase: 17-gh-trade-led · Researched: 2026-09-18*
