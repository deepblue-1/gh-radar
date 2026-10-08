---
status: done
from: gh-trade
from_commit: 159e2ee3
from_branch: master
date: 2026-10-08
fbs_sync_marker: 88fc746d
done_commit: 15a5dfa3
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-08

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경** (fbs·MsgType·필드·vtable·enum 값 그대로). 의미 두 가지가 바뀐다 (gh-trade quick-261008-ks9).

1. `CancelReason` 12 `BurstLimit` 의 적용 대상 확대 — 종전(quick-261007-gwv): 「이번 진입 구간에 낸 **추가매수** 미체결」만.
   이제: 버스트 상한가 판정 ∧ 체크 ON 이면 그 상따가 추적하는 **이 계좌·종목·거래소 매수 미체결 전부** — 상따 선·추가·후매수 + 상따가
   인수한 **수동주문(group 7)·VI 자동주문(group 8)** + 기동 시드분. 즉 저널 80 의 취소 사유 12 가 group 1·2·3 뿐 아니라 7·8 행에도 붙는다.
   취소 사유 줄(StrategyEvent)도 1건 나간다(문구 「… — 버스트 상한가 판정(매수 미체결 전부)」).
2. `extra_buy_burst_release`(vtable 138, 상태 키 `add_buy_burst_release`) — 클라 라벨 「버스트 시 해제」 → 「**버스트 해제**」, 위치는
   ☐매수주문 오른쪽. 해제 범위는 그대로 추가매수(`extra_buy_enabled` OFF)뿐이고 취소 범위만 위 1처럼 넓어졌다.
   `buy3_schema` 읽기 규칙(≥3)도 그대로.
3. (참고) 버스트 상한가 판정 자체도 이번 주에 바뀌었다 — 159e2ee3: 상한가 조각 2개 이상(자전거래 방지로 끊긴 체결)만 판정,
   ks9: 매도1호가가 상한가 아래로 내려오면 오염 기록 초기화. 58/59 `burst_upper_limit`·kind 10·85 `burst_upper_limit` 이 같은 판정을 따른다.

판정기가 걸린 파일:

- docs/features/order-log-progress.md
- server/docs/protocol.md

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 생성물 재동기화 **불필요** (fbs 무변경).
- relay 파서·DB 마이그레이션 불필요.
- 웹: ① 취소 사유 12 라벨이 수동·VI 행에도 자연스러운지 확인(「버스트 상한가」 그대로면 충분해 보임) ② lc.set 화면에 이 체크박스를
  보이고 있다면 라벨을 「버스트 해제」로, 설명을 「버스트 상한가 판정 시 추가매수 해제 + 이 종목 매수 미체결 전부 취소」로.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 (와이어 무변경 — 순서 제약 없음)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 서버 로그 `[LimitChaser] 추가매수 해제 — 버스트 상한가 …` 뒤에 매수 미체결 취소 사유 줄과 취소 통보가 이어진다.
- 저널 80 에서 그 시각 취소 행들의 `cancel_reason` = 12 (수동·VI 행 포함), 웹 주문로그에 같은 라벨.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
