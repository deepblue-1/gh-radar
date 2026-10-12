---
status: done
from: gh-trade
from_commit: 6ae1a804
from_branch: master
date: 2026-10-12
fbs_sync_marker: e5b4fbca
done_commit: 6a628d3b
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-12

## 바뀐 것

`table UserSettings`(42/84) 말미, `post_buy_floor_amount` 뒤에 **optional 스칼라 2필드**를 append 했다(8d56ea53, 요청 노트 from-gh-radar `261012-prebuy-watch-autoaddbuy-usersettings` 처리분). MsgType·기존 필드 무변경.

- `pre_buy_watch_amount: uint = null;` — vtable 30. 선매수 매도잔량 기본값(만원) 0~999,999,999. 0 = 종전(상장주식수 × 0.3% 시딩), > 0 = 상따 폼을 열 때 선매수 매도잔량 칸을 그 값으로(그 칸만 시딩 생략, 서버 전략 에코가 이김).
- `pre_buy_auto_add_buy: bool = null;` — vtable 32. WinForms 라벨 「☐줄매수도 같이 켜기」(6ae1a804 에서 「줄매수 자동켜짐」→ 바뀜). 사람이 ☐선매수를 켤 때 ☐줄매수(+줄매수에 딸린 ☐버스트 취소 자동 체크)를 같은 제출로 켜고, 제출 실패면 함께 되돌림. 서버는 보관·에코만(판정 무관).

규칙:
- **42:** 필드가 **없으면**(null) 서버가 저장값을 유지한다(저장 행이 없으면 0·false). 0·false 로 지우려면 필드를 **실어** 보낸다 — 웹 42 는 동기화 뒤 두 필드를 늘 실을 것. 범위 밖이면 42 전체 거부(54 ERROR 「선매수 매도잔량 기본값은 …」).
- **84:** 서버가 두 필드를 늘 싣는다(0·false 포함). 84 에 없으면 구 서버 → 0·false 로 읽는다.
- 기존 저장 행 사용자는 두 값이 0·false 로 시작한다.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs
- server/docs/protocol.md

## gh-radar 가 할 일

- relay 생성물 재동기화: `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`(gh-trade 저장소의 스크립트, 서버는 아래대로 이미 배포됨).
- 웹 /me 상따 기본값 카드에 두 항목(「매도잔량 [ ]만」·「☐줄매수도 같이 켜기」, 선매수 줄 아래) — 84 로 읽고 42 로 저장, 42 에 두 필드 항상 실기.
- 웹 상따 폼: 기본값 채울 때 매도잔량 > 0 이면 그 값, ☐선매수를 사람이 켤 때 설정이 켜져 있으면 ☐줄매수도 같은 제출에 켜기(실패 시 함께 되돌림).
- 앞서 보낸 노트 `261012-prebuy-watch-default-auto-addbuy` 는 이 노트로 대체 — 웹 반영 때 둘 다 done 으로.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — **이미 배포 완료.** KB 120 = v1.0-158-gc697be43 (2026-10-12 21:33 재기동) · 교보 119 = v1.0-159-g6ae1a804 (21:35 재기동, 서버 바이너리는 120 과 같은 BuildID — 차이는 클라 커밋뿐). KB 121 은 이번에 배포하지 않았다(121 에 붙는 사용자는 아직 새 필드 저장 불가).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 웹 /me 에서 매도잔량 50·같이 켜기 ON 저장 → 같은 dma_user_id 의 WinForms 기본설정 창에 같은 값(84 브로드캐스트). 반대 방향도.
- 서버 로그 `[Gateway] 사용자 설정 저장 … 선매수매도잔량=50만 줄매수자동켜짐=true 84 송신 세션=N`.
- 동기화 전 웹이 42 를 보내도 두 값이 지워지지 않는지(필드 부재 = 유지).

## 질문

없음
