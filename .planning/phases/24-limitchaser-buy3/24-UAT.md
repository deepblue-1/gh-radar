---
status: complete
phase: 24-limitchaser-buy3
source: [24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-03-SUMMARY.md, 24-04-SUMMARY.md, 24-05-SUMMARY.md, 24-06-SUMMARY.md, 24-07-SUMMARY.md, 24-08-SUMMARY.md, 24-09-SUMMARY.md, 24-10-SUMMARY.md, 24-11-SUMMARY.md, 24-12-SUMMARY.md, 24-13-SUMMARY.md, 24-14-SUMMARY.md, 24-15-SUMMARY.md, 24-16-SUMMARY.md, 24-17-SUMMARY.md, 24-18-SUMMARY.md, 24-19-SUMMARY.md, 24-20-SUMMARY.md, 24-21-SUMMARY.md, 24-22-SUMMARY.md, 24-23-SUMMARY.md, 24-24-SUMMARY.md]
started: 2026-09-29T01:58:28Z
updated: 2026-09-29T03:22:06Z
---

## Current Test

[testing complete]

## Tests

### 1. 운영 웹 상따 카드 기본 표시
expected: https://gh-radar-webapp.vercel.app/trading 에서 상따 전략 카드를 열면 매수주문 카드 안에 선매수·추가매수·후매수 3그룹이 기본 접힘 + 요약 줄로 보이고, 매수 LED 가 상태(OFF/감시/보유중)에 맞게 켜진다. DevTools → Network → WS 프레임의 lc.snap 항목에 buy3Schema:1 이 실려 있다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 2. 실전략 값 확정 → 에코 왕복
expected: 실전략 하나의 값(예: 후매수 반등 % 나 주문금액)을 바꿔 확정하면 에코 뒤에도 그 값이 그대로 남고, 「다른 단말에서 변경됐어요」 배너 없이 전략 로그에 변경 줄이 한 줄 선다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 3. R6 한방 두 행 수용
expected: 선매수를 펼치면 한방이 「○ 한방 ─ N건 ›」과 「한방가격 ─ 금액 ›」 두 행으로 나뉘어 있다. 스케치 009 D 의 한 행 「☐한방 3건 @12,990원」과 다르다(폰 행 폭 때문). 이 두 행 모양을 채택하면 pass.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 4. 접힌 카드 · 요약 · 흐림 · L3
expected: 세 그룹이 기본으로 접혀 있고 요약 값이 읽기 편하다. 꺼진 그룹 글자는 흐리게(0.45) 보이지만 대비가 너무 약하지 않다. 폰 폭에서는 쉐브런(›)이 숨는다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 5. 제목줄 상태 줄바꿈
expected: 폰 폭에서 매수주문 「켜짐 · 켠 매수 없음」이 제목 옆 둘째 줄에 한 덩어리로 선다. 좁은 폭(본문 344)에서 매도 카드 「무장 · 대기 · 후매수 발동」은 「무장 · 대기 ·」/「후매수 발동」 두 줄로 꺾여 헤더가 3줄이 되는데, 이 모양을 받아들이면 pass.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 6. 로그 문장 모양
expected: 선매수를 켜면 로그 맨 위에 「선매수 자동 체크 — 켬: …」, 그 아래에 「선매수 체크 — 매수주문도 켬」이 선다. 줄바꿈이 자연스럽고, 생략이 있는 자동 체크 줄은 빨간색(error)이다. 서버가 그룹을 접으면 「서버가 매수 그룹 해제 — …」 한 줄이 같은 로그 패널 모양으로 뜬다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 7. 사전 검증 줄 시각
expected: 조건이 안 맞는 그룹(예: 주문금액 없이 추가매수 켜기)을 켜려 하면 전송 없이 그룹 아래에 작은 안내 줄(예: 「주문금액을 먼저 입력해 주세요」)이 뜬다. 긴 문구는 2~3줄로 접혀 카드 폭 안에 들어가고, 접힘/펼침을 바꿔도 위치가 튀지 않는다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 8. 무장 불가 패널 문구
expected: 무장할 수 없는 상태의 패널에서 사유가 「매수주문 · 선매수 · 추가매수 · 후매수 · …」처럼 한 줄로 합쳐져 자연스럽게 읽힌다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 9. 선매수 켬 실제 흐름(폰)
expected: 폰에서 선매수 스위치를 켜면 매도 탭으로 자동 이동하지 않는다. 매도·취소 스위치와 체크가 먼저 ON 으로 보였다가 에코 뒤에도 그대로 확정된다(되돌아가지 않음).
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 10. 360 폭 시딩 값 표시
expected: 폰(카드 360 폭)에서 새 전략 카드를 만들면 「체결량 17,909,347주」 같은 긴 시딩 값이 빠듯하지만 잘리거나 말줄임 없이 다 보인다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 11. 라이트 · 다크 전반
expected: 라이트·다크 두 테마 모두에서 매도 「주문가격 · 비교가격 · 매수잔량」, 취소 「매수잔량」 라벨이 잘 읽히고, 상태 색이 감시 중=초록 · 보유중=주황으로 구분된다.
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 12. 후매수 소진 300ms 창(실기)
expected: 후매수가 발동(보유중)한 전략이 마지막 재진입으로 소진되는 순간, 웹이 옛 ON 값을 다시 보내 서버가 후매수를 다시 여는 핑퐁이 없다. 후매수 요약이 「소진 · 남은 0회」로 멈추고 로그에 재켜짐 줄이 없다. (장중 실전략이 소진까지 가야 볼 수 있다 — 못 봤으면 blocked 로 답해 주세요.)
result: pass
reported: "전부 pass" (사용자 일괄 응답)

### 13. [24-01] 스키마 재생성 — gh-trade 팁 flatc 출력과 생성물 일치(바뀐 생성 파일 2개)
expected: 스키마 재생성 — gh-trade 팁 flatc 출력과 생성물 일치(바뀐 생성 파일 2개)
result: pass
source: automated
coverage_id: 24-01/D1

### 14. [24-01] relay 빌더 buy3_schema=1 · C→S 12 · buy_watch_side/S→C 4 슬롯 부재, 파서 신필드 17 (60·64 · 키 56)
expected: relay 빌더 buy3_schema=1 · C→S 12 · buy_watch_side/S→C 4 슬롯 부재, 파서 신필드 17 (60·64 · 키 56)
result: pass
source: automated
coverage_id: 24-01/D2

### 15. [24-01] relay zod — 반등률 0~100 + 후매수 ON 이면 1~100 · 최대 횟수 0~255 · 신필드 필수 · S→C 5 떨어뜨림
expected: relay zod — 반등률 0~100 + 후매수 ON 이면 1~100 · 최대 횟수 0~255 · 신필드 필수 · S→C 5 떨어뜨림
result: pass
source: automated
coverage_id: 24-01/D3

### 16. [24-01] relay 통합 트레이서 — ws lc.set → 게이트웨이 10(buy3) → 60 보유중 에코 → lc 프레임
expected: relay 통합 트레이서 — ws lc.set → 게이트웨이 10(buy3) → 60 보유중 에코 → lc 프레임
result: pass
source: automated
coverage_id: 24-01/D4

### 17. [24-01] 매수 LED D-12 · 로그 매수 래치 전이 제거 · 런타임 5/그룹 게이트 3 skip · 폼 기본값·금액→수량 3벌 · D-03 금액 0
expected: 매수 LED D-12 · 로그 매수 래치 전이 제거 · 런타임 5/그룹 게이트 3 skip · 폼 기본값·금액→수량 3벌 · D-03 금액 0
result: pass
source: automated
coverage_id: 24-01/D5

### 18. [24-01] 브라우저 트레이서 P24-1 — 비교가격 확정 → 게이트웨이 10 buy3 디코드 → 보유중 LED(span · 툴팁 원문) → 390 · 1280 헤더 한 줄
expected: 브라우저 트레이서 P24-1 — 비교가격 확정 → 게이트웨이 10 buy3 디코드 → 보유중 LED(span · 툴팁 원문) → 390 · 1280 헤더 한 줄
result: pass
source: automated
coverage_id: 24-01/D6

### 19. [24-02] 읽기 전용 필터 — 네트워크 모듈 require 0 · 입력은 표준입력뿐
expected: 읽기 전용 필터 — 네트워크 모듈 require 0 · 입력은 표준입력뿐
result: pass
source: automated
coverage_id: 24-02/D1

### 20. [24-02] buyWatchSide === \"1\" 만 · 계좌 끝 4자리 외 * · 원문 계좌 부재 · 빈 items · lc.snap 아님 종료 코드 2
expected: buyWatchSide === \"1\" 만 · 계좌 끝 4자리 외 * · 원문 계좌 부재 · 빈 items · lc.snap 아님 종료 코드 2
result: pass
source: automated
coverage_id: 24-02/D2

### 21. [24-03] MsgType 38 조립 경로 제거 — relay MSG 에 ArmBuyLatchReq 없음 · 생성 enum 에만 38 봉인
expected: MsgType 38 조립 경로 제거 — relay MSG 에 ArmBuyLatchReq 없음 · 생성 enum 에만 38 봉인
result: pass
source: automated
coverage_id: 24-03/D1

### 22. [24-03] 구 탭 lc.arm buy → 게이트웨이 0바이트 · 거부 프레임 1건 · 소켓 유지 · 다음 sell 은 36
expected: 구 탭 lc.arm buy → 게이트웨이 0바이트 · 거부 프레임 1건 · 소켓 유지 · 다음 sell 은 36
result: pass
source: automated
coverage_id: 24-03/D2

### 23. [24-03] 구 탭 lc.set(신필드 없음) → 거부 프레임 · 소켓 유지 · 새 모양 10 도착 / 철거는 중립 buy3_schema=1 / 계좌 가드 우선
expected: 구 탭 lc.set(신필드 없음) → 거부 프레임 · 소켓 유지 · 새 모양 10 도착 / 철거는 중립 buy3_schema=1 / 계좌 가드 우선
result: pass
source: automated
coverage_id: 24-03/D3

### 24. [24-03] shared RelayLcArmMsg.latch 'sell'|'cancel' · webapp handleArm/onArm 'buy' 불가
expected: shared RelayLcArmMsg.latch 'sell'|'cancel' · webapp handleArm/onArm 'buy' 불가
result: pass
source: automated
coverage_id: 24-03/D4

### 25. [24-03] 감시대상 토글 제거 — 행 0 · cfg 43키에 buyWatchSide 없음 · zod 미지 키 제거 · 게이트웨이 슬롯 null
expected: 감시대상 토글 제거 — 행 0 · cfg 43키에 buyWatchSide 없음 · zod 미지 키 제거 · 게이트웨이 슬롯 null
result: pass
source: automated
coverage_id: 24-03/D5

### 26. [24-04] 매수 카드 4장 순서 · 세 그룹 카드 기본 접힘(hidden, DOM 유지) · 요약 줄 · 접기 버튼은 lc.set 0 · 에코/탭 전환 뒤 유지
expected: 매수 카드 4장 순서 · 세 그룹 카드 기본 접힘(hidden, DOM 유지) · 요약 줄 · 접기 버튼은 lc.set 0 · 에코/탭 전환 뒤 유지
result: pass
source: automated
coverage_id: 24-04/D1

### 27. [24-04] D-10 의미어 · D-03 「—」 · D-11 「3회 · 남은 2회」 · 소진 안내 · 발동잔량 행 · 요약 항목(R5)
expected: D-10 의미어 · D-03 「—」 · D-11 「3회 · 남은 2회」 · 소진 안내 · 발동잔량 행 · 요약 항목(R5)
result: pass
source: automated
coverage_id: 24-04/D2

### 28. [24-04] 그룹 상태 문구 표(UI-SPEC §11) · D-15 꼬리 · 상태 색 첫 단어 기준
expected: 그룹 상태 문구 표(UI-SPEC §11) · D-15 꼬리 · 상태 색 첫 단어 기준
result: pass
source: automated
coverage_id: 24-04/D3

### 29. [24-04] D-09 라벨 · 시트 제목 · 접근성 이름 접두 · 인라인 Tab 카드 경계(R4) · e2e/a11y 정렬
expected: D-09 라벨 · 시트 제목 · 접근성 이름 접두 · 인라인 Tab 카드 경계(R4) · e2e/a11y 정렬
result: pass
source: automated
coverage_id: 24-04/D4

### 30. [24-06] 확정 훅 companions — 한 확정 = 한 lc.set · 주 필드 성공 판정 · 거부/무응답/끊김/대기 폐기 때 동반 되돌림 · no-op 동반 포함 · meta 전달
expected: 확정 훅 companions — 한 확정 = 한 lc.set · 주 필드 성공 판정 · 거부/무응답/끊김/대기 폐기 때 동반 되돌림 · no-op 동반 포함 · meta 전달
result: pass
source: automated
coverage_id: 24-06/D1

### 31. [24-06] 그룹 스위치 D-01/D-02 전반 동반 · D-05 · 미등록 그룹 켜기 = 등록
expected: 그룹 스위치 D-01/D-02 전반 동반 · D-05 · 미등록 그룹 켜기 = 등록
result: pass
source: automated
coverage_id: 24-06/D2

### 32. [24-06] D-02 후반 서버 접힘 뒤 마스터 자동 끔 — 하강 전이 1회 · 재수신 0 · 첫 스냅샷 0 · 재접속 0 · 삭제 가드 0 · in-flight 대기 1 · 그룹 재ON 0 · 거부 뒤 재시도 0
expected: D-02 후반 서버 접힘 뒤 마스터 자동 끔 — 하강 전이 1회 · 재수신 0 · 첫 스냅샷 0 · 재접속 0 · 삭제 가드 0 · in-flight 대기 1 · 그룹 재ON 0 · 거부 뒤 재시도 0
result: pass
source: automated
coverage_id: 24-06/D3

### 33. [24-06] 그룹별 무장 가드 웹 ↔ relay 동형 · Pitfall 5(후매수만 + 선매수 금액 0 게이트웨이 도달)
expected: 그룹별 무장 가드 웹 ↔ relay 동형 · Pitfall 5(후매수만 + 선매수 금액 0 게이트웨이 도달)
result: pass
source: automated
coverage_id: 24-06/D4

### 34. [24-07] preBuyAutoChecksOf — 6체크 순서 · 이미 켜진 것 제외 · 0 매도 가격 = 상한가(알 때만) · 생략 사유 5종 · 순수
expected: preBuyAutoChecksOf — 6체크 순서 · 이미 켜진 것 제외 · 0 매도 가격 = 상한가(알 때만) · 생략 사유 5종 · 순수
result: pass
source: automated
coverage_id: 24-07/D1

### 35. [24-07] preBuyAutoCheckLogLine — 한 줄 문법 · info/error · 가격 조각 · 전부 켜짐이면 null
expected: preBuyAutoCheckLogLine — 한 줄 문법 · info/error · 가격 조각 · 전부 켜짐이면 null
result: pass
source: automated
coverage_id: 24-07/D2

### 36. [24-07] 폼 — 사람 선매수 ON 에만 동반 · 성공 뒤 onClientLog 1회 · 거부 0 · D-08 에코/재접속 전송 0 · 끄는 방향 무변화 · 사전 검증 실패면 자동 체크 0
expected: 폼 — 사람 선매수 ON 에만 동반 · 성공 뒤 onClientLog 1회 · 거부 0 · D-08 에코/재접속 전송 0 · 끄는 방향 무변화 · 사전 검증 실패면 자동 체크 0
result: pass
source: automated
coverage_id: 24-07/D3

### 37. [24-07] D-04 기본값 · seedListSharesDefaults · 폼 시딩(폼당 1회 · 손댄 칸 제외 · 서버 전략이면 생략 · 제출 0) · card-body listShares
expected: D-04 기본값 · seedListSharesDefaults · 폼 시딩(폼당 1회 · 손댄 칸 제외 · 서버 전략이면 생략 · 제출 0) · card-body listShares
result: pass
source: automated
coverage_id: 24-07/D5

### 38. [24-08] P24-2 ~ P24-6 — 접기 · D-01 + 자동 체크 · D-02 전반/후반 · D-19 · 삭제 가드 · 사전 검증 · D-16 · 후매수 단계 · override 무배너
expected: P24-2 ~ P24-6 — 접기 · D-01 + 자동 체크 · D-02 전반/후반 · D-19 · 삭제 가드 · 사전 검증 · D-16 · 후매수 단계 · override 무배너
result: pass
source: automated
coverage_id: 24-08/T1

### 39. [24-10] buy3 선매수 금액 0 전략이 첫 마운트 · 재마운트 뒤에도 값 확정을 보낸다(WR-01)
expected: buy3 선매수 금액 0 전략이 첫 마운트 · 재마운트 뒤에도 값 확정을 보낸다(WR-01)
result: pass
source: automated
coverage_id: 24-10/D1

### 40. [24-10] 구서버 판별 lib 단일 지점 · formFromServer 좁힌 특례(buy3 → 0 · 구서버 → prev)
expected: 구서버 판별 lib 단일 지점 · formFromServer 좁힌 특례(buy3 → 0 · 구서버 → prev)
result: pass
source: automated
coverage_id: 24-10/D2

### 41. [24-10] 선매수 사전 검증 — 금액 0(buy3 · 구서버) · 한방가격 0 을 선매수 카드 한 줄로(IN-04 · IN-03)
expected: 선매수 사전 검증 — 금액 0(buy3 · 구서버) · 한방가격 0 을 선매수 카드 한 줄로(IN-04 · IN-03)
result: pass
source: automated
coverage_id: 24-10/D3

### 42. [24-10] 죽은 더티 코드 삭제 · lib · shared · strategy-log 주석 정정(IN-02 · IN-01 lib 분)
expected: 죽은 더티 코드 삭제 · lib · shared · strategy-log 주석 정정(IN-02 · IN-01 lib 분)
result: pass
source: automated
coverage_id: 24-10/D4

### 43. [24-11] 거부된 제출(serverFold 자동 끔 · D-02 전반 동반 끔)의 사유가 다음 무관한 에코에 붙지 않는다
expected: 거부된 제출(serverFold 자동 끔 · D-02 전반 동반 끔)의 사유가 다음 무관한 에코에 붙지 않는다
result: pass
source: automated
coverage_id: 24-11/D1

### 44. [24-11] 15:40 · 전부 정지 원인 에코에는 보낸 cfg · 사유를 귀속하지 않는다 — 원인 문장만 남는다
expected: 15:40 · 전부 정지 원인 에코에는 보낸 cfg · 사유를 귀속하지 않는다 — 원인 문장만 남는다
result: pass
source: automated
coverage_id: 24-11/D2

### 45. [24-11] 무응답 제출의 귀속은 결과 모름 창 동안만 살고(창 안 늦은 내 에코는 내 것) 창이 닫히면 비워진다 · 재전송 0 · 타이머 정리
expected: 무응답 제출의 귀속은 결과 모름 창 동안만 살고(창 안 늦은 내 에코는 내 것) 창이 닫히면 비워진다 · 재전송 0 · 타이머 정리
result: pass
source: automated
coverage_id: 24-11/D3

### 46. [24-12] 구서버 에코에서 매수가 켜진 채 매도 끄기 = 전송 0 + 「구서버 전략이라 매수주문부터 꺼 주세요」 · 매수주문 끄기 = 10 한 건(buy_watch_side 슬롯 없음) · 이어서 매도 끄기 = 철거(crud D)
expected: 구서버 에코에서 매수가 켜진 채 매도 끄기 = 전송 0 + 「구서버 전략이라 매수주문부터 꺼 주세요」 · 매수주문 끄기 = 10 한 건(buy_watch_side 슬롯 없음) · 이어서 매도 끄기 = 철거(crud D)
result: pass
source: automated
coverage_id: 24-12/D1

### 47. [24-12] 구서버 에코의 값 확정 · 금액 확정 · 켜는 토글 · 대기열 꺼내기 = 전송 0 + legacyReadOnly(낙관 표시 없음 · 조용한 드롭 없음)
expected: 구서버 에코의 값 확정 · 금액 확정 · 켜는 토글 · 대기열 꺼내기 = 전송 0 + legacyReadOnly(낙관 표시 없음 · 조용한 드롭 없음)
result: pass
source: automated
coverage_id: 24-12/D2

### 48. [24-12] buy3 에코(buy3Schema 1)에서는 제한 없음 — 기존 확정 · 동반 · 자동 끔 · 사전 검증 테스트 전부 통과
expected: buy3 에코(buy3Schema 1)에서는 제한 없음 — 기존 확정 · 동반 · 자동 끔 · 사전 검증 테스트 전부 통과
result: pass
source: automated
coverage_id: 24-12/D3

### 49. [24-12] D-04a 금액 확정 특례 제거 — 금액 행 「—」 · 끄기 cfg 서버 금액 · 수량은 유지
expected: D-04a 금액 확정 특례 제거 — 금액 행 「—」 · 끄기 cfg 서버 금액 · 수량은 유지
result: pass
source: automated
coverage_id: 24-12/D4

### 50. [24-13] 구서버 에코(buy3Schema 0)면 매수주문 카드 상태가 「구서버 전략 · 끄기만 가능」(--destructive) · 매수 LED 는 「감시」 그대로 · 다른 카드 상태 불변
expected: 구서버 에코(buy3Schema 0)면 매수주문 카드 상태가 「구서버 전략 · 끄기만 가능」(--destructive) · 매수 LED 는 「감시」 그대로 · 다른 카드 상태 불변
result: pass
source: automated
coverage_id: 24-13/D1

### 51. [24-13] 구서버 에코에서 꺼진 스위치(선 · 추가 · 후매수 · 매수취소 · 꺼진 매수주문/매도주문)는 disabled · 켜진 스위치는 끌 수 있다 · 열마다 「켤 수 없는 이유」 구서버 한 줄
expected: 구서버 에코에서 꺼진 스위치(선 · 추가 · 후매수 · 매수취소 · 꺼진 매수주문/매도주문)는 disabled · 켜진 스위치는 끌 수 있다 · 열마다 「켤 수 없는 이유」 구서버 한 줄
result: pass
source: automated
coverage_id: 24-13/D2

### 52. [24-13] buy3 에코(buy3Schema 1)의 카드 상태 · 스위치 · 패널은 종전과 같다
expected: buy3 에코(buy3Schema 1)의 카드 상태 · 스위치 · 패널은 종전과 같다
result: pass
source: automated
coverage_id: 24-13/D3

### 53. [24-13] 구서버 에코 상따 카드 axe — 본문 344 · 992 × 라이트 · 다크 critical/serious 0 · 기존 매트릭스 8 스캔 불변
expected: 구서버 에코 상따 카드 axe — 본문 344 · 992 × 라이트 · 다크 critical/serious 0 · 기존 매트릭스 8 스캔 불변
result: pass
source: automated
coverage_id: 24-13/D4

### 54. [24-14] 대기열 선매수 켜기가 꺼내는 순간 서버 값으로 동반을 다시 계산 — 사람이 방금 확정한 매도 주문가격(120,000)을 지키고, 0 이 된 매도 매수잔량에 매도 3체크를 싣지 않는다 · 로그는 실제 전송 판정
expected: 대기열 선매수 켜기가 꺼내는 순간 서버 값으로 동반을 다시 계산 — 사람이 방금 확정한 매도 주문가격(120,000)을 지키고, 0 이 된 매도 매수잔량에 매도 3체크를 싣지 않는다 · 로그는 실제 전송 판정
result: pass
source: automated
coverage_id: 24-14/D1

### 55. [24-14] 앞 건 실패로 대기 건을 접을 때 동반 마스터까지 비교 — 불일치면 실패 표시 + 서버 값(ON) 되돌림 · 재전송 없음
expected: 앞 건 실패로 대기 건을 접을 때 동반 마스터까지 비교 — 불일치면 실패 표시 + 서버 값(ON) 되돌림 · 재전송 없음
result: pass
source: automated
coverage_id: 24-14/D2

### 56. [24-14] 동반 값 필드(매도 가격 채움)는 에코 전 폼에 보이지 않고 cfg 에만 실린다 · 불리언만 낙관 표시 · 되돌림
expected: 동반 값 필드(매도 가격 채움)는 에코 전 폼에 보이지 않고 cfg 에만 실린다 · 불리언만 낙관 표시 · 되돌림
result: pass
source: automated
coverage_id: 24-14/D3

### 57. [24-15] 자동 마스터 OFF 는 에코 대비 buyEnabled 한 필드만 바꿀 때만 나간다 — 다른 클라가 둔 수량 · 고정 필드가 에코에 있으면 전송 0 · 매수주문 ON 그대로 · 재예약 0
expected: 자동 마스터 OFF 는 에코 대비 buyEnabled 한 필드만 바꿀 때만 나간다 — 다른 클라가 둔 수량 · 고정 필드가 에코에 있으면 전송 0 · 매수주문 ON 그대로 · 재예약 0
result: pass
source: automated
coverage_id: 24-15/D1

### 58. [24-15] 보이지 않는 인스턴스는 1.5초 유예 뒤 재확인 — 다음 틱 0 → 유예 뒤 1건 · 유예 중 다른 인스턴스의 마스터 OFF 에코면 0 · 유예 중 in-flight 면 풀린 뒤 다시 유예 · 중복 0
expected: 보이지 않는 인스턴스는 1.5초 유예 뒤 재확인 — 다음 틱 0 → 유예 뒤 1건 · 유예 중 다른 인스턴스의 마스터 OFF 에코면 0 · 유예 중 in-flight 면 풀린 뒤 다시 유예 · 중복 0
result: pass
source: automated
coverage_id: 24-15/D2

### 59. [24-15] 보이는 인스턴스의 D-02 후반 동작(다음 틱 1건 · 가드 ①~④ · 거부 뒤 재시도 0 · D-34 0) 불변 · e2e P24-4 시드를 실제 에코 모양으로 고친 뒤에도 green
expected: 보이는 인스턴스의 D-02 후반 동작(다음 틱 1건 · 가드 ①~④ · 거부 뒤 재시도 0 · D-34 0) 불변 · e2e P24-4 시드를 실제 에코 모양으로 고친 뒤에도 green
result: pass
source: automated
coverage_id: 24-15/D3

### 60. [24-17] lib 자동 체크가 그룹 인자 한 벌 — 추가매수 판정 = 선매수 판정(8케이스) · groupLabel 만 다름 · 로그 첫머리만 그룹 이름 · 선매수 문장 불변
expected: lib 자동 체크가 그룹 인자 한 벌 — 추가매수 판정 = 선매수 판정(8케이스) · groupLabel 만 다름 · 로그 첫머리만 그룹 이름 · 선매수 문장 불변
result: pass
source: automated
coverage_id: 24-17/D1

### 61. [24-17] 폼 — 추가매수 켬 한 번 = 한 제출(추가매수 · 마스터 · 6체크 · 상한가 채움) · 성공 뒤 로그 한 줄 · D-16/사전 검증 먼저 · 이미 켜진 체크 불변 · 다시 꺼도 유지 · 거부 되돌림 · 대기열 꺼낼 때 계산 · 후매수/에코 대상 아님
expected: 폼 — 추가매수 켬 한 번 = 한 제출(추가매수 · 마스터 · 6체크 · 상한가 채움) · 성공 뒤 로그 한 줄 · D-16/사전 검증 먼저 · 이미 켜진 체크 불변 · 다시 꺼도 유지 · 거부 되돌림 · 대기열 꺼낼 때 계산 · 후매수/에코 대상 아님
result: pass
source: automated
coverage_id: 24-17/D2

### 62. [24-17] 진짜 브라우저 → relay → 스텁 게이트웨이 경로에서 추가매수 켜기 한 번 = 10 한 건(6체크 · 마스터) → 에코 → 로그 두 줄
expected: 진짜 브라우저 → relay → 스텁 게이트웨이 경로에서 추가매수 켜기 한 번 = 10 한 건(6체크 · 마스터) → 에코 → 로그 두 줄
result: pass
source: automated
coverage_id: 24-17/D3

### 63. [24-19] 대기 건을 앞 확정 실패로 접을 때 주 필드가 이미 서버 값이면 주 필드는 성공 · 동반은 서버 값(선매수 OFF · 마스터 ON · 말풍선 0 · 전송 1)
expected: 대기 건을 앞 확정 실패로 접을 때 주 필드가 이미 서버 값이면 주 필드는 성공 · 동반은 서버 값(선매수 OFF · 마스터 ON · 말풍선 0 · 전송 1)
result: pass
source: automated
coverage_id: 24-19/D1

### 64. [24-19] 주 필드가 서버에 서지 않았으면 종전대로 실패(rejected) · 되돌림 표시는 서버 값
expected: 주 필드가 서버에 서지 않았으면 종전대로 실패(rejected) · 되돌림 표시는 서버 값
result: pass
source: automated
coverage_id: 24-19/D2

### 65. [24-19] in-flight 실패 · 꺼낼 때 막힘 되돌림도 서버 동기값 · 미등록은 확정 직전 폼 값
expected: in-flight 실패 · 꺼낼 때 막힘 되돌림도 서버 동기값 · 미등록은 확정 직전 폼 값
result: pass
source: automated
coverage_id: 24-19/D3

### 66. [24-19] 토글 되돌림이 보이는 e2e 회귀(P24-4 D-02 전반/후반 · P24-10 구서버 끄기) 무변
expected: 토글 되돌림이 보이는 e2e 회귀(P24-4 D-02 전반/후반 · P24-10 구서버 끄기) 무변
result: pass
source: automated
coverage_id: 24-19/D4

### 67. [24-20] 값 확정 in-flight 중 대기에 선 「선매수 끄기」(화면상 마지막)는 그사이 다른 단말이 후매수를 켠 에코가 오면 마스터 OFF 를 싣지 않는다 · 후매수 ON 유지 · 마스터 ON 표시
expected: 값 확정 in-flight 중 대기에 선 「선매수 끄기」(화면상 마지막)는 그사이 다른 단말이 후매수를 켠 에코가 오면 마스터 OFF 를 싣지 않는다 · 후매수 ON 유지 · 마스터 ON 표시
result: pass
source: automated
coverage_id: 24-20/D1

### 68. [24-20] 꺼내는 순간에도 마지막이면 마스터 OFF 를 싣고 · 누른 순간 마지막이 아니었으면 싣지 않고 · 즉시 경로(⑰) 결과는 종전과 같다
expected: 꺼내는 순간에도 마지막이면 마스터 OFF 를 싣고 · 누른 순간 마지막이 아니었으면 싣지 않고 · 즉시 경로(⑰) 결과는 종전과 같다
result: pass
source: automated
coverage_id: 24-20/D2

### 69. [24-20] buy3 → 구서버 전환 에코는 하강 전이가 아니다 — 자동 마스터 OFF 전송 0 · 매수주문 ON 그대로
expected: buy3 → 구서버 전환 에코는 하강 전이가 아니다 — 자동 마스터 OFF 전송 0 · 매수주문 ON 그대로
result: pass
source: automated
coverage_id: 24-20/D3

### 70. [24-21] 선매수 켬 in-flight → 추가매수 켬(대기) 또는 후매수 켬(대기) → 선매수 성공 에코 뒤 「선매수 자동 체크 — 켬: …」 한 줄이 남고, 추가매수(꺼낼 때 계산 · 켤 것 없음)는 줄 0
expected: 선매수 켬 in-flight → 추가매수 켬(대기) 또는 후매수 켬(대기) → 선매수 성공 에코 뒤 「선매수 자동 체크 — 켬: …」 한 줄이 남고, 추가매수(꺼낼 때 계산 · 켤 것 없음)는 줄 0
result: pass
source: automated
coverage_id: 24-21/D1

### 71. [24-21] 생략 사유도 그룹별(선매수 · 추가매수 error 줄 둘 다) · 추가매수 사전 검증 막힘은 선매수 슬롯을 지우지 않는다
expected: 생략 사유도 그룹별(선매수 · 추가매수 error 줄 둘 다) · 추가매수 사전 검증 막힘은 선매수 슬롯을 지우지 않는다
result: pass
source: automated
coverage_id: 24-21/D2

### 72. [24-21] 훅 lastSuccessSent — 즉시 전송 에코 답만 true · 꺼낼 때 no-op · 대기 접기(두 갈래) · 로컬 반영 · 늦은 에코는 false
expected: 훅 lastSuccessSent — 즉시 전송 에코 답만 true · 꺼낼 때 no-op · 대기 접기(두 갈래) · 로컬 반영 · 늦은 에코는 false
result: pass
source: automated
coverage_id: 24-21/D3

### 73. [24-21] 대기 추가매수 켬을 꺼낼 때 다른 단말이 이미 켜 no-op 성공이면 「추가매수 자동 체크」 줄 0 · 사람이 보낸 켜기는 종전대로 한 줄(⑲ · D-35 · e2e P24-3 · P24-12)
expected: 대기 추가매수 켬을 꺼낼 때 다른 단말이 이미 켜 no-op 성공이면 「추가매수 자동 체크」 줄 0 · 사람이 보낸 켜기는 종전대로 한 줄(⑲ · D-35 · e2e P24-3 · P24-12)
result: pass
source: automated
coverage_id: 24-21/D4

### 74. [24-22] 카드 호가 매수1잔량 ≥ 최소면 추가매수 켜기 = 전송 0 + D-36 원문 error 한 줄 · 얇은 벽 · 잔량 모름 = 전송 1 · 호가 없음 = 로그 0
expected: 카드 호가 매수1잔량 ≥ 최소면 추가매수 켜기 = 전송 0 + D-36 원문 error 한 줄 · 얇은 벽 · 잔량 모름 = 전송 1 · 호가 없음 = 로그 0
result: pass
source: automated
coverage_id: 24-22/D1

### 75. [24-22] 판정 함수 표 6행 · 문구 원천(쉼표 · U+2265)
expected: 판정 함수 표 6행 · 문구 원천(쉼표 · U+2265)
result: pass
source: automated
coverage_id: 24-22/D2

### 76. [24-22] 폼 순서(사전 검증 → D-36 → 자동 체크) · D-36 이 먼저면 자동 체크 0 · 얇은 벽이면 추가매수 · 마스터 · 6체크 한 제출 + 성공 뒤 자동 체크 한 줄 · 카드 흐름 원문
expected: 폼 순서(사전 검증 → D-36 → 자동 체크) · D-36 이 먼저면 자동 체크 0 · 얇은 벽이면 추가매수 · 마스터 · 6체크 한 제출 + 성공 뒤 자동 체크 한 줄 · 카드 흐름 원문
result: pass
source: automated
coverage_id: 24-22/D3

### 77. [24-22] 진짜 브라우저 → relay → 스텁 게이트웨이: 두꺼운 벽(매수1잔량 10 ≥ 최소 1) D-36 원문 · 얇은 벽(10 < 11) 10 한 건 · 로그 없음
expected: 진짜 브라우저 → relay → 스텁 게이트웨이: 두꺼운 벽(매수1잔량 10 ≥ 최소 1) D-36 원문 · 얇은 벽(10 < 11) 10 한 건 · 로그 없음
result: pass
source: automated
coverage_id: 24-22/D4

### 78. [24-23] 진짜 브라우저 → relay → 스텁 게이트웨이 후매수 발동 에코의 80% 값 · 사람 값 유지 값이 행에 그대로 · 배너 · 「서버 반영 완료」 · 「다른 단말」 · 제출 0
expected: 진짜 브라우저 → relay → 스텁 게이트웨이 후매수 발동 에코의 80% 값 · 사람 값 유지 값이 행에 그대로 · 배너 · 「서버 반영 완료」 · 「다른 단말」 · 제출 0
result: pass
source: automated
coverage_id: 24-23/D1

### 79. [24-23] P24-3 · P24-4 · P24-6 사건 기반 대기 · FOLD_QUIET_MS 관찰 창(숫자 고정 대기 0)
expected: P24-3 · P24-4 · P24-6 사건 기반 대기 · FOLD_QUIET_MS 관찰 창(숫자 고정 대기 0)
result: pass
source: automated
coverage_id: 24-23/D2

### 80. [24-23] 전략 로그 · 카드 흐름 Pitfall 8 발동 에코 픽스처 264,000 · 사유 줄 원문 예시 4줄(D-37)
expected: 전략 로그 · 카드 흐름 Pitfall 8 발동 에코 픽스처 264,000 · 사유 줄 원문 예시 4줄(D-37)
result: pass
source: automated
coverage_id: 24-23/D3

### 81. [24-24] round-2 갭 4건 · Info 5건 · D-36 · D-37 · D-38 회귀 게이트 green (한 팁 ee7ce8b7)
expected: round-2 갭 4건 · Info 5건 · D-36 · D-37 · D-38 회귀 게이트 green (한 팁 ee7ce8b7)
result: pass
source: automated
coverage_id: 24-24/D1

### 82. [24-24] relay 재배포 불필요 확인(relay 무변경 · shared 주석뿐)
expected: relay 재배포 불필요 확인(relay 무변경 · shared 주석뿐)
result: pass
source: automated
coverage_id: 24-24/D2

### 83. 24-10·12·13·15·17 결정 재해석 · 구서버 에코 화면 · WR-06 남는 한계
expected: 24-10·12·13·15·17 결정 재해석 · 구서버 에코 화면 · WR-06 남는 한계
result: pass
source: prior-checkpoint
evidence: 24-16 체크포인트 사용자 「승인」(2026-09-28, 세 결정 모두 수용 · 스크린샷 reference/24-13-legacy/)

### 84. 24-20·22·23 D-02 남는 한계 문구 · D-36 새 로그 문구 · UI-SPEC D-15/D-37/D-38 서술
expected: 24-20·22·23 D-02 남는 한계 문구 · D-36 새 로그 문구 · UI-SPEC D-15/D-37/D-38 서술
result: pass
source: prior-checkpoint
evidence: 24-24 체크포인트 사용자 「승인」(2026-09-28, 판단 6건)

### 85. 24-02 D-14 매수잔량 기준 전략 추출 보고
expected: 24-02 D-14 매수잔량 기준 전략 추출 보고
result: pass
source: prior-checkpoint
evidence: 24-02 SUMMARY — 2026-09-28 08:06 KST 총 2건 중 매수잔량 기준 0건 보고

### 86. 24-16·24-18·24-23(D4) 형식 오류 coverage 블록(kind: command/test)
expected: 24-16·24-18·24-23(D4) 형식 오류 coverage 블록(kind: command/test)
result: pass
source: prior-checkpoint
evidence: SUMMARY 본문에 명령·테스트 pass 기록 — 스키마 kind 값만 옛 형식(내용 누락 아님)

## Summary

total: 86
passed: 86
issues: 0
pending: 0
skipped: 0
blocked: 0

## Notes

- 사람 확인 12건(1~12)만 제시한다. 자동 통과 70건은 SUMMARY coverage 블록의 pass 테스트, 사전 승인 4건은 24-16 · 24-24 체크포인트 등에서 이미 닫힌 항목이다.
- 24-08 참고 스크린샷(reference/24-08-visual/)은 24-10 이후 변경 전 모습이므로 판정은 운영 화면 기준.
- 자동 UI 검증: Playwright MCP 없음 → 0 auto-verified, 12 manual.

## Gaps

[none yet]
