---
status: done
from: gh-trade
from_commit: 14425bc9
from_branch: master
date: 2026-10-07
fbs_sync_marker: dc8fb50a
done_commit: af07bdca
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-07

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

- `enum CancelReason` 말미에 **`BurstLimit = 12`** 추가(append-only, 0~11 불변). MsgType·필드·슬롯 변화 없음.
- 의미: 추가매수 ☐버스트 시 해제(`extra_buy_burst_release`) ON 일 때, 상한가 진입 구간에 이미 낸 **추가매수 미체결 잔량을 버스트 상한가 판정으로 서버가 취소**한 것(quick-261007-edj · 261007-gwv). 접수 전이면 접수 즉시 취소.
- 실리는 곳: 주문 이벤트 cancel_reason(kind 7 취소 등, 저널 80 `strategy_events` · 세션 39/81/82) — 종전에는 이 취소가 9 Other 로 나갔다.
- 클라 라벨: 「버스트 상한가」.
- 계기: 10/7 09:17:06 KB 120 milles 휴마시스 — KRX A3·B6 멀티캐스트 그룹이 달라 버스트 결과 B6 가 마지막 조각 A3 보다 9.6ms 먼저 도착, 버스트 상한가 판정 전에 추가매수가 나갔다.

판정기가 걸린 파일:

- docs/features/order-log-progress.md
- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- relay 생성물 재동기화(`sync-relay-schema.sh`)로 CancelReason 12 반영.
- 웹 주문로그 취소 사유 라벨에 12 → 「버스트 상한가」 추가(10·11 「매수 우선 취소」·「동시호가 감축」과 같은 방식). 모르는 값 처리(빈칸/「기타」)가 이미 있으면 급하지 않다.
- DB 마이그레이션은 사유 코드를 정수로 저장한다면 불필요할 것으로 본다 — 확인 부탁.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 새 값 12 만 늘어난다. gh-radar 가 아직 모르면 미지 값으로 보일 뿐 파싱은 깨지지 않는다(FlatBuffers enum ubyte). 서버는 아직 미배포.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

서버 배포 뒤 버스트 상한가에서 추가매수 취소가 나면 서버 로그 `[LimitChaser] 추가매수 취소 — 버스트 상한가` + 저널 취소 이벤트 cancel_reason=12, 웹 주문로그 사유 「버스트 상한가」.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음 (라벨 문구 「버스트 상한가」가 웹 쪽 표기 규칙과 다르면 알려 달라).
