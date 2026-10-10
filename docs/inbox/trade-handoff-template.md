---
status: open
from: gh-radar
from_commit: {{FROM_COMMIT}}
from_branch: {{FROM_BRANCH}}
date: {{DATE}}
fbs_sync_marker: {{FBS_SYNC_MARKER}}
done_commit:
---
<!-- trade-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-trade 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-radar → gh-trade 작업 요청 — {{DATE}}

## 요청 내용

무엇이 왜 필요한가 — 서버 동작 · StockDMA.fbs 필드 · 주문로그 · 배포. 웹·relay 의 어느 화면·경로가 막혀 있는지 적는다.

TODO: 요청 내용을 적는다.

## gh-trade 가 할 일

서버 코드 · .fbs(→ `sync-client-schema.sh`·`sync-relay-schema.sh`) · 문서 · 배포 중 무엇이 필요한지 적는다.

TODO: gh-trade 가 할 일을 적는다.

## 배포 순서 제약

gh-radar 먼저 배포가 안전한가: TODO

gh-trade 는 cloud-verify.sh 게이트 뒤 deploy.sh <broker> <env> 로 KB 120·121·교보 119 를 장 마감 뒤 배포한다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(서버 로그 줄 · relay 응답 · 웹 화면) 적는다.

TODO: 확인 방법을 적는다.

## 질문

gh-trade 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

TODO: 질문을 적는다.
