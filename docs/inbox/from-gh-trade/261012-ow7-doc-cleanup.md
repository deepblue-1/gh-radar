---
status: done
from: gh-trade
from_commit: eaa61b15
from_branch: master
date: 2026-10-12
fbs_sync_marker: e5b4fbca
done_commit: none   # 웹·relay 무변경 — reason_code 정확 일치 비교 0건 확인만(기준 HEAD 60cef504)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-12

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어 무변경, 주석·문서만. protocol.md SetLimitChaserReq 행과 .fbs UserSettings `post_buy_max_count` 주석을 (deprecated, ow7 — 서버 무시)로 고쳤다. 하나만 값이 바뀐다: 저널 `reason_code` 문자열 `AddBuy 버스트해제(버스트 상한가 ∧ ☐버스트 해제)` 의 괄호 안이 `☐버스트 취소` 로 바뀐다(첫 토큰 `AddBuy` 동일, 과거 행은 옛 문자열).

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

없음(원하면 다음 relay 스키마 동기화 때 주석 반영). reason_code 를 정확 일치로 비교하는 곳이 있다면 새 문자열도 받게.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

없음

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
