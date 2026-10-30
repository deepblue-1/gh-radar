---
status: open
from: gh-trade
from_commit: 71915512
from_branch: worktree-agent-aed27da48fa7541ca
date: 2026-10-30
fbs_sync_marker: 55e62638
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-30

## 바뀐 것

Phase 44 「상따 설정 변경 마스크」 — MsgType 번호 무변경, `SetLimitChaser` 테이블 말미 append 1필드 + 세대 6.
(gh-radar-12 합의 10/28 의 정식 인계. 사고: 2026-10-28 09:12:31 KB 120 에스피소프트 — 선·줄매수 발주 44ms 뒤 금액만 고친 재제출이
소진 에코보다 먼저 출발해 체크 ON 스냅샷을 실었고, 서버 「재제출 = 재무장」이 게이트를 다시 열어 같은 매수 2건이 중복 발주됐다(20,660주·약 1억).
웹 탭(relay) 제출도 같은 경로로 재무장시킬 수 있었다.)

### ① 필드·세대

- **`SetLimitChaser.change_mask: ulong` (field id 85 · vtable 174, C→S 전용, 테이블 끝 append)** — 「이번 제출에서 사람이 바꾼 칸」
  uint64 비트마스크. 에코는 0(D-04) — Set 응답·푸시는 종전대로 전체 스냅샷이라 **클라·웹의 에코 적용 코드는 무변경**. fbs 커밋은
  gh-trade `55e62638`(44-01, 생성물 마커와 같다), 비트 표 정본은 `server/docs/protocol.md` 「SetLimitChaser change_mask 비트 표 (Phase 44)」.
- **`buy3_schema` 6** = 마스크를 싣는 세대. 서버는 `buy3_schema ≥ 6` 일 때만 `change_mask` 를 읽는다.
  - 6 + 마스크 0 = 바뀐 칸 없음 → 아무 칸도 반영하지 않고 재무장도 없다.
  - ≤ 5 = 종전 전체 반영·재무장(이행기, D-02). **지금 relay 가 5 로 재제출해도 동작은 불변**이다 — 다만 그 재제출이 이미 소진된 선·줄매수를
    다시 열면 서버가 warn 1줄 `[Gateway] 구 세대 재제출이 소진된 선·줄매수를 다시 연다 isin= acct= schema= 선매수= 줄매수=` 를 남긴다(D-14, 관측용).
  - 병합은 **기존 전략이 있을 때만**이다. 미등록 키 첫 등록·삭제(crud D)는 마스크 무관 전체 반영(D-07).
- **병합 바탕 = 에코가 보여 준 값.** 비트 없는 칸은 서버 cfg 원값이 아니라 에코와 같은 값으로 남는다:
  ① 후매수 발동 override(매도가·비교가 = 상한가, 취소잔량 ×0.8)를 흡수한 값 ② 마스크에 마스터 bit0 이 있을 때만 선·줄·후매수 체크를
  에코처럼 접은 값(발주로 소진된 그룹 = OFF). 마스터 칸 자신은 예외로 서버 cfg 값이다. 매도·취소 체크는 접지 않는다.

### ② 비트 표 전문 (`server/docs/protocol.md` 「SetLimitChaser change_mask 비트 표 (Phase 44)」 50행 그대로)

규칙: **append-only · 재사용·재배치 금지 · 새 칸은 50부터 · 64비트가 차면 `change_mask_hi: ulong`(id 86 · vt 176)을 append**.
기계 판은 `server/src/trade/strategy/LimitChaserChangeMask.h` `kMaskFields[]`(gh-radar 의 이름→비트 표 대조 상대는 이 표 하나다).

| 비트 | 그룹 | 와이어 필드 | vtable | 클라 컨트롤 |
|---:|---|---|---:|---|
| 0 | 매수 공통 | `buy_enabled` | 28 | `chkBuyEnabled` |
| 1 | 매수 공통 | `buy_order_price` | 14 | `numBuyOrderPrice` |
| 2 | 매수 공통 | `buy_watch_price` | 18 | `numBuyWatchPrice` |
| 3 | 선 | `pre_buy_enabled` | 100 | `chkPreBuyEnabled` |
| 4 | 선 | `buy_order_amount` | 80 | `numBuyOrderAmount` |
| 5 | 선 | `buy_order_qty` | 16 | (파생 ← 금액 ÷ `numBuyOrderPrice`) |
| 6 | 선 | `buy_watch_amount` | 158 | `numBuyWatchQty`(만원 칸) |
| 7 | 선 | `buy_watch_qty` | 20 | (파생 ← ÷ `numBuyWatchPrice`) |
| 8 | 선 | `buy_trade_qty_enabled` | 26 | `chkBuyTradeQtyEnabled` |
| 9 | 선 | `buy_min_trade_amount` | 160 | `numBuyMinTradeQty`(만원) |
| 10 | 선 | `buy_min_trade_qty` | 22 | (파생) |
| 11 | 선 | `sweep_enabled` | 50 | `chkSweepEnabled` |
| 12 | 선 | `sweep_min_tick_count` | 52 | `numSweepMinTickCount` |
| 13 | 선 | `sweep_watch_price` | 48 | `numSweepWatchPrice` |
| 14 | 줄 | `extra_buy_enabled` | 102 | `chkAddBuyEnabled` |
| 15 | 줄 | `extra_buy_order_amount` | 108 | `numAddBuyOrderAmount` |
| 16 | 줄 | `extra_buy_order_qty` | 110 | (파생 ← ÷ `numBuyOrderPrice`) |
| 17 | 줄 | `extra_buy_min_amount` | 162 | `numAddBuyMinQty`(만원) |
| 18 | 줄 | `extra_buy_min_qty` | 104 | (파생 ← ÷ `numBuyWatchPrice`) |
| 19 | 줄 | `extra_buy_max_amount` | 164 | `numAddBuyMaxQty`(만원) |
| 20 | 줄 | `extra_buy_max_qty` | 106 | (파생) |
| 21 | 줄 | `extra_buy_burst_release` | 138 | `chkAddBuyBurstRelease` |
| 22 | 줄 | `extra_buy_auto` | 156 | `chkAddBuyAuto` |
| 23 | 후 | `post_buy_enabled` | 114 | `chkPostBuyEnabled` |
| 24 | 후 | `post_buy_order_amount` | 122 | `numPostBuyOrderAmount` |
| 25 | 후 | `post_buy_order_qty` | 124 | (파생 ← ÷ `numBuyOrderPrice`) |
| 26 | 후 | `post_buy_rebound_pct` | 116 | `numPostBuyReboundPct` |
| 27 | 후 | `post_buy_floor_amount` | 166 | `numPostBuyFloorQty`(만원) |
| 28 | 후 | `post_buy_floor_qty` | 118 | (파생 ← ÷ `numBuyWatchPrice`) |
| 29 | 후 | `post_buy_auto` | 132 | `chkPostBuyAuto` |
| 30 | 매도 | `sell_enabled` | 42 | `chkSellEnabled` |
| 31 | 매도 | `sell_order_price` | 30 | `numSellOrderPrice` |
| 32 | 매도 | `sell_watch_price` | 34 | `numSellWatchPrice` |
| 33 | 매도 | `sell_watch_amount` | 168 | `numSellWatchQty`(만원) |
| 34 | 매도 | `sell_watch_qty` | 36 | (파생 ← ÷ `numSellWatchPrice`) |
| 35 | 매도 | `sell_order_ratio` | 72 | `numSellOrderRatio` |
| 36 | 매도 | `sell_qty_track_enabled` | 74 | `chkSellQtyTrack` |
| 37 | 매도 | `sell_qty_track_ratio` | 76 | `numSellQtyTrackRatio` |
| 38 | 매도 | `sell_trade_qty_enabled` | 44 | `chkSellTradeQtyEnabled` |
| 39 | 매도 | `sell_min_trade_amount` | 170 | `numSellMinTradeQty`(만원) |
| 40 | 매도 | `sell_min_trade_qty` | 38 | (파생 ← ÷ `numSellWatchPrice`) |
| 41 | 취소 | `cancel_qty_enabled` | 84 | `chkCancelByQty` |
| 42 | 취소 | `cancel_watch_amount` | 172 | `numCancelQty`(만원) |
| 43 | 취소 | `cancel_watch_qty` | 86 | (파생 ← ÷ `numSellWatchPrice`) |
| 44 | 취소 | `cancel_trade_enabled` | 88 | `chkCancelByExec` |
| 45 | 취소 | `cancel_qty_track_enabled` | 90 | `chkCancelByTracking` |
| 46 | 자동매도 | `auto_sell_enabled` | 140 | `chkAutoSell` |
| 47 | 자동매도 | `auto_sell_start_cond` | 142 | `txtAutoSellStartCond` |
| 48 | 자동매도 | `auto_sell_ratio_pct` | 144 | `numAutoSellRatio` |
| 49 | 자동매도 | `auto_sell_method` | 146 | `cmbAutoSellMethod` |
| 50~63 | 예약 | — | — | 새 칸은 50부터 append |

**그룹 7개.** 매수 공통 0-2 · 선 3-13 · 줄 14-22 · 후 23-29 · 매도 30-40 · 취소 41-45 · 자동매도 46-49 (예약 50-63).
**취소 리셋 조건 = 취소 그룹 ∪ 매도 공유 5칸**(32 `sell_watch_price` · 37 `sell_qty_track_ratio` · 38 `sell_trade_qty_enabled` ·
39 `sell_min_trade_amount` · 40 `sell_min_trade_qty`) — 취소 판정이 이 매도 칸을 재사용하므로 이 다섯 칸 비트는 취소 래치·기준선도 리셋한다.

**비트 없는 칸.**

- 식별·고정·봉인 20(괄호는 field id): `isin`(0) · `account_no`(1) · `market`(2) · `client_key`(3 dep) · `crud`(4) · `buy_watch_side`(10 dep) ·
  `sell_min_cum_volume`(18 dep) · `sell_cum_volume_enabled`(21 dep) · `sweep_recalc_enabled`(25) · `sweep_min_count`(26) · `sweep_min_rate`(27) ·
  `exchange`(28) · `a3_buy4_enabled`(29 dep) · `smart_sell`(30 dep) · `origin_ord_qty`(31 dep) · `buy_price_break_enabled`(32 dep) ·
  `sell_price_break_enabled`(33 dep) · `buy_entry_latched`(46 dep) · `buy3_schema`(47) · `post_buy_reentry`(58 — 보관·에코만). 그리고 `change_mask`(85) 자신.
- S→C 전용 15: `sell_order_qty`(14) · `sell_qty_track_baseline`(37) · `sell_entry_latched`(39) · `cancel_qty_track_baseline`(44) ·
  `cancel_entry_latched`(45) · `extra_buy_abandoned`(54) · `post_buy_trigger_qty`(61) · `post_buy_reentry_left`(62 dep) · `post_buy_phase`(63) ·
  `extra_buy_abandon_qty`(65) · `post_buy_unlock_qty`(66) · `auto_sell_state`(72) · `auto_sell_sold_qty`(73) · `auto_sell_basis`(74) ·
  `auto_sell_basis_price`(75).

**칸 수.** CONTEXT D-03 의 「약 44개」·「S→C 16개」는 10/28 합의 때 어림수 — RESEARCH §1 전수(기존 필드 85 = id 0~84)로 비트 50(sweep 3칸
`sweep_enabled`·`sweep_min_tick_count`·`sweep_watch_price` 는 Designer 가 `OnStrategyOptionChanged` 에 배선한 사람 편집 칸이라 포함, 금액의 짝
수량 11칸은 relay 도 세워야 하므로 포함) · 식별·고정·봉인 20(`post_buy_reentry` 는 보관·에코 전용이라 S→C 가 아니라 여기) · S→C 전용 15 로 확정,
**50 + 20 + 15 = 85**, 새 `change_mask`(id 85) 는 그 밖.

### ③ gh-radar-12 질문 2)·4) 답

- **D-05 바뀐 칸 정의** — 바뀐 칸 = **사람이 이 제출 사이에 손댄 칸**(클릭·입력·스핀·Enter·콤보·[기본값]). 값이 같아도 비트, ON→OFF→ON 도 비트.
  마지막 에코와의 diff 가 **아니다**(소진 에코가 늦게 오는 틈에 껐다 켠 의도를 잃는다). WinForms 정의가 정본이고 웹도 같은 정의를 따른다.
  WinForms 는 값이 그대로인 Enter 확정도 손댐으로 센다. 에코 적용은 손댐이 아니고 마스크를 비우지도 않는다. 송신 성공 직후 비운다.
  WinForms 상따 창에는 지금 [기본값] 버튼이 없다 — 웹에 「기본값으로」 같은 버튼이 있다면 누르기 전/후 값을 비교해 **바뀐 칸 전부**의 비트를 세운다(D-12).
- **D-06 반영 규칙**(`buy3_schema ≥ 6`, 기존 전략)

  | 칸 종류 | 비트 있음 | 비트 없음 |
  |---|---|---|
  | 체크 | 값 ON → 켠다(선·줄매수는 소진 상태여도 재무장, 후매수는 「감시」 단계일 때만) · 값 OFF → 끈다(킬 스위치 그대로) | 에코가 보여 준 상태 유지 — 와이어 값이 ON 이어도 무시, 게이트 무접촉 |
  | 숫자·금액·콤보 | 그 값으로 교체 | 에코가 보여 준 값 유지(장중 서버가 고친 취소잔량 ×0.8·후매수 발동잔량·기준선이 되돌아가지 않음) |

  그룹 게이트는 「그 그룹 체크 비트 ∨ 마스터 bit0」 일 때만 다시 쓴다. **마스터 bit0 ∧ ON 은 세 그룹 게이트를 화면 값(접힌 설정) 대로 다시 쓴다** —
  발주로 접힌 그룹은 그 그룹 체크 비트가 함께 와야 열린다. 규칙(2026-10-30 사용자 결정): 선·줄매수가 다 나가 마스터까지 자동 해제(D-34)된 뒤
  ☐선매수만 다시 켜면 마스터 + 선매수만 ON, 줄매수는 OFF 그대로. 사람이 ☐매수주문을 껐다가 마스터 비트만 실어 다시 켜도 화면이 OFF 로 보인
  그룹은 OFF 로 남는다(구 세대 클라와 같은 결과).
- **D-07** — 신규 등록(서버에 그 isin·계좌·거래소 전략이 없음)은 마스크를 무시하고 전체 반영, 삭제(crud D)는 마스크 무관. 서버가 기존 전략 유무로 판정한다.
- **D-08 그룹 조건** — 매도·취소 래치·기준선 리셋, 게이트 변경, 후매수 ON→ON 갈래(하한 상향 등), 자동매도 Start/Stop 전이는 **그 그룹 비트가 있을 때만**.
  금액·매수 칸만 고친 제출은 매도 감시를 건드리지 않는다.
- **D-09** — 비트 없는 칸의 와이어 값이 서버 값과 다르면 **거부하지 않고** info 1줄
  `[Gateway] 상따 마스크 밖 불일치 N칸(이름·이름) isin= acct= schema= mask=0x…`(제출당 최대 1줄, 이름 대표 3개). 웹이 낡은 값을 실어도 정상 제출이다.
- **D-10 짝 비트는 relay 몫** — 서버는 칸마다 독립 반영이고 묶음 책임은 보내는 쪽이다. **relay 가 금액 수정 때 짝 수량 비트를 같이 세운다**
  (금액 → 수량 = 금액 ÷ 그 칸의 가격 · 매수가격이 바뀌면 수량 3칸 · 매수 비교가가 바뀌면 수량 5칸 · 매도 비교가가 바뀌면 수량 3칸). WinForms 짝 규칙(같은 표를 relay 로 옮긴다 — 컨트롤 이름 → 비트):
  `numBuyOrderAmount`(4)→5 · `numBuyWatchQty`(6)→7 · `numBuyMinTradeQty`(9)→10 · `numAddBuyOrderAmount`(15)→16 · `numAddBuyMinQty`(17)→18 ·
  `numAddBuyMaxQty`(19)→20 · `numPostBuyOrderAmount`(24)→25 · `numPostBuyFloorQty`(27)→28 · `numSellWatchQty`(33)→34 · `numSellMinTradeQty`(39)→40 ·
  `numCancelQty`(42)→43 · `numBuyOrderPrice`(1)→{5,16,25} · `numBuyWatchPrice`(2)→{7,10,18,20,28} · `numSellWatchPrice`(32)→{34,40,43} ·
  `chkSellQtyTrack`(36, OFF 로 바뀔 때)→{33,34} · `chkCancelByTracking`(45, OFF)→{42,43}. 체크 칸에는 파생이 없다.
- **D-14** — `buy3_schema ≤ 5` 제출이 소진된 선·줄매수 게이트를 다시 열 때 warn `[Gateway] 구 세대 재제출이 소진된 선·줄매수를 다시 연다 …` 1줄. 동작은 종전 그대로.
- **`lcBuy3SchemaOf` 단조성** — 6 은 **앞 다섯 조건 전부 + `changeMask` 존재**일 때만 파생한다(P-1). `changeMask` 만 있고 앞 조건 미달이면 낮은 schema
  (조립기 경고) — 마스크가 5 이하 세대에 실리면 서버가 읽지 않아 전체 반영된다.

판정기가 걸린 파일:

- server/docs/protocol.md
- (fbs 는 44-01 커밋 `55e62638` 에서 먼저 바뀌었다 — server/src/protocol/StockDMA.fbs)

## gh-radar 가 할 일

- **생성물 재동기화는 이 세션이 끝냈다** — `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 실행, `--check` 0 diff,
  새 SYNC MARKER `server-repo-commit: 55e62638`. 바뀐 파일은 `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/set-limit-chaser.ts` 둘 —
  **gh-radar 저장소에서 경로 지정 커밋만 남았다**(gh-trade 쪽은 커밋하지 않았다).
- **필수 아님(호환)**: relay 가 지금처럼 `buy3_schema` 5 로 재제출하면 종전 전체 반영·재무장 — 깨지는 것이 없다(D-14 warn 만 늘 수 있다).
- **★주의 — relay 가 `buy3_schema` 6 으로 올리면**:
  - 웹→relay 는 **바뀐 칸 이름 배열**로 받고, relay 가 ② 표로 uint64 를 만든다(이름→비트 대조 테스트는 gh-radar 몫 — 대조 상대는 protocol.md 표 하나).
  - 금액 수정 때 **짝 수량 비트를 같이 세운다**(③ D-10 표).
  - `lcBuy3SchemaOf` 에 `changeMask` 존재 조건을 더해 6 을 파생한다(앞 다섯 조건 전부 + `changeMask`).
  - 에코 적용 코드는 무변경(에코 `change_mask` 는 늘 0).
  - 웹의 「손댐」은 D-05 정의(사람 조작 — 값이 같아도 비트, 에코 diff 아님)를 따른다.
- 전환 전까지는 5 그대로(동작 불변). DB 마이그레이션 불필요. relay S→C 전용 필드 목록 변동 없음(`change_mask` 는 C→S 전용 — 에코에서 읽을 필요 없음).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 서버가 먼저 나가도 relay(≤ 5)는 종전 전체 반영·재무장(동작 불변, warn 1줄만). 순서는 gh-trade 서버(120·119) → WinForms 클라 Release(같은 날, D-15) → relay·웹(DB → relay → webapp)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 서버 로그 `[LimitChaser] 설정 갱신 … 마스크=0x…(N비트)` — relay 제출의 비트 수가 웹에서 바꾼 칸 수(+ 짝 수량 비트)와 같다. 전환 전 relay(5)는 `마스크=전체`.
- `[Gateway] 상따 마스크 밖 불일치 N칸(…)` 이 웹 탭 제출에서 **드물게**만 보인다(자주 보이면 relay 가 바뀐 칸 비트를 빠뜨린 것).
- `[Gateway] 구 세대 재제출이 소진된 선·줄매수를 다시 연다` warn 이 relay 전환 뒤 0 으로 줄어든다.
- 와이어 모양의 정본은 gh-trade doctest `[chmask]` C11~C14(`server/tests/test_gateway_fanout.cpp` — 와이어 병합·신규 등록 전체 반영·삭제 무관) ·
  접힌 그룹 재무장 차단 2건(같은 파일).

## 질문

웹 탭의 「손댐」 UI 정의(칸 포커스·입력 이벤트)가 D-05 와 같은지 확인 요청 — 그 밖 없음.
