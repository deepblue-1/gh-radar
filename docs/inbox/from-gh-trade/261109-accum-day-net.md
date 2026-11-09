---
status: done
from: gh-trade
from_commit: a4e54275
from_branch: worktree-agent-a27f73af5a5f7fca2
date: 2026-11-09
fbs_sync_marker: eac98e43
done_commit: a65e4509
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-09 (Phase 48 매집감지 하루 순매수·사이클 규칙)

gh-radar-45 와 2026-11-09 에 합의한 내용을 구현했다. 와이어 구조(MsgType·필드·슬롯)는 **바뀌지 않는다**. 바뀌는 것은 뜻이고, 새 값이 몇 개 늘어난다.

## 바뀐 것

### (a) 무엇이 바뀌나

- **필드·슬롯·MsgType 무변경**(D-16). 88 AccumSignal · 89 AccumSnapshot · 90 AccumChartResp · kind 16 43칸 · 하루 이벤트 파일 키 44개(순서 그대로) · accum_flow export 기존 열은 이름과 위치가 그대로다.
- **day_* 의 뜻**: 「06:00·새 사이클에 0」 → **「06:00 에만 0」**. 사이클과 떼어 낸 종목별 하루 장부다. 청산·즉시 종료·하루 판정 종료·새 등록을 넘어 그날 끝까지 이어 센다. 미등록 구간의 팀 주문도 들어가고, 우리 서버 체결 제외는 그대로 반영한다. 해당 필드:
  - 88 `day_buy_qty`·`day_buy_krw`·`day_sell_qty`·`day_sell_krw`·`day_lo_px`·`day_hi_px`·`day_avg_px`·`day_cross_time`
  - 90 `samples[].day_net_krw`·`day_avg_px` (닫힌 차트는 지금처럼 청산 시점 값으로 고정)
  - kind 16 `snap_qty[2]`(day_buy_krw)·`snap_cum[2]`(day_sell_krw)·`accept_latency_us`(day_avg_px)
  - 이벤트 파일 `day_*` · export `pos_day_*`·`payload.pos_day`
  - `prev_*` 는 하루 장부 그날 값으로 06:00 에 확정한다(지금과 같은 시점).
- **88 회색 행이 사이클이 끝난 뒤에도 하루 값을 갱신한다**(D-04). 그날 발표된 등록이 있었던 종목은 06:00 까지 state 3 회색 행이 계속 온다. 끝난 사이클 값(cycle·since·buy/sell 누적 등)은 동결하고 하루 칸만 움직인다. `end_reason` = 그날 마지막 종료 사유다. 2026-10-27 숨김 갱신과 같은 방식이다. 89 오늘 청산 원소도 같은 값이다.
- **kind 16 `queue_case` 6 「하루 값 갱신」**(새 값, gh-radar-45 합의):
  - state 3 · `cancel_reason` = 그날 마지막 종료 사유(1/4/5) · cycle/since = 끝난 그 사이클 값 · 하루 칸만 움직인다.
  - 송출 조건: 그날 청산 사본이 있는 미등록·숨김 종목의 하루 지문(day_buy_krw·day_sell_krw·종료 사유·사이클)이 바뀐 분 M 의 다음 분 경계 (M+1):00 에 한 줄. 지문이 같으면 안 낸다. 같은 사이클로 재등장하면 지금처럼 row 1·state 1/2 라 구별된다.
  - 서버는 우리 체결 제외로 하루 값이 바뀌어도 row 6 을 낸다. 틱 예산 256 을 row 1 과 같이 쓴다(넘치면 다음 틱으로 밀릴 뿐 분 경계 시각은 그대로).
  - 양: 참조 모델 11/3 하루 30,401행 중 row 6 이 8,906행(29%)이었다. 서버 이벤트 파일·kind 16 적재량도 그 규모로 늘어난다고 보면 된다(서버 실측은 배포 첫 거래일 뒤 따로 알린다).
- **`cancel_reason`(= 88 `end_reason`) 4 뜻 변경 · 5 추가**:
  - 1 청산(사이클 누적 2억 미만 → 숨김, 다시 2억 이상이면 같은 사이클 재등장)
  - 2 기동 정합(복원 안 됨) — 그대로
  - 3 이월 만료 — **옛 서버만**. 이월 상한이 없어져 더는 생기지 않는다(`carry_days` 는 계속 세며 255 에서 포화)
  - **4 즉시 종료** — 등록·숨김 포지션의 사이클 누적 순매수 ≤ 0(장중 팀 주문). 옛 뜻 「숨김 중 등록 뒤 최고 −30% 매집 종료」 는 삭제됐다. 등록 상태에서 한 주문으로 ≤ 0 이 되면 청산(end 1) → 종료(end 4) 두 행이다. 이제 88 도 회색 행으로 온다(옛 4 는 88 없음).
  - **5 하루 판정 종료(새 값)** — 평일 20:01:00 뒤 첫 틱에 한 번, 등록·숨김 포지션 중 보유 비율 (매수 − 매도) ÷ 매수 < 5%(금액 기준) 이거나 사이클 누적 < 2억이면 종료한다. 서버가 그 시각에 꺼져 있었으면 다음 기동이나 06:00 리셋 머리에서 같은 판정을 먼저 한다.
- **message 꼬리 `|rule=2`**(D-18 새 규칙 행 표식): 모든 kind 16 행과 이벤트 파일 message 가 `…|nxt=<b>/<s>|rule=2` 로 끝난다(현실 ≈ 173B). **옛 행은 키가 없다** = 옛 규칙. 「판정 기준」 문구는 이 키로 옛 행/새 행을 가르면 된다.
- **export 열 `rule_version`**: accum_flow 평면 열 `pos_day_avg_px` 뒤 · `schema_version` 앞에 새 열. 값 = 그 isin 그날 마지막 이벤트 행 message 의 `|rule=N`, 없으면 0. **schema_version 은 그대로**(올리지 않았다). 옛 행은 0.
- **89 오늘 청산 원소** end_reason 이 1 뿐 아니라 **1/4/5** 다. 같은 날 재기동이면 저널(row 4 cancel 1/4/5 · row 6)에서 되살린다.
- **th_net_krw = 2억**(옛 1.2억). 등록 = 사이클 누적 순매수 ≥ 2억 ∧ 최근 60초 팀 매수 30조각 ∧ KRX 당일 거래대금 ≥ min(시총 1%, 100억). 시총 상한 없음(그대로).
- **carry_days 상한 없음**(255 포화) · end_reason 3 은 더는 없다.
- **export row 6 해석 규칙**(D-19): export 는 row 6 을 사이클 경계·종료로 읽지 않는다(`cycles_of`·`avg_px`·`pos_net` 은 row 6 이 없을 때와 같다). `pos_day` 에는 row 6 을 싣는다(하루 값 추이). day_* 열(pcap 재계산, KRX G1+G4)은 그대로다.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

- **relay 생성물 재동기화**: fbs 는 주석만 바뀌었다. 생성 코드는 그대로지만 SYNC MARKER 를 맞추려면 gh-radar 쪽에서 `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh` 를 돌린다(gh-trade 는 돌리지 않았다 — relay 생성물 동기화는 gh-radar 몫, 39 선례). 미병합 gh-radar 페이즈의 생성물을 지우지 않게 합친 fbs 기준으로 돌릴 것.
- **relay 파서·DB**: 새 값만 늘어난다 — kind 16 `queue_case` 6, `cancel_reason` 5, message `rule=` 키, export `rule_version` 열. 이 값들을 모르는 값으로 버리거나 깨지지 않는지 확인 부탁. row 6 은 사이클 구간·종료가 아니다(사이클 집계·「종료」 카운트에 넣지 않는다).
- **웹 표시**:
  - `cancel_reason` 라벨 — 4 「즉시 종료(누적 ≤ 0)」(옛 「매집 종료 −30%」 라벨 교체) · 5 「하루 판정 종료」.
  - **(d) 「판정 기준」 문구 제안** — 새 행(rule 2): 「사이클 누적 순매수 ≥ 2억 · 60초 30조각 · 거래대금」. 옛 행(키 없음)은 지금 문구 그대로.
  - 당일 칸 설명 「06:00·새 사이클에 0」 → 「06:00 에만 0(하루 순매수)」.
- **(c) 지난날 재적재 예고**: 119 의 9/29 ~ 마지막 거래일 accum_flow 를 새 규칙 참조 모델로 재생성한다(**20261105 포함** — 지금 export 가 없는 날). 완료 시각·날짜 목록·날짜별 행 수·백업 위치는 재생성 뒤 따로 알린다(이 노트에 「재적재」 절을 덧붙이거나 메시지로). 재생성 날짜의 차이:
  - 모델 이벤트는 **우리 체결 제외가 없다**(`our_excluded_qty` 0).
  - 모델은 **KRX G1 08 ~ 15시 팀 주문만**으로 사이클·하루 값·20:01 하루 판정을 만든다(G4 16 ~ 20시·NXT 팀 주문 없음).
  - export `day_*` 열은 그대로 pcap KRX 만(G1+G4)이다. 그래서 같은 날 모델 이벤트의 하루 순매수와 export `day_net_krw` 는 G4 몫만큼 다를 수 있다.
  - 재생성 행도 `rule_version` 2 다.
- **(e) 범위 밖**: 인박스 `261105-limitup-export-20261104-missing` 은 이 인계 범위 밖이다. 20261104 export 는 지금 있다(언급만 — 그 노트의 답·상태 닫기는 따로).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 필드·슬롯 무변경, 새 값(queue_case 6·cancel_reason 5·rule 키·rule_version 열)만 늘어난다. 옛 gh-radar 가 모르는 값을 만나도 깨지지 않는지 확인 부탁

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

gh-trade 쪽 배포 계획: 서버 120 → 119 → 112(121 손대지 않음)를 장 마감 뒤에 배포하고, 119 분석기(밤 배치 export 코드)도 같은 시점에 바꾼다. 그 뒤 119 지난날 재생성을 한다.

## 확인 방법

- 배포 첫 거래일 kind 16 행 message 가 `|rule=2` 로 끝난다.
- 장중 `queue_case` 6 행(state 3 · cancel_reason 1/4/5)이 보인다. 그 행의 cycle/since 는 끝난 사이클 값이고 하루 칸(snap_qty[2]·snap_cum[2])만 움직인다.
- 장중 `cancel_reason` 4(즉시 종료) 종료 행, 20:01 뒤 `cancel_reason` 5(하루 판정 종료) 종료 행이 보인다.
- 88 회색 행의 하루 칸이 사이클 종료 뒤에도 06:00 전까지 바뀐다.
- 밤 배치 accum_flow 의 `rule_version` 열이 2 이고, row 6 이 사이클 수·종료 집계에 들어가지 않는다.
- 재적재 뒤 지난날 행의 `rule_version` 이 2 다.

## 질문

1. 옛 relay·웹이 `queue_case` 6 · `cancel_reason` 5 · message `rule=` 키 · export `rule_version` 열을 만나도 문제없이 받는가(모르는 값은 버리거나 그대로 저장)? 문제가 있으면 gh-trade 배포 전에 알려 달라.
2. row 6 으로 kind 16·이벤트 파일 양이 하루 약 30% 늘어난다(모델 11/3 기준). 적재 쪽 용량·쿼리에 부담이 있는가?
3. 지난날 재적재 통보 형식(노트 「재적재」 절 vs 새 노트) 선호가 있는가? 없으면 이 노트에 절을 덧붙인다.
