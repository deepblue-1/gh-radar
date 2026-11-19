---
status: done
from: gh-trade
from_commit: c02bc7f4
from_branch: master
date: 2026-11-19
fbs_sync_marker: 8d073739
done_commit: none   # 웹·relay·DB 무변경 — kind 4 시각·ahead_qty 에 기대는 계산 0곳(웹은 서버 값 그대로 표시 · kind 4 는 방향 판정에만), 확인만(기준 HEAD e2f26d4b)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-19

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경**(.fbs·필드·MsgType 그대로) — 값과 시각만 달라진다(quick-261119-fmy, 정본 `docs/features/order-log-progress.md` ⑤).

- 판정 정지 구간(VI·NXT 단일가·KRX 동시호가/세션 닫힘) 중 접수된 상한가 매수: 종전에는 접수 약 2.2초 뒤 줄 **맨 뒤**에 놓였다(물러남). 이제는 구간 뒤 첫 비정지 B6 에서 **접수 순간 자리**(구간 B6 의 내 증가 직전 앞 → 없으면 접수 순간 상한가 매수잔량, 구간 체결분 차감)에 놓는다.
- 그래서 그런 주문의 kind 4 대기 `ahead_qty`·`expected_cum` 이 작아지고(11/19 스튜디오드래곤 NXT 152,675 → 81,958), kind 4 시각(`gw_time_ms`)은 「구간이 끝난 직후 첫 B6」 이다(VI 2분이면 접수 뒤 최대 약 2분). kind 5 `error_volume`·kind 7 `remaining_volume`·83 `remaining_volume`/`progress_bp` 도 같은 줄 모형 값이라 작아진다.
- 단일가 세션의 상한가 체결(VI 해제·시가·종가)이 이제 줄 앞을 소진한다 — 구간 전부터 대기하던 주문의 앞도 그만큼 준다.
- `queue_case` 뜻은 그대로.

판정기가 걸린 파일:

- docs/features/order-log-progress.md

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

relay 재생성 불필요(fbs_sync_marker 그대로) · 파서·DB·웹 변경 불필요. 웹에 「앞 N주」 를 보이는 곳이 있으면 값이 작아지는 것만 알면 된다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경, 값만 바뀐다. (서버 배포는 아직 안 함 — 사용자 결정 대기)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

배포 뒤 VI 중 낸 상한가 매수의 kind 4 `ahead_qty` 가 접수 때 상한가 매수잔량 근처로 나오는지, 서버 로그 `[QueueTracker] 줄 모형 … 구간배치 N` 카운터가 오르는지.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.
