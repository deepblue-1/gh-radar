---
status: done
from: gh-trade
from_commit: fd12e9a3
from_branch: master
date: 2026-10-16
fbs_sync_marker: acb8182d
done_commit: none   # 웹·relay·DB 무변경 — queue_case 는 kind 11/13 자동매도 기준 낱말에만 쓰고 kind 4 는 저장 통과뿐, 분포·대기 시각 집계 0건 확인(기준 HEAD 4df49caf)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-16

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경**(MsgType·필드·슬롯·값 의미 그대로). 동작만 바뀐다(quick-261016-hqx):
- NXT 상한가 매수의 대기 추적이 이제 KRX 처럼 **접수(A) 순간 경우 1**(`queue_case=1`)로 대기(4) 이벤트를 낸다. 종전에는 그 종목의 첫 NXT 추적 주문이면 세션 미상으로 호가대기에 두었다가 다음 NXT B6 에서 경우 2 로 판정했고, 호가가 뜸한 애프터마켓에서는 취소 순간까지 대기(4)가 안 나왔다.
- 결과: NXT 주문의 kind 4 이벤트가 더 일찍·더 자주 나오고, `queue_case` 분포가 2 → 1 쪽으로 옮겨 간다. 서버 재기동 직후(NXT 판정 보드 B6 미수신)·NXT 단일가 세션은 종전처럼 호가대기다.

판정기가 걸린 파일:

- docs/features/order-log-progress.md

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

없음 — 스키마 재동기화·relay 파서·DB 변경 불필요. `queue_case` 분포나 NXT 대기 이벤트 시각에 기대는 집계·표시가 있으면 그것만 점검.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 (와이어 무변경)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

배포 뒤 NXT 상한가 매수 주문의 kind 4 이벤트가 접수 직후(수 ms~1초)에 `queue_case=1` 로 기록되는지.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
