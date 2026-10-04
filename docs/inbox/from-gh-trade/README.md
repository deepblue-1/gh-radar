# gh-trade → gh-radar 인박스

gh-trade 가 StockDMA.fbs · relay 계약에 닿는 변경을 gh-radar 에 넘기는 곳이다(합의 2026-10-04, gh-trade-8a 제안 · 사용자 승인). 세션 메시지는 세션이 끝나면 사라지므로 이 파일이 주 경로이고, 메시지는 보조다.

- **쓰는 쪽:** gh-trade 세션이 `YYMMDD-<slug>.md` 로 쓴다. 쓰다 만 노트가 남의 커밋에 섞이지 않게 임시 파일에 쓴 뒤 rename 으로 놓는다. 커밋은 gh-radar 세션이 한다.
- **읽는 쪽:** gh-radar 세션은 세션·작업 시작 때 `status: open` 노트부터 읽는다. 처리하면 `status: done` 과 `done_commit` 을 채워 **경로를 지정해** 커밋한다(`git add -A` 금지).

## 노트 형식

```markdown
---
status: open            # open | done
from_commit: <gh-trade 커밋 해시>
from_branch: <gh-trade 브랜치>
date: YYYY-MM-DD
fbs_sync_marker: <relay/src/generated/StockDMA.fbs SYNC MARKER 해시 | none(와이어 무변경)>
done_commit:            # gh-radar 가 처리한 커밋 해시 — done 으로 바꿀 때 채운다
---

## 바뀐 것
MsgType 번호 · 필드 · 슬롯

## gh-radar 가 할 일

## 배포 순서 제약
gh-trade 서버를 먼저 배포해도 안전한지 한 줄. gh-radar 쪽은 언제나 DB → relay → webapp 이고, push 자체가 webapp 프로덕션 배포다.

## 확인 방법

## 질문
```
