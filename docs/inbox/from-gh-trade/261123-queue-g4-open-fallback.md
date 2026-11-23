---
status: done
from: gh-trade
from_commit: 136068db
from_branch: master
date: 2026-11-23
fbs_sync_marker: 8d073739
done_commit: none   # 웹·relay·DB 무변경 — 웹 진행률(queue-progress.ts)은 83 remaining_volume·progress_bp 를 산술 없이 클램프만 해 서버 수정이 그대로 반영 · 11/23 이전 16:00 발사 값은 「물러남」(줄 전체)이라 fifoReplay 와 어긋남만 인지, 확인만(기준 HEAD 8b80648c)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-23

## 바뀐 것

**와이어 무변경**(.fbs · MsgType · 필드 · 저널 레이아웃 그대로). 값의 의미만 바로잡혔다.

- 말달리자 줄 모형(QueueTracker)의 16:00 KRX 애프터마켓(G4) 개시 발사 주문 대기(4) `ahead_qty` · 83 QueueProgress `remaining_volume`/`progress_bp` 가 이제 **접수 순간 실제 자리**다. 전에는 16:00 발사 주문이 전부 「물러남」(A + 2.2초 뒤 줄 맨 뒤)으로 들어가 앞이 G4 줄 전체로 나왔다.
  - 실례: 11/23 KB120 37728502101 휴림로봇 #3405000218 — 종전 ahead 1,638,000 → 수정 규칙 손계산 92,133(= gh-radar fifoReplay 6번째 · 5.27억과 같음).
- 같이 바뀐 규칙: KRX 키의 줄 장부가 seq 계열 G1 → G4 첫 이벤트에서 **0 부터 다시 시작**한다(gh-radar `launch-queue.ts` 「첫 B6 이면 0」 과 같은 기준). G4 뒤 G1 낙오는 장부에 넣지 않는다.
- 정본 문서: `docs/features/order-log-progress.md` ⑤ · `server/src/market/publish/QueueTracker.h` 머리 주석.

판정기가 걸린 파일:

- docs/features/order-log-progress.md

## gh-radar 가 할 일

없음이 기본이다 — 스키마 재동기화 · relay 파서 · DB 마이그레이션 불필요. kind 4 `ahead_qty` 나 83 값을 그대로 보여 주는 화면이 있다면, 11/23 이전 16:00 발사 주문 값은 「물러남」 값(줄 전체)이라 fifoReplay 와 크게 어긋난다는 점만 알아 두면 된다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경, 값만 바로잡힘. 배포 예정은 11/24 16:00 전 세 서버(120 · 119 · 112), 사용자 확인 뒤.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

배포 뒤 16:00 발사 주문의 kind 4 `ahead_qty` 가 같은 주문번호의 `launch_piece_queue` fifoReplay 「접수 때 앞」 수량과 비슷해야 한다(서버 로그 `[QueueTracker] 줄 모형 … 물러남` 이 16:00 에 뛰지 않음).

## 질문

없음. 다만 fifoReplay 값과 서버 ahead 를 주문번호로 나란히 볼 수 있는 화면이 있으면 11/24 대조에 쓰고 싶다.
