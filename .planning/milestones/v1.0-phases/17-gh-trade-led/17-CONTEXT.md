# Phase 17: gh-trade 프로토콜 재동기화 · 기존 화면 보정 · 상따 래치 LED - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning
**Source:** 사용자 요청("gh-trade 프로토콜·로직 변경을 gh-radar 와 VM 게이트웨이(relay)에 반영, 특히 시세·거래 로직, 상따 매수/매도/취소 래치 LED") + 조사 2건(gh-trade 291a953→HEAD 변경, gh-radar 소비처). 사용자는 범위 A+B+C 전부를 택했고, C(신규 화면 3개)는 Phase 18 로 분리했다.

<domain>
## Phase Boundary

gh-trade 서버 스키마가 relay 마지막 동기화(`291a953`, 2026-09-08) 이후 **append-only 로 15 커밋** 바뀌었다(실서버 10.41.1.120 은 2026-09-17 21:34 `59f7513e` 배포). 기존 필드 슬롯 변경은 0건이라 relay 의 현재 디코딩은 깨지지 않지만, 서버가 이미 보내는 진실이 웹에 드러나지 않고 신규 푸시 3종은 `unknown-msg-type` warn 으로 드롭된다.

이 phase 가 하는 것:

1. **스키마 재동기화** — gh-trade `server/scripts/sync-relay-schema.sh`(flatc 25.12.19) 로 `relay/src/generated/**` 재생성. 수기 사본 3곳(`msg-type.ts` · `envelope.ts` · `subscription-hub.ts`) 에 신규 MsgType 36/37/38(C→S)·76/77/78(S→C) 등록.
2. **신규 푸시 3종 중계** — 76 `RateCrossAlert` · 77 `QueuedWindowState` · 78 `RateCrossSnapshot` 을 파싱해 브라우저 프레임으로 내리고, relay 세션 캐시에 보관해 브라우저 인증 직후 스냅샷을 준다. **웹 UI 는 만들지 않는다**(Phase 18). 드롭 경고 0 이 목표.
3. **기존 화면에 새 필드 반영** — 체결테이프 `bs_code` 실값 색 · 호가 종목정보 10칸 `krx_close_price>0 → '종가'` · 미체결 `queued_status/pending_status/board/pending_cancel_sent(+order_time)` 표식과 취소 제외 · 주문통보 `request_kind/requester/board` · `ServerMessage.source` 새 값 `[상따]/[VI]` 배지 · 통보 묶기(3초 창) · VI `exchange` 축(파싱·전송·KRX/NXT 양쪽 조회·거래소 열).
4. **상따 3단계 래치 LED 3종 + 수동 점등** — `sell/cancel/buy_entry_latched` 를 C# 정본 규칙 그대로 LED(회색/주황/초록)로 그리고, 클릭 토글로 `ArmSellLatchReq 36 / ArmCancelLatchReq 37 / ArmBuyLatchReq 38` 을 보낸다.

**밖 (Phase 18):** 돌파감지 목록 UI(76/78), 예약/장전/시간외종가 발주 UI(77 + `DirectOrderReq.piece_count/krx_session` 송신), NXT VI 전략 설정 카드. gh-trade 서버·클라 변경(없음 — 게이트웨이는 relay 를 클라 하나로 본다).

**Requirements:** 신규 등록 — **TRADE-04**(프로토콜 재동기화 + 신규 푸시 중계 + 기존 화면 보정), **TRADE-05**(상따 래치 LED 3종 + 수동 점등). plan 단계에서 REQUIREMENTS.md 갱신(Phase 16 선례).

**순서:** 본 문서 → `/gsd-plan-phase 17` → execute → relay(VM radar-gw, `scripts/deploy-relay.sh`) → webapp(Vercel) 배포 → smoke. 배포는 장 마감(20:00 KST) 이후, 사용자 확인 후.

</domain>

<decisions>
## Implementation Decisions

### 스키마·프로토콜 층 (relay)
- **D-01 생성물은 스크립트로만.** `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh` (worktree 에서 실행 시 `RELAY=` 를 반드시 지정 — 기본값이 메인 체크아웃). 반영 뒤 `--check` 로 차이 0 확인. `relay/src/generated/**` 손편집 금지(T-16-05). gh-trade 저장소는 건드리지 않는다(스크립트는 gh-radar 쪽에만 쓴다).
- **D-02 화이트리스트 명시 등록.** `msg-type.ts` `MSG` 에 36/37/38/76/77/78 추가, `INBOUND_MSG_TYPES` 에 76/77/78 추가, `subscription-hub.ts` switch 에 명시 `case` 3개(PC-12: 넓힌 만큼 명시 case). `envelope.test.ts` 의 MSG↔생성 enum 대조가 먼저 깨지는 것이 의도된 알람.
- **D-03 신규 푸시 3종의 브라우저 프레임.** `{t:"rate.cross", item}`(76) · `{t:"rate.cross.snap", items}`(78) · `{t:"queued.window", ...6 bool/uint}`(77). 필드는 fbs 그대로(isin, exchange, lastPrice, changeRate, thresholdPct, basePrice, exchangeTime, serverTime). relay **세션 캐시**: 78 수신 시 above 집합을 교체, 76 수신 시 upsert(원소 순서 = exchangeTime 오름차순·isin), 77 은 최신 1건 보관. 브라우저 wss 인증 직후 D-12(Phase 16) 전략 스냅샷과 같은 자리에서 `rate.cross.snap` + `queued.window` 를 내린다. 76 은 **로그인 전 연결에도 온다** — 세션 Ready 전 프레임은 캐시만 하고 팬아웃은 Ready 뒤(기존 규율). 하루 1회 규칙·임계−2%p 이탈 삭제는 클라(Phase 18) 몫 — relay 는 서버 above 집합을 그대로 보관한다(서버 재무장 폭 2%p 와 동일).
- **D-04 래치 수동 점등 인바운드.** `{t:"lc.arm", key, latch:"sell"|"cancel"|"buy"}` → `Envelope{msg_type=36|37|38, get_strategy_req={key}}`. `key` = 상따 전략 키 `ISIN:accountNo:exchange`(`GetLimitChaserReq 20` 과 같은 값). relay 가드는 `lc.set` 과 동형: Ready 세션 · key 형식 · accountNo ∈ 세션 계좌. **빈 키는 보내지 않는다.** pending-key FIFO 에 넣지 않는다(응답이 본문 있는 60 에코라 에코 안의 키로 귀속). 응답은 기존 `lc` 경로 그대로, 실패는 `ServerMessage(54)` 한글 사유가 기존 `msg` 경로로 내려온다 — 별도 ack 프레임 없음. 요청은 **토글**이다(서버가 현재 래치값을 보고 켜거나 끈다).
- **D-05 `readLimitChaser` 에 `cancelEntryLatched`·`buyEntryLatched` 추가.** S→C 전용이라 `buildSetLimitChaserReq` 는 보내지 않는다(sell 과 같은 규율). 값은 무장과 접지 않은 **원값**을 그대로 넘긴다.
- **D-06 VI 거래소 축.** `parseViTrigger`(61)·`parseViOrderNotice`(56)·`parseViOrderList`(72/73) 가 `exchange` 를 읽고 빈 값은 `"KRX"` 로 정규화. `buildSetVITriggerReq` 는 `exchange` 를 실어 보낸다(webapp 미지정 = "KRX"). Ready 프리페치의 `GetVITriggerReq(21)` 은 `get_strategy_req.key="KRX"` 와 `"NXT"` **2회** 보내고, 빈 61(그 거래소 미등록)은 거래소 정보가 없으므로 relay 가 **21 요청 거래소 FIFO** 로 귀속한다(C# `_pendingViGets` 동형). 세션 캐시와 `{t:"vi"}` 프레임은 거래소별: `{t:"vi", x:"KRX"|"NXT", cfg|null}`. 브라우저 인증 스냅샷도 두 거래소 모두. VI 주문 행 상관 키는 ISIN+거래소(같은 종목이 양쪽에서 발동하면 행 둘).
- **D-07 미체결 파서 확장.** `RelayUnfilled` 에 `orderTime`(현행 스키마에 있으나 미소비) · `queuedStatus` · `pendingStatus` · `board` · `pendingCancelSent` 추가. **Q-ID 주문번호(`Q`+9자, 첫 글자 영문)** 가 relay 의 주문번호 가드·`order.cancel` zod 를 통과하는지 확인하고 막혀 있으면 허용한다(예약 요약 행의 취소는 원주문번호 = Q-ID 로 나간다). `pendingCancelSent=true` 행은 relay `order.cancel` 에서 **거부하지 않는다**(서버가 브로커 앞에서 R 로 답한다 — 이중 판정 금지) — 화면이 취소 버튼을 감추는 것으로 충분.
- **D-08 주문통보 확장.** `ParsedOrderResp` 와 `RelayOrderMsg` 에 `board`·`requestKind`·`requester` 추가(와이어 키 `bd`/`rk`/`rq`, 빈 값 생략 가능). **`message` 문구는 어디서도 파싱하지 않는다** — 정정·취소 804 거부는 서버가 문구를 교체한다. `order/notice-status.ts` 가 문구를 보고 있으면 `request_kind`/`notice_type` 으로 바꾼다. `dma_orders.origin` 은 원주문 주체 그대로(`requester` 는 표시 전용, D-03 gh-trade). `side` 를 싣지 않는 기존 규율(Pitfall 8)은 유지.
- **D-09 `ServerMessage.source` 새 값.** shared 의 `src` 어휘에 `"LimitChaser"`·`"VITrigger"` 추가. 판정은 **동등 비교**만(자유문 해석 금지). 상따 사유 줄이 100ms 드레인으로 훨씬 많이 오므로 webapp 로그 상한·백프레셔 경로가 그대로 견디는지 확인.
- **D-10 체결테이프.** `RelayTapeEntry` 에 `bs`(`"1"` 매도 · `"2"` 매수 · `""` 미상) 추가. `trade-tape.tsx` 는 `bs` 가 있으면 그 값으로 매수/매도 색·sr-only 텍스트를 정하고, `""` 인 원소만 기존 `deriveTapeSides` 추정으로 폴백한다. 하단 고지 문구는 "서버 체결구분" 기준으로 바꾸고 폴백 사용 시에만 「추정」을 붙인다.
- **D-11 KRX 종가 표기(2026-09-18 개정 — 실측 후 사용자 결정).** `RelayQuote` 에 `kc`(krx_close_price) 추가. ① **호가 종목정보**(종목 상세 `stock-orderbook-section`, 하락VI 항목이 있는 곳): `kc > 0` 이면 하락VI 자리를 라벨 `'종가'` + 값 `kc` 로, 0 이면 종전 표기. ② **상따 헤더 10칸**(기준·시가·고가·저가·상한·하한·상승VI·거래·시총·발행1% — 하락VI 칸 없음): **배치 유지, `하한` 칸을 `kc > 0` 이면 `'종가'` 로 대체**, 0 이면 `하한`. 어느 쪽도 **벽시계로 판정하지 않고 0 도 권위값**(같은 값이면 no-op). NXT 프레임에도 KRX 종가가 실리므로 라벨은 그대로 '종가'(C# 동일). 칸 수가 바뀌지 않으므로 §2.2b 밴드 경계 재측정 불필요.
- **D-12 `DirectOrderReq.piece_count/krx_session` 은 이번에 보내지 않는다.** 미송신 = 기존 수동주문 경로 바이트 무변경. Phase 18.

### 화면 층 (webapp)
- **D-13 미체결 표식 헬퍼 하나.** `packages/shared` 에 `sideDisplayText(side, orderNo, pendingStatus, board)` 를 두고 C# `NotificationHub.SideDisplayText` 동형으로 `매수Q`(Q-ID) · `매수P`(pendingStatus 비어 있지 않음) · `매수/종가`(board G2/G3) 접미를 만든다. `account-panel`·`vi-client` 미체결 표 모두 이 함수만 쓴다(인라인 접미 금지). `queuedStatus`/`pendingStatus` 문구는 **서버가 준 그대로 표시만**(툴팁 또는 보조 열) — 클라가 대기/발사중/완료를 다시 계산하지 않는다.
- **D-14 취소보관 행.** `pendingCancelSent === true` 행은 회색 글자 + 취소 버튼 숨김. **판정 근거는 이 bool 하나** — `pendingStatus` 문구 비교 금지(gh-trade 교훈 24). `vi-client` 의 미체결 취소도 같은 규칙.
- **D-15 주문통보 표시(today-orders-card 등).** 행위 단어: `noticeType==="C"` → 취소, `"M"` → 정정, 아니면 `requestKind` Cancel/Modify → 취소/정정, 아니면 side 단어. 취소·정정은 방향색 없음. `requester==="Manual"` → 「수동」 메타. `board` G2/G3 → 「시간외종가 」 접두(접수·체결·거부는 `시간외종가 매수`, 취소·정정 확인은 `시간외종가` 만).
- **D-16 통보 묶기(3초 창).** 전략 로그/주문 통보 표면에서 C# `MergeKeyOf` 동형: **체결**은 자동주문(원주체 상따·VI ∧ 수동 아님) 을 `origin|ISIN|exchange|side` 로, 수동·미상은 주문번호로; **접수**는 자동주문의 **매도 접수만** 묶는다(매수 접수는 묶지 않는다 — 취소 직후 재매수가 앞 줄에 합쳐지면 이미 취소된 수량이 더해져 보임). 거부·취소·정정·서버 줄은 묶지 않는다. 첫 시각 유지, `#첫번호~끝번호`, `(N건)`. 부분체결 조각 매도(quick-260916-fq3)로 통보가 조각 수만큼 쏟아지는 것을 막기 위함. 표면이 하나가 아니면 순수함수 하나(`mergeOrderNotices`)로 두고 각 표면이 호출.
- **D-17 서버 메시지 배지.** `src==="LimitChaser"` → `[상따]`, `"VITrigger"` → `[VI]`, 그 밖 → `[서버]`. 기존 `msg` 표시 표면(전략 로그·상태바 등, planner 가 실측) 에 적용.
- **D-18 VI 화면(Phase 17 범위).** `vi-settings-card` 는 KRX 설정 편집을 유지하되 캡션은 사실대로("KRX 설정 · NXT 는 Phase 18") 하고 `vi.set` 에 `exchange:"KRX"` 를 싣는다. `vi-order-list` 에 거래소 열 추가, 행 키 ISIN+거래소. `vi.notice` 에 거래소 표시. 사이드바/My page 의 VI 가동 배지는 KRX·NXT 어느 쪽이든 run 이면 가동.

### 상따 래치 LED 3종 (webapp `/trading/limit-chaser`)
- **D-19 색·단계 규칙은 C# 정본 그대로** (`docs/strategy/limit-chaser.md` §10, `LimitChaserForm.cs`):
  - 매도 LED: `!sellEnabled` → 회색 / `sellEnabled ∧ !sellEntryLatched` → 주황(잠복) / `sellEnabled ∧ sellEntryLatched` → 초록(감시 중). 클릭 가능 = `sellEnabled`.
  - 취소 LED: 무장 = `cancelQtyEnabled || cancelTradeEnabled` (**`cancelQtyTrackEnabled` 는 넣지 않는다**). `!무장` → 회색 / `무장 ∧ !cancelEntryLatched` → 주황 / `무장 ∧ cancelEntryLatched` → 초록. 클릭 가능 = 무장.
  - 매수 LED: `!buyEnabled` → 회색 / `buyEnabled ∧ buyWatchSide !== "1"`(매도잔량 기준) → **초록 2단계 유지·클릭 불가** / `buyEnabled ∧ side "1" ∧ !buyEntryLatched` → 주황 / `… ∧ buyEntryLatched` → 초록. 클릭 가능 = `buyEnabled ∧ side "1"`.
  - 서버 전략이 없으면(`server == null`) 세 LED 전부 회색·클릭 불가·툴팁 없음.
- **D-20 판정 근거는 마지막 서버 에코 스냅샷**(`server` 객체)이지 LED 색이나 폼 더티값이 아니다. 클릭은 확인 다이얼로그 없이 즉시 `lc.arm` 1건. 무반응 조건(회색, 매수의 매도잔량 기준)에서는 보내지 않는다. 결과는 60 에코가 LED 색으로 말하고, 실패는 서버 메시지(`[상따]` 배지 없이 WARN 문구 그대로)로 표시.
- **D-21 표기·접근성 — 채택안 박제(2026-09-18 목업 검토, `17-latch-led-mockup.html` 변형 A).** LED = **칩**(`<button>` · `rounded-full` · 테두리) 안에 도트 + 이름(`매수`/`매도`/`취소`) + 상태 라벨. 상태 라벨 문구: 무장 아님 `OFF` · 래치 OFF(잠복) **`대기`** · 래치 ON **`감시`**. 매수 LED 매도잔량 기준은 `감시` + `<small>(매도잔량 기준)</small>`, 매수 OFF 이고 발주됨은 `OFF` + `<small>(발주됨)</small>`. 클릭 가능: `cursor:pointer` + `aria-pressed`(초록 true/주황 false) + hover 테두리 강조. 클릭 불가: `disabled` + 점선 테두리. 툴팁은 C# 원문(특히 매수 켜는 쪽 "벽이 이미 감시수량 이상이면 바로 매수 주문이 나갈 수 있다"). 토큰: `--led-latent` 라이트 `oklch(0.74 0.17 62)`/다크 `oklch(0.80 0.16 70)`, `--led-armed` 라이트 `oklch(0.68 0.19 150)`/다크 `oklch(0.76 0.18 150)`, 회색은 기존 `--flat`(도트)·`--muted-fg`(라벨).
- **D-22 배치.** 상따 화면 **상태줄**(DMA 칩 다음)에 LED 3개를 매수·매도·취소 순으로. 기존 매수/매도 도트 세그먼트는 LED 가 대체한다. §2.2b 4밴드 컨테이너 쿼리 안에서만 반응(뷰포트 분기 신설 금지). 폰 밴드에서 상태줄이 두 줄로 접히는 모습은 목업으로 사용자 확인 완료(2026-09-18). **목업 게이트는 계획 단계에서 통과** — 실행 중 다시 묻지 않는다. 구현 결과는 dev 서버 스크린샷으로 한 번 더 보여 준다.
- **D-23 로그·배지.** 전략 로그 전이 집합에 `cancelLatched/cancelUnlatched`·`buyLatched/buyUnlatched` 4종 추가(문구는 매도 것과 대구: "취소 진입 래치 ON — 취소 판정 시작" 등). `valuesChanged` skip 집합에 두 필드 추가. 배지(`strategyBadgesOf`)는 무변경 — 래치 3종의 표면은 LED 다(배지에 섞지 않는다). 사이드바·My page 는 손대지 않는다.

### 검증·배포
- **D-24 테스트.** `relay/tests/helpers/frames.ts` 에 76/77/78 빌더 + `fake-gateway` 의 36/37/38 요청 리더(`readArmLatchRequest` — key 추출)·21 요청 key 리더. `envelope.test.ts` 신규 조립기/파서. `strategy-hub.test.ts` 에 Ready 프리페치 21 이 KRX·NXT 2회임을 반영(기존 「21 1회」 단언 갱신). webapp: LED 규칙 표 케이스(매수 side "0" 예외 포함), tape `bs` 실값/폴백, 미체결 표식·회색·취소 숨김, 주문통보 행위 단어, 묶기 순수함수.
- **D-25 실기 검증.** mock 게이트웨이(gh-trade `server/scripts/run-mac.sh`)는 서버 HEAD 이므로 76/77/78·36/37/38 을 실제로 낸다 — dev 로 드롭 카운터 0 과 LED 클릭 왕복을 확인. 실서버 검증은 배포 후 사용자 장중 관찰.
- **D-26 배포 순서·시점.** relay(`scripts/deploy-relay.sh`, `DMA_HOST` 무주입 보존) → webapp(Vercel) → `smoke-relay.sh`. **20:00 KST 이후**, 커밋 메시지·배포 모두 사용자 확인 후. server(Express) 는 shared 타입만 바뀌면 배포 생략 가능(16-46 선례) — diff 로 판단.

### Claude's Discretion
- 브라우저 프레임 키 이름(`bd/rk/rq/kc/bs` 등) 과 shared 타입 이름.
- LED 컴포넌트 파일 분리 여부·툴팁 구현(shadcn Tooltip 유무는 실측).
- 묶기 순수함수의 위치(`webapp/src/lib` 또는 shared).
- 21 거래소 FIFO 의 자료구조.

</decisions>

<specifics>
## Specific Ideas

- gh-trade 정본 파일: `server/src/protocol/StockDMA.fbs` · `server/docs/protocol.md` · `server/scripts/expected-vtable.txt` · `docs/strategy/limit-chaser.md` §5-4/§6-3/§6-5/§10 · `docs/strategy/vi-trigger.md` · `client/Forms/Trading/LimitChaserForm.cs`(`ShowBuyServerQty` :1027, `UpdateSellLatchLabel` :4246, `UpdateCancelLatchLed` :4342, 클릭 :4300/:4396/:4443) · `client/Services/DMA/Client.cs`(`SendArmSellLatch` :785 등) · `client/Services/DMA/NotificationHub.cs`(`SideDisplayText` :172, `ActionWord` :466, `MergeKeyOf` :573).
- gh-trade 서버 거부 문구(WARN, 원문): 36 `등록된 상따 전략이 없습니다 — 매도 래치를 켤 수 없습니다` / `매도 무장이 꺼져 있습니다 — 매도 감시를 먼저 켜세요`; 37 `… 취소 래치를 켤 수 없습니다` / `취소 감시가 꺼져 있습니다 — 취소 잔량 또는 체결 체크를 먼저 켜세요` / `취소할 매수 미체결이 없습니다 — 미체결이 생긴 뒤에 켜세요`; 38 `… 매수 래치를 켤 수 없습니다` / `매수 무장이 꺼져 있습니다 — 매수 감시를 먼저 켜세요` / `매도잔량 기준에서는 매수 진입 확인 래치가 없습니다 — 매수잔량 기준일 때만 켤 수 있습니다`. 테스트 픽스처 문구로 재사용.
- 매도 래치는 서버 안에서 둘(가격 래치 · 잔량 래치)이고 와이어에는 잔량 래치만 온다. `잔량 OFF ∧ 가격 ON` 은 정상 상태 — 화면에 "결함" 으로 그리지 않는다.
- 미체결 여부는 클라가 모른다(에코에 미체결 필드 없음) — 취소 LED 는 낙관적으로 클릭 가능하게 보이고 미체결 없음은 서버가 문구로 거부한다.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/17-gh-trade-led/17-RESEARCH.md` — 와이어 사실(슬롯·기본값·전송 클래스)과 gh-radar 편집 지점(경로:줄) 정본. planner 는 이 문서를 재조사 없이 그대로 쓴다.
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-RESEARCH.md` §Common Pitfalls(1~19) · `16-CONTEXT.md` D-01~D-14(전송·동기화 규율).
- `webapp/src/styles/globals.css` §2.2b — 상따 본문 4밴드 컨테이너 쿼리 정본.
- `relay/README.md` — 로컬 mock 기동·env.
- 메모리 `reference_gh_trade_protocol_sync` — 동기화 스크립트 소유·가드.

</canonical_refs>

<deferred>
## Deferred Ideas

- Phase 18: 돌파감지 목록 UI(76/78, 하루 1회 알림·임계−2%p 이탈 삭제·자동 열기 금지) · 예약/장전/시간외종가 발주 UI(77 라벨 전환·조각 입력·`piece_count/krx_session` 송신·벽시계 판정 금지) · NXT VI 설정 카드(거래소별 1건).
- 매도 **가격 래치** 표시 — gh-trade 쪽 와이어 필드가 없다(Deferred, gh-trade 소관).
- `UnfilledState.order_time` 을 미체결 표 '시간' 열로 노출하는 것은 D-07 파서 확장에 포함하되 열 추가는 재량.

</deferred>

---

*Phase: 17-gh-trade-led*
*Context gathered: 2026-09-18*
