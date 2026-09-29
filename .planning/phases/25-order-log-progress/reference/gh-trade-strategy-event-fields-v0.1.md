# 서버 전략 이벤트(StrategyEvent) 필드 초안 v0 — gh-trade-6d, 2026-09-29

용어 대응(서버 기준 확정): 기획서 「선매수」= Pre(선매수) · 「추가매수」= Add(추가매수, 코드 주석 "줄서기": 매수잔량 ≥ 구간 진입) · 「줄서기매수」= Post(후매수, 코드 주석 "반등": 발동잔량 ≤ 하향 래칫).
근거: 기획서 예시 조건 — 추가매수 「매수잔량≥150,000」 = Add, 줄서기매수 「매수잔량≤100,000」 = Post. 기획서 각주 「추가매수→후매수, 줄서기매수→반등매수」 는 예시와 어긋나므로 사용자 확인 항목.
매도: 「호가매도」= ShouldSellOnQuote(B6) · 「체결매도」= ShouldSellOnTrade(A3) + 체결훅(FillFirst). 코드에 이름은 없고 경로만 있다.
→ wire 는 enum 코드로 보내고 표시 이름은 클라 매핑(요청 수용).

## 전송
- `JournalBatch` 말미 append: `strategy_events:[StrategyEvent]`, `strategy_head_seq`, `strategy_caught_up`. `ObserverLoginReq` 에 `strategy_since_seq`, `ObserverLoginResp` 에 `strategy_head_seq`·`strategy_oldest_seq` append. 같은 epoch, **별도 seq 공간**(주문 저널 seq 와 섞지 않음).
- 저장: 서버 `log/journal/strategy/` 에 같은 프레이밍(날짜 파일 + seq.state), 기록 스레드 공유. 생산자는 MPSC 링 push 만(핫패스 규율).

## StrategyEvent (FlatBuffers table, 없는 값은 0/"")
| 필드 | 타입 | 뜻 |
|---|---|---|
| seq | uint64 | 전략 이벤트 seq(조밀·단조) |
| trade_date | string | YYYY-MM-DD KST |
| gw_time_ms | int64 | 발생 epoch ms (주문 이벤트 = 전송 직전 시각). 저널과 같은 이름 |
| kind | enum StrategyEventKind | 1 LimitExposed 상한가노출 · 2 LimitEntered 상한가진입 · 3 BuyOrder 매수주문 · 4 Queued 대기 · 5 FirstFill 첫체결 · 6 SellOrder 매도주문 · 7 Cancelled 취소 · 8 Rejected 거부 |
| group | enum OrderGroup | 0 None · 1 PreBuy · 2 AddBuy · 3 PostBuy · 4 SellQuote(호가매도) · 5 SellTrade(체결매도) · 6 SellFillHook(체결훅 즉시매도) |
| exchange | string | KRX / NXT (판단에 쓴 시세의 거래소 = 발주 거래소) |
| isin | string | |
| cum_volume | uint64 | 이벤트 시점 그 거래소 누적거래량(A3 최신값) |
| dma_user_id, account_no | string | 주문 이벤트만 |
| order_no | string | 없으면 "" (거부·시세 이벤트) |
| price, qty | int32 | 주문가·주문수량 (주문 이벤트) |
| order_condition | string | "0" 지정가 등 (매도주문 「방식」) |
| reason_code | string | 서버 OrderReasonName 원문 (B6Buy3, A3Buy4, B6Sell1 …) — 판정 키 |
| cond_threshold | int64 | 조건 설정값 (기획서 「조건: 매도잔량≤50,000」의 50,000) |
| cond_actual | int64 | 실측값 (38,200) |
| cond_metric | enum CondMetric | 1 Ask1Qty · 2 Bid1Qty · 3 TradeQty · 4 Price · 5 Burst · … (연산자는 reason_code 로 결정) |
| ev_kind | enum EvidenceKind | 1 Quote(호가) · 2 Trade(체결) · 3 FillNotice(체결통보) |
| ev_price | int32 | 근거 틱 가격 |
| ev_qty_before, ev_qty_after | int64 | 호가면 잔량 변화 (52,100→38,200) |
| ev_trade_qty | int64 | 체결이면 체결량 |
| limit_bid_qty | int64 | 그 시점 상한가 매수잔량(bid1==상한가일 때 bid1잔량, 아니면 0) |
| bid1_price, bid1_qty | int32/int64 | 매도주문: 매수1 가격·잔량 |
| accept_latency_us | int32 | 전송→접수 통보 (0 = 미측정). 접수 통보가 늦게 오므로 **Queued/별도 갱신**이 아니라 BuyOrder 이벤트를 접수 시점에 쓴다(전송 시각은 time_ms) |
| immediate_fill_qty | int64 | 즉시체결 분 (0 이면 없음). **Queued(4) 에 실린다** — BuyOrder(3) 는 A 통보 시점에 확정돼 그 뒤 체결을 모른다 (gh-trade 정정 2026-09-29, 이름·번호 무변경) |
| queue_case | int8 | 1 잔량 보고 낸 주문 · 2 잔량 쌓이기 전 주문 |
| base_cum, ahead_qty, expected_cum | uint64 | 대기: 기준 누적 · 내 앞 물량 · 체결예상 누적 |
| error_volume | int64 | 첫체결: expected_cum − 첫 체결 시점 누적 (부호 있음) |
| remaining_volume | int64 | 취소: expected_cum − 취소 시점 누적. 대기 아니었으면 필드 없음(0 과 구분: `has_remaining` bool) |
| cancel_reason | enum CancelReason | 1 Manual · 2 ExitSell(이탈) · 3 Bid1Drop(매수1 이탈) · 4 VIWatch · 5 Exchange(거래소 자동취소) · 6 Close(마감정리) … 서버 취소 사유 코드 |
| result_code, message | int32/string | 거부: 거래소·증권사 문구 그대로 |
| entry_round | int32 | 상한가진입 회차 |
| snap_qty, snap_cum | [int64] 벡터(길이 0~3) | 상한가진입: 즉시·1초·3초 매수잔량과 누적. 3초 전 이탈하면 길이<3 (FlatBuffers 테이블은 고정 배열 불가) |
| ask_qty_at_limit | int64 | 상한가노출: 상한가 매도잔량 |
| open_at_limit | bool | 시초 상한가 |

## 서버가 새로 만들어야 하는 것 (조사 결과)
- 상한가노출: Stock 은 ask1 만 파싱 → 퍼블리셔 QuoteStore(10단계) 에서 판정해 이벤트 push (콜드 스레드, 발주 경로 무비용). 종목·거래소당 하루 1회 래치.
- 상한가진입: Stock::OnQuote 거래소별 1비트 엣지(bid1==상한 && ask1 잔량 0). 즉시·1초·3초 스냅은 타이머 3개(기록 스레드에서 A3 최신값 읽기).
- 대기·체결예상: PendingBuySlot(LimitChaser) 에 base_cum·ahead_qty·expected_cum·queue_case·first_fill_seen 추가. 경우 1 = 발주 시점(bid1==상한) 값, 경우 2 = 발주 뒤 첫 B6 에서 내 주문이 반영된 시점 값.
- 첫체결 오차·취소 남은 거래량: E/C 통보 처리 시 슬롯 값 − Stock 최신 누적.
- 접수 ms: PlacedOrder 에 sent_at_ns 추가(OrderRttTable 은 KB 전용·60건 상한이라 안 씀).
- VI·단일가 제외: Stock 에 거래소별 원자 VI 플래그(Server::OnVI 에서 세움) + MarketClock 동시호가 구간. 이 구간엔 노출/진입 판정과 진행률 갱신을 멈춘다.
- 누적거래량은 uint32 파싱 — 이벤트는 uint64 로 싣는다.

## 잔량진행률 전송 (2부)
- 권장: 새 Broadcast 메시지 `QueueProgress`(다음 빈 MsgType) — 종목·거래소별 1초 스로틀, 의미 = 그 (isin, exchange) 의 대기 주문 **전체 스냅샷**(빈 배열 허용 = 전부 사라짐). 항목 {account_no(필수 — relay 계좌 권한 게이트), dma_user_id, order_no, exchange, isin, group, expected_cum, current_cum, remaining_volume, progress_bp}. 서버가 진실 원본(클라 누적거래량 사본은 거래소 합산·지연 위험). 66/67 은 손대지 않는다(Notice 등급·고빈도 부적합).
- 슬림 대안: 67 `UnfilledState` 말미에 expected_cum·base_cum·ahead_qty 만 append 하고 진행률은 클라가 자기 누적으로 계산 — gh-radar 는 거래소별 cum_volume 이 있어 가능, WinForms 는 OCX 누적이 거래소별인지 확인 필요.
- 첫 체결·취소 시 해당 항목이 빠진 QueueProgress 가 한 번 더 나가 클라가 줄을 지운다.

## v0.1 반영 (gh-radar 대조 2026-09-29)
- 시세 이벤트(노출·진입, 계좌 없음) 가시성: 그 게이트웨이 자격증명 있는 사용자 전원 — 수용.
- 스트림 2개(주문 저널·전략 이벤트) 각각 커서·gap·resync, live 전이는 두 caught_up 모두 true — 수용. 서버 펌프는 커서 2개를 같은 Tick 에서 돌린다.
- Rejected 는 (a) 평면 목록만으로 시작. (b) journal_seq 로 reject_seq 조인은 후속.
- `immediate_fill_qty` 는 BuyOrder(3) 가 아니라 **Queued(4)** 에 실린다(gh-trade 정정 2026-09-29, 이름·번호 무변경). 전량 즉시체결 = Queued 1건 `qty=0` · `immediate_fill_qty=전량`(대기 없음 · FirstFill 없음). 일부 즉시체결 = Queued 1건 `qty=남은 수량` · `immediate_fill_qty=체결분`.
