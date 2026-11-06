# kind 9 「상태전이」 43칸 매핑 — 매매진단 챗봇(gh-radar Phase 39)

## 요청 내용

**동기 사례.** 11/5 milles 금양그린파워 — 13:08:18 VI 때 선매수가 1회 발주하고 꺼졌다가, 13:10:25 milles 의 설정 재제출로 선매수가 다시 켜졌고, 그래서 13:10:30.385 스윕 조건 선매수 5,940주가 나갔다. 마지막 고리(13:10:25 다시 켜짐)는 지금 DB 어디에도 없어서 gh-radar 챗봇이 「왜 나갔나」 에 끝까지 답하지 못한다. kind 9 가 이 빈칸을 채운다.

**요청.** `enum StrategyEventKind` 의 비워 둔 9 를 `StateTransition = 9` 로 채우고 주석만 단다. **와이어(테이블 · 필드)는 무변경** — 기존 `table StrategyEvent` 43칸을 kind 9 의미로 재해석한다(kind 11~18 과 같은 방식).

- **1차(이번 구현):** 설정 변경 이력(사람 제출로 스위치 · 값이 실제로 바뀜) + 서버 자동 상태전이(선매수 1회 발주 뒤 꺼짐 · 마스터 해제 · 줄매수 재체크 · 후매수 잠금해제/발동 · 위험도 래치 등).
- **2차(번호만 예약):** 진입 래치(매도 · 취소 진입 확인) · 발주 게이트 차단(세션 가드 · 게이트 소진) · VI 미발주 사유 — 토큰 이름만 지금 정해 두고 **2차 · 이번 구현 제외**.

1차 · 2차를 한 번에 설계해 두는 이유: 칸 배치와 `reason_code` 접두 대역이 한 벌이어야 2차를 붙일 때 gh-radar 라벨 사전 · 챗봇 해설을 다시 짜지 않는다.

### 43칸 매핑(kind 9 일 때만 — 다른 kind 의 기존 의미는 그대로)

| # | 칸 | kind 9 의미 |
|---|---|---|
| 1 | `seq` | 전략 이벤트 seq(기존 공간 그대로) |
| 2 | `trade_date` | YYYY-MM-DD KST |
| 3 | `gw_time_ms` | 전이 시각 — 사람 행 = 설정이 적용된 순간 · 서버 행 = 서버가 상태를 바꾼 순간 |
| 4 | `kind` | `9` (StateTransition) |
| 5 | `group` | 단일 그룹 전이면 그 `OrderGroup`(1 선매수 · 2 줄매수 · 3 후매수 · 9 자동매도), 그 밖(마스터 · 매도 · 취소 · 위험도 · SOR · 여러 그룹이 함께 바뀜)은 **0** |
| 6 | `exchange` | 그 LimitChaser 의 거래소 키(KRX / NXT) |
| 7 | `isin` | 그 LimitChaser 의 종목 |
| 8 | `cum_volume` | 전이 시점 그 거래소 A3 누적(맥락용) |
| 9 | `dma_user_id` | 그 전략 소유 DMA 사용자 — 감사 칸(gh-radar 는 화면 · 챗봇에 **반환하지 않는다**) |
| 10 | `account_no` | **필수** — 비면 아무도 못 본다(gh-radar 가시성 RPC · relay 팬아웃 모두 계좌 키로 거른다) |
| 11 | `order_no` | 원인 주문번호(발주로 생긴 자동 꺼짐 · 후매수 발동 등) — 없으면 `""` |
| 12 | `price` | 원인 주문 가격 — 없으면 0 |
| 13 | `qty` | 원인 주문 수량 — 없으면 0 |
| 14 | `order_condition` | **제출자 표시용 식별 문자열** — 사람 제출 행만(예 `milles`) · 서버 행은 `""`. 화면에 「(milles)」 로 붙는다(`dma_user_id` 는 감사 칸이라 반환하지 않으므로 「누가」 는 이 칸으로만 보인다) |
| 15 | `reason_code` | 사유 토큰(아래 표) — **접두 대역(Cfg / Auto / Sys …)이 사람 / 서버 구분의 정본** |
| 16 | `cond_threshold` | 단계형 상태의 **전**(후매수 단계 0 꺼짐 · 1 감시 · 2 보유중 · 3 소진 / 위험도 래치 0 대기 · 1 무장 · 2 발동) — 단계형이 아닌 사유는 0 |
| 17 | `cond_actual` | 단계형 상태의 **후**(같은 번호 체계) — 단계형이 아닌 사유는 0 |
| 18 | `cond_metric` | 0(2차 예약) |
| 19 | `ev_kind` | 0(2차 예약) |
| 20 | `ev_price` | 0(2차 예약) |
| 21 | `ev_qty_before` | 사유가 정한 **주요 값 하나**의 전(예 후매수 발동잔량 · 하한 · 위험도 %) — 없으면 0 |
| 22 | `ev_qty_after` | 같은 값의 후 — 없으면 0 |
| 23 | `ev_trade_qty` | 0(2차 예약) |
| 24 | `limit_bid_qty` | 0(2차 예약) |
| 25 | `bid1_price` | 0(2차 예약) |
| 26 | `bid1_qty` | 0(2차 예약) |
| 27 | `accept_latency_us` | 0(2차 예약) |
| 28 | `immediate_fill_qty` | 0(2차 예약) |
| 29 | `queue_case` | 0(2차 예약) |
| 30 | `base_cum` | `SetLimitChaser.change_mask` 54비트 원값(사람 제출 행 — 전체 제출이면 전체 비트) · 서버 행은 0 |
| 31 | `ahead_qty` | **스위치 비트셋 전**(아래 비트 표) |
| 32 | `expected_cum` | **스위치 비트셋 후** |
| 33 | `error_volume` | 0(2차 예약) |
| 34 | `remaining_volume` | 0(2차 예약) |
| 35 | `has_remaining` | false(2차 예약) |
| 36 | `cancel_reason` | 0(2차 예약) |
| 37 | `result_code` | 0(2차 예약) |
| 38 | `message` | 바뀐 값 요약 — 서버 로그 「설정 갱신」 의 토큰 낱말 그대로, **바뀐 칸만**(예 `감시가 10,000→10,100 · 주문수량 500→600주`) · 바뀐 값이 없으면 `""` |
| 39 | `entry_round` | 0(2차 예약) |
| 40 | `snap_qty` | 빈 벡터(2차 예약) |
| 41 | `snap_cum` | 빈 벡터(2차 예약) |
| 42 | `ask_qty_at_limit` | 0(2차 예약) |
| 43 | `open_at_limit` | false(2차 예약) |

### 스위치 비트셋(`ahead_qty` = 전 · `expected_cum` = 후)

비트 값은 에코가 화면에 보여 주는 cfg 기준이다 — 마스터 해제로 선 · 줄 · 후가 접히면 그 비트도 0 으로 적는다.

| 비트 | 스위치 | 원 설정 칸 |
|---|---|---|
| bit0 | 매수 마스터 | `buy_enabled` |
| bit1 | 선매수 | `pre_buy_enabled` |
| bit2 | 줄매수 | `extra_buy_enabled` |
| bit3 | 후매수 | `post_buy_enabled` |
| bit4 | 매도 | `sell_enabled` |
| bit5 | 취소 | `cancel_qty_enabled` · `cancel_trade_enabled` · `cancel_qty_track_enabled` 중 하나라도 켜짐 |
| bit6 | 자동매도 | `auto_sell_enabled` |
| bit7 | SOR 매수 | `sor_buy` |
| bit8 | SOR 매도 | `sor_sell` |
| bit9 | 위험도 | `sell_risk_enabled` |
| bit10 | 선매수 ☐체결량 | `buy_trade_qty_enabled` |
| bit11 | 선매수 ☐한방 | `sweep_enabled` |
| bit12 | 줄매수 ☐자동 | `extra_buy_auto` |
| bit13 | 후매수 ☐자동 | `post_buy_auto` |
| bit14~63 | 예약 | append-only — 새 스위치는 14 부터 뒤에 붙인다(기존 비트 의미는 바꾸지 않는다) |

### 사유 토큰(`reason_code`) — 접두 대역

| 대역 | 토큰 | 언제 | 쓰는 칸 | 단계 |
|---|---|---|---|---|
| `Cfg*` 사람 | `CfgSubmit` | 사람 제출로 스위치 또는 값이 **실제로 바뀜**(같은 값 재제출 = 행 없음) | `order_condition` 제출자 · `base_cum` 마스크 · `ahead_qty`→`expected_cum` · `message` 바뀐 값 · 단일 그룹이면 `group` · 값 하나만 바뀌면 `ev_qty_before`→`ev_qty_after` | 1차 |
| | `CfgRearm` | 스위치 값은 그대로인데 체크 비트 ON 재제출로 소진 게이트만 다시 열림 | `order_condition` · `base_cum` · `ahead_qty` = `expected_cum`(같음) · `group` | 1차 |
| `Auto*` 서버 판정 | `AutoPreBuyOff` | 선매수 1회 발주 뒤 ☐선매수 자동 해제 | `group` 1 · `order_no`/`price`/`qty` = 그 발주 · bit1 1→0 | 1차 |
| | `AutoAddBuyOff` | 줄매수 발주 뒤 자동 해제 | `group` 2 · `order_no`/`price`/`qty` = 그 발주 · bit2 1→0 | 1차 |
| | `AutoAddBuyGiveUp` | 줄매수 최대 초과로 포기(체크 해제) | `group` 2 · bit2 1→0 · 포기 수량을 알면 `ev_qty_after` | 1차 |
| | `AutoAddBuyRecheck` | 줄매수 ☐자동 재체크 | `group` 2 · bit2 0→1 | 1차 |
| | `AutoPostBuyUnlock` | 후매수 잠금해제(감시 시작) | `group` 3 · `cond_threshold`→`cond_actual` 단계 · `ev_qty_before`→`ev_qty_after` 발동잔량 | 1차 |
| | `AutoPostBuyRelock` | 후매수 다시 잠김(상한가 풀림 · 동시호가) | `group` 3 · 단계 · 발동잔량 | 1차 |
| | `AutoPostBuyFire` | 후매수 발동(매도 · 취소 켬 · 취소잔량 ×0.8) | `group` 3 · `order_no`/`price`/`qty` = 그 발주 · 단계 · 발동잔량 · bit4 · bit5 0→1 | 1차 |
| | `AutoMasterOff` | 매수 마스터 해제(선 · 줄 · 후 모두 접힘) | `group` 0 · bit0(과 접힌 bit1~3) 1→0 | 1차 |
| | `AutoRiskLatchOn` | 위험도 래치 켜짐 | `group` 0 · `cond_threshold`→`cond_actual` 래치 단계 · `ev_qty_before`→`ev_qty_after` 위험도 % | 1차 |
| | `AutoRiskLatchReset` | 위험도 래치 리셋 | 같음 | 1차 |
| | `AutoRiskFire` | 위험도 발동 | 같음 + 원인 주문이 있으면 `order_no`/`price`/`qty` | 1차 |
| `Sys*` 서버 운영 경로 | `SysCloseOff` | 15:40 / 20:00 정리로 꺼짐 | `group` 0 · 비트셋 전→후 | 1차 |
| | `SysKillSwitch` | 킬 스위치(전체 / 행 끄기) | `group` 0 · 비트셋 전→후 | 1차 |
| | `SysRestore` | 재기동 복원 | `ahead_qty` 0 → `expected_cum` 복원된 비트셋 | 1차 |
| | `SysCommand` | 41 명령 경로로 상태가 바뀜(42 설정 제출이 아닌 명령 전문) | 비트셋 전→후 · 보낸 세션 식별자를 알면 `order_condition`(Q1 과 함께 답해 달라) | 1차 |
| `Latch*` | `LatchSellOn` | 매도 진입 확인 래치 켜짐 | 번호만 예약 | **2차 · 이번 구현 제외** |
| | `LatchCancelOn` | 취소 진입 확인 래치 켜짐 | 번호만 예약 | **2차 · 이번 구현 제외** |
| `Gate*` | `GateSessionBlocked` | 조건은 성립했으나 세션 가드(Blocked)로 미발주 — 상태가 바뀔 때만 1행(틱마다 금지) | 번호만 예약 | **2차 · 이번 구현 제외** |
| | `GateConsumed` | 조건은 성립했으나 게이트 소진으로 미발주 — 상태가 바뀔 때만 1행 | 번호만 예약 | **2차 · 이번 구현 제외** |
| `Vi*` | `ViNoOrder` | VI 미발주 사유 | 번호만 예약 | **2차 · 이번 구현 제외** |

**동기 사례에 대면:**

- 13:08:18 = `AutoPreBuyOff` — `group` 1 · `order_no`/`price`/`qty` = 그때 VI 중 나간 선매수 발주 · `ahead_qty` bit1 = 1 → `expected_cum` bit1 = 0 · `order_condition` `""`.
- 13:10:25 = `CfgSubmit` — `order_condition` `milles` · `base_cum` = 그 제출의 `change_mask` · `ahead_qty` bit1 = 0 → `expected_cum` bit1 = 1(다른 비트는 같음) · `group` 1 · `message` 에 같이 바뀐 값이 있으면 그 낱말.

## gh-trade 가 할 일

아래 운영 조건 4개를 kind 9 계약으로 지켜 달라.

1. **같은 값 재제출은 행을 만들지 않는다.** relay 는 설정을 초당 1회꼴로 재제출한다(「설정 갱신」 로그가 재제출마다 1줄인 것과 같은 빈도). kind 9 행은 바뀐 스위치 · 값이 있을 때만(`CfgRearm` 은 게이트가 실제로 다시 열릴 때만) 만든다 — 그렇지 않으면 계좌 · 종목당 하루 수만 행이 된다.
2. **80 저널(관찰자) 송신은 필수.** gh-radar 는 80 으로 받아 `dma_strategy_events` 에 적재한다. 82 실시간 송신(과 81 백필 포함 여부)은 gh-trade 판단 — Q3 으로 알려 달라.
3. **`account_no` 필수.** 상따 전략 인스턴스는 (isin, 계좌) 단위라 행마다 그 계좌를 채운다. 비면 gh-radar 의 어떤 사용자에게도 보이지 않는다.
4. **와이어 무변경.** `StockDMA.fbs` 는 `enum StrategyEventKind` 의 `StateTransition = 9` 값과 주석만 바꾼다(주석 예: `// 상태전이 — 설정 변경 이력 + 서버 자동 상태전이(gh-radar Phase 39). 43칸 매핑은 gh-radar 인박스 노트 YYMMDD-chatbot-kind9-mapping.md`). relay 생성물 동기화(`sync-relay-schema.sh`)는 지금처럼 gh-trade 소유로 돌려 달라.

구현 노트(회신)에 실제로 쓴 토큰 이름 · 칸 배치 · 단계 번호를 적어 주면, gh-radar 라벨 사전과 챗봇 해설을 그 낱말로 맞춘다.

## 배포 순서 제약

gh-radar 먼저 배포가 안전한가: 예 — 그리고 **gh-radar 먼저여야 한다.** relay 는 kind 화이트리스트가 없다(`toStrategyApplyEvent` 는 순수 매핑 · `dma_strategy_apply` 에 kind CHECK 없음 · 팬아웃은 시세 kind 이거나 계좌 일치면 보냄). 그래서 gh-trade 서버가 kind 9 를 내보내는 즉시 relay 가 그대로 적재하고 계좌 소유자에게 푸시하며, 지금 웹은 이를 「선매수 · 9」 같은 원문 숫자 행으로 그린다. 인박스 261105 의 「구 relay 는 모르는 kind 로 무시」 는 사실이 아니다 — 여기서 정정한다. **gh-radar webapp(주문로그 「상태전이」 라벨 · 필터 · 회색 줄) 배포를 확인한 뒤 gh-trade 서버를 켜 달라.** gh-radar relay 는 바꾸지 않는다.

gh-trade 는 cloud-verify.sh 게이트 뒤 deploy.sh <broker> <env> 로 KB 120·121·교보 119 를 장 마감 뒤 배포한다.

## 확인 방법

- **gh-radar 웹 배포 확인(서버 켜기 전):** `git -C <gh-radar> log origin/master --oneline -1 -- packages/shared/src/strategy-event-labels.ts` 에 kind 9 라벨 커밋이 보이고, 웹 주문로그 탭에 「상태전이」 칩이 있다.
- **gh-trade 서버 배포 뒤:** `dma_strategy_events` 에 kind 9 행이 생긴다 — `account_no` 가 채워져 있고, 같은 값 재제출로 생긴 행이 없다(계좌 · 종목당 행 수가 Q4 예상 안).
- **웹:** 주문로그 탭에 회색 「상태전이」 줄(사유 문구 · 스위치 전→후 · 사람 행이면 「(milles)」)이 보인다.
- **챗봇:** 시험 문항 「11/5 13:10 금양그린파워 선매수 왜 나갔어?」 의 답에 스윕 조건 · 단일가 체결 제외에 더해 ③ 「13:10:25 설정 재제출로 선매수가 다시 켜짐」 이 나온다(그날 이후 같은 꼴의 사례로 확인).

## 질문

1. **Q1 제출자 식별** — relay 재제출(42)이 서버에 어느 세션 신원으로 오는가. `order_condition` 에 표시용 식별자(예 `milles`)를 실을 수 있는가 — 못 싣는다면 무엇을 실을 수 있는가.
2. **Q2 `CfgRearm`** — 값은 그대로이고 체크 비트 ON 재제출로 소진 게이트만 다시 열리는 경우를 서버가 실제로 구분할 수 있는가. 구분이 안 되면 `CfgSubmit` 하나로 합쳐도 된다.
3. **Q3 82 실시간 송신** — kind 9 를 82(실시간)로도 보낼지, 80 저널 전용(`IsObserverOnlyKind`)으로 둘지.
4. **Q4 행 수** — 계좌 · 종목당 하루 예상 kind 9 행 수(평소 · 많은 날).
5. **Q5 이의** — 1차 토큰 이름이나 칸 배치에 이의가 있으면 구현 노트에서 바꿔 달라. gh-radar 라벨 사전은 회신 낱말로 맞춘다.

## 인박스 261105 질문 답

1. **기존 챗봇 구조** — Anthropic Messages API tool use 다(Agent SDK · CLI 아님). 팀장 Sonnet 5 + 전문가 5(시세 · 테마 · 뉴스 · 상한가 · 웹서치). 저널 · 이벤트 조회 도구는 아직 없다 → 이번 Phase 39 에서 읽기 전용 「주문 진단」 전문가(`claude-opus-5-5`)와 조회 도구(저널 · 전략 이벤트 · 시세 · 상태전이 · 종목 검색)를 새로 만든다. 계좌 범위는 모델이 고르지 못하게 서버가 로그인 사용자(`req.userId`)로 묶는다(공유 계좌는 웹 조회 RPC 와 같은 범위).
2. **지난 날짜 시세** — 연다(gh-radar 결정 D-12). 오늘은 tickgw 로, 지난 날짜는 변환된 격자가 있으면 읽고 없으면 변환을 요청해서 읽는다. 119 부하는 없다(지난 날짜는 GCS 보관본 변환 경로).
3. **kind 9 하나 vs 둘** — kind 9 하나로 두고, 사람(설정 변경) / 서버(자동 전이) 구분은 `reason_code` 접두 대역(`Cfg*` · `Auto*` · `Sys*`, 2차 `Latch*` · `Gate*` · `Vi*`)으로 가른다.
