---
status: testing
phase: 25-order-log-progress
source: [25-VERIFICATION-R2.md, 25-VERIFICATION.md]
started: 2026-09-29T16:35:27Z
updated: 2026-09-29T16:35:27Z
---

## Current Test

number: 1
name: 첫 거래일 UAT (a): 상따 매수 1건 발생 시 주문로그 탭에 BuyOrder 줄(조건 · 근거 · 상한가 매수잔량 · 접수 +ms)이 게이트웨이 로그의 전송 시각 · 조건값과 일치하는지 로그인 세션에서 대조
expected: |
  실이벤트 필드값이 게이트웨이 원본과 일치
awaiting: user response

## Tests

### 1. 첫 거래일 UAT (a): 상따 매수 1건 발생 시 주문로그 탭에 BuyOrder 줄(조건 · 근거 · 상한가 매수잔량 · 접수 +ms)이 게이트웨이 로그의 전송 시각 · 조건값과 일치하는지 로그인 세션에서 대조
expected: 실이벤트 필드값이 게이트웨이 원본과 일치
result: [pending]

### 2. 첫 거래일 UAT (b): 그 주문 행을 펼쳐 통보(접수·체결) 조각과 전략 줄이 같은 ms 규칙(통보 먼저)으로 보이는지 확인
expected: 타임라인이 gw_time_ms 순 · 동시각은 통보 우선으로 정렬
result: [pending]

### 3. 첫 거래일 UAT (c): 공용 패널 배지 · 카드 배지 · 창 분리 「오늘」 이어붙임이 실이벤트 도착 시 실제로 갱신되는지
expected: 탭이 안 보이는 동안 배지 카운트 증가, 탭 열면 0
result: [pending]

### 4. 첫 거래일 UAT (d): 대기 · 첫 체결 · 취소 · 매도 · 상한가 노출/진입 줄(상따 origin 주문)이 실제로 그려지는지
expected: 각 kind 별 문장이 D-09/D-10 규칙대로 보임
result: [pending]

### 5. 첫 거래일 UAT (e): 83 QueueProgress 로 미체결 진행률 막대가 실제로 갱신되는지(수동·VI 대기 포함, 단일가/VI 구간 정지 포함)
expected: 체결예상까지 진행률 막대·퍼센트가 실시간으로 움직이고 단일가/VI 구간에서 멈춤
result: [pending]

### 6. 첫 거래일 UAT (f)/(g): 수동·VI 주문은 전략 이벤트 0 이 정상인지 · healthz journal.strategy.lastSeq 가 null→값으로 전이하고 lagSeq 가 0 근처를 유지하는지
expected: 수동 주문에 상따 줄 없음 · lastSeq 전이 정상 · dbError:false 유지
result: [pending]

### 7. 운영 웹 로그인 세션 육안 확인: 작업대 공용 패널 「주문로그」 탭 · 카드 「주문로그」/「전략로그」 탭 · /trading/order-log 창 · 마이페이지 오늘 주문 행 ▶ 펼침 · DevTools WS 인증 직후 unf.progress snap 1프레임
expected: 다섯 표면 모두 정상 렌더 · 새로고침 후 6821181b 번들 반영(25-13 배포로 sha 이동)
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
