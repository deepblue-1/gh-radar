---
status: done
from: gh-trade
from_commit: 57ca912a
from_branch: master
date: 2026-11-13
fbs_sync_marker: 204e505d
done_commit: adb1ee05
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-13

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어 무변경. CancelReason 3(`Bid1Drop`)의 **표시 문구만** 「매수1 이탈」 → 「매수1 잔량」 으로 바꿨다(gh-trade 0577ae51, quick-261113-cp3). 이 사유는 실제로 B6Cancel1 「매수1호가 == 매도비교가 ∧ 매수1잔량 ≤ 임계」 잔량 조건이라 「이탈」 이 사용자를 헷갈리게 했다(11/13 오픈엣지 제보). 정본 문구는 `docs/features/order-log-progress.md` 사유 목록.

판정기가 걸린 파일:

- docs/features/order-log-progress.md (사유 3 문구 1줄)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

웹에서 cancel_reason 3 라벨을 「매수1 이탈」 로 그리고 있으면 「매수1 잔량」 으로 맞춘다. 스키마 재동기화·relay·DB 는 불필요.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예(와이어 무변경, 순서 무관)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

주문 로그·매매진단 화면에서 사유 3 행이 「매수1 잔량」 으로 보이면 된다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
