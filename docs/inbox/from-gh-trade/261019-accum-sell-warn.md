---
status: done
from: gh-trade
from_commit: c70b7d41
from_branch: master
date: 2026-10-19
fbs_sync_marker: 233cb995
done_commit: 2021cd24
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-19 매집감지 매도 조기 경보 (quick-261019-gwm)

## 바뀐 것

매집중 종목에서 「금액 ≥ 500만 팀 매도가 그 금액 이상 팀 매수 없이 3건 연속」 이면 서버가 **매도 경보**를 켠다(표시 전용, 주문 경로 무관).
MsgType·Envelope 슬롯 추가 없음. 88/89 의 같은 테이블 말미에 2필드 append, kind 16 은 기존 43칸의 재해석만 늘었다.

### (가) 88 AccumSignal / 89 AccumSnapshot.items — table AccumSignal 말미 append

| 필드 | 타입 | 필드 id | vtable | TS 접근자 | 기본값 |
|---|---|---|---|---|---|
| `sell_warn` | bool | 29 | 62 | `sellWarn()` | false |
| `sell_warns` | uint | 30 | 64 | `sellWarns()` | 0 |

- `sell_warn` = 지금 매도 경보 중. `sell_warns` = 이 사이클 경보 횟수(청산·새 사이클 0, 06:00 이월은 유지, 재기동 0 — 파일에 없다).
- 구 서버 프레임은 두 필드가 없어 기본값(false/0)으로 읽힌다. 구 relay 는 모르는 필드를 무시한다.

### (나) 관찰자 저널 kind 16 — gh-radar-9b 확정 매핑

- `queue_case` **5** = 매도 경보 **에지** — 켜질 때와 꺼질 때 **둘 다** 그 자리에서 즉시 1행(분 경계·틱 예산 밖).
  - 꺼짐 행 5 가 나가는 경우: 대상 팀 매수 1건 · 매도중 확정(분당 행보다 먼저) · 06:00 이월(종료 행 없음).
  - 예외: 청산·06:00 이월 탈락·만료처럼 종료 행 4 가 같이 나가는 경우는 **종료 행 4 만** 낸다 — 그 행의 `has_remaining = false` 가 꺼짐을 알린다(꺼짐 행 5 를 따로 내지 않는다).
  - 같은 주문이 경보와 매도중 확정을 함께 만들면 매도중이 이긴다 — 경보 행 없이 매도중으로만 간다.
- `has_remaining`(bool, 지금까지 늘 false) = `sell_warn` — **모든 행 종류**(1·2·3·4·5)에 같은 매핑.
- `condMetric` = `sell_warns`(사이클 누적) — 슬롯 칸이 uint8 이라 `min(sell_warns, 255)`.
- `message` 끝에 `|warn=<0|1>` 추가(사람용, 기존 키 순서 불변):
  `since=YYYYMMDD|reg=HHMMSS|st=<1|2|3>|end=<0..3>|cyc=<n>|carry=<n>|row=<1..5>|our=<n>|th=<net>/<same>/<mcap>|warn=<0|1>` — 최장 161B.
- 행 종류 전체: 1 분당 · 2 거래일 첫 스냅샷 · 3 복원 스냅샷 · 4 종료 · **5 매도 경보 에지**.

### (다) 지문(변화 있을 때만 판정) 구성 — JournalDigest 입력 12개, 순서대로

state · end_reason · buy_qty · sell_qty · buy_krw · sell_krw · sell_phases · our_excluded_qty · cycle · carry_days · **sell_warn** · **sell_warns**
(FNV-1a 64. 경보 켜짐·꺼짐이 분당 행에도 「변화」 로 잡힌다.)

### (라) 서버 설정 — 와이어 밖

`[accum_signal] warn_sell_streak = 3`(0 = 경보 끔) · `warn_min_order_krw = 5000000`(원, 팀 주문 완성 시점 금액). 두 값은 88/89·kind 16 어디에도 싣지 않는다.

판정기가 걸린 파일:

server/docs/protocol.md
server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

- (마) relay 스키마 재생성 — `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`, 생성 기준 233cb995 → gh-trade 커밋 c70b7d41(이 quick 커밋 1, master 병합 4e26f02e).
  233cb995 와 c70b7d41^ 사이 fbs 변경 없음 확인(미병합 페이즈 생성물을 지울 위험 없음). `--check` 결과: 신규/변경 예정 1개 · 삭제 예정 없음 · .fbs 사본 갱신 예정.
- 88/89 디코드에 `sellWarn()`·`sellWarns()` 추가, 표시(웹 매집 화면 경보 배지 등)는 gh-radar 판단.
- kind 16: `queue_case` 5 행 종류 이름 추가, `has_remaining`·`condMetric` 의 뜻(위 (나)) 반영. DB 칸은 기존 43칸 그대로라 마이그레이션 없음.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 모르는 queue_case 는 relay·RPC·웹이 원문 통과(gh-radar-9b 확인)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 서버 로그 `[AccumSignal] 매도 경보 isin=… 연속 매도 3건(건당 ≥ 500만원) …` 와 `[AccumSignal] 매도 경보 해제 isin=… 사유=<매수|매도중 확정|06:00 이월> …`.
- 기동 로그 `[Config] accum_signal warn_sell_streak=3 warn_min_order_krw=5000000 (warn_sell_streak 0=경보 끔) …`.
- strategy_events kind 16 에서 `queue_case = 5` 행 — 켜짐 행 `has_remaining = true`·message `|warn=1`, 꺼짐 행 `has_remaining = false`·`|warn=0`, `condMetric` = 그 사이클 경보 횟수.
- relay 재생성 뒤 88 디코드에 `sellWarn`·`sellWarns` 값이 실린다.

## 질문

없음

## 회신 (2026-10-19 · gh-radar quick-261019-j1w)

1. relay 생성물 재생성 — gh-trade 776320af 기준(`sync-relay-schema.sh` · flatc 25.12.19) · 재생성 커밋 e3f512af(`relay/src/generated/` 2파일만 · relay 코드 무변경).
2. kind 16 (나) 반영 — shared `AccumSignal.sellWarn`(hasRemaining) · `sellWarns`(condMetric) · 행 종류 5 그대로 통과(웹 읽기 규칙 · 복원 RPC 무변경 · DB 마이그레이션 없음). message `warn=` 키는 읽지 않는다(칸이 정본).
3. 표시 — `/trading` 작업대 「매집」 패널, 매집중 + 경보일 때 「매집중」 옆 주황 채움 「매도경보」 1초 깜빡임(클라 동형 · 동작 줄이기 켜면 정적) · 횟수는 툴팁(「이 사이클 경보 n회」). 매도중 · 청산 행은 그리지 않는다.
4. 88/89 디코드는 웹이 쓰지 않아 접근자 생성만 — 배포는 webapp push 만(relay 재배포 · DB 없음).
