---
status: done
from: gh-trade
from_commit: 0c92d08a
from_branch: master
date: 2026-11-02
fbs_sync_marker: b6d3f3ef
done_commit: 21e6682d
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-02

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경(StockDMA.fbs · 생성 코드 그대로) — 기존 칸의 의미만 하나 더해졌다** (quick-261102-enc).

- StrategyEvent **kind 7 Cancelled** 이고 **`cancel_reason` 12 BurstLimit** 인 이벤트는 이제 `cond_actual` 에 **버스트 상한가 판정 비율 %(1~100)** 를 싣는다.
  ☐버스트 취소(quick-261101-t7c 비율 판정)가 매수 미체결을 취소할 때의 그 판정 비율이다(엄격 잠김 = 100, 광전자 꼴 = 80 등).
- `cond_actual` **0** = 옛 서버 기록(비율 모름) — 종전 표시 그대로.
- 다른 kind 7 사유(1~11)는 `cond_actual` 0 그대로다(의미 불변). `cond_metric` 은 kind 7 에서 계속 0 이다.
- 82 푸시 · 81 백필 · 저널 · relay 경로는 칸별 분기 없이 `cond_actual` 을 복사하므로 새 필드·슬롯이 없다.
- gh-trade 클라 주문로그는 `취소 | 버스트 상한가 78% · 체결까지 …남았었음` 꼴로 그린다(0 이면 `버스트 상한가`).

판정기가 걸린 파일:

- docs/features/order-log-progress.md
- server/docs/protocol.md

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **relay 스키마 동기화 불요** — .fbs 무변경.
- relay 파서 · DB 마이그레이션 불요 — `cond_actual` 은 이미 저장되는 칸이다(kind 7 에서 0 이던 값이 12 사유일 때 채워질 뿐).
- **웹 주문로그(선택)**: kind 7 · `cancel_reason` 12 · `cond_actual` > 0 이면 사유 라벨을 「버스트 상한가 NN%」 로, 0 이면 종전 「버스트 상한가」. 웹이 kind 7 의 `cond_actual` 을 따로 쓰는 곳이 없다면 아무것도 안 해도 깨지지 않는다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경이고 옛 웹은 kind 7 의 `cond_actual` 을 무시하므로 어느 쪽을 먼저 배포해도 안전하다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 다음 ☐버스트 취소 발생 뒤 그 주문의 kind 7 이벤트가 `cancel_reason` 12 · `cond_actual` = 서버 로그 `[LimitChaser] 매수 미체결 취소 — 버스트 상한가 … 비율=NN%` 의 NN 과 같다.
- 웹 주문로그(반영했다면) 취소 행이 「버스트 상한가 NN%」, 이 배포 전 기록은 「버스트 상한가」.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.

## gh-radar 처리 (261102)

- 웹 주문로그 반영 — `packages/shared/src/strategy-event-text.ts` `cancelledBody`: kind 7 · `cancel_reason` 12 · `cond_actual` > 0 이면
  「버스트 상한가 NN%」, 0 이면 종전 「버스트 상한가」. 다른 사유는 `cond_actual` 을 읽지 않는다. 남은 거래량 조각은 그대로 뒤에 붙는다.
- relay · 생성물 · DB 무변경(와이어 무변경 확인).
- 테스트: `strategy-event-text.test.ts` 「취소 사유 12 + cond_actual」 1건 추가 · shared 855 · 웹 주문로그 관련 184 통과.
