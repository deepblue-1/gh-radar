---
status: done
from: gh-trade
from_commit: 8f284735
from_branch: master
date: 2026-10-31
fbs_sync_marker: 55e62638
done_commit: 7ab653ba
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-31

## 바뀐 것

위험도(상한가 거래량 ÷ 상한가 매수잔량)의 **분자** 정의가 바뀌었다(quick-261031-nd7). 두 군데에 닿는다.

**(가) 85 LimitFeature 말미 필드 1개 append — `limit_vol_qty: ulong`**

- 필드 id 34 · vtable 슬롯 72 (`table LimitFeature` 말미, `lock_cancel_krw` 바로 뒤). 기존 필드 순서·번호 무변경, MsgType·Envelope 무변경.
- TS 접근자 `limitVolQty()` (bigint). 구 서버 프레임에는 필드가 없어 기본값 0 이다. FlatBuffers 는 기본값 0 을 싣지 않으므로 「필드 없음」 과 「값 0」 은 가를 수 없다.
- 정의: 상한가 거래량(주) = A3 누적거래량 − 기준점. 기준점 = 직전 매도 체결 직후 누적거래량.
  체결 한 건마다 다음 중 하나만 적용한다.
  - 동결 중이고 체결가 < 상한가 → 동결 해제, 기준점 = 누적 − 이 체결 수량
  - 동결 아님, 매도('1'), 체결가 < 상한가 → 기준점 = 누적
  - 동결 아님, 매도('1'), 체결가 == 상한가 → 동결(이 매도부터 셈에 든다)
  - 그 밖(매수 '2' · 1/2 밖 코드 · 동결 중 상한가 체결) → 무동작
  - 하루 첫 판정 보드 체결이면 기준점 = 누적 − 그 수량(장전·다른 보드 거래량 제외). 누적이 줄면(역행) 다시 시작, 06:00 리셋, 상한가 미상이면 0.
- 판정 보드(KRX G1·G4 / NXT G1) A3 전 키를 서버가 추적한다. 85 대상에 늦게 들어온 키도 그 전 매도가 기준점에 들어 있다.
- 위험도(%) = `limit_vol_qty × 100 ÷ q_qty`. gh-trade 상따창은 반올림 정수 % 로 보이고, 잠기기 전에도 표시한다.

**(나) 밤 보고서 locks `risk_3s` / `risk_10s` / `risk_60s` / `risk_pre` 의미 변경**

- 옛 정의: 잠김 터치 창 누적 매도 주도 상한가 체결 금액 ÷ 그 시점 대기 금액(`q_krw`).
- 새 정의: 그 시점 상한가 거래량(위 (가)와 같은 규칙, KRX G1 A3 `cum_volume`) ÷ 그 시점 `q_qty`(주 ÷ 주, 소수).
- 적용 시작: **20261102**(이 변경 뒤 첫 밤 배치)부터. 그 전 날짜 행은 재생성하지 않는 한 옛 정의다.
- 열 이름·타입(DOUBLE)·NULL 규칙(잠김 밖 · 잠김 시작 전 · q 0)은 그대로다. 그 시점까지 체결이 없으면 NULL 이 하나 늘었다.
- `schema_version` 은 **1 그대로**다. 올리면 `limitup-sync` 가 `schema_version ≠ 1` 인 날을 건너뛴다(quick-261006-f1j 와 같은 편차). 그래서 날짜를 가로질러 `risk_*` 를 비교하는 화면·분석에는 20261102 경계 표시가 필요하다.

**(다) 저널 kind 15 슬롯은 무변경이다** — `limit_vol_qty` 는 kind 15 에 싣지 않고, `feature_schema`(1)도 그대로다.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

1. relay 스키마 재생성: `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`. 생성 기준이 55e62638 에서 이 커밋(8f284735)으로 바뀐다. `--check` 결과는 신규/변경 1개(limit-feature.ts), 삭제 없음, .fbs 사본 갱신. gh-trade 쪽 규칙상 이 반영은 **별도 커밋**이다.
2. 85 를 읽는 곳이 있으면 `limitVolQty()` 를 디코드하고 표시한다(필요할 때만).
3. `risk_*` 설명 문구(툴팁·리포트 범례)를 새 정의로 고치고, 20261102 경계를 표시한다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 말미 append 라 구 relay·구 클라는 이 필드를 무시한다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 배포 뒤 상한가 근처 종목의 85 프레임에서 `limit_vol_qty` 가 0 이 아닌 값으로 오는지 본다. 잠긴 종목이면 대략 상한가 체결이 쌓인 양(수천 ~ 수십만 주)이다.
- 20261102 밤 배치 뒤 locks `risk_*` 값 범위를 본다. 주 ÷ 주라 대개 0.1 ~ 2 근처이고 1 을 넘을 수 있다. 옛 정의(금액 ÷ 금액)와는 같은 행이라도 값이 다르다.

## 질문

없음 — 다만 `risk_*` 를 날짜 축으로 그리는 화면이 있다면 경계 표시 방식을 알려 주면 gh-trade 문서에 맞춰 적겠다.

## gh-radar 처리 기록

- `d59f7ed8` — relay 생성물 재동기화(85 `limit_vol_qty` id 34 포함).
- `7ab653ba` — relay 85 디코드에 `limitVolQty` 추가 · shared 상따 누적 행 위험도를 `limit_vol_qty ÷ 대기 수량` 으로(잠기기 전에도 표시). 키가 없거나(구 relay) 0 이면서 lockSellKrw > 0(구 서버)이면 옛 식 — 운영 두 서버가 새 서버라 실제로는 타지 않는다.
- `bff5d170` — 상한가 보고서 위험도 캡션을 날짜별 정의로. 경계는 `LIMITUP_RISK_QTY_FROM = "20261102"`(그날부터 새 정의 · 앞은 옛 정의 문구). 질문 답: 날짜 축 경계 표시는 이 캡션 하나다(차트 축 표시는 없음).
- 배포: relay `f4e6ab94`(11/1) · webapp push 11/1. 실값 확인은 11/2 장중 85 프레임과 그날 밤 배치.
