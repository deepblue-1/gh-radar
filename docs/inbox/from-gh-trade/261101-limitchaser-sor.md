---
status: done
from: gh-trade
from_commit: e2775e98
from_branch: master
date: 2026-11-01
fbs_sync_marker: 21d692a1
done_commit: ad4cf510
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-01

## 바뀐 것

Phase 45 「상따 SOR — KRX·NXT 합산 매도·라우팅 매수」 — MsgType 번호 무변경, `SetLimitChaser` 테이블 말미 append 2필드 + 세대 7, 미러는 서버.
상따창 매수·매도 패널 맨 위의 ☐SOR 를 켜면 그 그룹 설정이 KRX·NXT 공용 한 벌이 되고, 매도 SOR 은 KRX+NXT 상한가 매수잔량 합산으로 판정해 주문가능수량을
두 거래소에 나누며(양쪽 매수 미체결 취소·1번 이동·봇매도 대기 포함), 매수 SOR 은 성립 순간 양 시장 비교가격 잔량을 비교해 한 거래소에 1건 낸다.
fbs 커밋은 gh-trade `21d692a1`(45-01 — 이 노트의 `fbs_sync_marker` 와 같다, 이미 origin/master 에 있어 아래 판정기 목록에는 protocol.md 만 걸렸다).
정본: `server/docs/protocol.md` 「SetLimitChaser change_mask 비트 표」·「SetLimitChaser SOR 미러·합산·라우팅 요약 (Phase 45)」 · 동작 `docs/strategy/limit-chaser.md` §6-7.

판정기가 걸린 파일:

- server/docs/protocol.md

### ① 필드·세대

- **`SetLimitChaser.sor_buy: bool` (field id 86 · vtable 176, 양방향, 테이블 끝 append)** — ☐SOR(매수).
- **`SetLimitChaser.sor_sell: bool` (field id 87 · vtable 178, 양방향, 테이블 끝 append)** — ☐SOR(매도).
- 에코(Set 응답·푸시)에 **설정값이 그대로 실린다** — 44 의 `change_mask`(C→S 전용, 에코 0)와 달리 **양방향**이다(D-02). 웹은 키별 에코의 `sor_*` 로 표시하면 된다.
- **`buy3_schema` 7** = 두 필드를 싣는 세대. 서버는 `buy3_schema ≥ 7` 일 때만 `sor_buy`·`sor_sell` 을 읽고, **≤ 6 은 서버 값 유지**(2·3·4·5·6 의 종전 keep 관례 —
  44 의 「≤ 5 = 전체 반영」과 다르다. schema ≤ 5 는 전 비트 반영이라 keep 블록이 SOR 플래그를 지킨다 — Pitfall 7, doctest `[sor] G2`). 7 은 6 의 마스크 규칙을 그대로 포함한다.
- **relay `lcBuy3SchemaOf` 단조성** — **앞 여섯 조건 전부(postBuyAuto · extraBuyBurstRelease · 자동매도 4필드 · extraBuyAuto · changeMask) + sorBuy/sorSell 존재**일 때만 7 을
  파생해야 한다(지금 함수는 changeMask 까지 보고 6 을 돌려준다 — `relay/src/dma/envelope.ts:1508`). `sorBuy/sorSell` 이 있는데 schema 가 7 미만이면 그 두 필드를 싣지 않고
  (서버 값 유지) 경고 — 기존 필드들과 같은 꼴.
- 상태 키 `sor_buy`·`sor_sell`(⑥).

### ② 비트 표 (`server/docs/protocol.md` 「SetLimitChaser change_mask 비트 표」 52행 그대로)

규칙: **append-only · 재사용·재배치 금지 · 새 칸은 52부터**. 기계 판은 `server/src/trade/strategy/LimitChaserChangeMask.h` `kMaskFields[52]`.

**예약 번호 문장 정정:** 261030 노트(`261030-limitchaser-change-mask.md`) §② 의 「64비트가 차면 `change_mask_hi: ulong`(id 86 · vt 176)을 append」는 **이제 틀리다** —
id 86/vtable 176 · id 87/vtable 178 을 `sor_buy`·`sor_sell` 이 썼다(FlatBuffers id 는 선언 순서라 비워 둘 수 없다). `change_mask_hi` 는 64비트가 차면 **그때의 말미에**
append 한다(번호는 그때 정한다).

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
| 50 | SOR | `sor_buy` | 176 | `chkBuySor` |
| 51 | SOR | `sor_sell` | 178 | `chkSellSor` |
| 52~63 | 예약 | — | — | 새 칸은 52부터 append |

- 칸 수: 비트가 있는 칸 52 · 식별·고정·봉인 20 · S→C 전용 15 → **52 + 20 + 15 = 87**, `change_mask`(id 85) 자신은 그 밖 — 전 필드 88 = id 0~87.
- 그룹 8개: 매수 공통 0-2 · 선 3-13 · 줄 14-22 · 후 23-29 · 매도 30-40 · 취소 41-45 · 자동매도 46-49 · **SOR 50-51**(`kMaskGroupSor`) · 예약 52-63.
- 미러 범위 상수(D-05): `kMaskGroupSorBuyScope` = 매수 공통∪선∪줄∪후 · `kMaskGroupSorSellScope` = 매도∪취소∪자동매도.

### ③ 규칙 — gh-radar 가 알아야 할 것

- **미러는 서버(D-03).** Set 수신에서 서버가 그 제출의 SOR 그룹 칸을 Phase 44 병합 함수(`MergeMaskedOnto`) 그대로 다른 거래소 전략에 다시 적용한다(상대 전략이 없으면
  exchange 만 뒤집어 만든다). **relay·웹은 복사하지 않는다 — 자기 키(isin:acct:exchange)의 Set 만 보낸다.** 복사 요청을 따로 보내면 안 된다.
- **미러 범위(D-05):** 매수 SOR = 매수 공통·선·줄·후매수 그룹 전부(체크 포함) · 매도 SOR = 매도·취소·봇매도(자동매도) 그룹 전부(체크 포함). 켜진 뒤에는 그 그룹 칸을
  어느 창·웹에서 고치든 마스크 비트대로 상대에 같은 값이 쓰인다.
- **SOR 을 켜는 제출은 서버가 그룹 전체를 복사한다(45-REVIEW CR-01).** 웹은 SOR 체크의 손댐 비트(50·51)만 실으면 된다 — 서버가 「켜짐」(요청 키 OFF→ON, 또는
  상대 키가 그 그룹 OFF)을 감지해 미러 마스크를 그 그룹 범위(`kMaskGroupSorBuyScope`·`kMaskGroupSorSellScope`)로 넓히고, 요청 키의 **서버 현재값**(마스크
  밖 칸 포함)을 상대 키에 쓴다. 그룹 칸 비트를 웹이 일부러 같이 세울 필요가 없고, 세우면 그 칸은 와이어 값으로 덮인다(종전 병합 규칙). 복사된 체크 비트는
  짝 1회성 게이트를 다시 열지 않는다(소진된 선매수 재발주 없음 — 사람이 실은 비트만 재무장).
- **OFF 는 복사만 멈추고 값은 유지(D-07).** 플래그 자신(비트 50·51)은 늘 짝으로 같다 — 한쪽 crud D 삭제는 삭제를 전파하지 않고 남은 쪽 `sor_buy`·`sor_sell` 을 내린다(A6).
- **D-06 입력 장치 규칙 — 웹도 같다:** 매수 SOR 을 켜는 조작은 매도 SOR 도 함께 켜 두 비트(50·51)를 같은 제출에 싣고, 매도 SOR 을 끄면 매도만 꺼진다(매수 SOR 유지) —
  서버는 두 플래그를 독립 저장하고 불변식을 강제하지 않으므로 웹 입력 장치도 WinForms 와 같은 동반 규칙을 지켜야 한다. 기본 OFF, 기본설정에 항목 없음(D-08).
- **에코 2건:** SOR 미러로 다른 거래소 전략이 바뀌면(그룹 칸 복사·짝 생성·한쪽 삭제로 상대 SOR 내림) 서버는 요청 키 에코에 이어 **다른 거래소 키의 에코
  (`SetLimitChaserResp`)를 한 건 더** 보낸다. relay·웹은 키(isin·계좌·거래소)로 행을 골라 각자 덮으면 되고 복사 요청을 따로 보내지 않는다. 미러가 돌지 않은 제출
  (SOR 무관·SOR 그룹 밖 칸)은 1건이다. 「응답 1건」을 가정한 코드(요청-응답 짝 맞추기 등)가 있으면 손봐야 한다.
- 짝 공유값(매도·취소 무장·래치·기준선)은 두 키 에코가 같은 값을 싣는다(D-24).
- **봇매도 명령(41) [바로시작]·[중지]도 `sor_sell` ON 이면 짝 양쪽에 적용되고 두 키 에코가 온다.**

### ④ NXT 비거래 종목

NXT 거래 대상이 아닌 종목에서 `sor_buy`/`sor_sell` 을 OFF→ON 으로 켜는 SetLimitChaser(schema 7) 제출은 저장·에코 없이 54 ERROR(`source` "SetLimitChaser")
「NXT 미거래 종목 — SOR 을 켤 수 없습니다(상따 설정을 저장하지 않았습니다)」 1줄로 거부된다(제출 전체 — 다른 칸도 저장되지 않는다). 이미 ON 인 전략의 유지 제출(ON→ON)은
통과한다. 웹은 그 종목에서 SOR 토글을 OFF·비활성으로 둔다(D-04 — WinForms 와 같다).

### ⑤ 54 사유 줄 4종 · 로그 모양 (새 StrategyEvent kind 없음)

- **새 StrategyEvent kind 없음**(A8) — 80/81/82 journal 계약 무변경. 나눔·이동·라우팅·봇매도 대기는 54 사유 줄 + 서버 로그로만 보인다.
- 새 `OrderReason` 4개의 `OrderReasonName`(54 조건명): `SorSellSplit` 「호가매도 나눔(KRX·NXT 합산 ≤ 매도조건 → 분할)」 · `SorMoveOnce` 「호가매도 1번 이동(한쪽 미체결 → 상한가 쪽)」 ·
  `SorRoute` 「매수 라우팅(양 시장 비교 → 한 거래소 1건)」 · `AutoSellHold` 「봇매도 대기(매도조건 매도 뒤 시작)」.
- 54 줄 모양(`FormatOrderNotice`):
  - 나눔 `호가매도 나눔 | 합산 25,000 (KRX 20,000 + NXT 5,000) · 매도조건 30,000 → KRX 4,000주 · NXT 1,000주` — `source` "LimitChaser", 짝 두 인스턴스(두 키)가 1건씩
  - 1번 이동 사건 `호가매도 1번 이동 | NXT 미체결 600 취소 → KRX 상한가`(두 키 1건씩) + 이동 매도 주문 줄 `매도 600주 @13,000 — 1번 이동 — 상대 거래소 미체결 취소분`(옮겨 간 쪽 1건)
  - 라우팅 `매수 라우팅 | NXT 매도잔량 8,000 > KRX 3,000 → NXT`(줄·후매수는 `NXT 매수잔량 500 < KRX 2,000 → NXT`) — 실제로 다른 거래소를 골랐을 때만, 두 키 1건씩
  - 봇매도 대기 `봇매도 시작조건 충족 — 매도조건 매도 뒤 시작(대기) | KRX`(NXT 면 `| NXT`) — `source` "AutoSell", 거래소별 1회
- 주의: 54 문맥(`ServerMessage` 상관 필드)에는 isin·계좌만 있고 거래소가 없다. 짝 두 인스턴스가 1건씩 내므로 isin·계좌로만 거르는 표시는 나눔·이동·라우팅 줄을 2번 볼 수 있다
  (gh-trade Phase 45 `deferred-items.md` D-24 — 서버 한 인스턴스 발행으로 바꿀지 UAT 뒤 결정. 바뀌면 다시 알린다).
- 서버 로그: `[LimitChaser] 발동 | 합산 25000 (KRX 20000 + NXT 5000) ≤ 매도조건 30000 isin= 계좌=` · `[LimitChaser] 나눔 | 둘 다 상한가 · 잔량 비율 → KRX 4000 · NXT 1000 isin= 계좌=` ·
  `[LimitChaser] 1번 이동 | NXT 미체결 600 취소 → KRX 상한가 isin= 계좌=` · `[LimitChaser] 라우팅 | NXT 매도잔량 8000 > KRX 3000 → NXT isin= 계좌=` ·
  `[AutoSell] 봇매도 시작조건 충족 — 매도조건 매도 뒤 시작(대기) isin= 계좌= 거래소= 발동가= 기준=`.

### ⑥ 상태 키 · 재기동

- `log/strategy_state.toml` 의 `[[strategy]]` 항목에 `sor_buy`·`sor_sell`(와이어 이름 그대로, 부재 = false). 재기동 때 두 항목(KRX·NXT)이 각각 등록되며 짝이 다시 붙는다.
  1번 이동·봇매도 대기 등 짝 런타임은 비영속. 한쪽만 파일에 있으면 단독 운전, 로그인 Set 이 오면 미러가 상대를 만든다.

## gh-radar 가 할 일

- **생성물 재동기화는 이 세션이 끝냈다** — `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 실행, 새 마커 `server-repo-commit: 21d692a1`, `--check` 0 diff.
  gh-radar 작업 트리에 `relay/src/generated/StockDMA.fbs` · `relay/src/generated/stock-dma/set-limit-chaser.ts` 변경이 놓여 있다 — **gh-radar 저장소에서 경로 지정 커밋만 남았다**
  (`git add relay/src/generated/`, 이 노트와 별도 또는 함께).
- relay: `lcBuy3SchemaOf` 에 7 단계(앞 여섯 조건 + `sorBuy`/`sorSell` 존재) · `LcSetCfg` 에 `sorBuy`/`sorSell` · `buildSetLimitChaserReq` 가 schema 7 일 때만 두 필드를 싣는다 ·
  에코 파서가 `sorBuy()`/`sorSell()` 을 읽어 웹에 넘긴다.
- ★주의: relay 가 7 로 올리면 웹 상따 설정 탭에 ☐SOR 2개(매수 ON → 매도 동반, D-06)를 표시·제출하고, **에코 2건**을 수용하고, **NXT 비거래 종목은 비활성**으로 둔다.
  복사 로직은 넣지 않는다(서버가 미러한다).
- 전환 전까지는 6 그대로 둬도 동작 불변이다 — SOR 은 WinForms 에서만 켜지고, 웹 제출(schema ≤ 6)은 `sor_*` 를 지우지 않는다(서버 값 유지, `[sor] G2`).
  다만 SOR 이 켜진 종목에서 웹이 매도·매수 그룹 칸을 고치면 그 값은 서버가 상대 거래소에도 미러한다(웹 쪽 추가 작업 없음).
- 범위 밖: 「호가창 합산 한 줄」(KRX + NXT 상한가 잔량 표시)은 이번 Phase 45 범위 밖이다(CONTEXT Deferred) — 웹도 만들 필요 없다.
- DB 마이그레이션: 필요 여부는 gh-radar 판단(웹이 상따 설정을 저장한다면 `sor_buy`·`sor_sell` 2칸).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 서버가 먼저 나가도 relay(≤ 6)는 서버 값 유지(SOR 은 켜지지 않은 채 종전 동작). 순서는 gh-trade 서버(120·119) → WinForms 클라 Release → relay·웹(DB → relay → webapp). Phase 44(변경 마스크)가 미배포면 45 와 한 배포로 묶인다(45-DEPLOY.md)

- relay 가 서버보다 먼저 7 을 보내면 구 서버는 vt 176/178 을 모르는 슬롯으로 무시하고 schema 7 을 `≥ 6` 으로 읽어 Phase 44 마스크 경로로 간다(SOR 없음 — 해롭지 않지만 웹 SOR 토글이 먹지 않는다).
  그래서 relay·웹 전환은 gh-trade 서버 배포 뒤에 한다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 서버 로그(첫 SOR ON Set 뒤): `[Gateway] SOR 미러 isin= acct= KRX→NXT 마스크=…`(또는 상대가 없으면 `[Gateway] SOR 미러 생성 isin= acct= KRX→NXT`) ·
  `[StrategyMgr] LimitChaser 등록 key=…:NXT` · `[LimitChaser] 설정 갱신 … SOR=매수{}/매도{}` 두 전략 2줄.
- 구 세대(≤ 6) 웹 재제출 뒤에도 에코의 `sor_buy`/`sor_sell` 이 그대로(서버 값 유지 — `[sor] G2`).
- relay 7 전환 뒤: 웹 ☐SOR(매수) 켜기 → 송신 schema 7 · 마스크 비트 50·51(D-06 동반 — 그룹 칸 복사는 서버가 넓혀서 한다, CR-01) → 에코 2건(두 키 모두
  `sor_buy = sor_sell = true`, 상대 키의 매수·매도 그룹 칸 = 요청 키 값) · NXT 비거래 종목에서 토글 비활성(54 ERROR 없음).
- 와이어 모양의 정본은 gh-trade doctest `server/tests/test_gateway_fanout.cpp` `[sor]` G1~G6(G1 미러 생성·에코 2건 · G2 세대 keep · G3 NXT 비거래 거부 · G4 그룹 한정 미러·OFF 유지 ·
  G5 봇매도 명령 양쪽 · G6 crud D 삭제 · G7 SOR 다시 켜기 = 그룹 전체 복사(45-REVIEW CR-01)).

## 질문

- 웹 탭 ☐SOR 매수 ON 이 매도 SOR 을 함께 켜는 UI 규칙(D-06)을 웹도 똑같이 따르는지 확인 요청.
- 에코 2건을 받는 relay·웹 상태 코드에 「Set 1건 = 응답 1건」 가정이 있는지 — 있으면 알려 달라. 그 밖 없음.

## gh-radar 처리 (261101 · quick-261101-okd)

커밋:

- `bce42b6a` feat(relay): 상따 SOR buy3_schema 7 — 생성물 재동기화(마커 21d692a1) 커밋 · shared 비트 표 52행(50 `sor_buy` · 51 `sor_sell`) ·
  `lcBuy3SchemaOf` 7(앞 여섯 조건 + `sorBuy`·`sorSell` 둘 다) · 미달이면 6 이하 + 두 필드 미적재 + 경고 · 에코 파서 `sorBuy()`/`sorSell()` ·
  zod `lc.set` cfg 선택 필드. gh-trade `LimitChaserChangeMask.h` 52줄 대조 테스트 실행·초록.
- `093da9f3` feat(webapp): 상따 ○SOR 매수·매도 토글 — 매수주문 · 매도주문 제목줄 체크 · D-06 동반 · NXT 미거래 종목 잠금.
- `ad4cf510` fix(webapp): 에코 2건 — 카드의 응답 판정을 키별 에코 맵으로.

질문 답:

1. **예, 웹도 D-06 동형이다.** 매수 SOR 켜기 = 매도 SOR 동반(매도 현재값과 무관) · 한 제출에 `changed` [sorBuy, sorSell] → 비트 50·51 ·
   매도 SOR 끄기 = 매도만 · 매수 SOR 끄기 = 매수만 · 기본 OFF · `/me` 기본설정 항목 없음(D-08) · NXT 미거래 종목(relay `nxt.snap` 집합에 없음)은
   OFF→ON 비활성(54 ERROR 를 일부러 부르지 않는다) · 이미 ON 이면 끄기 허용 · 집합을 아직 모르면 막지 않는다. 복사 요청은 보내지 않는다.
2. **relay 는 없음** — hub · sweeper 가 키별이고 fanout 은 두 키 에코를 각각 `lc` 프레임으로 중계한다(테스트 okd-4).
   **웹은 있었다** — 카드 응답 판정(「서버가 답했는가」)이 단일 슬롯 `lastLimitChaserEcho` 를 키로 거르는 구조라, 두 키 에코가 한 렌더 배치로 겹치고
   요청 키 에코가 내용상 새것이 없는 멱등 답(이미 무장된 재무장 · 같은 값 재제출 등)이면 요청 카드가 답을 놓쳐 3초 뒤 「미반영」이 설 수 있었다
   (요청 키 에코가 값을 바꾸는 보통 제출은 전략 목록 변화 경로로 이미 확정됐다) → 키별 에코 맵(`limitChaserEchoByKey`)으로 고침 `ad4cf510`.

배포: gh-trade 서버(120·119) 배포 뒤 relay → webapp(push = 프로덕션) 순서. DB 마이그레이션 없음(웹은 상따 설정을 DB 에 저장하지 않는다).
이 quick 은 push · 배포를 하지 않았다 — 위 「확인 방법」 은 배포 뒤 메인 세션이 본다.
