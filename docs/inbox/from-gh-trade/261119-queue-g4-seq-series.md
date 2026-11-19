---
status: done
from: gh-trade
from_commit: 28412b7f
from_branch: master
date: 2026-11-19
fbs_sync_marker: 8d073739
done_commit: none   # 웹·relay·DB 무변경 — gh-radar fifoReplay(ticks/launch-queue.ts)는 G4 보드만 걸러 재생해 G1·G4 msg_seq 를 섞지 않음 · qeval 은 gh-radar 에 없음, 확인만(기준 HEAD b3340e11)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-19

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경** — `.fbs`·MsgType·필드·슬롯 그대로.

동작만 바뀐다: 말달리자 줄 모형(quick-261118-ms7)에서 **낮부터 추적되던 KRX 키**에 애프터마켓(G4, 평소 16:00 · 11/19 순연일 17:00) 개시 뒤 접수된 상한가 매수가 이제 대기(kind 4)와 83 QueueProgress 를 낸다. 고치기 전에는 그 주문이 호가대기에 갇혀 kind 4·83 이 한 건도 안 나갔다(11/19 KB120 스튜디오드래곤·123690 사례).

원인: KRX msg_seq(정보분배일련번호)는 (종목, 보드)마다 따로 매겨지고 G4 는 1 근처에서 다시 시작한다. 서버 줄 장부가 기준 seq 를 하나만 들고 있어 G4 B6 를 전부 「낡은 B6」 로 버렸다. 이제 기준 seq 를 계열(KRX G1·NXT / KRX G4)마다 둔다.

판정기가 걸린 파일:

- docs/features/order-log-progress.md

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 생성물 재동기화·relay 파서·DB 마이그레이션·웹 수정 **필요 없음**.
- 참고만: `fifoReplay`·qeval 같은 재생기가 KRX G1 과 G4 이벤트를 **msg_seq 한 줄로 정렬·비교하면 안 된다** — 보드마다 번호가 따로이고 G4 가 더 작다(10/13 · 10/14 원시 A3 32종목 전부 G4 첫 seq 3 ~ 254 < G1 마지막 seq).
- 11/19 이후 kind 4 가 16:00 이후 시각으로도 들어오기 시작한다(전에는 그 시간대 낮부터 추적 키는 0건).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경이라 순서 제약 없음.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

배포 뒤 16:00 이후 낮부터 추적 중인 KRX 종목에 상한가 매수가 접수되면 약 2.3초 안에 kind 4 가 적재되고, 83 이 그 주문을 싣는다. 서버 로그 `[QueueTracker] 줄 모형 … 낡은B6` 이 16:00 이후에도 0 근처.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
