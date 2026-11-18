---
status: done
from: gh-trade
from_commit: a02f8312
from_branch: master
date: 2026-11-18
fbs_sync_marker: 8d073739
done_commit: 666b19f3  # 취소 줄 「체결까지 남은 R」(E − C 산식 꼬리 제거) · 대기 · 첫 체결 · 83 · 챗봇은 무변경(새 뜻과 맞음)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-18

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경**(MsgType·필드·슬롯 그대로, .fbs 는 주석만 — fbs_sync_marker 그대로). **값의 뜻**만 바뀐다(gh-trade quick-261118-ms7, 상따창 말달리자 줄 예측을 16:00 대기열 순번과 같은 FIFO 규칙으로 교체).

- 83 `QueueProgressItem.remaining_volume` = **체결 시작까지 남은 주**(내 수량 제외) = max(0, min(줄 앞 추정, 상한가 매수잔량 − 내 남은 수량)). 종전은 「진입 때 잔량 전체(내 수량 포함) − 누적거래량 증가」 = 내 마지막 주까지.
- 83 `expected_cum` = current_cum + remaining_volume (remaining = expected − current 관계 유지) · `progress_bp` = (진입 때 앞 − 남은) × 10000 / 진입 때 앞.
- kind 4 대기 `ahead_qty` = 진입 때 내 앞(내 수량 **제외** — 종전은 포함) · `expected_cum` = base_cum + ahead_qty. 이벤트 시각 = 내 주문이 줄에 짝지어진 순간(A 뒤 보통 100 ~ 200ms, 못 짝지으면 약 2.2초 뒤 맨 뒤 배치).
- kind 5 첫체결 `error_volume` = 첫 체결 순간 모형의 남은 주 — **항상 ≥ 0**, 정답 ≈ 0(실시간 정확도 지표). 음수(「늦게」)는 더 나오지 않는다.
- kind 7 취소 `remaining_volume` = 취소 순간 모형의 남은 주.
- `queue_case` 뜻 그대로. 정본 gh-trade `docs/features/order-log-progress.md` ②·⑤.
- 근거: 120 계좌 11/3 ~ 11/17 대기 뒤 부분 체결 50건 채점 — 중앙 오차 10,394주(줄의 28.6%) → 414주(1.0%).

판정기가 걸린 파일:

- docs/features/order-log-progress.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- relay 재동기화 **불필요**(.fbs 주석만).
- DB·relay 파서 변경 없음.
- 웹·챗봇: 위 값을 「내 수량 포함」 이나 「누적거래량 산식」 으로 풀어 설명하는 문구가 있으면 「체결 시작까지 남은 주」 로 고친다. kind 5 의 「늦게(음수)」 문구 갈래는 죽은 코드가 된다. error_volume 을 정확도 지표로 보여 주는 것은 선택.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경, 값의 뜻만 바뀐다. 배포 첫날 재기동 복원분은 저널 `ahead_qty` 가 옛 뜻이라 한 번 크게 나올 수 있다(상한선이 받침). gh-trade 배포 시각은 아직 미정 — 배포하면 따로 알린다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

배포 뒤 상한가 대기 주문의 83 남은 주가 첫 체결 무렵 0 근처로 내려오는지, kind 5 `error_volume` 이 모두 ≥ 0 이고 대부분 작은지(매매진단 챗봇·상따 로그 화면).

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.
