---
status: open
from: gh-trade
from_commit: 983bd924
from_branch: feature/limitchaser-amount-unit
date: 2026-10-11
fbs_sync_marker: e5b4fbca
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-11

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

Phase 32 「상따 수량 옵션 금액 단위 전환」 — MsgType 번호·저널 kind 무변경. `SetLimitChaser` 말미 append 8필드 + `UserSettings` 말미 append 1필드.
gh-trade 커밋: 32-01 `a36fa1ef`(트레이서 158) · `e5b4fbca`(나머지 7필드·UserSettings — fbs 최종) · `3e5760d2`(사유 문장 「N만(M주)」·RT 로그 꼬리), 문서 `983bd924`.
**기준 브랜치는 gh-trade 미병합 `feature/limitchaser-amount-unit` 이다**(master 병합 전 — 병합 뒤 마커 해시가 바뀔 수 있다).

- **`SetLimitChaser` 금액 8필드 (C→S, 만원 `uint`, 테이블 끝 append)** — `buy_watch_amount`(vtable 158) · `buy_min_trade_amount`(160) ·
  `extra_buy_min_amount`(162) · `extra_buy_max_amount`(164) · `post_buy_floor_amount`(166) · `sell_watch_amount`(168) · `sell_min_trade_amount`(170) ·
  `cancel_watch_amount`(172). 상따창 수량 임계 칸(선매수 매도잔량·체결량, 줄매수 최소·최대, 후매수 최소, 매도 매수잔량·체결, 취소 매수잔량)에
  사람이 넣은 **만원 원값**이다. 「발동」 칸은 금액 필드가 없다(S→C `post_buy_trigger_qty` 주를 클라가 역산).
  - 규약은 `buy_order_amount` 와 같다 — 서버는 **보관·에코·상태파일만** 하고 평가·발주에는 쓰지 않는다. 서버가 비교하는 값은 종전대로 주 필드
    (`buy_watch_qty` 등)이고 C# 클라가 제출 때 `주 = floor(만원 × 10000 ÷ 그룹 비교가)`(매수 그룹 = `buy_watch_price`, 매도·취소 = `sell_watch_price`)로
    1회 내림 환산해 싣는다.
  - **`buy3_schema` 게이트 없음** — 5 그대로. 서버는 늘 읽는다. **0 이 오면 0 을 저장한다(keep 아님)** — 구 relay 가 필드 없이 재제출하면 금액은 0 이 되고,
    C# 단말 칸은 주 × 비교가 역산 값으로 보인다(값이 조금 바뀌어 보일 수 있지만 서버 비교 주는 그대로라 동작은 깨지지 않는다).
  - 에코(60 Set 에코·Get·열거·300ms 푸시)는 저장 원값 그대로. 서버 상태 키 = 와이어 이름 8개(`strategy_state.toml` — 줄매수 둘은
    `extra_buy_*_amount` 로, 기존 `add_buy_*` 키와 다르다), 부재 = 0.
- **`UserSettings.post_buy_floor_amount: uint` (vtable 28, `present` 뒤 말미 append)** — 「후매수 최소」 기본값(만원 0~999,999,999, 내장 0).
  42 는 **12값 전체 교체**로 바뀌었고 84 에 실린다. 옛 `post_buy_floor_qty`(12)는 이름·형 그대로 **봉인** — 신 C# 클라는 0 을 싣고 읽지 않는다
  (`(deprecated)` 표기는 아님). 범위 밖이면 42 전체 거부(54 ERROR `후매수 하한금액은 0~999999999만원이어야 합니다`).
- **54 `[상따]` 사유 줄(ServerMessage INFO) 형식 변화** — 임계·관측 수량이 「N만(M주)」로 나온다. 예:
  - `매수1잔량 150만(15,000주) ≤ 임계 100만(10,000주)`
  - `줄매수 포기 — 매수1잔량 160만(16,000주) > 최대 150만(15,000주)`
  - 비교가가 0 이면 종전 형식(주만) 폴백: `매수1잔량 15,000 ≤ 임계 10,000`
  임계의 만원은 저장 금액 원값(그 임계가 사용자 설정 주와 같을 때만 — 후매수 발동·줄매수 값 조정처럼 서버가 바꾼 임계는 역산)이고, 관측은 늘
  `round(주 × 비교가 ÷ 10000)` 역산이다. 사유 줄 첫 토큰·`reason_code`·StrategyEvent(81/82)·저널 kind 는 무변경 — 바뀐 건 수량 숫자 표기뿐이다.
- 서버 로그 `[Gateway]` warn 2줄(상따 취소 설정 불완전 · 줄매수 설정 불완전)의 수량 칸과 RT `[LimitChaser]` 8줄 끝 `(만원)=` 꼬리도 같은 토큰을 쓴다
  (키=값 접두는 바이트 그대로 — 로그 파서가 있다면 영향 없음).

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **필수 아님(호환)**: relay 생성물은 gh-trade 가 이 노트와 같은 시점에 `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 로
  재생성해 **gh-radar 저장소에 커밋 `4970c3ae`(master, push 안 함)** 로 실었다 — `relay/src/generated/` 3파일(`StockDMA.fbs` 사본 · `stock-dma/set-limit-chaser.ts` ·
  `stock-dma/user-settings.ts`), 마커 `server-repo-commit: c6753edc → e5b4fbca`. **gh-trade 미병합 브랜치 `feature/limitchaser-amount-unit` 기준 생성물**이다
  (사본에는 master `da762186` 의 「추가매수 → 줄매수」 주석 개명도 함께 실렸다 — 주석만). relay 는 금액 필드가 없으면 0 으로 끝나고, `buy3_schema` 파생
  (P-1 단조성 — `extraBuyAuto` 등 선택 필드 존재)은 금액 필드와 무관해 5 그대로다. 아무것도 안 해도 깨지지 않는다.
- **웹에서 다루려면**:
  - ⓐ 상따 설정 화면 수량 칸 단위 표시 「만(주)」 — 만원 입력·주 환산 표시(C# 은 칸 = 만원, 툴팁 「N주 (환산가 P원)」). 환산 규칙은 gh-trade
    `docs/strategy/limit-chaser.md` §10 「금액 ↔ 수량 12벌」(제출 1회 내림 · 표시 반올림 · 그룹별 비교가 · 비교가 0 이면 그 그룹 등록 거부).
  - ⓑ `lc.set` 재제출 때 금액 8필드를 **60/64 에코값 그대로 되싣기** — 0 을 지어내면 C# 단말 칸이 사람이 넣은 만원 대신 역산 표시로 떨어진다
    (깨지진 않음 — 서버 비교 주는 웹이 싣는 주 필드 그대로). 웹이 주를 바꿔 보낸다면 금액도 그 주와 짝이 맞게(`floor(만원×10000÷비교가) == 주`) 싣거나 0 을 싣는다.
  - ⓒ 84 의 `post_buy_floor_amount` 표시·설정(옛 `post_buy_floor_qty` 는 0 — 웹이 42 를 보낸다면 12값 전체에 이 필드를 포함하고 봉인 필드는 0).
- DB 마이그레이션 불필요(54 사유 줄을 저장한다면 숫자 표기만 바뀐다). relay 서버전용(S→C) 필드 목록 변동 없음(8필드는 C→S·에코).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — append 전용이고 구 relay 가 금액 0 을 보내도 서버 비교값(주 필드)은 바뀌지 않는다. relay 가 금액을 되싣는 것은
gh-trade 서버 배포 뒤여야 의미가 있다(구 서버는 vtable 158~172 를 모르니 무시할 뿐 깨지지 않는다).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 60 에코에 금액 8필드가 실린다 — C# 상따창에서 만원을 넣은 종목은 그 원값(예: `sell_watch_amount: 100`), 구 relay 재제출 뒤면 0.
- 84 프레임에 `post_buy_floor_amount` 가 실린다(C# 「매매조건 설정」 창 「최소 [ ]만」 저장 뒤 그 값, 처음엔 0).
- 54 `[상따]` 줄이 `매수1잔량 150만(15,000주) ≤ 임계 100만(10,000주)` 꼴(비교가 0 이면 `매수1잔량 15,000 ≤ 임계 10,000`).
- 서버 `strategy_state.toml` 에 8키(`buy_watch_amount` … `cancel_watch_amount`)가 있고 재기동 뒤에도 에코 원값이 같다.
- relay 쪽: `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh --check` 가 「신규/변경 예정 0 개 · .fbs 사본 최신」.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

- 웹 상따 화면에 「만(주)」 단위 표시를 언제 도입할지(도입 전에는 ⓑ 되싣기만 해 두면 C# 칸의 만원 원값이 웹 재제출로 지워지지 않는다).
- 웹이 금액을 직접 받을지(그러면 환산 규칙 §10 을 그대로 공유 — 제출 내림·표시 반올림·그룹별 비교가), 아니면 지금처럼 주를 받고 금액은 되싣기만 할지.
